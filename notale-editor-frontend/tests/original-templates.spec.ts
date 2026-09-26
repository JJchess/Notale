import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('original page and repeated diagrams preserve editable identities through reopen',async({page})=>{
 const id=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'原创模板验证',width:1600,height:900,slides:[{id:'first',name:'空白页',sourcePath:'first.html',html:'<html><body><main id="stage" data-notale-id="stage" style="width:1600px;height:900px"></main></body></html>'}]}})).status()).toBe(201);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="templates"]').click();await expect(page.locator('[data-template-id]')).toHaveCount(8);
 await page.locator('[data-template-id="N04"]').click();await page.locator('[data-template-use="page"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(2);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const canvas=page.frameLocator('#canvas');await expect(canvas.locator('[data-template-instance]')).toHaveCount(1);
 const heading=canvas.locator('[data-notale-id]').filter({hasText:/让反馈/}).last();const target=await heading.getAttribute('data-notale-id');expect(target).toBeTruthy();
 await page.evaluate(target=>{const w=(window as any).NotaleWorkbench;const s=w.getSnapshot();return w.commands([{type:'element.patch',slideId:s.document.slides[1].id,target,patch:{text:'反馈让学习发生'}}]);},target);
 for(let i=0;i<2;i++){
  await page.locator('[data-tool="insert"]').click();const category=page.locator('[data-insert-category="diagrams"]');if(!await category.evaluate(e=>(e as HTMLDetailsElement).open))await category.locator('summary').click();
  await page.locator('[data-diagram-template="N05"]').click();await page.locator('[data-template-use="diagram"]').click();await expect(page.locator('.template-dialog')).toHaveCount(0);
 }
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await expect(canvas.locator('[data-template-instance]')).toHaveCount(3);
 const state=await canvas.locator('[data-template-instance]').evaluateAll(nodes=>({ids:nodes.flatMap(n=>[n,...n.querySelectorAll('[data-notale-id]')].map(n=>n.getAttribute('data-notale-id'))),widths:nodes.map(n=>n.getBoundingClientRect().width)}));
 expect(new Set(state.ids).size).toBe(state.ids.length);expect(state.widths.filter(w=>w<=721)).toHaveLength(2);
 await page.locator('#undo').click();await expect(canvas.locator('[data-template-instance]')).toHaveCount(2);await page.locator('#redo').click();await expect(canvas.locator('[data-template-instance]')).toHaveCount(3);
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.slides[1].html).toContain('反馈让学习发生');expect((saved.document.slides[1].html.match(/data-template-instance=/g)||[]).length).toBe(3);await page.reload();await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="pages"]').click();await page.locator('[data-slide]').nth(1).click();await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await expect(page.frameLocator('#canvas').locator('[data-template-instance]')).toHaveCount(3);await expect(page.frameLocator('#canvas').getByText('反馈让学习发生',{exact:true})).toHaveCount(1);
});
