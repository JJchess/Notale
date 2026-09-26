import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.PRESENT_TEST_URL??'http://127.0.0.1:4399'});
test('presentation retains return visits and bounds resident runtimes',async({page})=>{
 const id=randomUUID(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'放映缓存',width:1600,height:900,slides:Array.from({length:9},(_,i)=>({id:'page'+i,name:'页面 '+i,sourcePath:i+'.html',html:'<!doctype html><html><body><main id="stage" data-notale-id="stage">Page '+i+'</main></body></html>'}))}})).ok()).toBe(true);
 await page.goto('/present?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleShow?.state().ready&&(window as any).NotaleShow.state().control==='controlling');
 const current=()=>page.frameLocator('.ps-reveal section.present iframe');await current().locator('#stage').evaluate(()=>{(window as any).__cacheMarker='original';});
 const jump=async(index:number)=>{const start=Date.now();await page.evaluate(i=>(window as any).NotaleShow.reveal.slide(i),index);await page.waitForFunction(i=>(window as any).NotaleShow.state().index===i&&(window as any).NotaleShow.state().ready,index);await current().locator('#stage').waitFor();expect(await page.locator('.ps-reveal iframe[src]').count()).toBeLessThanOrEqual(5);return Date.now()-start;};
 await jump(3);const returnMs=await jump(0);expect(await current().locator('#stage').evaluate(()=>(window as any).__cacheMarker)).toBe('original');
 for(const i of [5,8,2,0])await jump(i);
 expect(await current().locator('#stage').evaluate(()=>(window as any).__cacheMarker)).toBeUndefined();await page.evaluate(()=>{const show=(window as any).NotaleShow;for(const index of [8,1,7])show.reveal.slide(index);});
 await page.waitForFunction(()=>(window as any).NotaleShow.state().index===7&&(window as any).NotaleShow.state().ready);await expect(current().locator('#stage')).toHaveText('Page 7');expect(await page.locator('.ps-reveal iframe[src]').count()).toBeLessThanOrEqual(5);expect(errors).toEqual([]);console.log({returnMs});
});
