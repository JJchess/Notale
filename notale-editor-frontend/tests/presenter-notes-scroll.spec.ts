import {test,expect} from '@playwright/test';import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.PRESENT_TEST_URL??'http://localhost:4399'});
test('unchanged notes retain reading position across steps, changed notes reset',async({page})=>{
 const id=randomUUID();const response=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'备注阅读',width:1600,height:900,slides:[{id:'first',name:'页面',sourcePath:'first.html',notes:Array.from({length:60},(_,i)=>'讲授备注第 '+i+' 段').join('\n'),steps:[{id:'start',name:'开始'},{id:'next',name:'继续'},{id:'changed',name:'新提示',notes:'这一段需要从头阅读'}],html:'<html><body><p data-notale-id="text">讲授内容</p></body></html>'}]}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto('/present?document='+id+'&speaker=1');await page.waitForFunction(()=>(window as any).NotaleShow?.state().ready&&(window as any).NotaleShow.state().control==='controlling');const notes=page.locator('#notes');await notes.evaluate(el=>el.scrollTop=250);await expect.poll(()=>notes.evaluate(el=>el.scrollTop)).toBe(250);
 await page.locator('#next').click();await expect.poll(()=>page.evaluate(()=>(window as any).NotaleShow.state().step)).toBe(1);expect(await notes.evaluate(el=>el.scrollTop)).toBe(250);
 await page.locator('#next').click();await expect(notes).toContainText('这一段需要从头阅读');await expect.poll(()=>notes.evaluate(el=>el.scrollTop)).toBe(0);
});
