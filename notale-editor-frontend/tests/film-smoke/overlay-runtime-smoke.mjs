import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from '../../../notale-editor/node_modules/esbuild/lib/main.js';
import {chromium} from '@playwright/test';

const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';
for(const path of ['/film-overlay.html','/film-runtime/bridge.js','/film-runtime/text-editor.js'])assert.equal((await fetch(base+path)).status,200,path);
const bundle=new URL('../../../.local/motale-film/overlay-runtime-check.js',import.meta.url);
await build({stdin:{contents:"export {OverlayPage,cleanOverlayHtml,overlayGeometryCommands} from './src/film/overlay-page.ts';export {FilmPreview} from './src/film/preview.ts';export {template} from './src/templates.ts';",resolveDir:new URL('../../notale-editor-frontend',import.meta.url).pathname},outfile:bundle.pathname,bundle:true,format:'esm',platform:'browser',target:'es2022'});
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
 await page.route('**/overlay-runtime-check.js',async route=>route.fulfill({body:await readFile(bundle),contentType:'text/javascript'}));
 await page.route('**/overlay-runtime-check',route=>route.fulfill({body:'<!doctype html><html><head><style>html,body{margin:0}iframe{border:0}.film-source{position:absolute;transform-origin:center}.film-source>iframe{width:100%;height:100%}.film-stage-background,.film-subtitles{position:absolute;pointer-events:none}</style></head><body></body></html>',contentType:'text/html'}));
 await page.goto(base+'/overlay-runtime-check');
 await page.evaluate(async()=>{window.test=await import('/overlay-runtime-check.js');});
 if(!process.argv.includes('--pointer')){
 const roundtrip=await page.evaluate(()=>{
  const kinds=['text','vertical-text','wordart:gradient','wordart:outline','wordart:shadow','date','symbol','shape:rounded','shape:star','icon:star','line','code'];
  for(const kind of kinds){
   const html=window.test.template(kind,kind==='symbol'?'α':''),clean=window.test.cleanOverlayHtml(html),original=new DOMParser().parseFromString(html,'text/html'),safe=new DOMParser().parseFromString(clean,'text/html');
   if(original.body.textContent!==safe.body.textContent)throw Error(kind+' loses text');
   const a=[...original.body.querySelectorAll('*')],b=[...safe.body.querySelectorAll('*')];if(a.length!==b.length)throw Error(kind+' loses elements');
   for(let i=0;i<a.length;i++)for(const attr of a[i].attributes)if(b[i].getAttribute(attr.name)!==attr.value)throw Error(kind+' loses '+attr.name);
   if(window.test.cleanOverlayHtml(clean)!==clean)throw Error(kind+' sanitizer is not stable');
  }
  const attack=window.test.cleanOverlayHtml('<p data-notale-id="safe" onclick="alert(1)" style="animation:spin 2s;transition:color 1s;color:red">safe</p><script>alert(1)</script><iframe srcdoc="bad"></iframe><svg onload="alert(1)"><animate attributeName="x"/></svg><a href="javascript:alert(1)">link</a>');
  const safe=new DOMParser().parseFromString(attack,'text/html');if(safe.querySelector('script,iframe,animate,[onclick],[onload],[href]'))throw Error('unsafe author HTML survived');
  if(safe.querySelector('p').style.animation||safe.querySelector('p').style.transition)throw Error('CSS clock survived');
  const commands=window.test.overlayGeometryCommands([{id:'a',style:'opacity:0.4!important;transform:translateX(20px)'}],[{id:'a',style:'opacity:0.4!important;transform:translateX(50px)'}]);
  if(JSON.stringify(commands[0].patch.style)!==JSON.stringify({transform:'translateX(50px)'}))throw Error('gesture baked an untouched sampled value');
  return kinds.length;
 });
 assert.equal(roundtrip,12);
 await page.evaluate(()=>{
  window.errors=[];window.commands=[];window.selections=[];window.origins=[];
  const frame=document.createElement('iframe');frame.id='runtime';frame.width='800';frame.height='400';document.body.append(frame);
  window.author='<p data-notale-id="a" style="position:absolute;left:40px;top:60px;width:200px;font-size:32px;color:blue">Hello</p><div data-notale-id="b" style="position:absolute;left:400px;top:80px;width:100px;height:90px;background:green"></div>';
  window.overlay=new window.test.OverlayPage(frame,window.author,800,400,()=>{throw Error('legacy author path used');},message=>window.errors.push(message));
  window.overlay.bindAuthoring({selection:ids=>window.selections.push(ids),event:(type,data)=>{if(type==='gesture-active')window.gestureActive=data.active;},commands:(commands,origin)=>{
   window.commands.push(commands);window.origins.push({commands,origin});const doc=new DOMParser().parseFromString(window.author,'text/html');
   for(const command of commands){const node=doc.querySelector(`[data-notale-id="${command.target}"]`);if(command.patch?.richText!==undefined)node.innerHTML=command.patch.richText;if(command.patch?.style)for(const [property,value]of Object.entries(command.patch.style))node.style.setProperty(property,value);}
   window.author=doc.body.innerHTML;window.overlay.update(window.author);
  }});
  window.timer=setInterval(()=>window.overlay.prepare({a:{opacity:'.42',transform:'translateX(80px)'}},[]),16);
 });
 await page.waitForFunction(()=>window.overlay.frameReady);
 const before=await page.evaluate(()=>window.overlay.capture(['a']));
 await page.evaluate(()=>window.overlay.setEditing(true));
 const after=await page.evaluate(()=>window.overlay.capture(['a']));
 assert.equal(after.computedStyles.a.opacity,'0.42');assert.equal(after.computedStyles.a.transform,before.computedStyles.a.transform);assert.equal(after.rectangles[0].x,before.rectangles[0].x);
 const runtime=await(await page.locator('#runtime').elementHandle()).contentFrame();
 await page.mouse.click(155,80);await page.keyboard.down('Shift');await page.mouse.click(440,120);await page.keyboard.up('Shift');
 await page.waitForFunction(()=>window.selections.some(ids=>ids.length===2));
 await page.mouse.click(730,330);await page.waitForFunction(()=>window.selections.at(-1)?.length===0);
 await page.mouse.dblclick(155,80);await runtime.locator('[contenteditable=true]').waitFor();
 await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('Authored text');await page.keyboard.press('Escape');
 await page.evaluate(()=>window.overlay.flush());
 const authored=await page.evaluate(()=>({html:window.author,commands:window.commands,errors:window.errors}));
 assert.match(authored.html,/Authored text/);assert.doesNotMatch(authored.html,/opacity|translateX\(80px\)|contenteditable/);assert.deepEqual(authored.errors,[]);
 // Real native drag yields a delta command, not a sampled full-frame HTML copy.
 await page.mouse.move(155,80);await page.mouse.down();await page.mouse.move(190,105,{steps:5});await page.mouse.up();
 await page.waitForFunction(()=>window.commands.flat().some(command=>command.patch?.style?.transform));
 const drag=await page.evaluate(()=>window.commands.flat().filter(command=>command.patch?.style).at(-1));assert.equal(drag.patch.style.opacity,undefined);
 // A text session and a native gesture retain their actual authored frame even
 // when their final messages arrive after the host has sought elsewhere.
 await page.evaluate(()=>window.overlay.prepare({a:{opacity:'.42',transform:'translateX(80px)'}},[],{frame:12,documentId:'origin-doc',sourceId:'origin-source',clipAt:10,animationOffset:4}));
 await page.waitForFunction(()=>window.overlay.frameReady);await page.evaluate(()=>window.overlay.startText('a'));await runtime.locator('[contenteditable=true]').waitFor();
 await page.waitForFunction(()=>window.overlay.textOrigins.size===1);
 await page.evaluate(()=>window.overlay.prepare({a:{opacity:'.42',transform:'translateX(80px)'}},[],{frame:45,documentId:'origin-doc',sourceId:'origin-source',clipAt:10,animationOffset:4}));
 await page.waitForFunction(()=>window.overlay.frameReady);await page.keyboard.press('End');await page.keyboard.type(' delayed');
 await page.evaluate(()=>window.overlay.setEditing(false));await page.evaluate(()=>window.overlay.flush());
 const textOrigin=await page.evaluate(()=>window.origins.filter(entry=>entry.commands.some(command=>command.patch?.richText!==undefined)).at(-1)?.origin);
 assert.deepEqual(textOrigin,{frame:12,documentId:'origin-doc',sourceId:'origin-source',clipAt:10,animationOffset:4});
 await page.evaluate(()=>{window.overlay.setEditing(true);window.overlay.prepare({a:{opacity:'.42',transform:'translateX(80px)'}},[],{frame:24,documentId:'origin-doc',sourceId:'origin-source',clipAt:10,animationOffset:4});window.overlay.selectObjects(['a']);});
 await page.waitForFunction(()=>window.overlay.frameReady);await page.mouse.move(155,80);await page.mouse.down();await page.waitForFunction(()=>window.gestureActive===true);
 await page.evaluate(()=>window.overlay.prepare({a:{opacity:'.42',transform:'translateX(80px)'}},[],{frame:90,documentId:'origin-doc',sourceId:'origin-source',clipAt:10,animationOffset:4}));
 await page.waitForFunction(()=>window.overlay.frameReady);await page.mouse.move(185,105,{steps:5});await page.mouse.up();
 await page.waitForFunction(()=>window.origins.some(entry=>entry.origin?.frame===24&&entry.commands.some(command=>command.patch?.style?.transform)));
 assert.deepEqual(await page.evaluate(()=>window.errors),[]);
 await page.evaluate(()=>{clearInterval(window.timer);window.overlay.dispose();document.body.replaceChildren();});
 }
 // Two opaque full-stage frames leave blank pixels available to the lower UI.
 // Hold the native bridge while the already visible content receives a pointer.
 // Readiness must activate the stationary pointer without another mouse move.
 let releaseBridge;const bridgeReady=new Promise(resolve=>{releaseBridge=resolve;});
 await page.route('**/film-runtime/bridge.js',async route=>{await bridgeReady;await route.continue();});
 await page.evaluate(()=>{
  const root=document.createElement('div');root.style.cssText='position:relative;width:800px;height:400px';document.body.append(root);
  const under=document.createElement('button');under.textContent='Underlying interaction';under.style.cssText='position:absolute;left:650px;top:320px;z-index:0';under.onclick=()=>window.underClicks=(window.underClicks??0)+1;root.append(under);
  window.errors??=[];window.selected=[];window.preview=new window.test.FilmPreview(root,message=>window.errors.push(message),()=>{},()=>{});
  window.previewCommands=[];window.preview.bindAuthoring({commands:(clip,commands)=>window.previewCommands.push(...commands),selection:(clip,ids)=>window.selected.push({clip,ids})});
  const source=(id,x)=>({id,kind:'overlay',title:id,uri:'overlay:'+id,width:800,height:400,html:`<p data-notale-id="${id}" style="position:absolute;left:${x}px;top:80px;width:160px;font-size:32px">${id}</p>`});
  window.film={kind:'film',schemaVersion:1,id:'routing',title:'routing',width:800,height:400,frameRate:{numerator:30,denominator:1},sources:[source('front',320),source('back',80)],tracks:['front','back'].map(id=>({id,kind:'media',title:id,hidden:false,muted:false,locked:false,clips:[{id,sourceId:id,title:id,at:0,in:0,duration:100}]})),markers:[]};
  window.timer=setInterval(()=>window.preview.frame(window.film,0),16);
 });
 await page.waitForFunction(()=>document.querySelectorAll('.film-overlay-hit-regions > div').length>=2);
 await page.mouse.move(120,100);
 assert.equal(await page.locator('[data-preview-clip-id=back] iframe').evaluate(node=>node.style.pointerEvents),'none');
 releaseBridge();
 await page.waitForFunction(()=>window.preview.captureReady&&document.querySelectorAll('.film-overlay-hit-regions > div').length>=2);
 await page.waitForFunction(()=>document.querySelector('[data-preview-clip-id=back] iframe').style.pointerEvents==='auto');
 await page.mouse.click(120,100);
 await page.waitForFunction(()=>window.selected.some(s=>s.clip==='back'&&s.ids.includes('back')));
 await page.evaluate(()=>window.preview.startText('back','back',true));
 const back=await(await page.locator('[data-preview-clip-id=back] iframe').elementHandle()).contentFrame();
 await back.waitForFunction(()=>getSelection()?.toString()==='back');
 await page.keyboard.type('Replacement');await page.keyboard.press('Escape');await page.evaluate(()=>window.preview.flushAuthoring());
 const replacement=await page.evaluate(()=>window.previewCommands.filter(command=>command.patch?.richText!==undefined).at(-1)?.patch.richText);
 assert.equal(replacement,'Replacement');
 await page.mouse.move(350,100);await page.mouse.click(350,100);await page.waitForFunction(()=>window.selected.some(s=>s.clip==='front'&&s.ids.includes('front')));
 await page.mouse.move(710,335);
 await page.getByRole('button',{name:'Underlying interaction'}).click();assert.equal(await page.evaluate(()=>window.underClicks),1);
 await page.mouse.move(600,250);await page.mouse.click(600,250);await page.waitForFunction(()=>window.selected.at(-1)?.ids.length===0);
 await page.evaluate(()=>{clearInterval(window.timer);window.preview.dispose();});
 assert.deepEqual(errors,[]);
 console.log(process.argv.includes('--pointer')?'PASS stationary pointer after bridge readiness; native placeholder select-all; layered pointer routing':'PASS native template/sanitizer roundtrip; opaque capture; sampled frame stable in author mode; multi/empty selection; native text/drag commands do not bake untouched samples; late text/gesture preserve document/source/frame origin; stationary pointer after bridge readiness; native placeholder select-all; layered pointer routing');
}finally{await browser.close();}
