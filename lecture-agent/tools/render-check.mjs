#!/usr/bin/env node
/* 真实浏览器渲染验收（零依赖，靠系统 Chromium/Edge + DevTools 协议）。
   30 轮迭代里大量渲染/版式代码（iter18 balanceScene、主题切换、溢出）从未在真浏览器里验过——
   本机 preview MCP 长期不可用。本脚本补这一环：无头 Edge 驱动，断言核心不变量。

   为何不进 `npm test`：需要外部浏览器（非纯离线），故独立 `npm run render-check`。
   零依赖实现：Node ≥18 内置 fetch，Node ≥22 内置全局 WebSocket；用 http 起本地静态服，
   用 Target.createTarget 在新版无头里开标签页（新 headless 已移除 /json/new HTTP 端点）。

   断言（默认基线 course.lecture.json）：
     A 页面加载、Reveal 就绪、slideCount>0（基线应为 16）
     B 全程 0 条 console error / 未捕获异常
     C 四款字体 document.fonts 全部 loaded
     D 逐页 0 横向溢出（.pad scrollWidth ≤ clientWidth）
     E iter18 balanceScene 规则真的生效：非豁免页若内容 <72% 可用高度 → justifyContent==='center'
     F 逐页 0 纵向溢出（.pad scrollHeight ≤ clientHeight）——内容超高会被 overflow:hidden 裁掉
     G 逐页 0 公式被裁（.mblock 不横向可滚）——fitFormulas 应把宽公式缩进容器，否则右侧公式看不见
     H 非代码正文 0 损坏标记（undefined/NaN/[object Object]）——插值 bug 的信号，结构断言抓不到
     I 自定义版式(index/split) 0 内容裁切——active panel / 分栏列不超各自容器（absolute panel 不撑大 .pad，F 抓不到）
   任一失败 exit 1。用法：node tools/render-check.mjs [?query 如 ?theme=lab]  或  --doc generated/x.lecture.json
                       批量：--all-generated（扫 demo/generated/*）
                       截图：--shot[=1,2,8]（把指定页/全部页渲染成 PNG 供人工看视觉质量，写到临时目录 la-shots；配 --doc 选 doc）*/

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, findBrowser, CDP, sleep } from './lib/browser.mjs';   // 共享无头驱动（iter74 抽库，render-video 同用）

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(HERE, '../../demo');


/* 验收单份讲义：开一个新标签页导航到 url，跑 A-E 断言，收尾关标签页。返回 {label, fails, ready}。 */
async function verifyScene(cdp, url, label) {
  const fails = [];
  let ready = null, S, targetId;
  try {
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    ({ sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));

    const consoleErrors = [];
    const listener = msg => {
      if (msg.sessionId !== S) return;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
        consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (msg.method === 'Runtime.exceptionThrown')
        consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown'));
    };
    cdp.on(listener);
    await cdp.send('Runtime.enable', {}, S);
    await cdp.send('Page.enable', {}, S);
    await cdp.send('Page.navigate', { url }, S);

    const evalJs = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, S);
      if (r.exceptionDetails) throw new Error('页内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };

    for (let i = 0; i < 80; i++) {
      try {
        ready = await evalJs(`(() => {
          if (!window.Reveal || !Reveal.isReady || !Reveal.isReady()) return null;
          const secs = document.querySelectorAll('.reveal .slides > section');
          if (!secs.length) return null;
          return { slides: secs.length, fontsStatus: document.fonts ? document.fonts.status : 'n/a',
                   theme: document.documentElement.dataset.theme || '' };
        })()`);
      } catch { ready = null; }
      if (ready) break;
      await sleep(250);
    }
    if (!ready) throw new Error('Reveal 未在超时内就绪（20s）');
    if (ready.slides < 1) fails.push('A: 分页数为 0');

    // C 字体
    await evalJs('document.fonts.ready').catch(() => {});
    const fontsLoaded = await evalJs(`document.fonts.status === 'loaded'`);
    if (!fontsLoaded) fails.push(`C: 字体未全部 loaded（status=${await evalJs('document.fonts.status')}）`);

    // D+E 逐页走查：溢出 + balanceScene 规则
    const perSlide = await evalJs(`(async () => {
      const out = [];
      const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const total = Reveal.getTotalSlides();
      for (let i = 0; i < total; i++) {
        Reveal.slide(i); await raf(); await new Promise(r => setTimeout(r, 30)); await raf();
        const sec = Reveal.getCurrentSlide();
        const pad = sec.querySelector('.pad') || sec;
        const overflowX = pad.scrollWidth - pad.clientWidth;
        const overflowY = pad.scrollHeight - pad.clientHeight;   // pad height:100% + body overflow:hidden → 纵向超出即被裁掉看不见
        // 公式被裁：.mblock 若横向可滚(overflow-x:auto)说明 fitFormulas 没把宽公式缩进容器，右侧内容幻灯片上看不见
        const mblockClip = Math.round(Math.max(0, ...[...sec.querySelectorAll('.mblock')].map(m => m.scrollWidth - m.clientWidth)));
        const body = sec.querySelector('.pad > .body');
        let expectCenter = null, actualCenter = null;
        const exempt = sec.classList.contains('cover') || sec.classList.contains('bigidea');
        if (body && !exempt && !['lab','runlab','widlab'].some(c => body.classList.contains(c)) && !body.dataset.centered && !body.dataset.layout) {
          const avail = body.clientHeight;
          const kids = Array.from(body.children);
          if (avail && kids.length) {
            const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
            const contentH = kids.reduce((h,k) => h + k.offsetHeight, 0) + gap * (kids.length - 1);
            expectCenter = contentH < avail * 0.72;
            actualCenter = getComputedStyle(body).justifyContent === 'center';
          }
        }
        // 文本损坏标记：非代码正文里出现 undefined/NaN/[object Object] 几乎必是插值 bug（如 iter46 占位符碰撞）。
        // 排除 code/pre/.mi/代码卡/iframe/notes——这些地方 undefined/NaN 可能是合法讲授内容（如 JS 课）。
        let corrupt = '';
        { const clone = sec.cloneNode(true);
          clone.querySelectorAll('code, pre, .mi, .codecard, iframe, aside').forEach(e => e.remove());
          // 反斜杠须双写：本段在 evalJs 模板字符串里，\\[ / \\b 才能作为正则元字符送到浏览器（单写会被模板字面量吃掉）
          const m = (clone.textContent || '').match(/\\[object Object\\]|\\bundefined\\b|\\bNaN\\b/);
          if (m) corrupt = m[0]; }
        // 自定义版式(index/split)：active panel 是 position:absolute，不会撑大 .pad，F 抓不到其裁切 → 单独测
        // index 量当前显示的 .step-panel vs .step-stage；split 量每个 .split-col。两轴取最大溢出。
        let layoutClip = 0;
        if (body && body.dataset.layout === 'index') {
          const stage = body.querySelector('.step-stage');
          const active = stage && stage.querySelector('.step-panel.show');
          if (stage && active) layoutClip = Math.max(active.scrollHeight - stage.clientHeight, active.scrollWidth - stage.clientWidth);
        } else if (body && body.dataset.layout === 'split') {
          for (const c of body.querySelectorAll('.split-col')) layoutClip = Math.max(layoutClip, c.scrollHeight - c.clientHeight, c.scrollWidth - c.clientWidth);
        } else if (body && body.dataset.layout === 'compose') {
          for (const c of body.querySelectorAll('.compose-area')) layoutClip = Math.max(layoutClip, c.scrollHeight - c.clientHeight, c.scrollWidth - c.clientWidth);
        }
        layoutClip = Math.round(Math.max(0, layoutClip));
        out.push({ i, overflowX: Math.round(overflowX), overflowY: Math.round(overflowY), mblockClip, corrupt, expectCenter, actualCenter, layoutClip });
      }
      return out;
    })()`);

    const overflowed = perSlide.filter(s => s.overflowX > 1);
    if (overflowed.length) fails.push(`D: ${overflowed.length} 页横向溢出 → ` + overflowed.map(s => `#${s.i}(${s.overflowX}px)`).join(', '));
    // F 纵向溢出：内容比 .pad 高 → 被 overflow:hidden 裁掉，学生看不到底部（与 D 同属红线，阈值放宽到 >4px 避亚像素假阳性）
    const clipped = perSlide.filter(s => s.overflowY > 4);
    if (clipped.length) fails.push(`F: ${clipped.length} 页纵向溢出(内容被裁) → ` + clipped.map(s => `#${s.i}(${s.overflowY}px)`).join(', '));
    // G 公式被裁：fitFormulas(iter43) 应把宽公式缩进容器；仍横向可滚说明右侧公式在幻灯片上看不见（阈值 >4px 避亚像素）
    const fmlClip = perSlide.filter(s => s.mblockClip > 4);
    if (fmlClip.length) fails.push(`G: ${fmlClip.length} 页公式被裁(横向可滚，右侧看不见) → ` + fmlClip.map(s => `#${s.i}(${s.mblockClip}px)`).join(', '));
    // H 文本损坏：非代码正文出现 undefined/NaN/[object Object]，几乎必是插值 bug（结构断言/0 console error 抓不到）
    const corrupt = perSlide.filter(s => s.corrupt);
    if (corrupt.length) fails.push(`H: ${corrupt.length} 页正文含损坏标记(插值 bug?) → ` + corrupt.map(s => `#${s.i}("${s.corrupt}")`).join(', '));
    const balanceBad = perSlide.filter(s => s.expectCenter != null && s.expectCenter !== s.actualCenter);
    if (balanceBad.length) fails.push(`E: balanceScene ${balanceBad.length} 页规则未生效 → ` + balanceBad.map(s => `#${s.i}(应${s.expectCenter?'居中':'贴顶'}, 实${s.actualCenter?'居中':'贴顶'})`).join(', '));
    // I 自定义版式内容被裁：index 的 active panel / split 的分栏列超出各自容器（absolute panel 不撑大 .pad，F 抓不到）
    const layoutClipped = perSlide.filter(s => s.layoutClip > 4);
    if (layoutClipped.length) fails.push(`I: ${layoutClipped.length} 页自定义版式内容被裁(index面板/split列超容器) → ` + layoutClipped.map(s => `#${s.i}(${s.layoutClip}px)`).join(', '));
    ready.centered = perSlide.filter(s => s.actualCenter).length;

    await sleep(150);
    if (consoleErrors.length) fails.push(`B: ${consoleErrors.length} 条 console error → ` + consoleErrors.slice(0, 3).join(' | '));
    cdp.off(listener);
  } catch (e) {
    fails.push('运行失败: ' + (e.message || e));
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
  return { label, fails, ready };
}

/* 截图模式（--shot）：把指定页渲染成 PNG 供人工评估视觉质量——结构验收(A-F)之外的补充，
   同一套零依赖无头浏览器。关键：先关掉 reveal 过渡，否则会截到横向滑动的中途（页面看似"错位/截断"，实为动画帧）。 */
async function captureShots(cdp, url, pages, outDir) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, S); await cdp.send('Runtime.enable', {}, S);
  await cdp.send('Page.navigate', { url }, S);
  const evalJs = async e => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, S); return r.result && r.result.value; };
  for (let i = 0; i < 80; i++) { if (await evalJs(`!!(window.Reveal && Reveal.isReady && Reveal.isReady())`)) break; await sleep(250); }
  await evalJs('document.fonts.ready').catch(() => {});
  await evalJs(`Reveal.configure({ transition:'none', backgroundTransition:'none' })`);
  const total = await evalJs('Reveal.getTotalSlides()') || 0;
  const want = pages.length ? pages.filter(p => p >= 0 && p < total) : Array.from({ length: total }, (_, i) => i);
  const saved = [];
  for (const pg of want) {
    await evalJs(`(async()=>{ Reveal.slide(${pg}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); await new Promise(r=>setTimeout(r,300)); })()`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, S);
    const file = path.join(outDir, `page${pg}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    saved.push(file);
  }
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  return saved;
}

async function main() {
  const args = process.argv.slice(2);
  const allGenerated = args.includes('--all-generated');
  const docFlag = args.includes('--doc') ? args[args.indexOf('--doc') + 1] : '';
  const query = args.find(a => a.startsWith('?')) || '';
  // --shot[=1,2,8] 或 --shot 1,2,8：截图模式（默认全部页）。仅对单份 doc 生效（配 --doc / ?theme=）。
  let shotMode = false, shotPages = [];
  const eqShot = args.find(a => a.startsWith('--shot='));
  if (eqShot) { shotMode = true; shotPages = eqShot.slice(7).split(',').map(Number).filter(Number.isInteger); }
  else if (args.includes('--shot')) { shotMode = true; const nx = args[args.indexOf('--shot') + 1]; if (nx && !nx.startsWith('-')) shotPages = nx.split(',').map(Number).filter(Number.isInteger); }

  // 组装待验收清单：--all-generated 扫 demo/generated/*.lecture.json；否则单份（默认基线）
  let scenes;
  if (allGenerated) {
    const dir = path.join(DEMO_ROOT, 'generated');
    const files = readdirSync(dir).filter(f => f.endsWith('.lecture.json')).sort();
    scenes = files.map(f => ({ label: f.replace('.lecture.json', ''), doc: `generated/${f}`, query: '' }));
    if (!scenes.length) { console.error('✗ demo/generated/ 下没有 .lecture.json'); process.exit(1); }
  } else {
    const qs = new URLSearchParams(query.replace(/^\?/, ''));
    if (docFlag) qs.set('doc', docFlag);
    scenes = [{ label: docFlag || (qs.get('theme') ? `theme=${qs.get('theme')}` : 'baseline'), _qs: qs }];
  }

  const browserPath = findBrowser();
  if (!browserPath) { console.error('✗ 找不到 Edge/Chrome，跳过（非致命）'); process.exit(0); }

  const { server, port } = await startServer(DEMO_ROOT);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'la-render-'));
  const dbgPort = 9200 + Math.floor((Date.now() % 500));
  const proc = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--window-size=1440,900',
    `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  const cleanup = async () => {
    try { cdp && cdp.close(); } catch {}
    try { proc.kill(); } catch {}
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  const results = [];
  try {
    let ver;
    for (let i = 0; i < 50; i++) {
      try { ver = await fetch(`http://127.0.0.1:${dbgPort}/json/version`).then(r => r.json()); break; }
      catch { await sleep(200); }
    }
    if (!ver) throw new Error('浏览器 DevTools 端点未就绪');
    cdp = await CDP.attach(ver.webSocketDebuggerUrl);

    if (shotMode) {
      const sc = scenes[0];
      const qs = sc._qs || new URLSearchParams(sc.doc ? { doc: sc.doc } : {});
      const q = qs.toString();
      const url = `http://127.0.0.1:${port}/index.html${q ? '?' + q : ''}`;
      const outDir = path.join(os.tmpdir(), 'la-shots');
      await mkdir(outDir, { recursive: true });
      const saved = await captureShots(cdp, url, shotPages, outDir);
      console.log(`✓ 截图 ${saved.length} 张（${sc.label}）→ ${outDir}`);
      saved.forEach(f => console.log('  ' + path.basename(f)));
    } else for (const sc of scenes) {
      const qs = sc._qs || new URLSearchParams(sc.doc ? { doc: sc.doc } : {});
      const q = qs.toString();
      const url = `http://127.0.0.1:${port}/index.html${q ? '?' + q : ''}`;
      const res = await verifyScene(cdp, url, sc.label);
      const r = res.ready || {};
      const tag = res.fails.length ? '✗' : '✓';
      console.log(`${tag} ${res.label} :: slides=${r.slides ?? '?'} theme=${r.theme || '-'} fonts=${r.fontsStatus || '?'} centered=${r.centered ?? '?'}`);
      if (res.fails.length) res.fails.forEach(f => console.log(`    - ${f}`));
      results.push(res);
    }
  } catch (e) {
    results.push({ label: '(harness)', fails: ['运行失败: ' + (e.message || e)] });
  } finally {
    await cleanup();
  }

  if (shotMode) return;   // 截图模式无验收断言，不走下面的通过/失败汇总
  const failed = results.filter(r => r.fails.length);
  console.log('');
  if (failed.length) {
    console.error(`✗ 渲染验收失败：${failed.length}/${results.length} 份 → ${failed.map(r => r.label).join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ 渲染验收通过：${results.length} 份（分页/字体/0 溢出/balanceScene 规则/0 console error）`);
}

main().catch(e => { console.error('✗ ' + (e.message || e)); process.exit(1); });
