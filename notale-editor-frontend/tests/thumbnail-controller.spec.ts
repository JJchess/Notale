import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('thumbnail controller follows overview pagination and releases removed pages',async({page})=>{
 const id=randomUUID();const slides=Array.from({length:10},(_,i)=>({id:'p'+i,name:'页面 '+i,sourcePath:'p'+i+'.html',html:'<html><body><h1 data-notale-id="heading">Page '+i+'</h1></body></html>'}));
 const created=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'缩略图控制器验证',width:1600,height:900,slides}});expect(created.ok(),await created.text()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.id);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#overview').click();await expect(page.locator('.slide-card:visible')).toHaveCount(8);await expect.poll(()=>page.locator('.page-thumbnail iframe').count()).toBe(8);
 const thumbnail=page.frameLocator('[data-thumbnail="p0"] iframe');await expect(thumbnail.locator('h1')).toHaveText('Page 0');await thumbnail.locator('body').evaluate(()=>{(window as any).__thumbnailIdentity='retained';});
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'p0',target:'heading',patch:{text:'Updated page'}}]));await expect(thumbnail.locator('h1')).toHaveText('Updated page');expect(await thumbnail.locator('body').evaluate(()=>(window as any).__thumbnailIdentity)).toBe('retained');
 await page.locator('#overview-next').click();await expect(page.locator('.slide-card:visible')).toHaveCount(2);await expect.poll(()=>page.locator('.page-thumbnail iframe').count()).toBe(2);
 await page.locator('[data-slide="p9"]').click();await expect(page.locator('#overview')).toHaveAttribute('aria-pressed','false');
 await page.locator('#dock-delete-page').click();await expect(page.locator('[data-slide="p9"]')).toHaveCount(0);
 await page.locator('#overview').click();await expect.poll(()=>page.locator('.page-thumbnail iframe').count()).toBe(8);
 await page.evaluate(()=>(window as any).NotaleWorkbench.dispose());await expect(page.locator('.page-thumbnail iframe')).toHaveCount(0);
});
