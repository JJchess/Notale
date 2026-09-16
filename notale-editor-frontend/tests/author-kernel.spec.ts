import {test,expect,type Page} from '@playwright/test';
import {reveal} from './harness/format-panel';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.NEXT_TEST_URL??'http://127.0.0.1:4399'});
async function ready(page:Page){await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());}
async function patch(page:Page,style:Record<string,string>){await page.evaluate(style=>(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'first',target:'box',patch:{style}}]),style);}
async function synced(page:Page){await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());}
test('incremental edits, pending undo, remote merge and reopen preserve runtime',async({page,context})=>{
 const id=randomUUID();
 const created=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'本地事务 · 隔离验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<!doctype html><html><body style="margin:0"><main data-notale-id="stage" style="width:1600px;height:900px"><div data-notale-id="box" style="position:absolute;left:180px;top:180px;width:300px;height:150px;background-color:rgb(255,0,0)">对象</div><button data-notale-id="counter" onclick="this.textContent=Number(this.textContent)+1">0</button></main></body></html>'}]}});
 expect(created.status()).toBe(201);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready(page);
 const canvas=page.frameLocator('#canvas'),box=canvas.locator('[data-notale-id="box"]');
 await canvas.locator('[data-notale-id="counter"]').evaluate(e=>{e.textContent='7';(window as any).__retained=e;});
 const src=await page.locator('#canvas').getAttribute('src');let requests=0;
 await page.route('**/api/documents/*/sync/v2',async route=>{requests++;await new Promise(r=>setTimeout(r,550));await route.continue();});
 await patch(page,{'background-color':'#00ff00'});
 await expect(box).toHaveCSS('background-color','rgb(0, 255, 0)');
 await patch(page,{'background-color':'#0000ff'});
 await expect(box).toHaveCSS('background-color','rgb(0, 0, 255)');
 await page.locator('#undo').click();
 await expect(box).toHaveCSS('background-color','rgb(0, 255, 0)');
 await synced(page);
 expect(await page.locator('#canvas').getAttribute('src')).toBe(src);
 expect(await canvas.locator('[data-notale-id="counter"]').evaluate(e=>e===(window as any).__retained&&e.textContent==='7')).toBe(true);
 await page.unroute('**/api/documents/*/sync/v2');
 const head=await page.request.get('/api/documents/'+id).then(r=>r.json());
 const remote=await page.request.post('/api/documents/'+id+'/sync/v2',{data:{baseVersion:head.version,mutationId:randomUUID(),commands:[{type:'element.patch',slideId:'first',target:'box',patch:{style:{'border-radius':'23px'}}}]}});
 expect(remote.status()).toBe(200);expect((await remote.json()).change.changes.some((p:any)=>p.splice)).toBe(true);
 await patch(page,{'background-color':'#112233'});await synced(page);
 await expect(box).toHaveCSS('border-radius','23px');await expect(box).toHaveCSS('background-color','rgb(17, 34, 51)');
 expect(await page.locator('#canvas').getAttribute('src')).toBe(src);
 await page.reload({waitUntil:'domcontentloaded'});await ready(page);
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="box"]')).toHaveCSS('background-color','rgb(17, 34, 51)');
 expect(requests).toBeGreaterThan(0);
});
test('lost acknowledgement is retried exactly once',async({page})=>{
 const id=randomUUID();await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'幂等重试 · 隔离验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<html><body><div data-notale-id="box" style="width:200px;height:100px;background-color:red">重试</div></body></html>'}]}});
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready(page);
 let lost=false;await page.route('**/api/documents/*/sync/v2',async route=>{if(!lost){lost=true;expect((await route.fetch()).status()).toBe(200);await route.abort();}else await route.continue();});
 await patch(page,{'background-color':'#abcdef'});await expect.poll(()=>lost).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSyncState().pending)).toBe(0);
 const head=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(head.version).toBe(2);
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="box"]')).toHaveCSS('background-color','rgb(171, 205, 239)');
});
test('prepared insertion keeps object identity through confirmation and undo',async({page})=>{
 const id=randomUUID();await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'结构事务 · 隔离验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<html><body><main data-notale-id="stage"><div data-notale-id="box" style="width:200px;height:100px;background-color:red">原对象</div></main></body></html>'}]}});
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready(page);const src=await page.locator('#canvas').getAttribute('src');
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.insert',slideId:'first',parent:'stage',html:'<div style="width:100px;height:100px;background:blue">新对象</div>'}]));
 const inserted=await page.evaluate(()=>(window as any).NotaleWorkbench.getObjects().find((o:any)=>o.text==='新对象')?.id);expect(inserted).toBeTruthy();
 await synced(page);await expect(page.frameLocator('#canvas').locator('[data-notale-id="'+inserted+'"]')).toHaveCount(1);
 await page.locator('#undo').click();await expect(page.frameLocator('#canvas').locator('[data-notale-id="'+inserted+'"]')).toHaveCount(0);await synced(page);
 await page.locator('#redo').click();await synced(page);await expect(page.frameLocator('#canvas').locator('[data-notale-id="'+inserted+'"]')).toHaveCount(1);
 expect(await page.locator('#canvas').getAttribute('src')).toBe(src);
});
test('property preview cancellation restores the visible object without saving',async({page})=>{
 const id=randomUUID();await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'连续属性 · 隔离验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<html><body><div data-notale-id="box" style="position:absolute;width:200px;height:100px;background-color:red;opacity:1">属性</div></body></html>'}]}});
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready(page);await page.evaluate(()=>(window as any).NotaleWorkbench.select('box'));
 await reveal(page,'#appearance-opacity');const opacity=page.locator('#appearance-opacity');await expect(opacity).toBeVisible();await opacity.focus();await opacity.evaluate((input:HTMLInputElement)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'40');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const box=page.frameLocator('#canvas').locator('[data-notale-id="box"]');await expect(box).toHaveCSS('opacity','0.4');await opacity.press('Escape');await expect(box).toHaveCSS('opacity','1');await synced(page);
 expect((await page.request.get('/api/documents/'+id).then(r=>r.json())).version).toBe(1);
});
