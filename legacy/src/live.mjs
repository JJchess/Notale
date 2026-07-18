/* lecture-agent 实时 Dashboard 服务器（零依赖、纯 Node http + SSE）。
   给 `generate --live` 用：agent 在每阶段/block 钩点经 broadcast(evt) 推浏览器，
   Dashboard 页（demo/live.html）用 EventSource 订阅、增量渲染右侧 reveal 预览。

   路由：
     GET /events    —— SSE 流；新连接先回放完整事件历史 + 当前 doc 快照，再续推后续事件
     GET /doc       —— 当前最新 doc JSON（每次 block 完成时由 agent 更新）
     GET /state     —— 聚合快照 { topic, doc, events[], done, startedAt }（供 dashboard 初次加载）
     其他           —— 静态服务 demo/ 目录（复用 vendor/reveal、vendor/katex、doc-to-deck.js、live.html）

   设计要点：
   - SSE 重连友好：所有事件都缓存到内存 events[]，新客户端连上立刻回放完整进度（断线重连不丢中间状态）
   - 静态根指向 demo/：让 doc-to-deck.js 与 vendor/ 资源路径与 index.html 完全一致，零改路径
   - MIME 与 serve.py 对齐（.mjs/.wasm/.json 等）
   - 仅绑 127.0.0.1：不上 0.0.0.0，不触发 Windows 防火墙弹窗
*/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { accessSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(HERE, '..', '..', 'demo');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json',
};

/**
 * 启动 live dashboard 服务器。
 * @param {{port?:number, topic?:string, onReady?:()=>void}} opts
 * @returns {{broadcast:(evt:object)=>void, setDoc:(doc:object)=>void, markDone:(info:object)=>void, close:()=>void, url:string, port:number}}
 */
export function startLiveServer({ port = 8799, topic = '', onReady } = {}) {
  const clients = new Set();            // Set<ServerResponse> SSE 连接
  const events = [];                    // 事件历史（新连接回放）
  const state = { topic, doc: null, done: false, startedAt: new Date().toISOString() };

  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];

    /* ---- SSE 事件流 ---- */
    if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      /* 先回放历史 + 初次握手快照——客户端拿到 snapshot 后从 events[] 续算 UI 状态 */
      res.write(`event: snapshot\ndata: ${JSON.stringify({ ...state, events })}\n\n`);
      clients.add(res);
      /* 心跳：每 20s 发注释行，防代理/网关掐掉空闲 SSE 连接（浏览器看不见注释行） */
      const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* 已断 */ } }, 20000);
      req.on('close', () => { clearInterval(heartbeat); clients.delete(res); try { res.end(); } catch {} });
      return;
    }

    /* ---- 当前 doc ---- */
    if (url === '/doc') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(state.doc || { scenes: [], title: '(生成中…)' }));
      return;
    }

    /* ---- 聚合快照（dashboard 初次加载 + 重连后重新对齐状态用） ---- */
    if (url === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...state, events }));
      return;
    }

    /* ---- 静态服务 demo/（含 vendor/、doc-to-deck.js、live.html） ---- */
    try {
      const filePath = path.join(DEMO_ROOT, path.normalize(decodeURIComponent(url)).replace(/^([/\\])+/, ''));
      if (!filePath.startsWith(DEMO_ROOT)) { res.writeHead(403).end('forbidden'); return; }
      const target = (url === '/' || url === '') ? path.join(filePath, 'live.html') : filePath;
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error(`[live] 端口 ${port} 已占用；用 LA_LIVE_PORT=<port> 改端口`);
    else console.error('[live] server error:', e.message);
    process.exit(1);
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      const url = `http://127.0.0.1:${actualPort}/`;
      const api = {
        url,
        port: actualPort,
        /** 推一个事件给所有 SSE 客户端 + 缓存到历史供新连接回放。 */
        broadcast(evt) {
          const payload = { ...evt, ts: evt.ts || Date.now() };
          events.push(payload);
          const line = `data: ${JSON.stringify(payload)}\n\n`;
          for (const c of clients) { try { c.write(line); } catch { clients.delete(c); } }
        },
        /** 更新当前 doc 快照（agent 每完成一个 block 后调，dashboard 拉 /doc 增量渲染）。 */
        setDoc(doc) { state.doc = doc; },
        /** 标记生成完成、可激活正式渲染。 */
        markDone(info) { state.done = true; if (info) Object.assign(state, info); },
        close() { for (const c of clients) { try { c.end(); } catch {} } clients.clear(); server.close(); },
      };
      onReady && onReady(api);
      resolve(api);
    });
  });
}

/* ---------- 跨平台开浏览器 ---------- */
export function openBrowser(url) {
  const plat = process.platform;
  try {
    if (plat === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    else if (plat === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch { return false; }
}
