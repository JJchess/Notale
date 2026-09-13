import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('keyboard nudge follows page axes inside a rotated scaled parent',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'变换内微调',width:1600,height:900,slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body><div data-notale-id="parent" style="position:absolute;left:300px;top:200px;width:400px;height:300px;transform:rotate(25deg) scale(1.4)"><div data-notale-id="child" style="position:absolute;left:60px;top:50px;width:120px;height:80px;background:#654321;transform:rotate(-12deg)"></div></div></body></html>'}]}});expect(response.ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(async()=>{const w=(window as any).NotaleWorkbench;await w.whenReady();w.select('child');(document.activeElement as HTMLElement)?.blur();});
 const rect=()=>page.frameLocator('#canvas').locator('[data-notale-id="child"]').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 const before=await rect();await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await rect()).x-before.x).toBeCloseTo(1,1);await page.keyboard.press('Shift+ArrowDown');await expect.poll(async()=>(await rect()).y-before.y).toBeCloseTo(10,1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());const after=await rect();expect(after.width).toBeCloseTo(before.width,1);expect(after.height).toBeCloseTo(before.height,1);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());expect((await rect()).x).toBeCloseTo(after.x,1);expect((await rect()).y).toBeCloseTo(after.y,1);
});
