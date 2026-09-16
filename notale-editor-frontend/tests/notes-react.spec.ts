import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React notes autosave, retain drafts through reload and resolve remote changes explicitly',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'Notes acceptance',width:1600,height:900,slides:['a','b'].map(key=>({id:key,name:key,sourcePath:key+'.html',html:`<html><body><h1 data-notale-id="title-${key}">${key}</h1></body></html>`,notes:'Original '+key}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===2);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#toggle-notes').click();const notes=page.locator('#notes');await notes.fill('Draft A');
 const show=async(id:string)=>{await page.evaluate(id=>(window as any).NotaleWorkbench.showSlide(id),id);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());};
 await show('b');await expect(notes).toHaveValue('Original b');await notes.fill('Draft B');await show('a');await expect(notes).toHaveValue('Draft A');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===2);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());if(!await notes.isVisible())await page.locator('#toggle-notes').click();await expect(notes).toHaveValue('Draft A');
 await notes.press('Control+Enter');await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(saved.document.slides[0].notes).toBe('Draft A');
 await show('b');await expect(notes).toHaveValue('Draft B');await notes.dispatchEvent('compositionstart');await notes.fill('Conflicting B');await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'slide.update',slideId:'b',patch:{notes:'Remote B'}}]));await page.locator('#save-notes').click();await expect(page.locator('#notes-panel')).toContainText('请选择保留哪份内容');await expect(notes).toHaveValue('Conflicting B');await page.getByRole('button',{name:'使用已保存备注',exact:true}).click();await expect(notes).toHaveValue('Remote B');await notes.dispatchEvent('compositionend');
 await notes.fill('Presenter B');await show('a');await notes.fill('Presenter A');
 const popupReady=page.waitForEvent('popup');await page.locator('#speaker').click();const presenter=await popupReady;
 await expect(presenter.locator('#speaker-panel #notes')).toContainText('Presenter A');
 const presented=await page.request.get('/api/documents/'+id).then(r=>r.json());
 expect(presented.document.slides.map((slide:any)=>slide.notes)).toEqual(['Presenter A','Presenter B']);
 await presenter.close();
 await notes.fill('Copy this draft');await expect.poll(async()=>{const snapshot=await page.request.get('/api/documents/'+id).then(r=>r.json());return snapshot.document.slides.find((slide:any)=>slide.id==='a').notes;}).toBe('Copy this draft');await page.locator('[data-tool="pages"]').click();await page.locator('.slide-card.active').press('Control+d');
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(3);
 await expect(notes).toHaveValue('Copy this draft');await expect(page.locator('#save-notes')).toBeDisabled();
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 const copied=await page.request.get('/api/documents/'+id).then(r=>r.json());
 expect(copied.document.slides.find((slide:any)=>slide.id!=='a'&&slide.id!=='b').notes).toBe('Copy this draft');
 expect(copied.document.slides.find((slide:any)=>slide.id==='a').notes).toBe('Copy this draft');
 await page.locator('#undo').click();await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(2);
 await show('a');await expect(notes).toHaveValue('Copy this draft');await expect(page.locator('#save-notes')).toBeDisabled();

});
