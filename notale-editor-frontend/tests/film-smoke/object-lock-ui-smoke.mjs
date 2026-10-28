import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.MOTALE_PREVIEW_URL??'http://127.0.0.1:4322';assert.equal((await fetch(base+'/film')).status,200);
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(5000);await page.goto(base+'/film');await page.getByRole('button',{name:'文字',exact:true}).click();
 const iframe=page.locator('[data-preview-clip-id] iframe').first();await iframe.waitFor();const frame=await(await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.NotaleBridge?.state().mode==='edit');
 const box=await iframe.boundingBox(),r=await frame.locator('#stage > p').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};});
 await page.mouse.dblclick(box.x+r.x*box.width/r.w,box.y+r.y*box.height/r.h);await frame.locator('[contenteditable="true"]').waitFor();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('Locked draft');
 await page.getByRole('checkbox',{name:'锁定对象',exact:true}).check();await page.waitForTimeout(150);
 assert.equal(await frame.locator('[contenteditable="true"]').count(),0,'Lock must close an existing text session');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载工作副本'}).click();const doc=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.match(doc.tracks[0].clips[0].overlayHtml,/Locked draft/);assert.equal(doc.tracks[0].clips[0].objects['overlay-0'].locked,true);
 console.log('PASS locking an active text session closes editing and preserves the typed working copy');
}finally{await browser.close();}
