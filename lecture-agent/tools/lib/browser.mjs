/* 无头浏览器驱动共享库（iter74 从 render-check.mjs 抽出，供 render-check / render-video 复用——
   避免"刚做完枚举解耦就复制百行基建"的讽刺）。零依赖：Node http 静态服 + 原生 WebSocket 手写 CDP。 */
import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { accessSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.vtt': 'text/vtt',
};

/* 本地静态服务器（Node http 天生异步，多连接不死锁） */
export function startServer(root) {
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

/* 定位 Edge/Chrome */
export function findBrowser() {
  const c = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const p of c) { try { accessSync(p); return p; } catch {} }
  return null;
}

/* 极简 CDP 客户端（全局 WebSocket，id 关联；flatten 会话共用一条连接）。
   send() 第 4 参可配超时——视频编码等长任务需要 > 默认 30s。 */
export class CDP {
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
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, timeoutMs);
    });
  }
  on(fn) { this.listeners.push(fn); }
  off(fn) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }
  close() { try { this.ws.close(); } catch {} }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 一站式启动：静态服 + 无头浏览器 + CDP 连接。返回 { port, cdp, cleanup }。 */
export async function launch(root, { windowSize = '1440,900' } = {}) {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error('找不到 Edge/Chrome');
  const { server, port } = await startServer(root);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'la-render-'));
  const dbgPort = 9200 + Math.floor((Date.now() % 500));
  const proc = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--window-size=${windowSize}`,
    `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  let cdp = null;
  const cleanup = async () => {
    try { cdp && cdp.close(); } catch {}
    try { proc.kill(); } catch {}
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };
  try {
    let ver;
    for (let i = 0; i < 50; i++) {
      try { ver = await fetch(`http://127.0.0.1:${dbgPort}/json/version`).then(r => r.json()); break; }
      catch { await sleep(200); }
    }
    if (!ver) throw new Error('浏览器 DevTools 端点未就绪');
    cdp = await CDP.attach(ver.webSocketDebuggerUrl);
  } catch (e) { await cleanup(); throw e; }
  return { port, cdp, cleanup };
}
