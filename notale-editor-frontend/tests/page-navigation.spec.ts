import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
test('rapid page keys advance focus immediately and last navigation wins without remounting the current page',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'快速切页',width:1600,height:900,slides:Array.from({length:4},(_,i)=>({id:'page'+i,name:'页面'+i,sourcePath:i+'.html',html:`<html><body><main data-notale-id="stage" id="stage">Page ${i}</main></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="pages"]').click();await page.locator('[data-slide="page0"]').focus();
 const focused=await page.evaluate(()=>{for(let i=0;i<3;i++)document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));return (document.activeElement as HTMLElement).dataset.slide;});
 expect(focused).toBe('page3');await expect(page.frameLocator('#canvas').locator('#stage')).toHaveText('Page 3');await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-slide="page3"]').focus();
 const reversed=await page.evaluate(()=>{for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowUp'])document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));return (document.activeElement as HTMLElement).dataset.slide;});
 expect(reversed).toBe('page1');await expect(page.frameLocator('#canvas').locator('#stage')).toHaveText('Page 1');await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('#canvas').evaluate(frame=>{(window as any).__navigationFrame=frame;(window as any).__navigationMounts=(window as any).__notaleMounts.length;});
 await page.evaluate(()=>(window as any).NotaleWorkbench.showSlide('page1'));
 expect(await page.locator('#canvas').evaluate(frame=>frame===(window as any).__navigationFrame&&(window as any).__notaleMounts.length===(window as any).__navigationMounts)).toBe(true);
});

test('a pending page reorder does not steal focus from search when it settles',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'排序焦点',width:1600,height:900,slides:['a','b'].map(key=>({id:key,name:key,sourcePath:key+'.html',html:`<html><body><p data-notale-id="text">${key}</p></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.locator('[data-tool="pages"]').click();const card=page.locator('[data-slide="a"]');await card.focus();
 await card.evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,isComposing:true,bubbles:true})));
 expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.map((slide:any)=>slide.id))).toEqual(['a','b']);
 let release!:()=>void,arrived!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),requested=new Promise<void>(resolve=>arrived=resolve);
 await page.route('**/api/documents/*/prepare',async route=>{arrived();await gate;await route.continue();});
 await card.press('Alt+ArrowDown');await requested;
 const search=page.locator('#slide-search');await search.fill('a');release();
 await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.map((slide:any)=>slide.id))).toEqual(['b','a']);
 await expect(page.getByRole('status').filter({hasText:'页面已移动到第 2 页'})).toBeAttached();
 await expect(search).toBeFocused();await search.press('Backspace');await expect(search).toHaveValue('');
 await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
});

test('copy completion preserves a newer page navigation while its save is pending',async({page})=>{
 const id=randomUUID();expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'复制切页',width:1600,height:900,slides:['a','b'].map(key=>({id:key,name:key,sourcePath:key+'.html',html:`<html><body><p data-notale-id="text">${key}</p></body></html>`}))}})).ok()).toBe(true);
 await page.goto('/?document='+id);await page.waitForFunction(()=>(window as any).NotaleWorkbench);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());await page.locator('[data-tool="pages"]').click();
 let release!:()=>void,arrived!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),requested=new Promise<void>(resolve=>arrived=resolve);
 await page.route('**/api/documents/*/sync/v2',async route=>{arrived();await gate;await route.continue();});
 await page.locator('#copy-slide').click();await requested;
 await page.locator('[data-slide="b"]').click();await expect(page.frameLocator('#canvas').locator('[data-notale-id="text"]')).toHaveText('b');
 release();await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());
 await expect(page.locator('[data-slide="b"]')).toHaveAttribute('aria-current','true');
 await expect(page.frameLocator('#canvas').locator('[data-notale-id="text"]')).toHaveText('b');
 expect(await page.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot().document.slides.length)).toBe(3);
});
