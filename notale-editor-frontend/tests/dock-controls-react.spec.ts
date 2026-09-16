import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React dock navigates and changes pages directly while updating labels and boundary controls',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Dock controls',width:1600,height:900,slides:['first','second'].map((id,i)=>({id,name:'页面 '+(i+1),sourcePath:id+'.html',html:`<html><body><p data-notale-id="${id}-text">Page ${i}</p></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await expect(page.locator('#page-position')).toHaveText('1 / 2');await expect(page.locator('#dock-previous-page')).toBeDisabled();await expect(page.locator('#page-name')).toHaveCount(0);
 await page.locator('#dock-next-page').click();await expect(page.locator('#page-position')).toHaveText('2 / 2');await expect(page.locator('#dock-next-page')).toBeDisabled();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await expect(page.locator('#dock-add-page,#dock-delete-page')).toHaveCount(0);
 await expect(page.locator('#zoom-in svg')).toHaveCount(1);await expect(page.locator('#overview')).toHaveCount(0);
});
