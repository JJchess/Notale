import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('page cards duplicate beside selection, retain keyboard focus, delete and reorder without consuming field input',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'页面快捷键验证',width:1600,height:900,slides:['a','b','c'].map(key=>({id:key,name:key,sourcePath:key+'.html',html:`<html><body><p data-notale-id="text">${key}</p></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.locator('[data-tool="pages"]').click();
 const cards=page.locator('[data-slide]');const order=()=>cards.evaluateAll(els=>els.map(el=>(el as HTMLElement).dataset.slide!));
 await page.locator('[data-slide="b"]').click();await page.keyboard.press('Control+d');await expect(cards).toHaveCount(4);
 const firstCopy=(await order())[2];expect(await order()).toEqual(['a','b',firstCopy,'c']);await expect(page.locator(`[data-slide="${firstCopy}"]`)).toBeFocused();
 await page.keyboard.press('Control+d');await expect(cards).toHaveCount(5);const secondCopy=(await order())[3];await expect(page.locator(`[data-slide="${secondCopy}"]`)).toBeFocused();
 await page.keyboard.press('Delete');await expect(cards).toHaveCount(4);await expect(page.locator('[data-slide="c"]')).toBeFocused();
 await page.locator(`[data-slide="${firstCopy}"]`).dragTo(page.locator('[data-slide="a"]'),{targetPosition:{x:40,y:4}});await expect.poll(order).toEqual([firstCopy,'a','b','c']);
 const search=page.locator('#slide-search');await search.fill('b');await search.press('Home');await search.press('Delete');await expect(search).toHaveValue('');await expect(cards).toHaveCount(4);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.slides.map((s:any)=>s.id)).toEqual([firstCopy,'a','b','c']);
 await expect(page.locator('#dock-add-page,#dock-delete-page,#interact,#page-panel .rail-actions,#page-panel .meta')).toHaveCount(0);
 await page.locator('[data-slide="a"]').click({button:'right'});await expect(page.locator('#page-context-menu')).toBeVisible();await expect(page.locator('[data-slide="a"]')).toHaveAttribute('aria-current','true');
 await page.locator('[data-page-action="copy"]').click();await expect(cards).toHaveCount(5);const menuCopy=(await order())[2];await expect(page.locator(`[data-slide="${menuCopy}"]`)).toBeFocused();
 await page.keyboard.press('Shift+F10');await expect(page.locator('#page-context-menu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator(`[data-slide="${menuCopy}"]`)).toBeFocused();
 await search.fill('c');await page.locator('[data-slide="c"]').click();await page.keyboard.press('Control+d');await expect(search).toHaveValue('');await expect(cards).toHaveCount(6);
 await search.fill('b');await page.locator('[data-slide="b"]').click();await page.keyboard.press('Delete');await expect(page.locator(`[data-slide="${firstCopy}"]`)).toBeFocused();
 await page.locator('#add-slide').click();await expect(search).toHaveValue('');await expect(cards).toHaveCount(6);await expect(page.locator('.slide-card.active')).toBeFocused();
 await search.fill('新页面');await page.locator('.slide-card.active').press('Delete');await expect(search).toBeFocused();await expect(page.locator('#slide-search-empty')).toBeVisible();await search.fill('');
 await page.locator('#file-menu-trigger').click();await page.locator('#open-find-replace').click();await expect(page.locator('#find-replace-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('[data-slide="a"]').click();await page.locator('#page-panel').screenshot({path:'.local/page-sidebar-compact.png'});

});
