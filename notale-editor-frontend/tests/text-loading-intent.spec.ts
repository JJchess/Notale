import {test,expect,type Route} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('changing selection cancels delayed text entry and permits a later retry',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'延迟文字编辑',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><p data-notale-id="a" style="position:absolute;left:100px;top:100px;width:200px;height:100px">文字 A</p><p data-notale-id="b" style="position:absolute;left:400px;top:100px;width:200px;height:100px">文字 B</p></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);let arrived!:()=>void;const requested=new Promise<void>(resolve=>arrived=resolve);
 await page.route(url=>url.pathname.endsWith('/text-editor.js'),async(route:Route)=>{arrived();await hold;await route.continue();});
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const node=page.frameLocator('#canvas').locator('[data-notale-id="a"]');
 const edit=async()=>{const p=await node.evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight}});const f=(await page.locator('#canvas').boundingBox())!;await page.mouse.dblclick(f.x+p.x*f.width/p.w,f.y+p.y*f.height/p.h)};
 await edit();await requested;
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('b'));
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="b"]')).toHaveAttribute('data-notale-selected','');
 release();await expect.poll(()=>node.evaluate(()=>!!(window as any).NotaleTextEditor)).toBe(true);
 await expect(node).not.toHaveAttribute('contenteditable','true');
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="b"]')).toHaveAttribute('data-notale-selected','');
 await edit();await expect(node).toHaveAttribute('contenteditable','true');await node.press('Escape');
});
