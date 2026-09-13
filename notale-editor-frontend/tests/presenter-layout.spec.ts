import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.PRESENT_TEST_URL??'http://127.0.0.1:4399'});
test('presenter layout cancels gestures and previews loop destination',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'演讲布局',width:1600,height:900,presentation:{loop:true},slides:[0,1].map(i=>({id:'page'+i,name:'页面'+i,sourcePath:i+'.html',html:'<!doctype html><html><body><main id="stage" data-notale-id="stage">页面'+i+'</main></body></html>'}))}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/present?document='+id+'&speaker=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleShow?.state().ready&&(window as any).NotaleShow.state().control==='controlling');
 const splitter=page.getByRole('separator',{name:'调整画面与备注宽度'});await expect(splitter).toHaveAttribute('aria-valuenow','66');
 const bounds=(await splitter.boundingBox())!;await page.mouse.move(bounds.x+bounds.width/2,bounds.y+100);await page.mouse.down();await page.mouse.move(bounds.x-100,bounds.y+100,{steps:3});await expect(splitter).not.toHaveAttribute('aria-valuenow','66');await page.keyboard.press('Escape');await page.mouse.up();await expect(splitter).toHaveAttribute('aria-valuenow','66');expect(await page.evaluate(()=>localStorage.getItem('notale-presenter-layout'))).toBeNull();
 await splitter.focus();await page.keyboard.press('Home');await expect(splitter).toHaveAttribute('aria-valuenow','48');expect(await page.evaluate(()=>(window as any).NotaleShow.state().index)).toBe(0);
 await page.keyboard.press('End');await expect(splitter).toHaveAttribute('aria-valuenow','76');await splitter.dblclick();await expect(splitter).toHaveAttribute('aria-valuenow','66');
 await page.evaluate(()=>(window as any).NotaleShow.reveal.slide(1));await page.waitForFunction(()=>(window as any).NotaleShow.state().index===1&&(window as any).NotaleShow.state().ready);
 await expect(page.frameLocator('#next-preview').locator('#stage')).toHaveText('页面0');await page.locator('#next').click();await page.waitForFunction(()=>(window as any).NotaleShow.state().index===0);expect(await page.evaluate(()=>(window as any).NotaleShow.state().ended)).toBe(false);
});
