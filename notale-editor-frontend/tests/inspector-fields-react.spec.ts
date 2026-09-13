import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {importHtml} from '@notale/editor';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4398'});
test('binding and identity fields support repeated saves and preserve local drafts',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'属性字段',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:importHtml('<html><body><main id="stage"><input data-notale-id="range" type="range" value="20"><input data-notale-id="check" type="checkbox" checked></main></body></html>').html}]}});expect(response.ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length>0);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('range'));
 for(const value of ['30','40']){await page.locator('#binding-value').fill(value);await page.locator('#save-binding').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0].bindings.find((b:any)=>b.target==='range')?.value)).toBe(value);}
 await page.locator('#binding-value').fill('50');await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'无关更新'}]));await expect(page.locator('#binding-value')).toHaveValue('50');
 await page.locator('#property-identity summary').click();for(const name of ['参数 A','参数 B']){await page.locator('#object-name').fill(name);await page.locator('#save-object-name').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect(page.locator('#selection-name')).toHaveText(name);}
 await page.locator('#hide-objects').click();await expect(page.frameLocator('#canvas').locator('[data-notale-id="range"]')).toHaveCSS('visibility','hidden');await page.locator('#show-objects').click();await expect(page.frameLocator('#canvas').locator('[data-notale-id="range"]')).toHaveCSS('visibility','visible');
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('check'));await expect(page.locator('#binding-value')).toHaveValue('true');await page.locator('#binding-value').selectOption('false');await page.locator('#save-binding').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0].bindings.find((b:any)=>b.target==='check')?.value)).toBe(false);
});
