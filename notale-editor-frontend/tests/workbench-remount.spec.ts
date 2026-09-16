import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('new workbench edits independently while its predecessor finishes saving',async({page})=>{
 const first=randomUUID(),second=randomUUID();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [id,title] of [[first,'Old'],[second,'New']])expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title,width:1600,height:900,slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body><p data-notale-id="text">Hello</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+first,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 await page.route(`**/api/documents/${first}/sync/v2`,async route=>{entered();await gate;await route.continue();});
 try{
  await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'Old saved'}]));await started;
  const rejected=await page.evaluate(id=>{const old=(window as any).NotaleWorkbench;old.dispose();history.replaceState(null,'','?document='+id);old.mount();try{old.select('text');return false;}catch{return true;}},second);expect(rejected).toBe(true);
  await page.waitForFunction(id=>(window as any).NotaleWorkbench.getSnapshot()?.document.id===id,second);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
  await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'New saved'}]));await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());release();
  await expect(page.locator('.closing-session-notice')).toHaveCount(0);
  await expect.poll(async()=>(await page.request.get('/api/documents/'+first).then(r=>r.json())).document.title).toBe('Old saved');
  expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.title)).toBe('New saved');
  await page.evaluate(()=>(window as any).NotaleWorkbench.select('text'));await expect(page.locator('#property-panel')).toBeVisible();
  expect(errors).toEqual([]);
 }finally{release();}
});
