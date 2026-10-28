import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from '@playwright/test';
const base='http://127.0.0.1:4322',browser=await chromium.launch({executablePath:chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{for(const sample of process.argv.slice(2).length?process.argv.slice(2):['motion','manim','whiteboard']){
 const {id}=JSON.parse(await readFile(`.local/motale-film/${sample}-export-job.json`)),doc=JSON.parse(await readFile(`.local/motale-film/${sample}-three-acts.film.json`)),job=await(await fetch(base+'/film-export/jobs/'+id)).json();assert.equal(job.state,'complete',JSON.stringify(job));
 const page=await browser.newPage({viewport:{width:1280,height:780}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));const failed=[];page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto(base+job.preview);await page.waitForFunction(()=>!!window.NotaleFilmRenderer&&!!document.querySelector('iframe[src*="fixtures"]'));
 const at=doc.markers.find(m=>m.title==='观众接手').at/30;await page.evaluate(t=>window.film.frame(t),at);
 assert.equal(await page.locator('.film-subtitles').textContent(),`${sample} · 剪辑字幕`);
 const target=page.frames().find(f=>f.url().includes(`/fixtures/motale/${sample}/index.html`));assert.ok(target);await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(t=>window.NotaleFilmRenderer.state().time>t,at);
 const hit=await target.evaluate(()=>{for(let y=88;y<680;y+=16)for(let x=24;x<1250;x+=16)if([[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy])=>shell.hitTest({x:x+dx,y:y+dy}))){const r=document.querySelector('#stage').getBoundingClientRect();return {x,y,rect:{x:r.x,y:r.y,width:r.width,height:r.height},before:shell.state().activeBranch};}return null;});assert.ok(hit);
 const box=await page.locator('.film-source:not([hidden]) iframe[src*="fixtures"]').boundingBox(),x=box.x+(hit.rect.x+hit.x/1280*hit.rect.width)*box.width/1280,y=box.y+(hit.rect.y+hit.y/720*hit.rect.height)*box.height/720;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+12,{steps:6});await page.mouse.up();await target.waitForFunction(before=>shell.state().activeBranch!==before,hit.before);await page.waitForFunction(()=>!window.NotaleFilmRenderer.state().playing);assert.match(await page.locator('#status').textContent(),/观众已接手/);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await page.screenshot({path:`.local/motale-film/${sample}-html-export.png`});console.log(`PASS ${sample} packaged three acts + native overlay/captions + real pointer takeover during playback`);await page.close();
}}finally{await browser.close();}
