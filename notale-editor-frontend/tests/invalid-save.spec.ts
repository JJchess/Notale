import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.SAVE_TEST_URL??'http://127.0.0.1:4358'});
test('invalid queued requests remain recoverable without blocking subsequent saves',async({page})=>{
 const id=randomUUID(),mutationId=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'保存校验独立验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<html><body><main id="stage" data-notale-id="stage"><h1 data-notale-id="heading">原始内容</h1></main></body></html>'}]}})).status()).toBe(201);
 const open=async()=>{await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());};
 await open();
 await page.evaluate(async({id,mutationId})=>{
  const {scope,actor}=await fetch('/api/sync-context').then(r=>r.json());
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('notale-sync-v1:'+JSON.stringify([scope,actor]),1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').put({id:mutationId,documentId:id,createdAt:Date.now(),state:'pending',task:{documentId:id,slideId:'first',kind:'commit',request:{mutationId,baseVersion:1,commands:[{type:'element.transform',slideId:'first',target:'heading',transform:{matrix:[1,0,0,1,null,0]}}]}}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },{id,mutationId});
 await open();
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([]));
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'first',target:'heading',patch:{text:'保存正常'}}]));
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().version)).toBe(2);
 const state=await page.evaluate(()=>(window as any).NotaleWorkbench.getSyncState());expect(state.pending).toBe(0);expect(state.blocked).toBe(false);
 await expect(page.frameLocator('#canvas').locator('h1')).toHaveText('保存正常');
 const retained=await page.evaluate(async mutationId=>{
  const {scope,actor}=await fetch('/api/sync-context').then(r=>r.json());
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('notale-sync-v1:'+JSON.stringify([scope,actor]),1);r.onsuccess=()=>resolve(r.result);});
  const entry=await new Promise<any>(resolve=>{const r=db.transaction('operations').objectStore('operations').get(mutationId);r.onsuccess=()=>resolve(r.result);});db.close();return entry;
 },mutationId);
 expect(retained.state).toBe('recovery');expect(retained.task.request.commands[0].transform.matrix[4]).toBeNull();
 expect(retained.error).toContain('保存参数校验失败');
});
