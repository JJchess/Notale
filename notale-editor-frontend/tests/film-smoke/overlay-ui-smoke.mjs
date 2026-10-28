import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';
for(const path of ['/film','/film-overlay.html','/film-runtime/bridge.js','/film-runtime/text-editor.js'])assert.equal((await fetch(base+path)).status,200,path);
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(8000);page.on('dialog',d=>d.accept());
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/film');
 await page.getByRole('button',{name:'文字',exact:true}).click();
 const iframe=page.locator('[data-preview-clip-id] iframe').first();await iframe.waitFor();
 const frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.NotaleBridge?.state().mode==='edit');
 const text=frame.locator('#stage > p');
 // Convert iframe viewport coordinates because Chromium subframe locators omit the parent's CSS scale.
 async function point(locator,fx=.5,fy=.5){const box=await iframe.boundingBox(),local=await locator.evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight};});return{x:box.x+(local.x+local.width*fx)*box.width/local.vw,y:box.y+(local.y+local.height*fy)*box.height/local.vh};}
 async function drag(locator,dx,dy,fx=.5,fy=.5){const p=await point(locator,fx,fy);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();}
 const download=async()=>{const wait=page.waitForEvent('download');await page.getByRole('button',{name:'下载工作副本'}).click();return JSON.parse(await readFile(await(await wait).path(),'utf8'));};
 await drag(text,45,25);await page.waitForTimeout(120);
 assert.equal(await page.locator('.film-pool-item[aria-pressed="true"]').textContent(),'文字');
 let saved=await download();assert.match(saved.tracks[0].clips[0].overlayHtml,/matrix/);
 const click=await point(text);await page.mouse.click(click.x,click.y);
 await frame.locator('.moveable-control[data-direction="se"]').waitFor({state:'visible'});
 const width=await text.evaluate(n=>n.getBoundingClientRect().width);
 await drag(frame.locator('.moveable-control[data-direction="se"]'),35,15);await page.waitForTimeout(120);
 assert.ok(await text.evaluate(n=>n.getBoundingClientRect().width)>width+10,'existing Notale resize handle');
 const target=await point(text);await page.mouse.dblclick(target.x,target.y);
 await frame.locator('#stage [contenteditable="true"]').waitFor();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('Notale film overlay');await page.keyboard.press('ControlOrMeta+b');await page.keyboard.type(' BOLD');await page.keyboard.press('Escape');
 saved=await download();assert.match(saved.tracks[0].clips[0].overlayHtml,/Notale film overlay/);assert.match(saved.tracks[0].clips[0].overlayHtml,/font-weight: ?700/);
 assert.ok(!saved.tracks[0].clips[0].overlayHtml.includes('contenteditable'),'runtime editing attributes never enter author data');
 await page.getByRole('button',{name:'完成对象编辑',exact:true}).click();await frame.waitForFunction(()=>window.NotaleBridge.state().mode==='play');
 assert.equal(await iframe.locator('..').evaluate(n=>n.style.pointerEvents),'none');
 await page.getByRole('button',{name:'播放或暂停（空格）'}).click();await page.waitForTimeout(180);assert.notEqual(await page.locator('[data-role="time"]').textContent(),'00:00:00:00');await page.getByRole('button',{name:'播放或暂停（空格）'}).click();
 saved.tracks[0].clips[0].overlayHtml+='<script>window.__overlayProbe=true</script><img src=x onerror="window.__overlayProbe=true">';
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'打开影片 JSON'}).click();await(await chooser).setFiles({name:'overlay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 const reopened=page.frameLocator('[data-preview-clip-id] iframe');await reopened.locator('#stage > p').filter({hasText:'Notale film overlay'}).waitFor();
 const restored=page.frames().find(f=>f.url().includes('/film-overlay.html'));assert.equal(await restored.evaluate(()=>window.__overlayProbe),undefined);assert.equal(await reopened.locator('#stage script,#stage img').count(),0);
 assert.deepEqual(errors,[]);await page.screenshot({path:'.local/motale-film/overlay.png'});
 console.log('PASS existing Notale selection/drag/resize + native ProseMirror rich text + working-copy roundtrip + playback pointer release');
}finally{await browser.close();}
