import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('thumbnail controller follows sidebar scrolling and releases removed pages',async({page})=>{
 const id=randomUUID();const slides=Array.from({length:10},(_,i)=>({id:'p'+i,name:'页面 '+i,sourcePath:'p'+i+'.html',html:'<html><body><h1 data-notale-id="heading">Page '+i+'</h1></body></html>'}));
 const created=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'缩略图控制器验证',width:1600,height:900,slides}});expect(created.ok(),await created.text()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.id);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="pages"]').click();await expect(page.locator('[data-thumbnail="p0"] iframe')).toHaveCount(1);
 const thumbnail=page.frameLocator('[data-thumbnail="p0"] iframe');await expect(thumbnail.locator('h1')).toHaveText('Page 0');await thumbnail.locator('body').evaluate(()=>{(window as any).__thumbnailIdentity='retained';});
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'p0',target:'heading',patch:{text:'Updated page'}}]));await expect(thumbnail.locator('h1')).toHaveText('Updated page');expect(await thumbnail.locator('body').evaluate(()=>(window as any).__thumbnailIdentity)).toBe('retained');
 await page.locator('[data-slide="p9"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-thumbnail="p9"] iframe')).toHaveCount(1);await expect.poll(()=>page.locator('.page-thumbnail iframe').count()).toBeLessThanOrEqual(6);
 await page.locator('[data-slide="p9"]').click();await expect(page.locator('#overview')).toHaveCount(0);
 await page.locator('[data-slide="p9"]').press('Delete');await expect(page.locator('[data-slide="p9"]')).toHaveCount(0);
 await page.locator('[data-slide="p0"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-thumbnail="p0"] iframe')).toHaveCount(1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.dispose());await expect(page.locator('.page-thumbnail iframe')).toHaveCount(0);
});
