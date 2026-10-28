import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '@playwright/test';

const base=process.env.MOTALE_PREVIEW_URL??'http://film-build.localhost:4322';
assert.equal((await fetch(base)).status,200,'candidate must be ready before creating fixtures');
const reuseFilm=process.env.MOTALE_SMOKE_FILM_ID,reuseDeck=process.env.MOTALE_SMOKE_DECK_ID;
assert.equal(!!reuseFilm,!!reuseDeck,'reuse both isolated fixture IDs together');
const filmId=reuseFilm??randomUUID(),deckId=reuseDeck??randomUUID();
const film={kind:'film',schemaVersion:1,id:filmId,title:'共享侧栏验证 '+filmId.slice(0,6),width:1280,height:720,frameRate:{numerator:30,denominator:1},sources:[{id:'title',kind:'overlay',title:'标题',uri:'overlay:title',html:'<p data-notale-id="label" style="position:absolute;left:120px;top:150px;width:900px;font:56px sans-serif;color:#6c18f5">同一个编辑器</p><p data-notale-id="badge" style="position:absolute;left:120px;top:470px;width:700px;font:28px sans-serif;color:#29272e">第二个对象</p>'}],tracks:[{id:'visual',kind:'media',title:'画面',hidden:false,muted:false,locked:false,clips:[{id:'first',sourceId:'title',title:'标题场景',at:0,in:0,duration:300}]}],markers:[]};
async function post(document){const response=await fetch(base+'/api/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(document)});assert.equal(response.status,201,await response.text());}
if(!reuseFilm){
 await post({schemaVersion:1,kind:'film',id:filmId,title:film.title,width:1280,height:720,slides:[],film});
 await post({schemaVersion:1,id:deckId,title:'共享讲义验证 '+deckId.slice(0,6),width:1280,height:720,slides:[{id:'first',name:'标题页',sourcePath:'first.html',html:'<!doctype html><html><body style="margin:0"><main id="stage" data-notale-id="stage" style="position:absolute;width:1280px;height:720px"><h1 data-notale-id="heading" style="position:absolute;left:120px;top:180px;width:1000px;font-size:40px">讲义保留原来的编辑方式</h1></main></body></html>'}]});
}
async function read(id){const response=await fetch(base+'/api/documents/'+id);assert.equal(response.status,200);return response.json();}
const clips=snapshot=>snapshot.document.film.tracks.flatMap(track=>track.kind==='media'?track.clips:[]);
const clip=(snapshot,id='first')=>clips(snapshot).find(item=>item.id===id);
const html=(snapshot,id='first')=>{const item=clip(snapshot,id);return item.overlayHtml??snapshot.document.film.sources.find(source=>source.id===item.sourceId)?.html??'';};
const opacityKeys=snapshot=>clip(snapshot).objects?.label?.keyframes?.opacity??[];
async function stored(id,predicate,message){const deadline=Date.now()+10000;let snapshot;do{snapshot=await read(id);if(predicate(snapshot))return snapshot;await delay(100);}while(Date.now()<deadline);assert.fail(message+'; persisted='+JSON.stringify(snapshot));}

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??chromium.executablePath(),headless:true,args:['--no-sandbox']});
let phase='open';
try{
 const page=await browser.newPage({viewport:{width:1440,height:940},locale:'zh-CN'});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 const saved=()=>page.waitForFunction(()=>document.querySelector('#save-status')?.getAttribute('data-state')==='saved');
 async function panel(tool){const button=page.locator('[data-tool="'+tool+'"]');if(await button.getAttribute('aria-pressed')!=='true')await button.click();}
 async function frameOf(iframe){await iframe.waitFor({state:'visible'});const frame=await(await iframe.elementHandle()).contentFrame();assert.ok(frame,'iframe must have a browsing context');return frame;}
 function filmFrame(id='first'){return page.locator('.film-picture [data-preview-clip-id="'+id+'"] iframe');}
 async function nativeText(iframe,selector,value,finish=true){
  const frame=await frameOf(iframe),target=frame.locator(selector).first();await target.waitFor({state:'visible'});
  const editable=frame.locator('#stage [contenteditable="true"]').first();
  const alreadyEditing=await editable.isVisible();
  {
   const filmContainer=iframe.locator('..');
   if(await iframe.evaluate(node=>!!node.closest('[data-preview-clip-id]')))await filmContainer.locator('.film-overlay-hit-regions > div').first().waitFor({state:'attached'});
   // Native pointer coordinates account for the iframe's actual CSS scaling.
   const local=await (alreadyEditing?editable:target).evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};}),bounds=await iframe.boundingBox();assert.ok(bounds);
   const x=bounds.x+local.x*bounds.width/local.w,y=bounds.y+local.y*bounds.height/local.h;
   await page.mouse.move(x,y);
   await page.waitForFunction(node=>getComputedStyle(node).pointerEvents!=='none',await iframe.elementHandle());
   if(alreadyEditing)await page.mouse.click(x,y);else await page.mouse.dblclick(x,y);
  }
  await editable.waitFor({state:'visible'});await page.keyboard.press('Control+a');await page.keyboard.type(value);assert.equal(await editable.innerText(),value,'native text must replace the full editable value');if(finish)await page.keyboard.press('Escape');
 }
 async function chooseFixtureObject(id){await page.locator('[data-clip-id="first"] .film-clip-body').click();await panel('objects');const row=page.locator('#objects [data-object="'+id+'"]');await row.click();assert.equal(await row.getAttribute('aria-pressed'),'true');}
 async function clickCanvasObject(id){
  const iframe=filmFrame(),frame=await frameOf(iframe),target=frame.locator('[data-notale-id="'+id+'"]');await target.waitFor();
  await iframe.locator('..').locator('.film-overlay-hit-regions > div').first().waitFor({state:'attached'});
  const local=await target.evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};}),bounds=await iframe.boundingBox();assert.ok(bounds);
  const x=bounds.x+local.x*bounds.width/local.w,y=bounds.y+local.y*bounds.height/local.h;await page.mouse.move(x,y);await page.waitForFunction(node=>getComputedStyle(node).pointerEvents!=='none',await iframe.elementHandle());await page.mouse.click(x,y);
 }
 async function fontPanel(){await panel('style');const scope=page.locator('#format-scope-text');if(await scope.isVisible())await scope.click();await page.locator('#format-tab-font').click();}
 async function setFontSize(size){await fontPanel();const input=page.locator('#font-size');await input.fill(String(size));await input.press('Tab');}
 const catalog=()=>page.locator('#insert-drawer [data-insert]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-insert')+':'+(node.getAttribute('data-symbol')??'')));
 async function file(id){await page.locator('#file-menu-trigger').click();await page.locator('#file-menu [data-document="'+id+'"]').click();await page.waitForURL(url=>url.searchParams.get('document')===id);}

 await page.goto(base+'/film?film='+filmId);await saved();
 assert.equal(new URL(page.url()).pathname,'/');assert.equal(new URL(page.url()).searchParams.get('document'),filmId);
 assert.equal(await page.locator('.app-header').count(),1);assert.equal(await page.locator('.workspace').count(),1);
 assert.equal(await page.locator('.film-header,.film-workbench,.film-library,.film-inspector').count(),0);
 phase='shared document dimensions / single undo';
 await panel('style');assert.deepEqual(await page.locator('#property-panel [data-format-tab]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-format-tab'))),['page']);
 await page.locator('#format-tab-page').click();await page.locator('#deck-width').fill('1200');await page.locator('#save-deck-size').click();
 await stored(filmId,value=>value.document.width===1200&&value.document.film.width===1200,'shared size settings must update both root and film dimensions');await saved();
 await page.locator('#undo').click();await stored(filmId,value=>value.document.width===1280&&value.document.film.width===1280,'one undo must restore root and film dimensions together');await saved();
 phase='shared text / font / layers';
 await nativeText(filmFrame(),'[data-notale-id="label"]','共享画布中的文字');
 await stored(filmId,snapshot=>html(snapshot).includes('共享画布中的文字'),'native film text must persist');await saved();
 await setFontSize(52);await stored(filmId,snapshot=>clip(snapshot).objects?.label?.values?.['font-size']==='52px','shared typography must persist');await saved();
 await chooseFixtureObject('badge');await page.locator('#objects [data-object="label"]').click();
 assert.equal(await page.locator('#objects [data-object="badge"]').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#objects [data-object="label"]').getAttribute('aria-pressed'),'true');
 phase='timeline deselection / canvas reselect of the same object';
 await page.locator('[data-clip-id="first"] .film-clip-body').click();
 await page.waitForFunction(()=>document.querySelector('#objects [data-object="label"]')?.getAttribute('aria-pressed')==='false');
 await clickCanvasObject('label');
 await page.waitForFunction(()=>document.querySelector('#objects [data-object="label"]')?.getAttribute('aria-pressed')==='true');

 phase='shared catalog insertion';
 await panel('insert');const filmCatalog=await catalog();assert.ok(filmCatalog.includes('text:')&&filmCatalog.includes('shape:rect:'));
 await page.locator('#insert-drawer [data-insert="text"]').click();
 let snapshot=await stored(filmId,value=>clips(value).length===2,'text insertion must create exactly one clip');
 const textId=clips(snapshot).find(item=>item.id!=='first').id;
 assert.equal(clip(snapshot,textId).at,0);assert.equal(clip(snapshot,textId).duration,300);
 phase='native blur commit must retain its origin and the new selection';
 await nativeText(filmFrame(textId),'#stage > [data-notale-id]','从共同素材目录插入',false);
 await page.locator('[data-clip-id="first"] .film-clip-body').click();
 await stored(filmId,value=>html(value,textId).includes('>从共同素材目录插入</p>'),'clicking another clip must save the exact text into its original clip');await saved();
 assert.equal(await page.locator('[data-clip-id="first"] .film-clip-body').getAttribute('aria-pressed'),'true','late native text commands must not restore the old selection');
 assert.equal(await page.locator('[data-clip-id="'+textId+'"] .film-clip-body').getAttribute('aria-pressed'),'false');
 await panel('objects');assert.ok(await page.locator('#objects [data-object="label"]').isVisible(),'sidebar must still describe the newly selected clip');
 assert.ok(html(await read(filmId)).includes('共享画布中的文字'),'late text commit must not overwrite the newly selected clip');
 phase='shared catalog shape insertion';
 await panel('insert');await page.locator('#insert-drawer [data-insert="shape:rect"]').click();
 snapshot=await stored(filmId,value=>clips(value).length===3,'shape insertion must create exactly one clip');
 const shapeId=clips(snapshot).find(item=>!['first',textId].includes(item.id)).id;
 assert.equal(clip(snapshot,shapeId).at,0);assert.equal(clip(snapshot,shapeId).duration,300);await saved();
 await panel('style');assert.equal(await page.locator('#property-panel .format-tabs').count(),1);
 assert.ok(await page.locator('#format-tab-fill').isVisible());assert.equal(await page.locator('.film-appearance,.film-object-inspector').count(),0);

 phase='current-frame keys / single undo and redo / cancel';
 await chooseFixtureObject('label');await panel('animation');
 const timing=page.locator('#property-panel [data-panel="animation"] .film-property-timing');
 await timing.locator('[aria-label="动画属性"]').selectOption('opacity');
 await timing.locator('.film-property-key').click();
 await stored(filmId,value=>opacityKeys(value).some(key=>key.frame===0),'first opacity key must persist');await saved();
 const seek=page.locator('[data-role="seek"]');await seek.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('#property-panel [data-panel="animation"] .film-property-timing output')?.textContent==='1 帧');
 const opacity=timing.locator('input[aria-label="不透明度"]');await opacity.fill('0.65');await opacity.press('Enter');
 snapshot=await stored(filmId,value=>opacityKeys(value).some(key=>key.frame===1&&Number(key.value)===.65),'editing an animated property between keys must create the current-frame key');await saved();
 assert.equal(opacityKeys(snapshot).length,2);assert.equal(clip(snapshot).objects?.label?.values?.opacity,undefined);
 await page.locator('#undo').click();await stored(filmId,value=>opacityKeys(value).length===1&&!opacityKeys(value).some(key=>key.frame===1),'one undo must remove the single new key');await saved();
 await page.locator('#redo').click();snapshot=await stored(filmId,value=>opacityKeys(value).length===2&&opacityKeys(value).some(key=>key.frame===1&&Number(key.value)===.65),'one redo must restore the key');await saved();
 const cancelVersion=snapshot.version,cancelledKeys=JSON.stringify(opacityKeys(snapshot));
 await opacity.fill('0.25');await opacity.press('Escape');assert.equal(Number(await opacity.inputValue()),.65);
 snapshot=await read(filmId);assert.equal(snapshot.version,cancelVersion,'Escape must not save the discarded value');assert.equal(JSON.stringify(opacityKeys(snapshot)),cancelledKeys);
 await page.reload();await saved();await page.locator('[data-clip-id="first"]').waitFor();snapshot=await read(filmId);
 assert.ok(html(snapshot,textId).includes('从共同素材目录插入'));assert.equal(clips(snapshot).length,3);assert.equal(JSON.stringify(opacityKeys(snapshot)),cancelledKeys);

 phase='real deck edit / shared UI / document isolation';
 const beforeDeck=await read(filmId);await file(deckId);await page.locator('#canvas').waitFor({state:'visible'});await saved();
 assert.equal(await page.locator('.film-surface').count(),0);assert.equal(await page.locator('.workspace').count(),1);assert.equal(await page.locator('.app-header').count(),1);
 await panel('insert');assert.deepEqual(await catalog(),filmCatalog,'both documents must render the same insertion catalog');
 await nativeText(page.locator('#canvas'),'[data-notale-id="heading"]','共享侧栏中的讲义修改');
 await stored(deckId,value=>value.document.slides[0].html.includes('共享侧栏中的讲义修改'),'deck editing must use real canvas interaction');await saved();
 await fontPanel();assert.ok(await page.locator('#font-size').isVisible());
 await panel('objects');assert.ok(await page.locator('#objects [data-object="heading"]').isVisible());
 const afterDeck=await read(filmId);assert.equal(afterDeck.version,beforeDeck.version);assert.deepEqual(afterDeck.document.film,beforeDeck.document.film);
 const deckVersion=(await read(deckId)).version;await file(filmId);await saved();await page.locator('[data-clip-id="first"]').waitFor();
 await chooseFixtureObject('label');await setFontSize(54);await stored(filmId,value=>clip(value).objects?.label?.values?.['font-size']==='54px','film properties must rebind after switching back');await saved();
 assert.equal((await read(deckId)).version,deckVersion,'film edits must not use the old deck command binding');

 phase='timeline collapse and responsive boundaries';
 const toggle=page.getByRole('button',{name:'收起 / 展开时间线',exact:true});await toggle.click();assert.equal(await page.locator('.film-timeline').getAttribute('data-collapsed'),'true');await toggle.click();
 await panel('style');
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,scroll:[...document.querySelectorAll('.film-timeline-scroll,#property-panel,.tool-rail,.page-rail-scroll')].map(node=>getComputedStyle(node).overscrollBehavior)}));
 assert.ok(layout.overflow<=1,JSON.stringify(layout));assert.ok(layout.scroll.every(value=>value==='none'),JSON.stringify(layout));
 await page.setViewportSize({width:760,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const narrow=await page.locator('#property-panel').evaluate(node=>({position:getComputedStyle(node).position,width:node.getBoundingClientRect().width}));assert.equal(narrow.position,'absolute');assert.ok(narrow.width<=640);
 await page.setViewportSize({width:1440,height:940});assert.deepEqual(errors,[]);
 await page.screenshot({path:'.local/motale-film/shared-sidebar.png'});
 console.log('PASS shared sidebar/catalog/format/layers + native canvas and inserts + opacity key/undo/redo/cancel + deck↔film isolation + reload + responsive boundaries',JSON.stringify({filmId,deckId,textId,shapeId}));
}catch(error){console.error('FAIL',JSON.stringify({phase,filmId,deckId}));throw error;}finally{await browser.close();}
