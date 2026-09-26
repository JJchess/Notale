import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.PRESENT_TEST_URL??'http://127.0.0.1:4399'});
test('overview contains keyboard navigation and restores the initiating control',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'总览键盘验证',width:1600,height:900,slides:[0,1,2].map(i=>({id:'page'+i,name:'页面'+i,sourcePath:i+'.html',html:'<!doctype html><html><body><main id="stage" data-notale-id="stage">页面'+i+'</main></body></html>'}))}});expect(response.ok()).toBe(true);
 await page.goto('/present?document='+id+'&speaker=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleShow?.state().ready&&(window as any).NotaleShow.state().control==='controlling');
 const index=()=>page.evaluate(()=>(window as any).NotaleShow.state().index);
 await page.locator('#overview').focus();await page.keyboard.press('Space');
 const dialog=page.getByRole('dialog',{name:'选择要放映的页面'});await expect(dialog).toBeVisible();
 await expect(dialog.locator('.ps-overview-card').nth(0)).toBeFocused();
 await page.keyboard.press('ArrowRight');await expect(dialog.locator('.ps-overview-card').nth(1)).toBeFocused();expect(await index()).toBe(0);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('#overview')).toBeFocused();expect(await index()).toBe(0);
 await page.keyboard.press('Space');await page.keyboard.press('End');await expect(dialog.locator('.ps-overview-card').nth(2)).toBeFocused();await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect.poll(index).toBe(2);
 await page.locator('#blank').focus();await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window as any).NotaleShow.state().blank)).toBe(true);expect(await index()).toBe(2);
});
