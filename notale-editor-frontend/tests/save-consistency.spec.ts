import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test.use({baseURL:process.env.NEXT_TEST_URL??'http://127.0.0.1:4312'});
async function ready(page:Page){await page.waitForFunction(()=>(window as any).NotaleWorkbench?.getSnapshot());await page.evaluate(()=>(window as any).NotaleWorkbench.whenReady());}
async function drag(page:Page){
  const r=await page.frameLocator('#canvas').locator('h1').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,v:innerWidth};});
  const f=(await page.locator('#canvas').boundingBox())!,scale=f.width/r.v;
  await page.mouse.move(f.x+(r.x+r.w/2)*scale,f.y+(r.y+r.h/2)*scale);await page.mouse.down();await page.mouse.move(f.x+(r.x+r.w/2)*scale+35,f.y+(r.y+r.h/2)*scale+20,{steps:4});await page.mouse.up();
}
test('lost acknowledgement and later gestures survive reload and retry exactly once',async({page})=>{
  const id=randomUUID();
  expect((await page.request.post('/api/documents',{data:{schemaVersion:1,id,title:'保存恢复 · 独立验证',width:1600,height:900,slides:[{id:'first',name:'验证',sourcePath:'first.html',html:'<!doctype html><html><body style="margin:0"><main data-notale-id="stage" style="width:1600px;height:900px"><h1 data-notale-id="heading" style="position:absolute;left:180px;top:180px;width:500px;height:80px;margin:0">连续编辑</h1></main></body></html>'}]}})).status()).toBe(201);
  await page.goto('/?document='+id,{waitUntil:'domcontentloaded'});await ready(page);
  let offline=true,committed=false;
  await page.route('**/api/documents/*/sync/v2',async route=>{
    if(!offline)return route.continue();
    if(!committed){const response=await route.fetch();expect(response.status()).toBe(200);committed=true;}
    await route.abort('failed');
  });
  await drag(page);await expect.poll(()=>committed).toBe(true);
  await drag(page);
  const position=()=>page.frameLocator('#canvas').locator('h1').evaluate(e=>e.getBoundingClientRect().x);
  await expect.poll(position).toBeGreaterThan(240);
  const final=await position();
  page.on('dialog',dialog=>void dialog.accept());
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  await expect.poll(position).toBeCloseTo(final,0);
  offline=false;
  await expect(page.locator('#retry-save')).toBeVisible();await page.locator('#retry-save').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).NotaleWorkbench.getSyncState().pending)).toBe(0);
  const saved=await page.request.get('/api/documents/'+id).then(r=>r.json());
  expect(saved.version).toBe(3); // two gestures, despite the first committed response being lost
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  await expect.poll(position).toBeCloseTo(final,0);
});
