import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
/** Drives the 互动 tab against a backend running with EDITOR_AI_STUB, so the candidate
 * pipeline — request, gate, dry run, review, apply, undo — is checked without a model call.
 * The stub keys off the instruction text; see docs/AI-EDITS.md. The step-order assertions
 * additionally want the backend started with EDITOR_AI_STUB_DELAY_MS set (e.g. 300), or the
 * whole pipeline resolves within a single render and there is no "active" state to observe. */
test.use({baseURL:process.env.INTERACTIVE_TEST_URL??'http://127.0.0.1:4319'});
const html='<html><body style="margin:0"><main id="stage" data-notale-id="stage" style="position:absolute;width:1600px;height:900px">'
 +'<h1 data-notale-id="title" style="position:absolute;left:120px;top:90px;width:700px;margin:0;font-size:44px;color:#111111">标题文字</h1>'
 +'</main></body></html>';
async function open(page:Page){
 const id=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'AI 互动',width:1600,height:900,slides:[{id:'first',name:'首页',sourcePath:'first.html',html}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 return id;
}
const ready=(page:Page)=>page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
const slide=(page:Page)=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides[0]);

test('AI 局部修改：候选先审后用，一次撤销全部回退',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 const title=page.frameLocator('#canvas').locator('[data-notale-id="title"]');
 await expect(title).toHaveCSS('color','rgb(17, 17, 17)');
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('title'));
 await page.locator('[data-tool="interactive"]').click();
 await expect(page.locator('#ai-target')).toContainText('修改选中');
 await page.locator('#ai-instruction').fill('把标题变红');
 await page.locator('#ai-submit').click();
 // Real pipeline stages appear as the request actually reaches them -- not invented, not a
 // spinner. With EDITOR_AI_STUB_DELAY_MS set, at least one row is still "active" mid-flight.
 await expect(page.locator('#ai-steps li').first()).toBeVisible();
 // The candidate is described before anything is written to the document.
 await expect(page.locator('#ai-candidate')).toBeVisible();
 await expect(page.locator('#ai-candidate li')).toHaveText(['修改对象']);
 await expect.poll(async()=>page.locator('#ai-steps li[data-status="done"]').count()).toBe(4);
 await expect(page.locator('#ai-steps li')).toHaveText(['读取页面对象','请求模型','解析与校验','服务端试跑']);
 expect((await slide(page)).html).not.toContain('#c0392b');
 // The candidate is projected onto the canvas the instant it arrives, before any apply.
 await expect(title).toHaveCSS('color','rgb(192, 57, 43)');
 await page.locator('#ai-apply').click();
 await expect(title).toHaveCSS('color','rgb(192, 57, 43)');
 await ready(page);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await page.locator('#undo').click();
 await expect(title).toHaveCSS('color','rgb(17, 17, 17)');
 expect(errors).toEqual([]);
});

test('AI 插入互动：组件随对象一起落地，一次撤销全部回退',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 await page.evaluate(()=>(window as any).NotaleWorkbench.selectMany([]));
 await page.locator('[data-tool="interactive"]').click();
 await expect(page.locator('#ai-target')).toContainText('新建');
 await page.locator('#ai-instruction').fill('插入一个点击展开的提示框');
 await page.locator('#ai-submit').click();
 await expect(page.locator('#ai-candidate')).toBeVisible();
 await expect(page.locator('#ai-candidate li')).toContainText(['定义交互']);
 expect((await slide(page)).components ?? []).toHaveLength(0);
 // The insert transaction (slide.insert + elements.transfer + slide.delete) is projected onto
 // the canvas before applying too. The server reassigns fresh object ids on elements.transfer,
 // so the preview's ids will not match what the model authored -- assert on the visible text.
 await expect(page.frameLocator('#canvas').getByText('看答案')).toBeVisible();
 await page.locator('#ai-apply').click();
 await ready(page);
 await expect.poll(async()=>((await slide(page)).components ?? []).length).toBe(1);
 // The scratch page the transaction used must not survive it.
 await expect.poll(async()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(1);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await page.locator('#undo').click();await ready(page);
 await expect.poll(async()=>((await slide(page)).components ?? []).length).toBe(0);
 expect(errors).toEqual([]);
});

test('取消候选不改动工程，画布预览也一起复原',async({page})=>{
 await open(page);
 const title=page.frameLocator('#canvas').locator('[data-notale-id="title"]');
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('title'));
 await page.locator('[data-tool="interactive"]').click();
 await page.locator('#ai-instruction').fill('把标题变红');
 await page.locator('#ai-submit').click();
 await expect(page.locator('#ai-candidate')).toBeVisible();
 await expect(title).toHaveCSS('color','rgb(192, 57, 43)');
 const before=(await slide(page)).html;
 await page.locator('#ai-discard').click();
 await expect(page.locator('#ai-candidate')).toHaveCount(0);
 expect((await slide(page)).html).toBe(before);
 // The document was never touched, so the canvas just needed to forget the ghost.
 await expect(title).toHaveCSS('color','rgb(17, 17, 17)');
});

test('右键菜单把选区交给互动侧栏',async({page})=>{
 await open(page);
 await page.frameLocator('#canvas').locator('[data-notale-id="title"]').click({button:'right'});
 await expect(page.locator('[data-action="ai-edit"]')).toBeVisible();
 await page.locator('[data-action="ai-edit"]').click();
 await expect(page.locator('#interactive-drawer')).toBeVisible();
 await expect(page.locator('#ai-target')).toContainText('修改选中');
});
