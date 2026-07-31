#!/usr/bin/env node
/* 视频捕获管线（阶段2·浏览器内确定性逐帧捕获，研究定稿方案——不走 HyperFrames 服务端栈）：
   加载一份 composition 页（契约：window.COMPOSITION = {width,height,fps,durationMs,renderAt(tMs) 纯函数}），
   在页内逐帧 renderAt(t) → mediabunny CanvasSource（WebCodecs 客户端编码）→ Mp4/WebM，
   经 CDP 取回落盘 demo/generated/assets/。**零服务端 FFmpeg、零新 Node 依赖**（编码在浏览器里）。
   帧锁定 = 确定性：composition 不自跑 rAF，时间由本工具喂——同一 composition 每次产出逐帧一致。
   用法: node tools/render-video.mjs <composition 相对 demo/ 路径> [--out <名字>]
   例:   node tools/render-video.mjs generated/assets/gradient-descent.composition.html */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from '../../tools/lib/browser.mjs';   // 共享无头驱动已随 render-check 提升到主线 tools/

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(HERE, '../../demo');
const ASSETS = path.join(DEMO_ROOT, 'generated', 'assets');

const args = process.argv.slice(2);
const compPath = args.find(a => !a.startsWith('--'));
const outFlag = args.includes('--out') ? args[args.indexOf('--out') + 1] : '';
if (!compPath) { console.error('用法: node tools/render-video.mjs <composition 相对 demo/ 路径> [--out 名]'); process.exit(2); }

/* 页内捕获驱动（注入执行）：编码/封装全在浏览器（mediabunny vendored），返回 base64。 */
const DRIVER = `(async () => {
  const M = await import('/vendor/mediabunny/mediabunny.mjs');
  const C = window.COMPOSITION;
  if (!C || typeof C.renderAt !== 'function') throw new Error('页面未暴露 COMPOSITION 契约');
  const canvas = document.getElementById('stage');
  if (!canvas) throw new Error('缺 <canvas id="stage">');
  /* 编码选型：优先 MP4(H.264，兼容最广)；官方 Edge 一般可用。不行退 WebM(VP9/VP8，开源 Chromium 原生)。 */
  let format = new M.Mp4OutputFormat({ fastStart: 'in-memory' }), ext = 'mp4';
  let codec = await M.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: C.width, height: C.height });
  if (!codec) { format = new M.WebMOutputFormat(); ext = 'webm';
    codec = await M.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: C.width, height: C.height }); }
  if (!codec) throw new Error('无可用视频编码器（WebCodecs）');
  const output = new M.Output({ format, target: new M.BufferTarget() });
  const source = new M.CanvasSource(canvas, { codec, bitrate: M.QUALITY_MEDIUM });
  output.addVideoTrack(source, { frameRate: C.fps });
  await output.start();
  const frames = Math.round(C.durationMs / 1000 * C.fps);
  for (let f = 0; f < frames; f++) {
    C.renderAt(f * 1000 / C.fps);                       // 帧锁定：t 由帧号决定，非挂钟
    await source.add(f / C.fps, 1 / C.fps);             // 当前 canvas 状态 = 第 f 帧
  }
  source.close();
  await output.finalize();
  const u8 = new Uint8Array(output.target.buffer);
  let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return { b64: btoa(s), ext, codec, frames, bytes: u8.length };
})()`;

const t0 = Date.now();
const { port, cdp, cleanup } = await launch(DEMO_ROOT);
try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const pageErrors = [];
  cdp.on(m => { if (m.sessionId === S && m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || 'exception'); });
  await cdp.send('Runtime.enable', {}, S);
  await cdp.send('Page.enable', {}, S);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${compPath.replace(/\\/g, '/')}` }, S);

  /* 等 COMPOSITION 契约就绪 */
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: '!!(window.COMPOSITION && window.COMPOSITION.renderAt)', returnByValue: true }, S).catch(() => null);
    ok = r && r.result && r.result.value === true;
    if (!ok) await sleep(250);
  }
  if (!ok) throw new Error('composition 页未在 10s 内暴露 COMPOSITION 契约: ' + compPath);

  console.log('[capture] 逐帧渲染 + 浏览器内编码（WebCodecs/mediabunny）…');
  const r = await cdp.send('Runtime.evaluate', { expression: DRIVER, returnByValue: true, awaitPromise: true }, S, 300000);   // 编码长任务：5min 上限
  if (r.exceptionDetails) throw new Error('捕获失败: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  const { b64, ext, codec, frames, bytes } = r.result.value;

  await mkdir(ASSETS, { recursive: true });
  const base = outFlag || path.basename(compPath).replace(/\.composition\.html$/i, '').replace(/\.html$/i, '');
  const outFile = path.join(ASSETS, `${base}.${ext}`);
  await writeFile(outFile, Buffer.from(b64, 'base64'));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ ${path.relative(DEMO_ROOT, outFile)} — ${frames} 帧 · ${codec} · ${(bytes / 1024).toFixed(0)} KB · 合计 ${secs}s`);
  console.log(`  嵌入: { "type":"video", "src":"generated/assets/${base}.${ext}", "caption":"…" }`);   // src 相对 demo/index.html 解析
  if (pageErrors.length) { console.error('⚠ 页内异常 ' + pageErrors.length + ' 条（首条: ' + pageErrors[0].slice(0, 100) + '）'); process.exitCode = 1; }
} catch (e) {
  console.error('✗ ' + (e.message || e)); process.exitCode = 1;
} finally { await cleanup(); }
