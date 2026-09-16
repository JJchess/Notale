import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('presentation keeps the launch page while a save is pending',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'放映起点',width:1600,height:900,slides:['first','second'].map(id=>({id,name:id,sourcePath:id+'.html',html:'<html><body><p data-notale-id="title" style="font-size:20px">标题</p></body></html>'}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(async()=>{const w=(window as any).NotaleWorkbench;await w.whenReady();w.select('title');const viewer={closed:false,location:{href:''},close(){this.closed=true;}};(window as any).__launchViewer=viewer;window.open=(()=>viewer) as any;});
 let release!:()=>void,requests=0;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/documents/*/sync/v2',async route=>{requests++;await gate;await route.continue();});
 try{
  await page.locator('#font-size').fill('24');await page.locator('#font-size').press('Enter');await expect.poll(()=>requests).toBeGreaterThan(0);await page.locator('#present').click();
  await page.evaluate(()=>(window as any).NotaleWorkbench.showSlide('second'));release();
  await expect.poll(()=>page.evaluate(()=>(window as any).__launchViewer.location.href)).toContain('/present?');
  const href=await page.evaluate(()=>(window as any).__launchViewer.location.href);const url=new URL(href,'http://localhost');expect(url.searchParams.get('slide')).toBe('first');expect(url.searchParams.get('document')).toBe(id);expect(Number(url.searchParams.get('version'))).toBeGreaterThan(1);
  await page.evaluate(()=>(window as any).__launchViewer.location.href='');await page.locator('#present-menu summary').click();await page.locator('#present-speaker').click();await expect.poll(()=>page.evaluate(()=>(window as any).__launchViewer.location.href)).toContain('speaker=1');expect(new URL(await page.evaluate(()=>(window as any).__launchViewer.location.href),'http://localhost').searchParams.get('slide')).toBe('second');
  await page.evaluate(()=>(window as any).__launchViewer.location.href='');await page.locator('#present-menu summary').click();await page.locator('#present-beginning').click();await expect.poll(()=>page.evaluate(()=>(window as any).__launchViewer.location.href)).toContain('slide=first');
 }finally{release();}
});
