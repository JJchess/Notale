import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {importHtml} from '@notale/editor';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React resource notice retries without recreating the preview and clears on close',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'资源连接',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:importHtml('<html><body><main id="stage">资源连接验证</main></body></html>').html}]}});expect(response.ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length>0);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.route('**/api/documents/'+id+'/preview?version=*',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({response,json:{...data,renewAfterMs:1000}});});
 let fail=true;await page.route('**/api/documents/'+id+'/preview/renew',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.continue());
 await page.locator('#interact').click();await expect(page.locator('#preview-loading')).toBeHidden();await page.frameLocator('#preview-canvas').locator('#stage').evaluate(()=>{(window as any).__leaseMarker='same-frame';});
 const notice=page.locator('#preview-overlay [data-notale-preview-access]');await expect(notice).toBeVisible();fail=false;await notice.getByRole('button',{name:'重试资源连接'}).click();await expect(notice).toHaveCount(0);
 expect(await page.frameLocator('#preview-canvas').locator('#stage').evaluate(()=>(window as any).__leaseMarker)).toBe('same-frame');
 await page.locator('#preview-close').click();await page.locator('#interact').click();fail=true;await expect(notice).toBeVisible();await page.locator('#preview-close').click();await expect(page.locator('[data-notale-preview-access]')).toHaveCount(0);await expect(page.locator('#preview-canvas-host iframe')).toHaveCount(0);
});
