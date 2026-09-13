import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React recovery imports, exports and opens a separate recovered document',async({page})=>{
 const id=randomUUID(),mutationId=randomUUID();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'恢复原件',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',html:'<html><body><main data-notale-id="stage">原件</main></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===1);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#file-menu-trigger').click();await page.locator('[data-file="recovery"]').click();await expect(page.locator('#recovery-dialog')).toBeVisible();
 const raw=JSON.stringify({schema:'notale-sync-v1',operations:[{id:mutationId,documentId:id,createdAt:Date.now(),state:'recovery',task:{documentId:id,request:{baseVersion:1,mutationId,commands:[{type:'deck.update',title:'恢复后的标题'}]}}}]});
 await page.locator('#import-recovery').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(raw)});await expect(page.locator('.recovery-row')).toHaveCount(1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整草稿',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('notale-recovery.json');const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));expect(JSON.parse(Buffer.concat(chunks).toString()).operations[0].id).toBe(mutationId);
 const opened=page.waitForEvent('popup');await page.getByRole('button',{name:'打开恢复副本',exact:true}).click();const copy=await opened;await copy.waitForURL(/document=/);const copyId=new URL(copy.url()).searchParams.get('document');expect(copyId).not.toBe(id);const restored=await page.request.get('/api/documents/'+copyId).then(r=>r.json());expect(restored.document.title).toContain('恢复后的标题');const original=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(original.document.title).toBe('恢复原件');expect(original.version).toBe(1);await copy.close();
});
