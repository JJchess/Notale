import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';
assert.equal((await fetch(base+'/film')).status,200);
await mkdir('.local/motale-film/assets/openfilm',{recursive:true});
await writeFile('.local/motale-film/assets/openfilm/module.mjs', 'export const value=window.filmHost.name;');
await writeFile('.local/motale-film/assets/openfilm/value.json','{"label":"Relative resource"}');
await writeFile('.local/motale-film/assets/openfilm/page.html',`<!doctype html><html><head><style>
body{margin:0;background:#223548;color:white;font:24px sans-serif}#square{width:40px;height:40px;background:#dfbc89;animation:move 4s linear infinite}@keyframes move{from{transform:translateX(0)}to{transform:translateX(240px)}}
</style><script>
window.sawHost=!!window.filmHost;window.readyCount=0;window.activeDraws=0;window.maxDraws=0;
window.film={width:640,height:360,duration:3,async ready(){readyCount++;await new Promise(r=>setTimeout(r,20));const value=await fetch('./value.json').then(r=>r.json());document.querySelector('#label').textContent=value.label;window.loaded=true;},async frame(t){if(!loaded)throw Error('frame before ready');activeDraws++;maxDraws=Math.max(maxDraws,activeDraws);await new Promise(r=>setTimeout(r,12));const raf=await new Promise(requestAnimationFrame);window.sample={t,perf:performance.now(),date:Date.now(),random:Math.random(),raf};document.querySelector('#time').textContent=t.toFixed(4);activeDraws--;}};
</script><script type="module">import {value} from "./module.mjs";window.moduleValue=value;</script></head><body><p id="label"></p><p id="time"></p><div id="square"></div></body></html>`);
await writeFile('.local/motale-film/assets/openfilm/failure.html','<script>window.film={frame(){throw Error("explicit draw failure")}}</script>');
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(7000);page.on('dialog',d=>d.accept());
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/film');
 const action=name=>page.locator(`[data-action="${name}"]`).click();
 const seek=frame=>page.locator('[data-role="seek"]').evaluate((node,frame)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,String(frame));node.dispatchEvent(new Event('input',{bubbles:true}));},frame);
 if (!process.env.MOTALE_ERROR_ONLY) {
 await page.getByText('添加普通素材',{exact:true}).click();await page.locator('[name="kind"]').selectOption('openfilm');await page.locator('[name="uri"]').fill('/assets/openfilm/page.html');await page.locator('[name="duration"]').fill('5');await page.getByRole('button',{name:'加入素材库',exact:true}).click();await action('source-append');
 const drawn=async(t)=>page.waitForFunction(t=>[...document.querySelectorAll('.film-source')].some(n=>n.style.visibility!=='hidden'&&n.querySelector('iframe')?.contentWindow?.sample?.t===t),t);
 await drawn(0);const frame=page.frames().find(f=>f.url()==='about:srcdoc');assert.ok(frame);
 assert.deepEqual(await frame.evaluate(()=>({host:sawHost,module:moduleValue,ready:readyCount,label:document.querySelector('#label').textContent,size:[innerWidth,innerHeight]})),{host:true,module:'Notale',ready:1,label:'Relative resource',size:[640,360]});
 const snapshot=()=>frame.evaluate(()=>({...sample,css:getComputedStyle(document.querySelector('#square')).transform}));
 await seek(45);await drawn(1.5);const first=await snapshot();assert.equal(first.perf,1500);assert.equal(first.raf,1500);assert.equal(first.date,Date.UTC(2026,0,1)+1500);
 await seek(15);await drawn(.5);await seek(45);await drawn(1.5);assert.deepEqual(await snapshot(),first,'Non-monotonic frame repeat including random + CSS is deterministic');
 assert.equal(await frame.evaluate(()=>maxDraws),1,'Async frame calls do not overlap');
 await seek(120);await drawn(3-1e-6);assert.equal(await frame.evaluate(()=>readyCount),1);
 await seek(0);await drawn(0);await action('play');await page.waitForFunction(()=>Number(document.querySelector('[data-role="seek"]').value)>3);await action('play');
 await page.screenshot({path:'.local/motale-film/openfilm.png'});
 await page.getByRole('button',{name:'轨道设置：画面',exact:true}).click();await page.getByRole('button',{name:'删除轨道及片段',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.film-source iframe').length===0);
 assert.deepEqual(errors,[]);
 console.log('PASS OpenFilm pre-script host + ready + relative fetch + viewport + async frames + clocks/random/CSS + last-frame hold + deletion');
 }
 if(!await page.locator('[name="uri"]').isVisible())await page.getByText('添加普通素材',{exact:true}).click();
 await page.locator('[name="kind"]').selectOption('openfilm');await action('track-add');await page.locator('[name="uri"]').fill('/assets/openfilm/failure.html');await page.getByRole('button',{name:'加入素材库',exact:true}).click();await action('source-append');await action('play');
 await page.waitForFunction(()=>document.querySelector('[data-role="status"]').textContent.includes('explicit draw failure')&&document.querySelector('[data-action="play"]').getAttribute('aria-pressed')==='false');
 assert.equal(await page.locator('[data-action="play"]').getAttribute('aria-pressed'),'false');
 console.log('PASS OpenFilm render failure reports and stops playback');
}finally{await browser.close();}
