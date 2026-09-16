import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('vector results respect mode changes and retain a newer selection',async({page})=>{
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  (window as any).Worker=function(url:string|URL,options?:WorkerOptions){
   if(!String(url).includes('vector-worker.js'))return new NativeWorker(url,options);
   const worker={onmessage:undefined as any,onerror:undefined as any,terminate(){},postMessage(message:any){(window as any).__completeVector=()=>{(window as any).__completeVector=undefined;worker.onmessage?.({data:{id:message.id,result:'M100 100L300 100L300 250L100 250Z'}})}}};return worker;
  };
 });
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'图形计算边界',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><svg data-notale-id="svg" width="800" height="500"><rect data-notale-id="a" x="100" y="100" width="100" height="100" fill="blue"/><rect data-notale-id="c" x="150" y="150" width="100" height="100" fill="blue"/><rect data-notale-id="b" x="400" y="100" width="100" height="100" fill="green"/></svg></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const frame=page.frameLocator('#canvas'),a=frame.locator('[data-notale-id="a"]');
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['a','c']));
 const channel=await a.evaluate(()=>(window as any).__NOTALE__.channel);
 const send=(type:string,data:unknown)=>page.evaluate(({channel,type,data})=>{const frame=document.querySelector<HTMLIFrameElement>('#canvas')!;frame.contentWindow!.postMessage({source:'notale-host',channel,type,data},new URL(frame.src).origin)},{channel,type,data});
 const pending=()=>expect.poll(()=>a.evaluate(()=>!!(window as any).__completeVector)).toBe(true);
 const finish=()=>a.evaluate(async()=>{(window as any).__completeVector();await new Promise(requestAnimationFrame)});
 await send('vector-action',{action:'union'});await pending();
 await send('mode',{mode:'play'});await expect(frame.locator('html')).toHaveAttribute('data-notale-mode','play');
 await send('mode',{mode:'edit'});await expect(frame.locator('html')).toHaveAttribute('data-notale-mode','edit');await finish();
 await expect(frame.locator('[data-notale-vector-operation="union"]')).toHaveCount(0);
 await send('vector-action',{action:'union'});await pending();
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('b'));await expect(frame.locator('[data-notale-id="b"]')).toHaveAttribute('data-notale-selected','');await finish();
 await expect(frame.locator('[data-notale-vector-operation="union"]')).toHaveCount(1);
 await expect(frame.locator('[data-notale-id="b"]')).toHaveAttribute('data-notale-selected','');
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.slides[0].html).toContain('data-notale-vector-operation="union"');
});
