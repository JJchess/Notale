import {test,expect} from '@playwright/test';
import {reveal} from './harness/format-panel';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React multi-selection tools retain grouping and lock behavior',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Tools',width:1600,height:900,slides:[{id:'first',name:'First',sourcePath:'first.html',html:'<html><body><div data-notale-id="a" style="position:absolute;left:30px;top:30px;width:100px;height:100px">A</div><div data-notale-id="b" style="position:absolute;left:200px;top:30px;width:100px;height:100px">B</div></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['a','b']));await reveal(page,'#property-identity');await expect(page.locator('#group')).toBeEnabled();await expect(page.locator('#align-left')).toBeEnabled();await page.locator('#group').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 expect((await page.request.get('/api/documents/'+id).then(r=>r.json())).document.slides[0].groups).toHaveLength(1);
 await page.locator('#ungroup').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 expect((await page.request.get('/api/documents/'+id).then(r=>r.json())).document.slides[0].groups).toHaveLength(0);
 const openMenu=async()=>{
  await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
  const point=await page.frameLocator('#canvas').locator('[data-notale-id="a"]').evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight};});
  const frame=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(frame.x+point.x*frame.width/point.width,frame.y+point.y*frame.height/point.height,{button:'right'});
 };
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['a','b']));await reveal(page,'#property-identity');
 await openMenu();await page.locator('[data-action="group"]').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 expect((await page.request.get('/api/documents/'+id).then(r=>r.json())).document.slides[0].groups).toHaveLength(1);
 await openMenu();await page.locator('[data-action="ungroup"]').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 expect((await page.request.get('/api/documents/'+id).then(r=>r.json())).document.slides[0].groups).toHaveLength(0);
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('a'));await reveal(page,'#property-identity');await page.locator('#property-identity summary').click();await page.locator('#lock').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getObjects().find((item:any)=>item.id==='a').locked)).toBe(true);
 await expect(page.locator('#overview')).toHaveCount(0);
});
