import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('delayed vector command is canceled across A B A selection changes',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'延迟图形命令',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><svg data-notale-id="svg" width="800" height="500"><rect data-notale-id="a" x="100" y="100" width="100" height="100" fill="blue"/><rect data-notale-id="b" x="300" y="100" width="100" height="100" fill="green"/></svg></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);let arrived!:()=>void;const requested=new Promise<void>(resolve=>arrived=resolve);
 await page.route(url=>url.pathname.endsWith('/vector-editor.js'),async route=>{arrived();await hold;await route.continue()});
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const a=page.frameLocator('#canvas').locator('[data-notale-id="a"]'),b=page.frameLocator('#canvas').locator('[data-notale-id="b"]');
 const select=async(target:string)=>{await page.evaluate(target=>(window as any).NotaleWorkbench.select(target),target);await expect(page.frameLocator('#canvas').locator('[data-notale-id="'+target+'"]')).toHaveAttribute('data-notale-selected','')};
 await select('a');await requested;
 const channel=await a.evaluate(()=>(window as any).__NOTALE__.channel);
 const format=()=>page.evaluate(channel=>{const frame=document.querySelector<HTMLIFrameElement>('#canvas')!;frame.contentWindow!.postMessage({source:'notale-host',channel,type:'vector-action',data:{action:'style',property:'fill',value:'#ff0000'}},new URL(frame.src).origin)},channel);
 await format();await select('b');await select('a');release();
 await expect.poll(()=>a.evaluate(()=>!!(window as any).NotaleVectorEditor)).toBe(true);
 await expect(a).toHaveCSS('fill','rgb(0, 0, 255)');await expect(b).toHaveCSS('fill','rgb(0, 128, 0)');
 await format();await expect(a).toHaveCSS('fill','rgb(255, 0, 0)');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await expect(b).toHaveCSS('fill','rgb(0, 128, 0)');
});
