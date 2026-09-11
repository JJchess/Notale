import next from 'next';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
const backend = new URL(process.env.EDITOR_BACKEND_URL ?? 'http://127.0.0.1:4310');
const port = Number(process.env.PORT ?? 4312);
const contentBackend = new URL(process.env.EDITOR_CONTENT_BACKEND_URL ?? 'http://127.0.0.1:4311');
// A distinct loopback hostname keeps authored scripts isolated, using the same forwarded port.
const publicContent = new URL(process.env.EDITOR_PUBLIC_CONTENT_URL ?? `http://notale-content.localhost:${port}`);
const app=next({webpack:true,dev:process.env.NODE_ENV==='development',hostname:'127.0.0.1',port});
await app.prepare();
const handle=app.getRequestHandler();
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url!, 'http://frontend.local').pathname;
  const requestHost = new URL('http://' + (req.headers.host ?? 'localhost')).hostname;
  const isContentHost = requestHost === publicContent.hostname;
  if (isContentHost) {
    if (!pathname.startsWith('/content/') || !['GET', 'HEAD'].includes(req.method!)) { res.writeHead(404).end('Not found'); return; }
    const target = new URL(contentBackend); target.pathname = pathname; target.search = new URL(req.url!, 'http://frontend.local').search;
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = send(target, { method: req.method, headers: { ...req.headers, host: contentBackend.host, cookie: '', authorization: '' } }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Slide content unavailable'); });
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
  }
  // Signed slide content is never served on the editor/API origin.
  if (pathname.startsWith('/content/')) { res.writeHead(404).end('Not found'); return; }
  const templateAsset = /^\/templates\/refined\/(?:assets\/)?[a-zA-Z0-9_.-]+\.(?:json|html|png|jpg|woff2)$/.test(pathname) ? [pathname.slice(1), ({json:'application/json',html:'text/html; charset=utf-8',png:'image/png',jpg:'image/jpeg',woff2:'font/woff2'})[pathname.split('.').pop() as 'json'|'html'|'png'|'jpg'|'woff2']] : undefined;
  const staticAsset=pathname==='/katex.min.css'?['vendor/katex.min.css','text/css; charset=utf-8']:templateAsset;
  if(staticAsset && req.method==='GET'){
    try{const body=await readFile(resolve(staticAsset[0]));res.writeHead(200,{'content-type':staticAsset[1],'cache-control':'no-cache'}).end(body);}
    catch{res.writeHead(404).end('Resource not found');}
    return;
  }
  // Host API/show routing; preview URLs point at the isolated content hostname above.
  if (pathname.startsWith('/api/') || ['/health', '/show.html', '/show.js', '/reveal.css'].includes(pathname)) {
    const target = new URL(backend);
    target.pathname = pathname;
    target.search = new URL(req.url!, 'http://frontend.local').search;
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const rewritePreview = req.method === 'GET' && /^\/api\/documents\/[^/]+\/preview$/.test(pathname);
    const upstream = send(target, {
      method: req.method, headers: { ...req.headers, host: backend.host, ...(rewritePreview ? { 'accept-encoding': 'identity' } : {}) },
    }, response => {
      if (rewritePreview && response.statusCode === 200) {
        const chunks:Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          try {
            const preview = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            for (const slide of preview.slides) { const url = new URL(slide.url); slide.url = publicContent.origin + url.pathname + url.search; }
            const headers = { ...response.headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
            delete headers['content-length']; delete headers['content-encoding'];
            res.writeHead(200, headers).end(JSON.stringify(preview));
          } catch { res.writeHead(502).end('Invalid preview response'); }
        });
        response.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview unavailable'); });
        return;
      }
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Editor backend unavailable'); });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  if(['/index.html','/workbench.html'].includes(pathname))req.url='/'+new URL(req.url!,'http://frontend.local').search;
  await handle(req,res);
});
server.listen(port, '127.0.0.1', () => console.log(`Editor frontend: http://127.0.0.1:${port}`));
