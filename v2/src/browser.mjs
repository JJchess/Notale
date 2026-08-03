import { accessSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

export function findBrowser() {
  const candidates = [
    process.env.V2_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  return null;
}

function startServer(root) {
  const absoluteRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      const candidate = path.resolve(absoluteRoot, `.${pathname}`);
      const relative = path.relative(absoluteRoot, candidate);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const target = pathname.endsWith('/') ? path.join(candidate, 'index.html') : candidate;
      const data = await readFile(target);
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id != null && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    };
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('无法连接浏览器 CDP WebSocket'));
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, sessionId, timeoutMs = 30_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Best-effort cleanup.
    }
  }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function launchBrowser(root, canvas) {
  const executable = findBrowser();
  if (!executable) throw new Error('找不到 Edge/Chrome；可用 V2_BROWSER 指定路径');
  const { server, port } = await startServer(root);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'workflow-v2-browser-'));
  const debugPort = 9400 + Math.floor(Math.random() * 400);
  const browser = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    `--window-size=${canvas.width},${canvas.height}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let cdp;
  const cleanup = async () => {
    try { cdp?.close(); } catch {}
    try { browser.kill(); } catch {}
    await new Promise(resolve => server.close(resolve));
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    let version;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(response => response.json());
        break;
      } catch {
        await sleep(150);
      }
    }
    if (!version?.webSocketDebuggerUrl) throw new Error('浏览器 DevTools 端点未就绪');
    cdp = await CdpClient.connect(version.webSocketDebuggerUrl);
    return { cdp, port, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function probeNativeInteractions({ root, pages, width, height }) {
  const { cdp, port, cleanup } = await launchBrowser(root, { width, height });
  let targetId;
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '浏览器交互脚本执行失败');
      return response.result?.value;
    };
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/deck.html` }, sessionId);
    for (let index = 0; index < 80; index += 1) {
      if (await evaluate('Boolean(window.Reveal?.isReady?.())')) break;
      await sleep(100);
    }
    const results = [];
    for (let index = 0; index < pages.length; index += 1) {
      await evaluate(`(async()=>{Reveal.slide(${index});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
      const state = await evaluate(`(() => {
        const section=document.querySelector('[data-page-id="${pages[index].id}"]');
        const stage=section?.querySelector('[data-native-interactive="css3d"]');
        if(!stage) return {applicable:false,pass:true};
        const sendPointer=(type,x,y,pointerType='mouse')=>stage.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:pointerType==='touch'?7:3,pointerType,clientX:x,clientY:y,buttons:type==='pointermove'?1:0}));
        sendPointer('pointerdown',100,100);sendPointer('pointerup',100,100);
        const clickExpanded=stage.classList.contains('is-expanded');
        const before=stage.style.getPropertyValue('--native-ry');
        sendPointer('pointerdown',100,100);sendPointer('pointermove',170,115);sendPointer('pointerup',170,115);
        const dragRotated=stage.style.getPropertyValue('--native-ry')!==before;
        const beforeTouch=stage.style.getPropertyValue('--native-ry');
        sendPointer('pointerdown',120,120,'touch');sendPointer('pointermove',150,125,'touch');sendPointer('pointerup',150,125,'touch');
        const touchRotated=stage.style.getPropertyValue('--native-ry')!==beforeTouch;
        stage.focus();
        const beforeKey=stage.style.getPropertyValue('--native-ry');
        stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        const keyboardRotated=stage.style.getPropertyValue('--native-ry')!==beforeKey;
        stage.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        const reset=!stage.classList.contains('is-expanded');
        return {applicable:true,clickExpanded,dragRotated,touchRotated,keyboardRotated,reset,pass:clickExpanded&&dragRotated&&touchRotated&&keyboardRotated&&reset};
      })()`);
      results.push({ pageId: pages[index].id, ...state });
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    const reducedMotion = await evaluate(`(() => { const plane=document.querySelector('[data-native-interactive="css3d"] .native-plane'); return plane ? getComputedStyle(plane).transitionDuration.split(',').every(v=>parseFloat(v)===0) : true; })()`);
    return { pass: results.every(item => item.pass) && reducedMotion, reducedMotion, pages: results };
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cleanup();
  }
}

export async function probeNativeGeometry({ root, pages, scenes, width, height, tolerance = .015 }) {
  const { cdp, port, cleanup } = await launchBrowser(root, { width, height });
  let targetId;
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '浏览器几何实测失败');
      return response.result?.value;
    };
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/deck.html` }, sessionId);
    for (let index = 0; index < 80; index += 1) {
      if (await evaluate('Boolean(window.Reveal?.isReady?.())')) break;
      await sleep(100);
    }
    if (!(await evaluate('Boolean(window.Reveal?.isReady?.())'))) throw new Error('Reveal 未在几何探针时限内就绪');
    await evaluate('document.fonts.ready');
    await evaluate(`Reveal.configure({transition:'none',backgroundTransition:'none'});document.documentElement.dataset.nativeCapture='true'`);
    const results = [];
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const scene = scenes?.[page.id];
      const css3dIds = new Set((scene?.nodes || []).filter(node => node.type === 'css3d').map(node => node.id));
      const expected = (scene?.nodes || []).filter(node => !node.parentId || !css3dIds.has(node.parentId)).map(node => ({
        id: node.id, bbox: node.bbox, z: node.z, type: node.type,
        skipGeometry: node.type === 'css3d' || Number(node.style?.rotation || 0) !== 0,
      }));
      await evaluate(`(async()=>{Reveal.slide(${index});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
      const measured = await evaluate(`(() => {
        const section=document.querySelector('[data-page-id=${JSON.stringify(page.id)}]');
        if(!section)return {missingPage:true,nodes:[]};
        const sr=section.getBoundingClientRect();
        const expected=${JSON.stringify(expected)};
        const round=n=>Math.round(n*100000)/100000;
        const nodes=expected.map(spec=>{
          const el=section.querySelector('[data-native-node-id="'+CSS.escape(spec.id)+'"]');
          if(!el)return {id:spec.id,missing:true,pass:false};
          const r=el.getBoundingClientRect();
          const actual={x:round((r.left-sr.left)/sr.width),y:round((r.top-sr.top)/sr.height),w:round(r.width/sr.width),h:round(r.height/sr.height)};
          const delta={x:round(actual.x-spec.bbox.x),y:round(actual.y-spec.bbox.y),w:round(actual.w-spec.bbox.w),h:round(actual.h-spec.bbox.h)};
          const maxDelta=Math.max(...Object.values(delta).map(Math.abs));
          const clipped=el.classList.contains('native-text')&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2);
          const outside=r.left<sr.left-2||r.right>sr.right+2||r.top<sr.top-2||r.bottom>sr.bottom+2;
          const renderedZ=Number.parseInt(getComputedStyle(el).zIndex,10)||0;
          const layerMatches=renderedZ===spec.z;
          const geometryPass=spec.skipGeometry||maxDelta<=${Number(tolerance)};
          return {id:spec.id,expectedBBox:spec.bbox,renderedBBox:actual,delta,maxDelta,clipped,outside,expectedZ:spec.z,renderedZ,layerMatches,geometrySkipped:spec.skipGeometry,pass:geometryPass&&!clipped&&!outside&&layerMatches};
        });
        return {missingPage:false,nodes,pass:nodes.every(node=>node.pass)};
      })()`);
      results.push({ pageId: page.id, ...measured });
    }
    return { version: '1.0', pass: results.every(item => item.pass), tolerance, canvas: { width, height }, pages: results };
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cleanup();
  }
}

export async function compareImagesInBrowser({ root, source, preview, mask, width, height }) {
  const { cdp, port, cleanup } = await launchBrowser(root, { width, height });
  let targetId;
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/deck.html` }, sessionId);
    await sleep(150);
    const sourceUrl = `http://127.0.0.1:${port}/${String(source).replaceAll('\\', '/')}`;
    const previewUrl = `http://127.0.0.1:${port}/${String(preview).replaceAll('\\', '/')}`;
    const maskUrl = mask ? `http://127.0.0.1:${port}/${String(mask).replaceAll('\\', '/')}` : null;
    const expression = `(async()=>{
      const load = src => new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('image load failed: '+src)); img.src=src; });
      const [source,preview]=await Promise.all([load(${JSON.stringify(sourceUrl)}),load(${JSON.stringify(previewUrl)})]);
      const mask=${JSON.stringify(maskUrl)} ? await load(${JSON.stringify(maskUrl)}) : null;
      const canvas=document.createElement('canvas'); canvas.width=${width}; canvas.height=${height};
      const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,0,0,${width},${height}); const a=ctx.getImageData(0,0,${width},${height}).data;
      ctx.clearRect(0,0,${width},${height}); ctx.drawImage(preview,0,0,${width},${height}); const b=ctx.getImageData(0,0,${width},${height}).data;
      let m=null; if(mask){ctx.clearRect(0,0,${width},${height});ctx.drawImage(mask,0,0,${width},${height});m=ctx.getImageData(0,0,${width},${height}).data;}
      let abs=0,squared=0,changed32=0,changed64=0,max=0; const pixels=${width}*${height};
      let editableAbs=0,editableSquared=0,editableChanged32=0,editablePixels=0;
      let immutableAbs=0,immutableSquared=0,immutableChanged32=0,immutablePixels=0;
      for(let i=0;i<a.length;i+=4){
        const dr=Math.abs(a[i]-b[i]),dg=Math.abs(a[i+1]-b[i+1]),db=Math.abs(a[i+2]-b[i+2]);
        abs+=dr+dg+db; squared+=dr*dr+dg*dg+db*db; const peak=Math.max(dr,dg,db); max=Math.max(max,peak);
        if(peak>32) changed32+=1; if(peak>64) changed64+=1;
        if(m){
          if(m[i]>127){editablePixels+=1;editableAbs+=dr+dg+db;editableSquared+=dr*dr+dg*dg+db*db;if(peak>32)editableChanged32+=1;}
          else{immutablePixels+=1;immutableAbs+=dr+dg+db;immutableSquared+=dr*dr+dg*dg+db*db;if(peak>32)immutableChanged32+=1;}
        }
      }
      const region=(count,total,sq,changed)=>count?{pixelCount:count,pixelFraction:count/pixels,meanAbsDiff:total/(count*3),rmsDiff:Math.sqrt(sq/(count*3)),changedPixelFraction32:changed/count}:null;
      return {sourceSize:[source.naturalWidth,source.naturalHeight],previewSize:[preview.naturalWidth,preview.naturalHeight],maskSize:mask?[mask.naturalWidth,mask.naturalHeight]:null,compareSize:[${width},${height}],meanAbsDiff:abs/(pixels*3),rmsDiff:Math.sqrt(squared/(pixels*3)),maxChannelDiff:max,changedPixelFraction32:changed32/pixels,changedPixelFraction64:changed64/pixels,editableRegion:region(editablePixels,editableAbs,editableSquared,editableChanged32),immutableRegion:region(immutablePixels,immutableAbs,immutableSquared,immutableChanged32)};
    })()`;
    const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, 60_000);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '图像对比脚本失败');
    return response.result?.value;
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cleanup();
  }
}

export async function probeSnapshotEditability({ root, pageId, width, height, screenshotFile }) {
  const { cdp, port, cleanup } = await launchBrowser(root, { width, height });
  let targetId;
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '交互探针执行失败');
      return response.result?.value;
    };
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/deck.html` }, sessionId);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate('Boolean(window.Reveal?.isReady?.())')) break;
      await sleep(100);
    }
    await evaluate('document.fonts.ready');
    const result = await evaluate(`(async()=>{
      const section=document.querySelector(${JSON.stringify(`[data-page-id="${pageId}"]`)});
      if(!section) return {pass:false,reason:'missing section'};
      const titleLive=section.querySelector('[data-snapshot-id="title"].snapshot-live');
      const titleSnapshot=section.querySelector('.pixel-snapshot[data-snapshot-id="title"]');
      if(!titleLive||!titleSnapshot) return {pass:false,reason:'missing title snapshot pair'};
      const opacity=el=>Number(getComputedStyle(el).opacity);
      const before={snapshot:opacity(titleSnapshot),live:opacity(titleLive)};
      titleLive.focus();
      titleLive.textContent='树结构 · 可编辑验证';
      titleLive.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'树结构 · 可编辑验证'}));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const titleAfter={snapshot:opacity(titleSnapshot),live:opacity(titleLive),edited:titleLive.dataset.edited==='true',text:titleLive.textContent};
      const node=section.querySelector('.graph-node span[contenteditable="true"]');
      const graphSnapshot=section.querySelector('.graph-snapshot');
      const graphLayer=section.querySelector('.graph-layer');
      let graphAfter=null;
      if(node&&graphSnapshot&&graphLayer){
        node.focus(); node.textContent='A*';
        node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'A*'}));
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        graphAfter={snapshot:opacity(graphSnapshot),live:opacity(graphLayer),node:opacity(node.closest('.graph-node')),edited:node.closest('.graph-node').dataset.edited==='true',text:node.textContent};
      }
      titleLive.blur(); node?.blur();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const persisted={titleSnapshot:opacity(titleSnapshot),titleLive:opacity(titleLive),titleText:titleLive.textContent,graphSnapshot:graphSnapshot?opacity(graphSnapshot):null,graphLive:graphLayer?opacity(graphLayer):null};
      const pass=before.snapshot===1&&before.live===0&&titleAfter.snapshot===0&&titleAfter.live===1&&titleAfter.edited&&titleAfter.text==='树结构 · 可编辑验证'&&persisted.titleSnapshot===0&&persisted.titleLive===1&&(!graphAfter||(graphAfter.snapshot===1&&graphAfter.live===0&&graphAfter.node===1&&graphAfter.edited&&persisted.graphSnapshot===1&&persisted.graphLive===0));
      return {pass,before,titleAfter,graphAfter,persisted};
    })()`);
    const dragStart = await evaluate(`(()=>{
      const section=document.querySelector(${JSON.stringify(`[data-page-id="${pageId}"]`)});
      const node=section?.querySelector('.graph-node[data-node-id="a"]');
      if(!node) return null;
      const rect=node.getBoundingClientRect();
      return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,left:parseFloat(node.style.left),top:parseFloat(node.style.top)};
    })()`);
    if (dragStart) {
      const end = { x: dragStart.x + 90, y: dragStart.y + 48 };
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: dragStart.x, y: dragStart.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 1,
      }, sessionId);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: end.x, y: end.y, button: 'none', buttons: 1, modifiers: 1,
      }, sessionId);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 1,
      }, sessionId);
      await sleep(100);
      const dragAfter = await evaluate(`(()=>{
        const section=document.querySelector(${JSON.stringify(`[data-page-id="${pageId}"]`)});
        const stage=section?.querySelector('.layer-stage');
        const node=section?.querySelector('.graph-node[data-node-id="a"]');
        const graphSnapshot=section?.querySelector('.graph-snapshot');
        const graphLayer=section?.querySelector('.graph-layer');
        const edge=graphLayer?.querySelector('line[data-from="a"]');
        if(!stage||!node||!graphSnapshot||!graphLayer||!edge) return {pass:false,reason:'missing drag targets'};
        const left=parseFloat(node.style.left),top=parseFloat(node.style.top),width=parseFloat(node.style.width),height=parseFloat(node.style.height);
        const cx=left+width/2,cy=top+height/2;
        const endpointError=Math.hypot(Number(edge.getAttribute('x1'))-cx,Number(edge.getAttribute('y1'))-cy);
        const opacity=el=>Number(getComputedStyle(el).opacity);
        const delta=Math.hypot(left-${dragStart.left},top-${dragStart.top});
        const state={graphEdited:stage.dataset.graphEdited==='true',snapshot:opacity(graphSnapshot),live:opacity(graphLayer),delta,endpointError,left,top};
        return {pass:state.graphEdited&&state.snapshot===0&&state.live===1&&state.delta>80&&state.endpointError<0.1,...state};
      })()`);
      result.dragAfter = dragAfter;
      result.pass = Boolean(result.pass && dragAfter.pass);
    } else {
      result.dragAfter = { pass: false, reason: 'missing node a' };
      result.pass = false;
    }
    if (screenshotFile) {
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(screenshotFile, Buffer.from(screenshot.data, 'base64'));
    }
    return result;
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cleanup();
  }
}
