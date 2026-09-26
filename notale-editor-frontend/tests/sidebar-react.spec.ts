import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {reveal} from './harness/format-panel';
import {importHtml} from '@notale/editor';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4396'});
test('React sidebar restores preferences and selects the appropriate inspector',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'侧栏状态',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:importHtml('<html><body><main id="stage"><h1 data-notale-id="title">侧栏验证</h1></main></body></html>').html}]}});expect(response.ok()).toBe(true);
 await page.addInitScript(()=>{if(!localStorage.getItem('sidebar-test-initialized')){localStorage.setItem('notale-editor-view-v1',JSON.stringify({pages:true,inspector:false,notes:true}));localStorage.setItem('sidebar-test-initialized','1');}});
 const ready=async()=>{await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length>0);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());};
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready();
 await expect(page.locator('#page-panel')).toBeVisible();await expect(page.locator('#notes-panel')).toBeVisible();
 await page.locator('[data-tool="insert"]').click();await expect(page.locator('#insert-drawer')).toBeVisible();await expect(page.locator('#page-panel')).not.toBeVisible();
 await page.locator('[data-tool="style"]').click();await expect(page.locator('#property-panel')).toBeVisible();await expect(page.locator('[data-panel="format"]')).toBeVisible();await expect(page.locator('#tool-panel')).not.toBeVisible();
 await expect(page.locator('#global-style')).toBeVisible();await expect(page.locator('#object-style')).not.toBeVisible();
 await page.locator('[data-tool="pages"]').click();await expect(page.locator('#page-panel')).toBeVisible();await expect(page.locator('#property-panel')).not.toBeVisible();
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('title'));await expect(page.locator('#property-panel')).toBeVisible();await expect(page.locator('[data-tool="style"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#object-style')).toBeVisible();
 await expect(page.locator('#global-style')).not.toBeVisible();
 // 选中文字对象后，顶层给出「对象/文本」两档，图标行只给这个类型真有的分类，组跟着所选分类出现。
 await expect(page.locator('[data-format-scope="object"]')).toBeVisible();await expect(page.locator('[data-format-scope="text"]')).toBeVisible();
 await expect(page.locator('#format-tab-special')).toHaveCount(0);
 await reveal(page,'#property-geometry');await expect(page.locator('#property-geometry')).toBeVisible();await expect(page.locator('#property-text')).not.toBeVisible();
 await reveal(page,'#property-text');await expect(page.locator('#property-text')).toBeVisible();await expect(page.locator('#property-geometry')).not.toBeVisible();
 await expect(page.locator('#property-binding')).not.toBeVisible();
 await page.locator('[data-tool="style"]').click();await expect(page.locator('#property-panel')).not.toBeVisible();await page.locator('[data-tool="style"]').click();await expect(page.locator('#property-panel')).toBeVisible();
 await page.locator('#toggle-notes').click();await expect(page.locator('#notes-panel')).not.toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});await ready();await expect(page.locator('#notes-panel')).not.toBeVisible();await expect(page.locator('#property-panel')).toBeVisible();
});
