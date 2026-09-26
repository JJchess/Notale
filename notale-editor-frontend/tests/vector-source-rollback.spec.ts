import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
for(const conflict of [false,true])test('failed source calculation preserves '+(conflict?'conflicting source changes':'newer sibling changes'),async({page})=>{
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  (window as any).Worker=function(url:string|URL,options?:WorkerOptions){
   if(!String(url).includes('vector-worker.js'))return new NativeWorker(url,options);
   const worker={onmessage:undefined as any,onerror:undefined as any,terminate(){},postMessage(message:any){(window as any).__completeVector=()=>{(window as any).__completeVector=undefined;worker.onmessage?.({data:{id:message.id,error:'计算失败样本'}})}}};return worker;
  };
 });
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'图形计算边界',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><svg data-notale-id="svg" width="800" height="500"><g data-notale-id="group" data-notale-vector-operation="union"><defs data-notale-id="sources" data-notale-vector-sources="true"><path data-notale-id="a" d="M100 100L200 100L200 200Z" fill="blue"/></defs><path data-notale-id="result" d="M100 100L200 100L200 200Z" fill="blue"/></g><rect data-notale-id="b" x="400" y="100" width="100" height="100" fill="green"/></svg></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const frame=page.frameLocator('#canvas'),a=frame.locator('[data-notale-id="a"]');
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('group'));
 const channel=await a.evaluate(()=>(window as any).__NOTALE__.channel);
 const send=(type:string,data:unknown)=>page.evaluate(({channel,type,data})=>{const frame=document.querySelector<HTMLIFrameElement>('#canvas')!;frame.contentWindow!.postMessage({source:'notale-host',channel,type,data},new URL(frame.src).origin)},{channel,type,data});
 const pending=()=>expect.poll(()=>a.evaluate(()=>!!(window as any).__completeVector)).toBe(true);
 const finish=()=>a.evaluate(async()=>{(window as any).__completeVector();await new Promise(requestAnimationFrame)});
 await send('vector-action',{action:'source',id:'a'});
 await expect(a).toHaveAttribute('data-notale-selected','');
 await send('vector-action',{action:'style',property:'fill',value:'#ff0000'});await pending();
 await frame.locator('[data-notale-id="b"]').evaluate(node=>(node as SVGElement).style.fill='#ffff00');
 if(conflict)await a.evaluate(node=>(node as SVGElement).style.fill='#ffff00');
 await finish();
 await expect(a).toHaveAttribute('fill','blue');await expect(a).not.toHaveAttribute('style',/ff0000/);
 await expect(a).toHaveCSS('fill',conflict?'rgb(255, 255, 0)':'rgb(0, 0, 255)');
 await expect(frame.locator('[data-notale-id="b"]')).toHaveCSS('fill','rgb(255, 255, 0)');
 await expect(frame.locator('[data-notale-id="result"]')).toHaveAttribute('fill','blue');
});
