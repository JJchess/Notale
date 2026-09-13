import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('media fields match the selected type and retain invalid drafts',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'媒体参数',width:1600,height:900,slides:[{id:'page',name:'页面',sourcePath:'page.html',html:'<html><body><audio controls data-notale-id="audio"></audio><video controls data-notale-id="video"></video><img data-notale-id="image" alt="样本" style="object-fit:cover;object-position:20% 30%;clip-path:inset(5% 10% 15%)"><img data-notale-id="custom" style="object-position:20px 30px;clip-path:polygon(0 0,100% 0,50% 100%)"></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const select=(id:string)=>page.evaluate(id=>(window as any).NotaleWorkbench.select(id),id);
 await select('audio');await expect(page.locator('#media-fit')).toBeHidden();await expect(page.locator('#media-alt')).toBeHidden();await expect(page.locator('#media-volume')).toBeVisible();await page.locator('#media-start').fill('20');await page.locator('#media-start').press('Escape');await expect(page.locator('#media-start')).toHaveValue('0');await page.locator('#media-start').fill('10');await page.locator('#media-end').fill('5');await page.locator('#media-end').press('Enter');await expect(page.locator('#media-panel [role="alert"]')).toHaveText('结束时间需要晚于开始时间');await expect(page.locator('#media-end')).toHaveValue('5');
 await page.locator('#media-end').fill('15');await page.locator('#media-end').press('Enter');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect(page.locator('#media-panel [role="alert"]')).toHaveCount(0);
 await select('video');await expect(page.locator('#media-fit')).toBeVisible();await expect(page.locator('#media-alt')).toBeHidden();await select('image');await expect(page.locator('#media-alt')).toBeVisible();await expect(page.locator('#media-playback')).toBeHidden();
 await expect(page.locator('#media-x')).toHaveValue('20');await expect(page.locator('#media-y')).toHaveValue('30');await expect(page.locator('#crop-bottom')).toHaveValue('15');
 await page.locator('#media-x').fill('40');await page.locator('#media-x').press('Enter');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const image=page.frameLocator('#canvas').locator('[data-notale-id="image"]');
 await expect(image).toHaveCSS('object-position','40% 30%');await expect(image).toHaveCSS('clip-path','inset(5% 10% 15%)');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await select('image');
 await expect(page.locator('#media-x')).toHaveValue('40');await expect(page.locator('#media-y')).toHaveValue('30');await expect(page.locator('#crop-left')).toHaveValue('10');
 await select('custom');await expect(page.locator('#media-x')).toBeDisabled();await expect(page.locator('#media-x')).toHaveValue('');await expect(page.locator('#crop-top')).toBeDisabled();await expect(page.locator('#open-image-crop')).toBeDisabled();
 await page.locator('#media-alt').fill('Custom picture');await page.locator('#media-alt').press('Enter');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const custom=page.frameLocator('#canvas').locator('[data-notale-id="custom"]');await expect(custom).toHaveAttribute('alt','Custom picture');await expect(custom).toHaveCSS('object-position','20px 30px');await expect(custom).toHaveCSS('clip-path','polygon(0px 0px, 100% 0px, 50% 100%)');

});
