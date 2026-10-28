/** Calibrated compositor regression, not a physical-touchpad certification.
 * No CSS/JS bounce simulation. Input goes through Chromium's gesture pipeline;
 * screenshots detect visual stretch that scrollTop/DOM geometry cannot expose. */
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {access,mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import sharp from '../../../notale-editor/node_modules/sharp/lib/index.js';
const {values}=parseArgs({options:{editor:{type:'string'},output:{type:'string'},executable:{type:'string'},headed:{type:'boolean'},'disable-elasticity':{type:'boolean'}}});
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.resolve(root,values.output??'.local/motale-film/scroll-elasticity');
await mkdir(out,{recursive:true});
const report={schema:1,platform:process.platform,input:'CDP synthetic touch',physicalTouchpad:false,scope:values.editor?'calibration-and-editor':'calibration-only',elasticity:values['disable-elasticity']?'disabled':'enabled',calibration:[],editor:[],status:'running'};
async function executable(){
 const explicit=values.executable??process.env.MOTALE_CHROMIUM??process.env.CHROMIUM_PATH;if(explicit)return explicit;
 const configured=chromium.executablePath();try{await access(configured);return configured;}catch{}
 // Reuse already installed full browsers when the tooling package's older pin is absent.
 // Record the chosen path and version; --executable pins reproducible CI runs.
 const normalized=configured.replaceAll('\\','/'),match=/^(.*)\/chromium-\d+\//.exec(normalized);
 if(match){const cache=match[1],entries=await readdir(cache).catch(()=>[]);for(const name of entries.filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1])))for(const suffix of ['chrome-linux64/chrome','chrome-linux/chrome','chrome-win64/chrome.exe','chrome-win/chrome.exe']){const candidate=path.join(cache,name,suffix);try{await access(candidate);return candidate;}catch{}}}
 throw Error('No installed Chromium found; provide --executable or MOTALE_CHROMIUM');
}
let browser;
const save=()=>writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
/** Find the solid magenta marker in final compositor pixels, not its DOM box. */
async function marker(png,region){
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}),rows=[];
 const left=Math.max(0,Math.ceil(region.x)),right=Math.min(info.width,Math.floor(region.x+region.width));
 for(let y=0;y<info.height;y++){let count=0;for(let x=left;x<right;x++){const i=(y*info.width+x)*4;if(data[i]>245&&data[i+1]<10&&data[i+2]>245)count++;}if(count>Math.max(12,(right-left)*.6))rows.push(y);}
 if(!rows.length)throw Error('Visual marker is missing; this sample cannot establish a result');
 return [rows[0],rows.at(-1)];
}
async function capture(cdp){return Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64');}
async function drag(cdp,page,{x,y},distance,sample,cancel=false){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 try{for(let i=1;i<=16;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+distance*i/16,id:1}]});await page.waitForTimeout(16);if(i%4===0)await sample();}}
 finally{await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
}
async function measure(page,cdp,name,region,origin,distance){
 const before=await capture(cdp),baseline=await marker(before,region);await writeFile(path.join(out,name+'-baseline.png'),before);
 let maximum=0,peak=before;const frames=[];
 await drag(cdp,page,origin,distance,async()=>{const png=await capture(cdp),rows=await marker(png,region),delta=Math.max(...rows.map((y,i)=>Math.abs(y-baseline[i])));frames.push(rows);if(delta>=maximum){maximum=delta;peak=png;}});
 await writeFile(path.join(out,name+'-peak.png'),peak);
 return {name,baseline,frames,maxDisplacement:maximum,baselineImage:name+'-baseline.png',peakImage:name+'-peak.png'};
}
async function calibrate(behavior,edge){
 // Fresh context prevents a prior control's ongoing spring animation contaminating a protected sample.
 const context=await browser.newContext({viewport:{width:900,height:700},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page);
 try{
  await page.setContent(`<style>html{overscroll-behavior:${behavior}}body{margin:0;height:2100px;position:relative;background:#f5f5f5}.marker{position:absolute;left:90px;right:90px;height:20px;background:#f0f;${edge==='top'?'top':'bottom'}:40px}</style><div class="marker"></div>`);
  await page.evaluate(edge=>scrollTo(0,edge==='top'?0:document.documentElement.scrollHeight),edge);await page.waitForTimeout(60);
  const at=await page.evaluate(()=>scrollY),result=await measure(page,cdp,`control-${behavior}-${edge}`,{x:90,width:720},{x:450,y:edge==='top'?170:530},edge==='top'?352:-352);
  assert.equal(await page.evaluate(()=>scrollY),at,'calibration must stay at the scroll boundary');
  return {...result,behavior,edge,scrollPosition:at};
 }finally{await context.close();}
}
async function checkEditor(url){
 const address=new URL(url),id=address.searchParams.get('document');if(!id)throw Error('--editor must identify an independent film document using ?document=');
 const response=await fetch(new URL('/api/documents/'+encodeURIComponent(id),address));assert.equal(response.status,200,'editor API must be ready');const snapshot=await response.json();assert.equal(typeof snapshot.version,'number');
 const clips=snapshot.document.film?.tracks.filter(track=>track.kind==='media'&&!track.locked&&!track.hidden).flatMap(track=>track.clips)??[],sources=snapshot.document.film?.sources??[],clip=clips.find(clip=>sources.some(source=>source.id===clip.sourceId&&source.kind==='motale'));
 if(!clip)throw Error('Diagnostic document needs an unlocked Motale clip');
 assert.equal((await fetch(address)).status,200,'editor must be ready before opening a browser');
 const context=await browser.newContext({viewport:{width:1440,height:940},deviceScaleFactor:1,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page),writes=[];
 page.setDefaultTimeout(8000);page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push({method:r.method(),url:r.url()});});
 try{
  await page.addInitScript(()=>{if(self===top)localStorage.setItem('notale-locale','zh-CN');});await page.goto(address.href);
  await page.locator('[data-role=seek]').evaluate((n,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,String(value));n.dispatchEvent(new Event('input',{bubbles:true}));},clip.at);
  await page.locator(`[data-clip-id=${JSON.stringify(clip.id)}] .film-clip-body`).click();const style=page.locator('[data-tool=style]');if(await style.getAttribute('aria-pressed')!=='true')await style.click();const mode=page.getByRole('button',{name:'编辑场景对象',exact:true});if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();await page.locator('.film-motale-objects button').first().waitFor();
  for(const selector of ['.film-motale-objects','#property-panel'])for(const edge of ['top','bottom']){
   const target=page.locator(selector);await target.scrollIntoViewIfNeeded();
   const setup=await target.evaluate((node,edge)=>{
    const mark=document.createElement('div');mark.dataset.elasticityMarker='';mark.style.cssText='height:6px;min-height:6px;flex:none;width:200px;max-width:100%;background:rgb(255,0,255);pointer-events:none;margin:0;padding:0;border:0';
    if(edge==='top')node.prepend(mark);else node.append(mark);node.scrollTop=edge==='top'?0:node.scrollHeight;
    const r=node.getBoundingClientRect();return {behavior:getComputedStyle(node).overscrollBehaviorY,x:r.x+4,y:r.y+r.height/2};
   },edge);assert.equal(setup.behavior,'none');
   if(edge==='top'){
    const start=await target.evaluate(node=>{const max=node.scrollHeight-node.clientHeight;node.scrollTop=max/2;return {at:node.scrollTop,max};});assert.ok(start.max>8,'diagnostic needs overflowing content');
    await drag(cdp,page,setup,-96,async()=>{},true);await page.waitForTimeout(50);
    const changed=await target.evaluate(node=>node.scrollTop);assert.ok(Math.abs(changed-start.at)>1,'native gesture did not scroll the target; zero overscroll would be inconclusive');
    report.normalScroll??=[];report.normalScroll.push({selector,from:start.at,to:changed});await target.evaluate(node=>node.scrollTop=0);
   }
   await page.waitForTimeout(100);
   const bounds=await target.locator('[data-elasticity-marker]').boundingBox();assert.ok(bounds&&bounds.width>20,'visible diagnostic marker');
   const state=()=>target.evaluate(node=>{const ancestors=[];for(let p=node;p;p=p.parentElement){const r=p.getBoundingClientRect();ancestors.push([p.id||p.className,p.scrollLeft,p.scrollTop,r.x,r.y,r.width,r.height]);}return {ancestors,viewport:[scrollX,scrollY,visualViewport.offsetLeft,visualViewport.offsetTop]};});
   const before=await state(),result=await measure(page,cdp,`${selector.replace(/[^a-z-]/g,'')}-${edge}`,{x:bounds.x,width:bounds.width},setup,edge==='top'?128:-128);
   assert.ok(result.maxDisplacement<=1,`${selector} ${edge}: compositor moved ${result.maxDisplacement}px`);assert.deepEqual(await state(),before,'gesture moved a scroll ancestor or viewport');
   report.editor.push({...result,selector,edge,behavior:setup.behavior});await target.locator('[data-elasticity-marker]').evaluate(node=>node.remove());console.log('PASS',selector,edge,result.maxDisplacement+'px');
  }
  const after=await(await fetch(new URL('/api/documents/'+encodeURIComponent(id),address))).json();assert.deepEqual(after,snapshot,'diagnostic must not modify document or version');assert.deepEqual(writes,[],'diagnostic must not issue API mutations');report.documentUnchanged=true;
 }finally{await context.close();}
}
try{
 report.executable=await executable();browser=await chromium.launch({executablePath:report.executable,headless:!values.headed,timeout:15000,args:['--no-sandbox','--disable-dev-shm-usage',values['disable-elasticity']?'--disable-features=ElasticOverscroll':'--enable-features=ElasticOverscroll']});report.browser=browser.version();
 calibration: for(const behavior of ['auto','contain','none'])for(const edge of ['top','bottom']){const result=await calibrate(behavior,edge);report.calibration.push(result);console.log('CALIBRATE',behavior,edge,result.maxDisplacement+'px');if(behavior!=='none'&&result.maxDisplacement<3)break calibration;}
 const controls=report.calibration.filter(result=>result.behavior!=='none');
 if(controls.some(result=>result.maxDisplacement<3)){report.status='not-covered';report.reason='Positive control did not produce visible elastic overscroll; protected samples cannot be called passed';process.exitCode=2;}
 else{
  for(const result of report.calibration.filter(result=>result.behavior==='none'))assert.ok(result.maxDisplacement<=1,`overscroll-behavior:none failed at ${result.edge}`);
  if(values.editor)await checkEditor(values.editor);
  report.status='passed';
 }
}catch(error){report.status='failed';report.error=String(error);console.error(report.error);process.exitCode=1;}
finally{await browser?.close();await save();console.log(report.status,path.join(out,'result.json'));}
