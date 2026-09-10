const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});
 for(const [id,url] of [['menu-collection','https://pudding.cool/2026/06/menu-collection/'],['wine-animals','https://pudding.cool/2025/04/wine-animals/'],['womens-sizing','https://pudding.cool/2026/02/womens-sizing/']]){
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(4500);
   const dir=path.join(root,'evidence',id);fs.mkdirSync(dir,{recursive:true});
   await page.screenshot({path:path.join(dir,'original-00.png')});
   const meta=await page.evaluate(()=>({title:document.title,height:document.body.scrollHeight,links:[...document.querySelectorAll('a')].map(a=>({text:a.textContent,url:a.href})).filter(a=>/github/.test(a.url)),images:[...document.images].slice(0,12).map(i=>({src:i.currentSrc,width:i.naturalWidth})),buttons:[...document.querySelectorAll('button')].slice(0,30).map(b=>b.textContent)}));
   for(let i=1;i<=5;i++){await page.evaluate(y=>scrollTo(0,y),i*780);await page.waitForTimeout(1200);await page.screenshot({path:path.join(dir,`original-0${i}.png`)});}
   fs.writeFileSync(path.join(dir,'original.json'),JSON.stringify({...meta,errors},null,2));console.log(id,JSON.stringify(meta));
  }catch(e){console.log(id,String(e))}finally{await page.close()}
 }
 await browser.close();
})();
