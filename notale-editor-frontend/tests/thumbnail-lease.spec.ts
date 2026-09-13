import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('retained thumbnails renew their old grant after navigation adopts a newer revision',async({page})=>{
 const id=randomUUID(),renewed=new Set<string>();
 page.on('request',request=>{if(request.url().endsWith('/preview/renew'))renewed.add(request.postDataJSON().channel);});
 await page.clock.install();
 expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'缩略图续期',width:1600,height:900,slides:['a','b'].map(id=>({id,name:id,sourcePath:id+'.html',html:'<html><body><h1 data-notale-id="title">Title</h1></body></html>'}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.locator('#overview').click();
 const thumb=page.locator('[data-thumbnail="a"] iframe');await expect(page.frameLocator('[data-thumbnail="a"] iframe').locator('h1')).toHaveText('Title');
 const oldUrl=await thumb.getAttribute('src'),oldChannel=new URL(oldUrl!).pathname.split('/')[2];
 await page.evaluate(async()=>{const w=(window as any).NotaleWorkbench;await w.commands([{type:'element.patch',slideId:'a',target:'title',patch:{text:'Updated'}}]);await w.whenSynchronized();await w.showSlide('b');});
 await expect(thumb).toHaveAttribute('src',oldUrl!);const currentChannel=new URL((await page.locator('#canvas').getAttribute('src'))!).pathname.split('/')[2];expect(currentChannel).not.toBe(oldChannel);
 await page.clock.fastForward(31*60*1000);await expect.poll(()=>renewed.has(oldChannel)).toBe(true);
 await page.evaluate(()=>(window as any).NotaleWorkbench.dispose());
});
