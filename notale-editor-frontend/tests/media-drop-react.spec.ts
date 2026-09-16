import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('React media overlay drops a batch and pastes uploaded images',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'媒体入口',width:1600,height:900,slides:[{id:'first',name:'第一页',sourcePath:'first.html',html:'<html><body><p data-notale-id="text">保留文字</p></body></html>'},{id:'second',name:'第二页',sourcePath:'second.html',html:'<html><body><p data-notale-id="other">另一页</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length===2);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 const data=await page.evaluateHandle(()=>{const data=new DataTransfer(),bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));for(const name of ['one.png','two.png'])data.items.add(new File([bytes],name,{type:'image/png'}));return data;});
 await page.locator('#canvas-viewport').dispatchEvent('dragenter',{dataTransfer:data});const overlay=page.locator('#media-drop-overlay');await expect(overlay).toBeVisible();const bounds=await page.locator('#canvas-viewport').boundingBox(),cover=await overlay.boundingBox();expect(cover?.width).toBeCloseTo(bounds!.width,0);expect(cover?.x).toBeCloseTo(bounds!.x,0);
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
 await page.route('**/api/assets',async route=>{entered();await gate;await route.continue();});
 await overlay.dispatchEvent('drop',{dataTransfer:data,clientX:bounds!.x+150,clientY:bounds!.y+120});await started;await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'上传期间修改标题'}]));await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());release();
 await expect(overlay).toBeHidden();const images=page.frameLocator('#canvas').locator('img');await expect(images).toHaveCount(2);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 let saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(Object.keys(saved.document.assets)).toHaveLength(2);expect(saved.document.title).toBe('上传期间修改标题');await page.unroute('**/api/assets');expect(saved.document.slides[0].html).toContain('保留文字');
 await page.locator('#canvas-viewport').evaluate((el,data)=>el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})),data);await expect(images).toHaveCount(4);await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());saved=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(Object.keys(saved.document.assets)).toHaveLength(4);expect(saved.document.slides[0].html).toContain('保留文字');
 let releaseSwitch!:()=>void,enteredSwitch!:()=>void;const switchGate=new Promise<void>(resolve=>releaseSwitch=resolve),switchStarted=new Promise<void>(resolve=>enteredSwitch=resolve);
 await page.route('**/api/assets',async route=>{enteredSwitch();await switchGate;await route.continue();});
 try {
  await page.locator('#canvas-viewport').evaluate((el,data)=>el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})),data);
  await switchStarted;await page.evaluate(()=>(window as any).NotaleWorkbench.showSlide('second'));releaseSwitch();
  await expect(page.getByText('上传期间目标页面已变化，请在目标页重新插入',{exact:true})).toBeVisible();
  const unchanged=await page.request.get('/api/documents/'+id).then(r=>r.json());expect(unchanged.version).toBe(saved.version);expect(unchanged.document.slides).toEqual(saved.document.slides);
 } finally {releaseSwitch();await page.unroute('**/api/assets');}

});
