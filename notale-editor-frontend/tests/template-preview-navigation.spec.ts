import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('template preview navigates without inserting until requested',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'模板预览导航',width:1600,height:900,slides:[{id:'page',name:'页面',sourcePath:'page.html',html:'<html><body><main id="stage" data-notale-id="stage">预览</main></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.locator('[data-tool="templates"]').click();await page.locator('[data-template-id]').first().click();const title=page.locator('#template-preview-title'),first=await title.textContent();
 await page.locator('.template-dialog').evaluate(node=>{
  for(const signal of [{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}])node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true,...signal}));
 });await expect(title).toHaveText(first!);
 const preview=page.locator('.template-preview img');await preview.dispatchEvent('error');await page.getByRole('button',{name:'重试预览',exact:true}).click();await expect(preview).toBeVisible();await expect.poll(()=>preview.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0)).toBe(true);
 await page.getByRole('button',{name:'下一个预览',exact:true}).click();await expect(title).not.toHaveText(first!);await page.keyboard.press('ArrowLeft');await expect(title).toHaveText(first!);expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(1);
 await page.keyboard.press('Escape');await expect(page.locator('.template-dialog')).toHaveCount(0);
 await page.locator('[data-tool="insert"]').click();await page.locator('[data-insert-category="diagrams"] > summary').click();await page.locator('[data-diagram-template]').first().click();await expect(page.locator('[data-template-use="diagram"]')).toBeVisible();await page.keyboard.press('ArrowRight');await expect(page.locator('[data-template-use="diagram"]')).toBeVisible();await page.keyboard.press('Escape');
});
