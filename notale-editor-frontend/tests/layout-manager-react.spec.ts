import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React master controls create, publish, apply and reopen the canvas',async({page})=>{
 const errors:string[]=[];page.on('pageerror',cause=>errors.push(cause.message));
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Master acceptance',width:1600,height:900,slides:['a','b'].map(key=>({id:key,name:key,sourcePath:key+'.html',html:`<html><body><h1 data-notale-id="title-${key}">${key}</h1></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===2);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="style"]').click();await page.locator('#visual-layout-name').fill('Shared footer');await page.locator('#create-visual-layout').click();await expect(page.locator('#master-edit-banner')).toBeVisible();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#publish-master-return').click();await expect(page.locator('#master-edit-banner')).toBeHidden();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const master=await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.layouts[0]);if(!await page.locator('#shared-layout').isVisible())await page.locator('[data-tool="style"]').click();await page.locator('#shared-layout').selectOption(master.id);await page.locator('#apply-layout-all').click();await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.filter((s:any)=>!s.layoutSourceId&&s.layoutId).length)).toBe(2);
 await page.locator('#edit-layout-canvas').click();await expect(page.locator('#master-edit-banner')).toBeVisible();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.locator('#leave-master').click();await expect(page.locator('#master-edit-banner')).toBeHidden();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.layouts[0].name).toBe('Shared footer');expect(saved.document.slides.filter((s:any)=>!s.layoutSourceId&&s.layoutId===master.id)).toHaveLength(2);expect(errors).toEqual([]);
});
