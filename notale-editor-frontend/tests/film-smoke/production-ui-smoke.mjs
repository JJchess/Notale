import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
await new Promise((resolve,reject)=>{
 const req=http.get('http://127.0.0.1:4322/film',{headers:{host:'film-build.localhost:4322'}},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(new Error(`Production not ready: ${res.statusCode}`)));});req.on('error',reject);
});
const browser=await chromium.launch({executablePath:process.env.MOTALE_CHROMIUM??chromium.executablePath(),headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 await page.goto('http://film-build.localhost:4322/film');await page.locator('.film-workbench').waitFor();
 assert.ok(await page.locator('script[src*="/_next/"]').count(),'Actual production Next bundle');
 assert.equal(await page.locator('[data-role="sample"]').count(),0,'Production has no unavailable fixture selector');
 await page.getByText('导入 Motale 幕表',{exact:true}).click();await page.getByLabel('网页地址',{exact:true}).fill('/fixtures/motale/motion/index.html');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'选择 acts.json',exact:true}).click();await(await chooser).setFiles('fixtures/motale/motion/acts.json');
 await page.locator('.film-pool-item').waitFor();await page.locator('[data-role="source-act"]').selectOption('3');await page.locator('[data-action="source-append"]').click();
 try { await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.contentWindow?.shell?.state().time===90)); }
 catch (error) { console.log(await page.evaluate(()=>({status:document.querySelector('[data-role=status]')?.textContent,frames:[...document.querySelectorAll('iframe')].map(f=>({src:f.src,ready:f.contentDocument?.readyState,shell:!!f.contentWindow?.shell,state:f.contentWindow?.shell?.state(),text:f.contentDocument?.body?.textContent?.slice(0,160)}))})),errors);throw error; }
 await page.locator('[data-action="next"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>Math.abs((f.contentWindow?.shell?.state().time??0)-(90+1/30))<1e-6));
 const pending=page.waitForEvent('download');await page.locator('[data-action="download"]').click();const downloaded=await pending,doc=JSON.parse(await readFile(await downloaded.path(),'utf8'));
 assert.equal(doc.sources[0].uri,'/fixtures/motale/motion/index.html');assert.deepEqual(doc.tracks[0].clips.map(c=>[c.in,c.duration]),[[90,960]]);
 assert.equal(await page.locator('.film-workbench').evaluate(n=>getComputedStyle(n).overscrollBehavior),'none');
 assert.deepEqual(errors,[]);await page.screenshot({path:'.local/motale-film/production-film.png'});
 // The stable standalone candidate must still expose the three local samples.
 await page.goto('http://127.0.0.1:4322/film');await page.locator('[data-role="sample"]').waitFor();
 assert.equal(await page.locator('[data-role="sample"] option').count(),3);
 assert.deepEqual(errors,[]);
 console.log('PASS Next production hydration + generic acts.json import + source range playback/frame step + JSON + retained standalone candidate');
} finally {await browser.close();}
