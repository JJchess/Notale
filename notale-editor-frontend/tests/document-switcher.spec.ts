import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {importHtml} from '@notale/editor';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4395'});
test('React file menu renames and switches documents, retaining the current document on load failure',async({page})=>{
  const ids=[randomUUID(),randomUUID()];
  for(const [index,id] of ids.entries()){
    const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'切换验证 '+index,width:1600,height:900,slides:[{id:'page',name:'页面',sourcePath:'page.html',html:importHtml('<html><body><main id="stage"><h1>切换验证</h1></main></body></html>').html}]}});expect(response.ok()).toBe(true);
  }
  await page.goto('/?document='+ids[0],{waitUntil:'domcontentloaded'});
  await page.waitForFunction(id=>(window as any).NotaleWorkbench?.getSnapshot()?.document.id===id,ids[0]);
  await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
  await page.locator('#file-menu-trigger').dblclick();await page.locator('#deck-title').fill('React 重命名');await page.locator('#deck-title').press('Enter');
  await expect(page.locator('#file-title')).toHaveText('React 重命名');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
  await page.locator('#file-menu-trigger').click();
  await expect(page.locator('#file-menu [aria-checked="true"]')).toHaveText('React 重命名');
  await page.locator(`#file-menu [data-document="${ids[1]}"]`).click();await expect(page.locator('#file-menu')).toHaveCount(0);await expect(page.locator('#file-title')).toHaveText('切换验证 1');
  await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
  await page.route('**/api/documents/'+ids[0],route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'INTERNAL',message:'加载失败验证'})}));
  await page.locator('#file-menu-trigger').click();await page.locator(`#file-menu [data-document="${ids[0]}"]`).click();
  await expect(page.locator('#file-title')).toHaveText('切换验证 1');await page.locator('#file-menu-trigger').click();await expect(page.locator('#file-menu [aria-checked="true"]')).toHaveText('切换验证 1');await page.keyboard.press('Escape');
  await page.unroute('**/api/documents/'+ids[0]);const saved=await page.request.get('/api/documents/'+ids[0]).then(r=>r.json());expect(saved.document.title).toBe('React 重命名');
});
