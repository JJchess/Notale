import {chromium,type Browser} from 'playwright-core';
import sharp from 'sharp';
let browser:Browser|undefined;
/** Runs in the page. Layout trouble a screenshot shows but a model easily misses, one line each,
 * named by object id so the model can patch it directly. The viewport is the canvas. */
function layoutProbe(){
 const W=innerWidth,H=innerHeight,lines:string[]=[];
 const shown=[...document.querySelectorAll<HTMLElement>('[data-notale-id]')].filter(el=>{
  if(el.id==='stage'||el.tagName==='MAIN'||el.tagName==='BODY')return false;
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();
  return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)>0&&r.width>0&&r.height>0;
 });
 const name=(el:Element)=>{const text=(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,16);return el.getAttribute('data-notale-id')+(text?`「${text}」`:'');};
 const own=(el:Element)=>[...el.childNodes].some(node=>node.nodeType===3&&!!node.textContent?.trim());
 for(const el of shown){
  const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
  if(r.left<-1||r.top<-1||r.right>W+1||r.bottom>H+1)lines.push(`${name(el)} 超出画布（左 ${Math.round(r.left)}、上 ${Math.round(r.top)}、右 ${Math.round(r.right)}、下 ${Math.round(r.bottom)}，画布 ${W}×${H}）`);
  const wide=el.scrollWidth>el.clientWidth+2,tall=el.scrollHeight>el.clientHeight+2;
  if((wide||tall)&&el.clientWidth>0&&el.clientHeight>0){
   const hidden=cs.overflowX!=='visible'||cs.overflowY!=='visible';
   if(hidden||own(el))lines.push(`${name(el)} 内容${hidden?'被裁切':'溢出了自己的框'}：需要 ${el.scrollWidth}×${el.scrollHeight}，框只有 ${el.clientWidth}×${el.clientHeight}`);
  }
 }
 // Text over text is almost never intended; text over a picture often is, so only text pairs count.
 const texts=shown.filter(own);
 for(let i=0;i<texts.length&&lines.length<20;i++)for(let j=i+1;j<texts.length;j++){
  const a=texts[i],b=texts[j];if(a.contains(b)||b.contains(a))continue;
  const p=a.getBoundingClientRect(),q=b.getBoundingClientRect();
  const w=Math.min(p.right,q.right)-Math.max(p.left,q.left),h=Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top);
  if(w>0&&h>0&&w*h>0.3*Math.min(p.width*p.height,q.width*q.height))lines.push(`${name(a)} 与 ${name(b)} 的文字互相重叠`);
 }
 return lines.slice(0,10);
}
process.on('message',async(job:{key:string;url:string;width:number;height:number;step:number;outWidth?:number;probe?:boolean})=>{
 try {
  browser??=await chromium.launch({executablePath:process.env.EDITOR_CHROMIUM_PATH,chromiumSandbox:process.env.EDITOR_POSTER_SANDBOX!=='off',headless:true});
  const origin=new URL(job.url).origin;
  const context=await browser.newContext({viewport:{width:Math.min(4096,job.width),height:Math.min(4096,job.height)},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  try {
   await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
   await context.addInitScript(()=>{Object.assign(window,{__NOTALE_RENDER_MODE__:'poster'});HTMLMediaElement.prototype.play=function(){return Promise.resolve();};if(Object.getOwnPropertyDescriptor(window,'Worker')?.configurable!==false)Object.defineProperty(window,'Worker',{configurable:true,writable:true,value:class {constructor(){throw Error('Workers are disabled in posters');}}});});
   const page=await context.newPage();
   // A page that throws or logs errors is broken in a way a screenshot may not show; the AI hears it too.
   const errors:string[]=[];
   if(job.probe){page.on('pageerror',error=>errors.push(`页面报错：${error.message}`.slice(0,300)));page.on('console',message=>{if(message.type()==='error')errors.push(`控制台错误：${message.text()}`.slice(0,300));});}
   await page.goto(job.url,{waitUntil:'domcontentloaded',timeout:12000});
   await page.waitForFunction(()=>!!(window as any).NotaleBridge,{},{timeout:8000});
   await page.evaluate(async(step)=>{(window as any).NotaleBridge.mode('play');(window as any).NotaleBridge.seek(step,false);await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));},job.step);
   for(const frame of page.frames())if(frame!==page.mainFrame())await frame.waitForFunction(()=>!document.querySelector('#editorLoading')||!!document.querySelector('[data-notale-code-poster]'),{},{timeout:5000}).catch(()=>undefined);
   const layout=job.probe?await page.evaluate(layoutProbe).catch(()=>[] as string[]):undefined;
   const warnings=layout?[...new Set(errors)].slice(0,5).concat(layout):undefined;
   const bytes=await sharp(await page.screenshot({type:'png',animations:'disabled',timeout:5000})).resize({width:job.outWidth??640,withoutEnlargement:true}).webp({quality:82}).toBuffer();
   process.send?.({key:job.key,data:bytes.toString('base64'),warnings});
  }finally{await context.close();}
 }catch(error){process.send?.({key:job.key,error:error instanceof Error?error.message:String(error)});}
});
process.on('disconnect',()=>{void browser?.close().finally(()=>process.exit());});
