import {test,expect,type Page,type Locator} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const original='f5d596d1-0584-4de4-ada6-ecf918147cd4';
const ready=(p:Page)=>p.evaluate(()=>(window as any).NotaleWorkbench.whenReady());
const snap=(p:Page)=>p.evaluate(()=>(window as any).NotaleWorkbench.getSnapshot());
async function setup(p:Page){const baseline=await(await p.request.get('/api/documents/'+original)).json();const doc=structuredClone(baseline.document);doc.id=randomUUID();doc.title='Geometry session acceptance';doc.slides=[doc.slides[6]];expect((await p.request.post('/api/documents',{data:doc})).status()).toBe(201);await p.goto('/?document='+doc.id);await ready(p);return {doc,baseline};}
async function screenBox(p:Page,el:Locator){
  const r=await el.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth};});
  const f=await p.locator('#canvas').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};});const scale=f.width/r.viewport;
  return {x:f.x+r.x*scale,y:f.y+r.y*scale,width:r.width*scale,height:r.height*scale};
}
async function drag(p:Page,dx:number,dy:number){const r=await screenBox(p,p.frameLocator('#canvas').locator('h1'));await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:5});await p.mouse.up();}
test('geometry gestures remain visible and editable while saving; camera does not reload content',async({page})=>{
  const {doc,baseline}=await setup(page);const faults:string[]=[];page.on('pageerror',e=>faults.push(e.message));
  const frame=page.frameLocator('#canvas'),heading=frame.locator('h1');
  const runtime=await heading.evaluate(()=>({id:(window as any).__NOTALE__.channel,width:innerWidth,height:innerHeight}));
  await heading.evaluate(()=>{(window as any).retainedRuntimeMarker=123;});
  let release!:()=>void;const held=new Promise<void>(r=>release=r);let requests=0;
  await page.route('**/api/documents/*/commits',async r=>{requests++;if(requests===1)await held;await r.continue();});
  const initial=(await screenBox(page,heading));
  await drag(page,35,25);
  await expect.poll(()=>requests).toBe(1);
  const first=(await screenBox(page,heading));expect(first.x).toBeGreaterThan(initial.x+25);
  await drag(page,30,20);
  const second=(await screenBox(page,heading));expect(second.x).toBeGreaterThan(first.x+20);
  expect((await snap(page)).version).toBe(1);
  await page.locator('#undo').click();await expect.poll(async()=>Math.round((await screenBox(page,heading)).x)).toBe(Math.round(first.x));
  await page.locator('#redo').click();await expect.poll(async()=>Math.round((await screenBox(page,heading)).x)).toBe(Math.round(second.x));
  release();await expect.poll(async()=>(await snap(page)).version).toBe(3);
  expect((await screenBox(page,heading)).x).toBeCloseTo(second.x,0);
  expect(await heading.evaluate(()=>(window as any).retainedRuntimeMarker)).toBe(123);
  await page.locator('#canvas-zoom').selectOption('1');await page.locator('#zoom-in').click();
  expect(await heading.evaluate(()=>({id:(window as any).__NOTALE__.channel,width:innerWidth,height:innerHeight}))).toEqual(runtime);
  expect(await heading.evaluate(()=>(window as any).retainedRuntimeMarker)).toBe(123);
  const zoomBefore=await page.locator('#canvas-zoom').inputValue();
  await heading.evaluate(el=>el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-80,clientX:500,clientY:300})));
  await expect.poll(()=>page.locator('#canvas-zoom').inputValue()).not.toBe(zoomBefore);
  expect(await heading.evaluate(()=>({id:(window as any).__NOTALE__.channel,width:innerWidth,height:innerHeight}))).toEqual(runtime);
  await page.locator('#canvas-zoom').selectOption('fit');
  const id=await heading.getAttribute('data-notale-id');await page.evaluate(id=>(window as any).NotaleWorkbench.select(id),id);
  const handle=frame.locator('.moveable-control[data-direction="sw"]').first();await expect(handle).toBeVisible();
  const bounds=(await screenBox(page,heading)),h=(await screenBox(page,handle));
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2-45,h.y+h.height/2+20,{steps:4});await page.mouse.up();
  await expect.poll(async()=>(await snap(page)).version).toBe(4);
  expect((await screenBox(page,heading)).width).toBeGreaterThan(bounds.width+20);
  expect(await heading.evaluate(()=>(window as any).retainedRuntimeMarker)).toBe(123);
  const resizedWidth=(await screenBox(page,heading)).width;
  await page.reload();await ready(page);expect((await snap(page)).version).toBe(4);
  expect((await screenBox(page,heading)).width).toBeCloseTo(resizedWidth,0);
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap(page)).version).toBe(5);await ready(page);
  expect(faults).toEqual([]);expect(await(await page.request.get('/api/documents/'+original)).json()).toEqual(baseline);
});
test('geometry outbox survives failed save and reload without losing later gestures',async({page})=>{
  await setup(page);await page.route('**/api/documents/*/commits',r=>r.fulfill({status:503,body:'unavailable'}));
  await drag(page,30,20);await expect(page.locator('#retry-save')).toBeVisible();
  await drag(page,35,20);const final=await page.frameLocator('#canvas').locator('h1').evaluate(e=>e.getAttribute('style'));
  await page.reload();await ready(page);
  await expect.poll(()=>page.frameLocator('#canvas').locator('h1').getAttribute('style')).toBe(final);
  await page.unroute('**/api/documents/*/commits');await page.locator('#retry-save').click();
  await expect.poll(async()=>(await snap(page)).version).toBe(3);
  await expect(page.locator('#retry-save')).toBeHidden();
  await page.reload();await ready(page);
  const before=await screenBox(page,page.frameLocator('#canvas').locator('h1'));
  await page.keyboard.press('Control+z');await expect.poll(async()=>(await snap(page)).version).toBe(4);await ready(page);
  expect((await screenBox(page,page.frameLocator('#canvas').locator('h1')))!.x).toBeLessThan(before!.x-20);
});

test('geometry conflict preserves local gestures and never overwrites the newer head',async({page})=>{
  const {doc}=await setup(page);
  const response=await page.request.post('/api/documents/'+doc.id+'/commits',{data:{baseVersion:1,mutationId:randomUUID(),commands:[{type:'deck.update',title:'Changed in another window'}]}});
  expect(response.status()).toBe(200);const head=await response.json();
  await drag(page,30,20);await expect(page.locator('#save-status')).toContainText('版本冲突');
  await drag(page,30,20);const heading=page.frameLocator('#canvas').locator('h1'),local=await heading.getAttribute('style');
  await page.reload();await ready(page);expect(await heading.getAttribute('style')).toBe(local);
  await page.locator('#retry-save').click();await expect(page.locator('#save-status')).toContainText('版本冲突');
  expect(await(await page.request.get('/api/documents/'+doc.id)).json()).toEqual(head);
  expect(await heading.getAttribute('style')).toBe(local);
});
