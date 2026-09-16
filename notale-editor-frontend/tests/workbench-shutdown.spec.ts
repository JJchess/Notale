import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('same-task command and disposal preserve the admitted command in IndexedDB',async({page})=>{
 const id=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Before',width:1600,height:900,slides:[{id:'first',name:'First',sourcePath:'first.html',html:'<html><body><p data-notale-id="text">Text</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const rejected=await page.evaluate(async()=>{const workbench=(window as any).NotaleWorkbench;const pending=workbench.commands([{type:'deck.update',title:'Retained'}]);workbench.dispose();try{await pending;return false;}catch{return true;}});
 expect(rejected).toBe(true);
 await expect.poll(()=>page.evaluate(async()=> (await navigator.locks.query()).held?.filter(lock=>lock.name?.startsWith('notale-tab:')).length)).toBe(0);
 const entries=await page.evaluate(async documentId=>{
  const result:any[]=[];
  for(const info of await indexedDB.databases()){
   if(!info.name)continue;
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(info.name!);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   try{if(db.objectStoreNames.contains('operations'))result.push(...await new Promise<any[]>((resolve,reject)=>{const request=db.transaction('operations').objectStore('operations').getAll();request.onsuccess=()=>resolve(request.result.filter(entry=>entry.documentId===documentId));request.onerror=()=>reject(request.error);}));}finally{db.close();}
  }
  return result;
 },id);
 expect(entries).toHaveLength(1);expect(entries[0].state).toBe('recovery');expect(entries[0].task.request.commands[0].title).toBe('Retained');
 expect((await page.request.get('/api/documents/'+id).then(response=>response.json())).document.title).toBe('Before');
});
test('disposing workbench retains an in-flight save and releases document ownership after acknowledgement',async({page})=>{
 const id=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'退出验证',width:1600,height:900,slides:[{id:'first',name:'第一页',sourcePath:'first.html',html:'<html><body><div data-notale-id="text">Text</div></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 await page.route('**/api/documents/*/sync/v2',async route=>{entered();await gate;await route.continue();});
 try{
  await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'保存后退出'}]));
  await started;
  await page.evaluate(()=>(window as any).NotaleWorkbench.dispose());
  await expect(page.locator('#canvas-host iframe')).toHaveCount(0);
  await expect(page.locator('.closing-session-notice')).toBeVisible();
  const rejected=await page.evaluate(async()=>{try{await (window as any).NotaleWorkbench.commands([{type:'deck.update',title:'late'}]);return false;}catch{return true;}});
  expect(rejected).toBe(true);
  release();
  await expect(page.locator('.closing-session-notice')).toHaveCount(0);
  await expect.poll(async()=>{const result=await page.request.get('/api/documents/'+id).then(r=>r.json());return result.document.title;}).toBe('保存后退出');
  const locks=await page.evaluate(async()=>(await navigator.locks.query()).held?.filter(lock=>lock.name?.startsWith('notale-tab:')).length);
  expect(locks).toBe(0);
 }finally{release();}
});
