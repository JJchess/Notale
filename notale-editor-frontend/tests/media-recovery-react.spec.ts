import {test,expect} from '@playwright/test';
import {reveal} from './harness/format-panel';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React media settings preserve pending input and recovery buttons retry and export',async({page})=>{
 const id=randomUUID(),src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9V8AAAAASUVORK5CYII=';
 const created=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Media recovery',width:1600,height:900,slides:[{id:'first',name:'Image',sourcePath:'first.html',html:`<html><body><img data-notale-id="photo" alt="Original" src="${src}" style="width:600px;height:400px"></body></html>`}]}});expect(created.ok(),await created.text()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.evaluate(()=>(window as any).NotaleWorkbench.select('photo'));await reveal(page,'#media-panel');
 await expect(page.locator('#media-panel')).toBeVisible();await expect(page.locator('#media-playback')).toBeHidden();await page.locator('#media-alt').fill('Updated image');await page.locator('#media-fit').selectOption('cover');await page.locator('#media-x').fill('25');await page.locator('#crop-top').fill('10');
 await page.route('**/sync/v2',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'HTTP_503',message:'test offline'})}));
 await page.locator('#save-media').click();await expect(page.locator('#retry-save')).toBeVisible();await expect(page.locator('#media-alt')).toHaveValue('Updated image');const download=page.waitForEvent('download');await page.locator('#export-draft').click();expect((await download).suggestedFilename()).toBe('notale-recovery.json');
 await page.unroute('**/sync/v2');await page.locator('#retry-save').click();await expect(page.locator('#retry-save')).toBeHidden();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.slides[0].html).toContain('Updated image');
 const attributes=await page.frameLocator('#canvas').locator('[data-notale-id="photo"]').getAttribute('data-notale-media');expect(JSON.parse(attributes!)).toMatchObject({fit:'cover',positionX:25,crop:{top:10}});
});
