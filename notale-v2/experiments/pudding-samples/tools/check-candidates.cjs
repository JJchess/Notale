const {chromium}=require('/tmp/notale-playwright/node_modules/playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)}catch{res.writeHead(404).end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const report=[];
try{
if(process.argv.includes('--gallery-only')){
 const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.goto('http://127.0.0.1:41991/');await page.waitForTimeout(500);
 assert.equal(await page.locator('article').count(),JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).candidates.length);assert(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth)));
 const links=await page.locator('a').evaluateAll(as=>as.map(a=>a.href));for(const url of links){const response=await page.request.get(url);assert.equal(response.status(),200,url)}
 await page.screenshot({path:path.join(root,'evidence','gallery-1600.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'evidence','gallery-390.png'),fullPage:true});
 for(const id of ['waistline-cohorts','brand-size-atlas']){await page.goto(`${origin}/review/${id}/`);await page.waitForTimeout(1000);await page.screenshot({path:path.join(root,'review',id,'shots','390x844-initial.png'),fullPage:true});assert(await page.locator('.chart-hint').isVisible())}
 console.log('Gallery, all local links, preview service and final mobile hints PASS');return;
}
for(const viewport of [{width:1600,height:900},{width:1280,height:720},{width:390,height:844}]){
 const context=await browser.newContext({viewport,deviceScaleFactor:1});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 for(const id of ['wine-bottle-choice','waistline-cohorts','brand-size-atlas']){
  const page=await context.newPage();const errors=[],failed=[];page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`)});
  const dir=path.join(root,'review',id,'shots');fs.mkdirSync(dir,{recursive:true});const prefix=`${viewport.width}x${viewport.height}`;
  await page.goto(`${origin}/review/${id}/`);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1600);
  const shot=async name=>page.screenshot({path:path.join(dir,`${prefix}-${name}.png`),fullPage:viewport.width<600});
  await shot('initial');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow');
  if(id==='wine-bottle-choice'){
   for(let i=0;i<4;i++){await page.locator('.bottle').nth(i).click();await page.waitForTimeout(950);assert.equal(await page.locator('.bottle.selected').count(),1);assert.equal(await page.locator('#result').isVisible(),true);if(i===1)await shot('selected');await page.locator('#reset').click();await page.waitForTimeout(950)}
   await page.locator('.bottle').nth(0).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('main').getAttribute('data-selected'),'cat');await page.locator('#reset').click();await page.waitForTimeout(950);await shot('reset');
   if(viewport.width>600){await page.locator('.bottle').nth(1).hover({position:{x:5,y:100}});await shot('turned');assert.notEqual(await page.locator('.bottle .sprite').nth(1).evaluate(el=>el.style.backgroundPosition),'0px 0px')}
  }else if(id==='waistline-cohorts'){
   await page.evaluate(()=>window.medianNode=document.querySelector('[data-id="p50"]'));
   for(const [i,median]of [[1,'30.39'],[2,'30.39'],[3,'37.68'],[0,'27.28']]){await page.locator('nav button').nth(i).click();await page.waitForTimeout(850);assert.equal(await page.locator('#chart').getAttribute('data-median'),median);assert(await page.evaluate(()=>window.medianNode===document.querySelector('[data-id="p50"]')));await shot(`state-${i}`)}
   assert.equal(await page.locator('.person').count(),101);
  }else{
   await page.locator('[data-mode="L"]').click();await shot('large');assert((await page.locator('.dot:not(.faded)').count())>10);await page.locator('.dot:not(.faded)').first().click();assert((await page.locator('#detail').innerText()).includes('Waist:'));await shot('detail');
   await page.locator('[data-mode="8"]').click();await shot('size-8');await page.locator('[data-mode="all"]').click();assert.equal(await page.locator('.dot.faded').count(),0);
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForTimeout(700);await shot('reduced');
  const images=await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.equal(images.length,0,'broken images');assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  report.push({id,viewport,errors,failed,brokenImages:images,passed:true});console.log(id,prefix,'PASS');await page.close();
 }await context.close();
}fs.writeFileSync(path.join(root,'evidence','candidate-checks.json'),JSON.stringify(report,null,2));
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
