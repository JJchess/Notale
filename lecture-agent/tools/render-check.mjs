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
   任一失败 exit 1。用法：node tools/render-check.mjs [?query 如 ?theme=lab]  或  --doc generated/x.lecture.json */

import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { accessSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(HERE, '../../demo');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json',
};

/* ---------- 本地静态服务器（Node http 天生异步，多连接不死锁，无需线程） ---------- */
function startServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(root, path.normalize(url).replace(/^([/\\])+/, ''));
      if (!filePath.startsWith(root)) { res.writeHead(403).end(); return; }
      const target = url.endsWith('/') || url === '' ? path.join(filePath, 'index.html') : filePath;
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/* ---------- 定位 Edge/Chrome ---------- */
function findBrowser() {
  const c = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const p of c) { try { accessSync(p); return p; } catch {} }
  return null;
}

/* ---------- 极简 CDP 客户端（全局 WebSocket，id 关联；flatten 会话共用一条连接） ---------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws open failed')); });
    const cdp = new CDP(ws);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id); cdp.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) { cdp.listeners.forEach(fn => fn(msg)); }
    };
    return cdp;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 30000);
    });
  }
  on(fn) { this.listeners.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const docFlag = args.includes('--doc') ? args[args.indexOf('--doc') + 1] : '';
  const query = args.find(a => a.startsWith('?')) || '';
  const qs = new URLSearchParams(query.replace(/^\?/, ''));
  if (docFlag) qs.set('doc', docFlag);
  const q = qs.toString();

  const browserPath = findBrowser();
  if (!browserPath) { console.error('✗ 找不到 Edge/Chrome，跳过（非致命）'); process.exit(0); }

  const { server, port } = await startServer(DEMO_ROOT);
  const pageUrl = `http://127.0.0.1:${port}/index.html${q ? '?' + q : ''}`;
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'la-render-'));
  const dbgPort = 9200 + Math.floor((Date.now() % 500));

  const proc = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--window-size=1440,900',
    `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  const fails = [];
  let cdp;
  const cleanup = async () => {
    try { cdp && cdp.close(); } catch {}
    try { proc.kill(); } catch {}
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // 等 DevTools 端点起来
    let ver;
    for (let i = 0; i < 50; i++) {
      try { ver = await fetch(`http://127.0.0.1:${dbgPort}/json/version`).then(r => r.json()); break; }
      catch { await sleep(200); }
    }
    if (!ver) throw new Error('浏览器 DevTools 端点未就绪');

    cdp = await CDP.attach(ver.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = sessionId;

    // 收集 console error / 未捕获异常
    const consoleErrors = [];
    cdp.on(msg => {
      if (msg.sessionId !== S) return;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
        consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (msg.method === 'Runtime.exceptionThrown')
        consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown'));
    });
    await cdp.send('Runtime.enable', {}, S);
    await cdp.send('Page.enable', {}, S);

    await cdp.send('Page.navigate', { url: pageUrl }, S);

    // 轮询就绪：Reveal 存在 + 分页数 + 字体加载完
    const evalJs = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, S);
      if (r.exceptionDetails) throw new Error('页内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    let ready = null;
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
    if (!ready) throw new Error('Reveal 未在超时内就绪（10s）');

    // A 分页数
    console.log(`  slides=${ready.slides} theme=${ready.theme || '(default)'} fonts=${ready.fontsStatus}`);
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
        // balanceScene 期望：非豁免页，内容 <72% 可用高度 → 居中
        const body = sec.querySelector('.pad > .body');
        let expectCenter = null, actualCenter = null;
        const exempt = sec.classList.contains('cover') || sec.classList.contains('bigidea');
        if (body && !exempt && !['lab','runlab','widlab'].some(c => body.classList.contains(c)) && !body.dataset.centered) {
          const avail = body.clientHeight;
          const kids = Array.from(body.children);
          if (avail && kids.length) {
            const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
            const contentH = kids.reduce((h,k) => h + k.offsetHeight, 0) + gap * (kids.length - 1);
            expectCenter = contentH < avail * 0.72;
            actualCenter = getComputedStyle(body).justifyContent === 'center';
          }
        }
        out.push({ i, cls: sec.className.trim(), overflowX: Math.round(overflowX), expectCenter, actualCenter });
      }
      return out;
    })()`);

    const overflowed = perSlide.filter(s => s.overflowX > 1);
    if (overflowed.length) fails.push(`D: ${overflowed.length} 页横向溢出 → ` + overflowed.map(s => `#${s.i}(${s.overflowX}px)`).join(', '));

    const balanceBad = perSlide.filter(s => s.expectCenter != null && s.expectCenter !== s.actualCenter);
    if (balanceBad.length) fails.push(`E: balanceScene ${balanceBad.length} 页规则未生效 → ` + balanceBad.map(s => `#${s.i}(应${s.expectCenter?'居中':'贴顶'}, 实${s.actualCenter?'居中':'贴顶'})`).join(', '));
    const centeredCount = perSlide.filter(s => s.actualCenter).length;
    console.log(`  balanceScene: ${centeredCount} 页判为稀疏并纵向居中`);

    // B console error
    await sleep(200);
    if (consoleErrors.length) fails.push(`B: ${consoleErrors.length} 条 console error → ` + consoleErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fails.push('运行失败: ' + (e.message || e));
  } finally {
    await cleanup();
  }

  console.log('');
  if (fails.length) { console.error('✗ 渲染验收失败:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('✓ 渲染验收通过（分页/字体/0 溢出/balanceScene 规则/0 console error）');
}

main().catch(e => { console.error('✗ ' + (e.message || e)); process.exit(1); });
