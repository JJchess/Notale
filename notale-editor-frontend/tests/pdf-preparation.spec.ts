import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4399'});
for(const cancel of [false,true]) test(cancel?'closing a preparing PDF window releases export controls':'PDF waits for every page runtime before opening print',async({page,context})=>{
 const id=randomUUID();const created=await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'PDF ready',width:1600,height:900,slides:['first','second'].map(id=>({id,name:id,sourcePath:id+'.html',html:`<html><body><p data-notale-id="text">${id}</p></body></html>`}))}});expect(created.ok(),await created.text()).toBe(true);
 await context.addInitScript(()=>{window.print=()=>{(window as any).__printed=true;};});await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve;});
 await context.route('**/__notale_runtime__/bridge.js',async route=>{const frame=route.request().frame(),owner=frame.page();if(owner!==page&&frame.url().includes('second.html')){held=true;await gate;}try{await route.continue();}catch(cause){if(!owner.isClosed())throw cause;}});
 let popup;
 try{await page.locator('[data-header-menu="export"] > summary').click();const opened=page.waitForEvent('popup');await page.locator('#export-pdf').click();popup=await opened;await expect.poll(()=>held).toBe(true);expect(await popup.evaluate(()=>(window as any).__printed===true)).toBe(false);if(cancel){await popup.close();popup=undefined;await expect(page.locator('#export-pdf')).toBeEnabled();await expect(page.locator('#document-io-status')).toContainText('PDF 导出已取消');}else{release();await popup.waitForFunction(()=>(window as any).__printed===true);await expect(popup.locator('iframe')).toHaveCount(2);}}finally{release();await popup?.close();}
});
