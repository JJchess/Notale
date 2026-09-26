import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('preview shell ignores modified composing and already-handled navigation keys',async({page})=>{
 const id=randomUUID();
 const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Preview keys',width:1600,height:900,slides:['first','second'].map(id=>({id,name:id,sourcePath:id+'.html',html:`<html><body><h1 data-notale-id="heading">${id}</h1></body></html>`}))}});
 expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const before=await page.request.get('/api/documents/'+id).then(r=>r.json());
 await page.locator('#interact').click();await expect(page.locator('#preview-loading')).toBeHidden();await expect(page.locator('#preview-position')).toHaveText('1 / 2');
 await page.locator('#preview-close').evaluate(element=>{
  const cases: KeyboardEventInit[]=[{key:'ArrowRight',ctrlKey:true},{key:'ArrowRight',metaKey:true},{key:'PageDown',shiftKey:true},{key:'ArrowRight',altKey:true},{key:'Escape',isComposing:true},{key:'ArrowRight',isComposing:true},{key:'ArrowRight',keyCode:229}];
  for(const options of cases)element.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,...options}));
  const consumed=new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});consumed.preventDefault();element.dispatchEvent(consumed);
 });
 await expect(page.locator('#preview-overlay')).toBeVisible();await expect(page.locator('#preview-position')).toHaveText('1 / 2');
 await page.keyboard.press('ArrowRight');await expect(page.locator('#preview-position')).toHaveText('2 / 2');await expect(page.locator('#preview-loading')).toBeHidden();
 await page.keyboard.press('ArrowLeft');await expect(page.locator('#preview-position')).toHaveText('1 / 2');await expect(page.locator('#preview-loading')).toBeHidden();
 await page.keyboard.press('Escape');await expect(page.locator('#preview-overlay')).toBeHidden();
 const after=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(after.version).toBe(before.version);expect(after.document).toEqual(before.document);
});
