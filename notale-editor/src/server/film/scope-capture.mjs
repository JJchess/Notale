import path from 'node:path';
import {lstat,open} from 'node:fs/promises';
import {collectResources,resourceName,mapDocumentResources} from './export-resources.mjs';
import {readVideoIndex,frameIndexAt} from './export-video.mjs';
import {run,browser,check,cancelRuntime,captureScreenshot,renderResource,fulfillRenderFile} from './export-runtime.mjs';

const unsupported=new Set(['openfilm','lecture']);
const mime={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf'};
const runtimePaths=new Set(['/film-export/render.html','/film-export/player.js','/film-export/style.css','/film-export/film-overlay.html','/film-export/film-runtime/bridge.js','/film-export/film-runtime/text-editor.js']);
Object.assign(mime,{'.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.flac':'audio/flac','.webm':'video/webm','.wasm':'application/wasm'});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const unchanged=(before,after)=>after.isFile()&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs;

/** A point-in-time monitor, not a job: no author writes, snapshots, frame files or queue. */
export function createScopeCapture({root,renderOrigin,parseFilmDocument,filmDuration,frameSeconds,filmFrame,runtime}){
 let active=false,currentTask,finish;let finished=Promise.resolve();
 const capture=async function(input,signal){
  if(active)throw fail('最终合成采样正在进行，请稍后重试',429);
  if(signal?.aborted)throw fail('采样已取消',499);
  if(!input||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))throw fail('无效采样请求编号');
  const doc=parseFilmDocument(input.document),frame=input.frame;
  if(!Number.isSafeInteger(frame)||frame<0||frame>=filmDuration(doc))throw fail('采样帧不在影片范围内');
  if(doc.width>4096||doc.height>4096||doc.width*doc.height>3840*2160)throw fail('最终合成采样最多支持 4K 画布');
  if(input.languages!==undefined&&(!Array.isArray(input.languages)||input.languages.length>32||input.languages.some(v=>typeof v!=='string'||v.length>100)))throw fail('无效字幕语言');
  const time=frameSeconds(frame,doc.frameRate),requests=[],resourcesDocument={sources:[],fonts:[],layers:[]};let layers=0;
  function inspect(value,seconds,depth=0){
   if(depth>8)throw fail('嵌套影片超过采样限制');
   resourcesDocument.fonts.push(...value.fonts??[]);
   for(const layer of filmFrame(value,seconds).layers){
    if(++layers>32)throw fail('当前画面超过 32 个采样图层');
    if(unsupported.has(layer.source.kind))throw fail('当前画面含网页或讲义片段，尚不支持可靠的最终合成采样');
    // Include active per-clip HTML/CSS overrides, without pulling inactive sources
    // back in through a nested sequence's full source document.
    const {source,...appearance}=layer;resourcesDocument.layers.push(appearance);
    if(layer.source.kind==='sequence')inspect(layer.source.sequence,layer.sourceTime,depth+1);
    else {resourcesDocument.sources.push(layer.source);if(layer.source.kind==='video')requests.push({uri:layer.source.uri,time:layer.sourceTime});}
   }
  }
  inspect(doc,time);if(requests.length>8)throw fail('当前画面超过 8 个视频采样层');
  active=true;finished=new Promise(resolve=>{finish=resolve;});const task={cancelled:false,children:new Set(),runtime},files=new Map();let timer,resourceBytes=0,requestCount=0,reading=0,abortReason,routeFailure,allowed;const waiting=[];
  currentTask=task;
  const abort=()=>{abortReason=fail('采样已取消',499);cancelRuntime(task);};
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{abortReason=fail('最终合成采样超时，请缩短素材或减少图层',408);cancelRuntime(task);},30000);timer.unref();
  async function localFile(uri){
   check(task);const name=resourceName(uri),entry=allowed.get(name);
   if(!entry)throw fail('采样请求的资源不在当前画面的依赖范围内');
   const current=await lstat(entry.filename);
   if(!unchanged(entry.info,current))throw fail('采样期间素材发生变化，请刷新');
   files.set(entry.filename,entry.info);return entry.filename;
  }
  try{
   // A whiteboard bundle includes several thousand tiny handwriting glyph files.
   // Keep byte, request, concurrency and timeout limits unchanged.
   allowed=await collectResources(resourcesDocument,{root,check:()=>check(task),limits:{maxFiles:8192,maxBytes:128*1024*1024,maxFileBytes:48*1024*1024}});
   check(task);const videoFrames={},indices=new Map(),decoded=new Map();let decodedBytes=0;
   for(const request of requests){
    check(task);const filename=await localFile(request.uri);let index=indices.get(filename);
    if(!index){index=await readVideoIndex(task,filename,run,{timeoutMs:15000,maxOutput:24*1024*1024,maxFrames:120000});indices.set(filename,index);}
    if(request.time>=index.duration+1e-7)throw fail('采样片段超出视频实际时长');
    const selected=frameIndexAt(index.frames,request.time),key=filename+'|'+selected;let uri=decoded.get(key);
    if(!uri){const bytes=await run(task,'ffmpeg',['-hide_banner','-loglevel','error','-threads','2','-i',filename,'-map','0:v:0','-an','-vf',`select='eq(n,${selected})',scale=trunc(iw*sar+0.5):ih,setsar=1`,'-vsync','0','-frames:v','1','-threads','2','-f','image2pipe','-vcodec','png','pipe:1'],{timeoutMs:15000,maxOutput:24*1024*1024});decodedBytes+=bytes.length;if(decodedBytes>64*1024*1024)throw fail('视频采样超过内存限制');uri='data:image/png;base64,'+bytes.toString('base64');decoded.set(key,uri);}
    const mapped=mapDocumentResources({uri:request.uri},renderOrigin+'/').uri;
    const target=videoFrames[mapped]??={duration:index.duration,frames:[]};if(!target.frames.some(item=>item.time===index.frames[selected].time))target.frames.push({time:index.frames[selected].time,uri});
   }
   for(const value of Object.values(videoFrames))value.frames.sort((a,b)=>a.time-b.time);
   check(task);const instance=await browser(task);check(task);const page=await instance.newPage({viewport:{width:doc.width,height:doc.height},deviceScaleFactor:1,serviceWorkers:'block'});
   // Context routing also covers iframe workers and popups; a service worker or
   // WebSocket must not create an unbounded network path around this file list.
   await page.context().routeWebSocket('**/*',socket=>socket.close());
   await page.context().route('**/*',async route=>{
    try{
     check(task);const url=new URL(route.request().url());
     if(++requestCount>512)throw fail('最终合成采样请求数量超过限制');
     if(!['GET','HEAD'].includes(route.request().method()))throw fail('采样只允许读取画面资源');
     if(url.origin===renderOrigin&&runtimePaths.has(url.pathname))return await renderResource(route,task,url.pathname);
     if(url.protocol==='data:'||url.protocol==='blob:')return await route.continue();
     const filename=await localFile(url.href),info=files.get(filename),type=mime[path.extname(filename).toLowerCase()];
     if(!type||info.size>48*1024*1024||(resourceBytes+=info.size)>128*1024*1024)throw fail('画面依赖的资源类型或大小超过采样限制');
     while(reading>=8){await new Promise(resolve=>waiting.push(resolve));check(task);}reading++;
     try{
      check(task);const handle=await open(filename,'r');let body;
      try{if(!unchanged(info,await handle.stat()))throw fail('采样期间素材发生变化，请刷新');body=await handle.readFile();}
      finally{await handle.close();}
      check(task);await fulfillRenderFile(route,filename,type,body);
     }
     finally{reading--;waiting.shift()?.();}
    }catch(error){routeFailure??=error;await route.abort().catch(()=>{});cancelRuntime(task);}
   });
   await page.goto(renderOrigin+'/film-export/render.html');await page.waitForFunction(()=>!!window.NotaleFilmRenderer);
   await page.evaluate(async payload=>window.NotaleFilmRenderer.load(payload.document,payload.options),{document:mapDocumentResources(doc,renderOrigin+'/'),options:{capture:true,videoFrames,initialTime:time,languages:input.languages}});
   check(task);if(routeFailure)throw routeFailure;
   const png=await captureScreenshot(page,doc.width,doc.height);check(task);if(routeFailure)throw routeFailure;
   for(const [filename,before]of files)if(!unchanged(before,await lstat(filename)))throw fail('采样期间素材发生变化，请刷新');
   const sharp=(await import('sharp')).default;
   const {data,info}=await sharp(png).resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   check(task);return {pixels:data,width:info.width,height:info.height,frame,requestId:input.requestId,documentId:doc.id};
  }catch(error){throw abortReason??routeFailure??error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);cancelRuntime(task);await task.browser?.close().catch(()=>{});active=false;currentTask=undefined;finish();}
 };
 capture.close=async()=>{if(currentTask)cancelRuntime(currentTask);await finished;};
 return capture;
}
