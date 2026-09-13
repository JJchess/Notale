import {test,expect} from '@playwright/test';import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.PRESENT_TEST_URL??'http://localhost:4399'});
test('ending the controller ends its audience and pauses the presentation clock',async({page})=>{
 const id=randomUUID(),response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'结束放映',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><h1 data-notale-id="text">课堂演示</h1></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/present?document='+id+'&speaker=1');await page.waitForFunction(()=>(window as any).NotaleShow?.state().ready&&(window as any).NotaleShow.state().control==='controlling');await page.locator('.ps-display-menu summary').click();const popup=page.waitForEvent('popup');await page.locator('#audience').click();const audience=await popup;await audience.waitForFunction(()=>(window as any).NotaleShow?.state().ready);
 await page.locator('.ps-end-button').click();await expect(audience.locator('.ps-finish')).toBeVisible();expect(await audience.evaluate(()=>(window as any).NotaleShow.state().ended)).toBe(true);expect(await audience.evaluate(()=>(window as any).NotaleShow.state().timer.runningSince)).toBeNull();await expect(page).toHaveURL(new RegExp('/\\?document='+id));await audience.close();
});
