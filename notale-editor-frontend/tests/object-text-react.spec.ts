import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {importHtml} from '@notale/editor';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4397'});
test('Fallback text drafts survive unrelated updates and reject changed author content',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'文字草稿',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:importHtml('<html><body><main id="stage"><pre data-notale-id="title">原始文字</pre><pre data-notale-id="other">另一对象</pre><h1 data-notale-id="rich">普通文字</h1></main></body></html>').html}]}});expect(response.ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length>0);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('rich'));await expect(page.locator('#open-rich-editor')).toBeVisible();await expect(page.locator('#object-text')).not.toBeVisible();
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('title'));await expect(page.locator('#selection-name')).toHaveText('文字');await expect(page.locator('#object-text')).toHaveValue('原始文字');
 await page.locator('#object-text').fill('未提交草稿');
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'无关的标题更新'}]));await expect(page.locator('#object-text')).toHaveValue('未提交草稿');
 await page.locator('#apply-text').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect(page.frameLocator('#canvas').locator('[data-notale-id="title"]')).toHaveText('未提交草稿');
 await page.locator('#object-text').fill('继续编辑的草稿');await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'element.patch',slideId:'first',target:'title',patch:{text:'其他操作更新的文字'}}]));
 await expect(page.locator('#object-text')).toHaveValue('继续编辑的草稿');await page.locator('#apply-text').click();await expect(page.locator('#object-text-status')).toContainText('文字已变化');
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="title"]')).toHaveText('其他操作更新的文字');
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('other'));await expect(page.locator('#object-text')).toHaveValue('另一对象');await expect(page.locator('#object-text-status')).not.toBeVisible();
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['title','other']));await expect(page.locator('#selection-name')).toHaveText('已选择 2 个对象');await expect(page.locator('#object-text')).not.toBeVisible();
});
