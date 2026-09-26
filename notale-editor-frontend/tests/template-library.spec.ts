import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.TEMPLATE_TEST_URL??'http://127.0.0.1:4312'});
test('editable templates: page, repeated diagrams, edits, undo and reopen',async({page})=>{
  const id=randomUUID();
  const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'模板 · 编辑体验',width:1600,height:900,slides:[{id:'blank',name:'图示练习',sourcePath:'blank.html',html:'<!doctype html><html><body style="margin:0"><main id="stage" data-notale-id="stage" style="position:absolute;width:1600px;height:900px"></main></body></html>'}]}});
  expect(response.status(),await response.text()).toBe(201);
  await page.goto('/?document='+id);
  await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());
  const ready=()=>page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await ready();
  await page.locator('[data-tool="templates"]').click();
  await expect(page.locator('.template-card')).toHaveCount(8);
  const insert=async(code:string,kind:'page'|'diagram')=>{
    const tool=page.locator(`[data-tool="${kind==='diagram'?'insert':'templates'}"]`);
    if(await tool.getAttribute('aria-pressed')!=='true')await tool.click();
    if(kind==='diagram'){
      const section=page.locator('[data-insert-category="diagrams"]');
      if(await section.getAttribute('open')===null)await section.locator('summary').click();
      await page.locator(`[data-diagram-template="${code}"]`).click();
    }else await page.locator(`[data-template-id="${code}"]`).click();
    await page.locator(`[data-template-use="${kind}"]`).click();
    await expect(page.locator('.template-dialog')).not.toBeVisible({timeout:20000});await ready();
  };
  await insert('E3-02','page');
  const frame=page.frameLocator('#canvas');
  await expect(frame.locator('[data-template="E3-02"]')).toBeVisible();
  await frame.locator('body').evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const cardTitle=await frame.locator('[data-element-id="e302-card-title-0"]').getAttribute('data-notale-id');
  const image=await frame.locator('[data-element-id="e302-photo-0"] img').getAttribute('data-notale-id');
  await page.evaluate(async({cardTitle,image})=>{
    const w=(window as any).NotaleWorkbench,s=w.getSnapshot().document.slides[1];
    await w.commands([{type:'element.content',slideId:s.id,target:cardTitle,html:'我的课堂案例'},{type:'element.patch',slideId:s.id,target:image,patch:{style:{'object-position':'30% 50%'}}}]);
  },{cardTitle,image});
  await page.evaluate(()=>(window as any).NotaleWorkbench.showSlide('blank'));await ready();
  await insert('P015','diagram');await insert('P015','diagram');
  await expect(frame.locator('[data-template="P015"]')).toHaveCount(2);
  const valid=await frame.locator('body').evaluate(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);
    const painted=[...document.querySelectorAll<SVGElement>('[data-template="P015"] polygon')];
    return {unique:ids.length===new Set(ids).size,paints:painted.length===8&&painted.every(n=>{const id=n.getAttribute('fill')?.match(/#([^"')]+)/)?.[1];return !!id&&!!document.getElementById(id)?.querySelector('stop');})};
  });expect(valid).toEqual({unique:true,paints:true});
  const selected=await page.evaluate(()=>(window as any).NotaleWorkbench.getSelection());expect(selected.length).toBeGreaterThan(1);
  await page.locator('#undo').click();await expect(frame.locator('[data-template="P015"]')).toHaveCount(1);
  await insert('P004','diagram');
  const polygon=await frame.locator('[data-template="P004"] polygon').first().getAttribute('data-notale-id');
  await page.evaluate(async target=>{const w=(window as any).NotaleWorkbench;await w.commands([{type:'svg.patch',slideId:'blank',mutations:[{op:'set',target,attributes:{fill:'#4285a4'}}]}]);},polygon);
  await page.reload();await ready();
  const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());
  expect(saved.document.slides).toHaveLength(2);expect(saved.document.slides[0].groups.length).toBe(2);
  expect(saved.document.slides[0].html).toContain('#4285a4');expect(saved.document.slides[1].html).toContain('我的课堂案例');expect(saved.document.slides[1].html).toContain('30% 50%');
  expect(Object.keys(saved.document.assets).length).toBeGreaterThan(3);
  await page.locator('[data-tool="templates"]').click();
  await page.screenshot({path:'.local/template-library.png'});
  console.log('Template experience document: '+id);
});
