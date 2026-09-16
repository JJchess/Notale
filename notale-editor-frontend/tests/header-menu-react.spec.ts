import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React header menus are exclusive and support keyboard file selection',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Menu input',width:1600,height:900,slides:[{id:'a',name:'a',sourcePath:'a.html',html:'<html><body><p data-notale-id="text">A</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#file-menu-trigger').dblclick();const title=page.locator('#deck-title');await title.fill('保留输入');
 for(const init of [{isComposing:true},{keyCode:229}]){await title.evaluate((node,init)=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,...init})),init);await expect(title).toBeVisible();await expect(title).toHaveValue('保留输入');}
 await title.press('Escape');await expect(title).not.toBeVisible();await expect(page.locator('#file-title')).toHaveText('Menu input');
 const imports=page.locator('[data-header-menu="import"]'),exports=page.locator('[data-header-menu="export"]');
 await imports.locator('summary').click();await expect(imports).toHaveAttribute('open','');await exports.locator('summary').click();await expect(imports).not.toHaveAttribute('open','');await expect(exports).toHaveAttribute('open','');
 await exports.locator('summary').press('Escape');await expect(exports.locator('summary')).toBeFocused();await expect(exports).not.toHaveAttribute('open','');
 await exports.locator('summary').press('ArrowDown');await expect(page.locator('#export-pdf')).toBeFocused();await page.keyboard.press('End');await expect(page.locator('#export')).toBeFocused();await page.keyboard.press('Home');await expect(page.locator('#export-pdf')).toBeFocused();await page.keyboard.press('Escape');
 await imports.locator('summary').focus();await page.keyboard.press('ArrowUp');const labels=imports.locator('.editor-popup > label');await expect(labels.last()).toBeFocused();
 await labels.last().evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true})));await expect(imports).toHaveAttribute('open','');await expect(labels.last()).toBeFocused();
 const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Enter');expect((await chooser).isMultiple()).toBe(false);await expect(imports).not.toHaveAttribute('open','');
 await imports.locator('summary').click();await page.locator('.brand').dispatchEvent('pointerdown');await expect(imports).not.toHaveAttribute('open','');
});
