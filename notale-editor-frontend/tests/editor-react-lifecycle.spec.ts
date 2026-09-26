import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('../../notale-editor/node_modules/esbuild') as {build:(options:unknown)=>Promise<{outputFiles:{path:string;text:string}[]}>};
// Synthetic route.fulfill pages have no local IP address classification.
test.use({baseURL:process.env.ARCHITECTURE_URL??'http://127.0.0.1:4312',launchOptions:{executablePath:process.env.CHROMIUM_PATH,args:['--disable-features=LocalNetworkAccessChecks']}});
test('StrictMode editor unmount and remount create a working React tree and fresh workbench',async({page})=>{
 const bundle=await build({entryPoints:['tests/harness/editor-lifecycle.tsx'],bundle:true,write:false,outdir:'.local/lifecycle-harness',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))!.text;
 await page.route('**/lifecycle.js',route=>route.fulfill({contentType:'text/javascript',body:js}));await page.route('**/lifecycle.css',route=>route.fulfill({contentType:'text/css',body:css}));
 await page.route('**/lifecycle.html*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/lifecycle.css"></head><body><div id="root"></div><script src="/lifecycle.js"></script></body></html>'}));
 const ids=[randomUUID(),randomUUID()],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const id of ids)expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:id,width:1600,height:900,slides:[{id:'page',name:'Page',sourcePath:'page.html',html:'<html><body><p data-notale-id="text">Hello</p></body></html>'}]}})).ok()).toBe(true);
 await page.goto('/lifecycle.html?document='+ids[0]);await page.evaluate(()=>(window as any).EditorLifecycle.mount());
 await page.waitForFunction(id=>(window as any).NotaleWorkbench?.getSnapshot()?.document.id===id,ids[0]);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(id=>{(window as any).EditorLifecycle.unmount();history.replaceState(null,'','?document='+id);(window as any).EditorLifecycle.mount();},ids[1]);
 await page.waitForFunction(id=>(window as any).NotaleWorkbench?.getSnapshot()?.document.id===id,ids[1]);await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
 await page.evaluate(()=>(window as any).NotaleWorkbench.select('text'));await expect(page.locator('#property-panel')).toBeVisible();await expect(page.locator('#overview')).toHaveCount(0);
 await page.evaluate(()=>(window as any).NotaleWorkbench.commands([{type:'deck.update',title:'Remounted'}]));await page.evaluate(()=>(window as any).NotaleWorkbench.whenSynchronized());expect((await page.request.get('/api/documents/'+ids[1]).then(r=>r.json())).document.title).toBe('Remounted');
 await page.evaluate(()=>(window as any).EditorLifecycle.unmount());await expect(page.locator('#root')).toBeEmpty();await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).held?.filter(lock=>lock.name?.startsWith('notale-tab:')).length)).toBe(0);expect(errors).toEqual([]);
});
