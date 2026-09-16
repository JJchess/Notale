import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('compact header owns history and contextual tools without consuming a second canvas row',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'顶栏验证',width:1600,height:900,slides:[{id:'a',name:'a',sourcePath:'a.html',html:'<html><body><div data-notale-id="one" style="position:absolute;left:20px;top:20px;width:100px;height:100px">One</div><div data-notale-id="two" style="position:absolute;left:240px;top:20px;width:100px;height:100px">Two</div></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await expect(page.locator('.center > .toolbar,#overview,#overview-pagination')).toHaveCount(0);await expect(page.locator('.app-header #undo')).toHaveCount(1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany(['one','two']));await expect(page.locator('.app-header #group svg')).toHaveCount(1);await page.locator('#group').click();const groups=()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0].groups.length);await expect.poll(groups).toBe(1);await page.locator('#undo').click();await expect.poll(groups).toBe(0);await page.locator('#redo').click();await expect.poll(groups).toBe(1);
 await page.screenshot({path:'.local/header-compact-desktop.png'});await page.setViewportSize({width:600,height:850});await page.screenshot({path:'.local/header-compact-narrow.png'});
 await expect(page.locator('.app-header #undo')).toBeVisible();await expect(page.locator('.app-header #present')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
});
