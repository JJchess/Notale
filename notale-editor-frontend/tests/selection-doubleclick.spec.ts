import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('double click through multi-selection drag area enters the underlying text',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'多选文字编辑',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><p data-notale-id="a" style="position:absolute;left:100px;top:100px;width:200px;height:100px">文字 A</p><p data-notale-id="b" style="position:absolute;left:400px;top:100px;width:200px;height:100px">文字 B</p></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['a','b']));
 const node=page.frameLocator('#canvas').locator('[data-notale-id="a"]');
 const point=await node.evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight}});
 const frame=(await page.locator('#canvas').boundingBox())!;
 await page.mouse.dblclick(frame.x+point.x*frame.width/point.w,frame.y+point.y*frame.height/point.h);
 await expect(node).toHaveAttribute('contenteditable','true');
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="b"]')).not.toHaveAttribute('contenteditable','true');
 await node.press('Escape');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const after=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(after.document.slides[0].html).not.toContain('contenteditable');expect(after.document.slides[0].html).toContain('文字 A');
});
