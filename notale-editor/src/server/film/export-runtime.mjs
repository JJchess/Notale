import {spawn} from 'node:child_process';
import path from 'node:path';
import {realpath,open,stat} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {byteRange} from '../range.js';

/** Native media seeks need HTTP ranges even when requests never leave the browser. */
export async function fulfillRenderFile(route,file,contentType,body){
 const size=body?.length??(await stat(file)).size,range=byteRange(route.request().headers().range,size);
 const headers={'access-control-allow-origin':'*','cache-control':'no-store','accept-ranges':'bytes'};
 if(range===null)return route.fulfill({status:416,headers:{...headers,'content-range':`bytes */${size}`},body:''});
 const length=range?range.end-range.start+1:size;
 headers['content-length']=String(length);
 if(range)headers['content-range']=`bytes ${range.start}-${range.end}/${size}`;
 if(route.request().method()==='HEAD')body=Buffer.alloc(0);
 else if(range){
  if(body)body=body.subarray(range.start,range.end+1);
  else {const handle=await open(file,'r');try{body=Buffer.alloc(length);let offset=0;while(offset<length){const {bytesRead}=await handle.read(body,offset,length-offset,range.start+offset);if(!bytesRead)throw Error('Render resource changed during read');offset+=bytesRead;}}finally{await handle.close();}}
 }
 return route.fulfill({status:range?206:200,contentType,headers,...(body?{body}:{path:file})});
}

export function check(job){if(job.cancelled)throw Error('已取消');}
export function run(job,command,args,options={},captureStderr=false){
 check(job);const {timeoutMs=600000,maxOutput=512*1024*1024,...spawnOptions}=options;
 return new Promise((resolve,reject)=>{const child=spawn(job.runtime?.commands?.[command]??command,args,{...spawnOptions,stdio:['ignore','pipe','pipe']});job.children.add(child);const out=[],err=[];let size=0,error,errSize=0;
  const stop=message=>{error=Error(message);child.kill('SIGTERM');const force=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1500);force.unref();child.once('close',()=>clearTimeout(force));};
  const timeout=setTimeout(()=>stop(`${command} 执行超时`),timeoutMs);timeout.unref();
  child.stdout.on('data',x=>{size+=x.length;if(size>maxOutput){if(!error)stop(`${command} 输出超过限制`);}else out.push(x);});
  child.stderr.on('data',x=>{err.push(x);errSize+=x.length;while(errSize>65536&&err.length>1)errSize-=err.shift().length;});
  child.once('error',e=>{error=e;});child.once('close',code=>{clearTimeout(timeout);job.children.delete(child);if(job.cancelled)reject(Error('已取消'));else if(error)reject(error);else if(code!==0)reject(Error(`${command}: ${Buffer.concat(err).toString().slice(-3000)}`));else resolve(Buffer.concat(captureStderr?err:out));});
 });
}
/** Browser requests are fulfilled from packaged runtime / immutable inputs. No API credentials or extra listener. */
export async function renderResource(route,job,pathname){
 const runtime=job.runtime;
 if(pathname==='/film-export/render.html')return route.fulfill({contentType:'text/html',body:runtime.playerHtml()});
 const files={'/film-export/player.js':path.join(runtime.playerDir,'player.js'),'/film-export/style.css':path.join(runtime.playerDir,'player.css'),'/film-export/film-overlay.html':path.join(runtime.playerDir,'film-overlay.html'),'/film-export/film-runtime/bridge.js':path.join(runtime.editorRuntimeDir,'bridge.js'),'/film-export/film-runtime/text-editor.js':path.join(runtime.editorRuntimeDir,'text-editor.js')};
 let file=files[pathname];
 const base=job.dir&&`/film-export/jobs/${job.id}/files/`;
 if(!file&&base&&pathname.startsWith(base)){const parent=await realpath(job.dir);file=await realpath(path.join(parent,pathname.slice(base.length)));if(!file.startsWith(parent+path.sep))throw Error('Render file escapes job');}
 if(!file)throw Error('Render resource is not allowed');
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.wav':'audio/wav','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm'};
 return fulfillRenderFile(route,file,mime[path.extname(file)]??'application/octet-stream');
}
export async function browser(job){
 if(job.browser)return job.browser;
 job.browser=await chromium.launch({...(job.runtime?.chromium?{executablePath:job.runtime.chromium}:{}),headless:true,timeout:30000,args:['--disable-dev-shm-usage']});
 if(job.cancelled){await job.browser.close();check(job);}
 // Install on each context, including the implicit context created by newPage().
 const newContext=job.browser.newContext.bind(job.browser);
 job.browser.newContext=async options=>{const context=await newContext(options);await context.routeWebSocket('**/*',socket=>socket.close());await context.route('**/*',async route=>{try{const url=new URL(route.request().url());if(['data:','blob:'].includes(url.protocol))return route.continue();if(url.origin!=='https://film-render.invalid'||!['GET','HEAD'].includes(route.request().method()))throw Error('Render network is blocked');await renderResource(route,job,decodeURIComponent(url.pathname));}catch{await route.abort();}});return context;};
 const newPage=job.browser.newPage.bind(job.browser);
 job.browser.newPage=async options=>{const context=await job.browser.newContext(options);const page=await context.newPage();page.once('close',()=>void context.close().catch(()=>{}));return page;};
 return job.browser;
}

// A sequence export keeps one session for its page; page closure owns teardown.
const captureSessions=new WeakMap();
async function pageCaptureSession(page){
 let entry=captureSessions.get(page);
 if(!entry){
  entry={session:page.context().newCDPSession(page),transparent:false};captureSessions.set(page,entry);
  page.once('close',()=>{captureSessions.delete(page);void entry.session.then(session=>session.detach()).catch(()=>{});});
  entry.session.catch(()=>{if(captureSessions.get(page)===entry)captureSessions.delete(page);});
 }
 return {entry,session:await entry.session};
}
/** The browser compositor's final pixels, shared by export and on-demand scopes. */
export async function captureScreenshot(page,width,height,transparent=false){
 const {entry,session}=await pageCaptureSession(page);let timer;
 try{
  if(entry.transparent!==transparent){await session.send('Emulation.setDefaultBackgroundColorOverride',transparent?{color:{r:0,g:0,b:0,a:0}}:{});entry.transparent=transparent;}
  return await Promise.race([session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip:{x:0,y:0,width,height,scale:1}}).then(result=>Buffer.from(result.data,'base64')),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('浏览器抓帧超时')),30000);})]);
 }finally{clearTimeout(timer);}
}
export function cancelRuntime(task){
 task.cancelled=true;
 for(const child of task.children){child.kill('SIGTERM');const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1500);timer.unref();child.once('close',()=>clearTimeout(timer));}
 void task.browser?.close().catch(()=>{});
}
