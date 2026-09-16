import {chromium,type Browser} from 'playwright-core';
import sharp from 'sharp';
let browser:Browser|undefined;
process.on('message',async(job:{key:string;url:string;width:number;height:number;step:number})=>{
 try {
  browser??=await chromium.launch({executablePath:process.env.EDITOR_CHROMIUM_PATH,chromiumSandbox:process.env.EDITOR_POSTER_SANDBOX!=='off',headless:true});
  const origin=new URL(job.url).origin;
  const context=await browser.newContext({viewport:{width:Math.min(4096,job.width),height:Math.min(4096,job.height)},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  try {
   await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
   await context.addInitScript(()=>{Object.assign(window,{__NOTALE_RENDER_MODE__:'poster'});HTMLMediaElement.prototype.play=function(){return Promise.resolve();};if(Object.getOwnPropertyDescriptor(window,'Worker')?.configurable!==false)Object.defineProperty(window,'Worker',{configurable:true,writable:true,value:class {constructor(){throw Error('Workers are disabled in posters');}}});});
   const page=await context.newPage();await page.goto(job.url,{waitUntil:'domcontentloaded',timeout:12000});
   await page.waitForFunction(()=>!!(window as any).NotaleBridge,{},{timeout:8000});
   await page.evaluate(async(step)=>{(window as any).NotaleBridge.mode('play');(window as any).NotaleBridge.seek(step,false);await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));},job.step);
   for(const frame of page.frames())if(frame!==page.mainFrame())await frame.waitForFunction(()=>!document.querySelector('#editorLoading')||!!document.querySelector('[data-notale-code-poster]'),{},{timeout:5000}).catch(()=>undefined);
   const bytes=await sharp(await page.screenshot({type:'png',animations:'disabled',timeout:5000})).resize({width:640,withoutEnlargement:true}).webp({quality:82}).toBuffer();
   process.send?.({key:job.key,data:bytes.toString('base64')});
  }finally{await context.close();}
 }catch(error){process.send?.({key:job.key,error:error instanceof Error?error.message:String(error)});}
});
process.on('disconnect',()=>{void browser?.close().finally(()=>process.exit());});
