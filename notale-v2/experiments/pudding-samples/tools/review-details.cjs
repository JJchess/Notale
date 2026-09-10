const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const [id,url,positions] of [['wine-animals','https://pudding.cool/2025/04/wine-animals/',[0,4900,5550,6400,12500,15500]],['womens-sizing','https://pudding.cool/2026/02/womens-sizing/',[6000,9000,16000,24000,34000]],['menu-collection','https://pudding.cool/2026/06/menu-collection/',[0]]]){
 const page=await browser.newPage({viewport:{width:1600,height:900}});const failed=[];page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()}));
 try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(id==='menu-collection'?30000:5000);
 for(const y of positions){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(1600);await page.screenshot({path:path.join(root,'evidence',id,`detail-${y}.png`)});}
 if(id==='wine-animals'){await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1200);await page.locator('.product-centerleft').first().click();await page.waitForTimeout(2600);await page.screenshot({path:path.join(root,'evidence',id,'original-selected.png')});}
 fs.writeFileSync(path.join(root,'evidence',id,'detail.json'),JSON.stringify({failed,html: id==='menu-collection'?await page.locator('body').innerText():undefined},null,2));console.log(id,'done',failed.length);
 }catch(e){console.log(id,String(e))}await page.close();
}await browser.close();})();
