import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test.use({baseURL: process.env.ARCHITECTURE_URL ?? 'http://localhost:4399'});
test('root decorations support partial removal, cancel and reopening', async ({page}) => {
  const id=randomUUID();
  const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'装饰线编辑',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><p data-notale-id="text" style="text-decoration:underline line-through;position:absolute;left:100px;top:100px">Hello <a data-notale-id="link" href="https://example.com">world</a></p></body></html>'}]}});
  expect(response.ok(),await response.text()).toBe(true);
  await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);
  await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
  await page.evaluate(()=>(window as any).NotaleWorkbench.select('text'));
  const surface=page.locator('#rich-surface');
  for (const cancel of [true,false]) {
    await page.locator('#open-rich-editor').click();
    await expect(surface).toHaveCSS('text-decoration-line','underline line-through');
    await surface.evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild!,0);r.setEnd(el.firstChild!,5);const s=getSelection()!;s.removeAllRanges();s.addRange(r);});
    if (cancel) await page.locator('[data-rich-command="underline"]').click();
    else await surface.press("Control+u");
    await expect(page.locator('[data-rich-command="underline"]')).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('[data-rich-command="strikeThrough"]')).toHaveAttribute('aria-pressed','true');
    await expect(surface).toHaveText('Hello world');
    if(cancel){await page.locator('#rich-discard').click();continue;}
    await page.locator('#rich-save').click();
  }
  await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
  await page.reload();await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.evaluate(()=>(window as any).NotaleWorkbench.select('text'));
  const object=page.frameLocator('#canvas').locator('[data-notale-id="text"]');
  await expect(object).toHaveCSS('text-decoration-line','none');
  await expect(object.locator('span').first()).toHaveCSS('text-decoration-line','line-through');
  await expect(object.locator('a')).toHaveAttribute('href','https://example.com');
  await expect(object.locator('a span')).toHaveCSS('text-decoration-line','underline line-through');
  await page.locator('#open-rich-editor').click();await surface.press('Control+a');await page.locator('[data-rich-command="strikeThrough"]').click();await expect(page.locator('[data-rich-command="strikeThrough"]')).toHaveAttribute('aria-pressed','false');await page.locator('#rich-save').click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());await expect(object).toHaveText('Hello world');await expect(object.locator('a')).toHaveAttribute('data-notale-id','link');
});
