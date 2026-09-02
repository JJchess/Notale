import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL="http://127.0.0.1:41031/sample-workbench/mini/page-general/escapement/candidate/pages/";
const browser=await chromium.launch({headless:true});
const results=[];

async function open(options={}){
  const context=await browser.newContext({
    viewport:options.viewport||{width:1600,height:900},
    reducedMotion:options.reduced?"reduce":"no-preference"
  });
  if(options.noThree)await context.route("**/three.min.js",route=>route.fulfill({body:"",contentType:"text/javascript"}));
  if(options.lifecycle)await context.route("**/mechanism.js",async route=>{
    const response=await route.fetch();
    const probe=`window.__escapeProbe={dispose:0,loss:0};
const Renderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
 const instance=new Renderer(...args),dispose=instance.dispose.bind(instance),lose=instance.forceContextLoss.bind(instance);
 instance.dispose=(...values)=>{__escapeProbe.dispose++;return dispose(...values)};
 instance.forceContextLoss=(...values)=>{__escapeProbe.loss++;return lose(...values)};
 return instance;
};
THREE.WebGLRenderer.prototype=Renderer.prototype;\n`;
    await route.fulfill({response,body:probe+await response.text()});
  });
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>message.type()==="error"&&errors.push(message.text()));
  await page.goto(URL,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__NOTALE_READY__===true);
  return{context,page,errors};
}

const normal=await open();
const endpoints=[];
for(let index=0;index<4;index++){
  await normal.page.evaluate(index=>MiniEscapement.goTo(index,true),index);
  endpoints.push(await normal.page.evaluate(()=>({state:MiniEscapement.inspect(),
    name:stateName.textContent,copy:stateCopy.textContent,reading:reading.textContent})));
}
assert.deepEqual(endpoints.map(item=>item.state.id),["lock","release","step","relock"]);
assert.deepEqual(endpoints.map(item=>item.name),["锁住","放开","走一齿","再锁住"]);
assert.deepEqual(endpoints.map(item=>item.state.wheel),[0,.032,.36,Math.PI*2/15]);
assert.deepEqual(endpoints[0].state.parts,{fork:1,pallets:2,balance:1,hairspring:1});
assert.equal(endpoints[0].state.teeth,15);
assert.match(endpoints[3].copy,/2π\/15/);
assert.equal(endpoints[3].reading,"停在 1 齿");
results.push("four endpoints retain the 15-tooth wheel, fork, two pallets, balance, hairspring, and exact one-tooth relock");

await normal.page.evaluate(()=>{MiniEscapement.goTo(1,true);MiniEscapement.goTo(2)});
await normal.page.waitForTimeout(350);
const midpoint=await normal.page.evaluate(()=>MiniEscapement.inspect());
assert.ok(midpoint.progress>1&&midpoint.progress<2);
assert.ok(midpoint.wheel>.032&&midpoint.wheel<.36);
assert.ok(midpoint.fork>-.014&&midpoint.fork<.061);
results.push("release-to-step midpoint continuously interpolates wheel and fork rather than swapping scenes");

for(let cycle=0;cycle<2;cycle++){
  await normal.page.evaluate(()=>MiniEscapement.reset());
  assert.equal((await normal.page.evaluate(()=>MiniEscapement.inspect())).id,"lock");
  await normal.page.evaluate(()=>MiniEscapement.play());
  await normal.page.waitForTimeout(2900);
  const end=await normal.page.evaluate(()=>MiniEscapement.inspect());
  assert.equal(end.id,"relock");
  assert.equal(end.playing,false);
}
assert.deepEqual(normal.errors,[]);
results.push("Play and Reset repeat twice and settle on the same lock-to-relock cycle");

await normal.page.evaluate(()=>MiniEscapement.goTo(2,true));
const beforeResize=await normal.page.evaluate(()=>({state:MiniEscapement.inspect(),canvas:[mechanism.width,mechanism.height]}));
await normal.page.setViewportSize({width:1280,height:720});
await normal.page.waitForTimeout(150);
const afterResize=await normal.page.evaluate(()=>({
  state:MiniEscapement.inspect(),stage:[stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],
  canvas:[mechanism.width,mechanism.height],expected:[Math.round(view.clientWidth*Deck.ratio()),Math.round(view.clientHeight*Deck.ratio())]
}));
assert.deepEqual(afterResize.stage,[1280,720]);
assert.deepEqual(afterResize.canvas,afterResize.expected);
assert.equal(afterResize.state.id,beforeResize.state.id);
assert.deepEqual(normal.errors,[]);
await normal.context.close();

for(const [width,height] of [[1600,900],[1280,720]]){
  const run=await open({viewport:{width,height}});
  await run.page.evaluate(()=>MiniEscapement.goTo(3,true));
  const box=await run.page.locator("#stage").boundingBox();
  assert.ok(Math.abs(box.width-width)<.1&&Math.abs(box.height-height)<.1);
  assert.deepEqual(await run.page.evaluate(()=>[
    document.documentElement.scrollWidth,document.documentElement.scrollHeight
  ]),[width,height]);
  assert.equal((await run.page.evaluate(()=>MiniEscapement.inspect())).id,"relock");
  assert.deepEqual(run.errors,[]);
  await run.context.close();
}
results.push("1600x900, 1280x720, and same-page 1600-to-1280 resize preserve state and DPR sizing");

const reduced=await open({reduced:true});
assert.deepEqual(await reduced.page.evaluate(()=>{
  const state=MiniEscapement.inspect();return[state.id,state.progress,state.playing]
}),["relock",3,false]);
await reduced.page.locator("#play").click();
assert.deepEqual(await reduced.page.evaluate(()=>[MiniEscapement.inspect().id,MiniEscapement.inspect().playing]),["relock",false]);
assert.deepEqual(reduced.errors,[]);
await reduced.context.close();
results.push("reduced motion opens and settles immediately on the complete one-tooth relock evidence");

const fallback=await open({noThree:true});
const fallbackState=await fallback.page.evaluate(()=>({state:MiniEscapement.inspect(),
  svg:getComputedStyle(document.querySelector("#fallback")).display,
  nav:document.querySelector("nav").hidden,pathLength:+document.querySelector(".wheel circle").getAttribute("pathLength"),
  dash:document.querySelector(".wheel circle").getAttribute("stroke-dasharray"),copy:stateCopy.textContent}));
assert.deepEqual([fallbackState.state.id,fallbackState.state.renderer],["relock","fallback"]);
assert.deepEqual([fallbackState.svg,fallbackState.nav,fallbackState.pathLength,fallbackState.dash],["block",true,30,"1 1"]);
assert.match(fallbackState.copy,/2π\/15/);
assert.equal(await fallback.page.locator(".pallet").count(),1);
assert.equal(await fallback.page.locator(".balance").count(),1);
assert.deepEqual(fallback.errors,[]);
await fallback.context.close();
results.push("missing Three renders a truthful terminal SVG with fifteen equal tooth marks and controls removed");

const lifecycle=await open({lifecycle:true});
await lifecycle.page.evaluate(()=>MiniEscapement.play());
await lifecycle.page.waitForTimeout(100);
await lifecycle.page.evaluate(()=>MiniEscapement.dispose());
const disposed=await lifecycle.page.evaluate(()=>({ready:__NOTALE_READY__,state:MiniEscapement.inspect(),probe:__escapeProbe}));
assert.deepEqual([disposed.ready,disposed.state.disposed,disposed.state.playing],[false,true,false]);
assert.ok(disposed.probe.dispose>=1&&disposed.probe.loss>=1);
const value=disposed.state.progress;
await lifecycle.page.locator("#reset").click();
await lifecycle.page.locator("[data-index='3']").click();
assert.equal(await lifecycle.page.evaluate(()=>MiniEscapement.inspect().progress),value);
await lifecycle.page.reload({waitUntil:"networkidle"});
await lifecycle.page.waitForFunction(()=>window.__NOTALE_READY__===true);
assert.equal(await lifecycle.page.locator("canvas").count(),1);
assert.deepEqual((await lifecycle.page.evaluate(()=>MiniEscapement.inspect())).parts,
  {fork:1,pallets:2,balance:1,hairspring:1});
assert.deepEqual(lifecycle.errors,[]);
await lifecycle.context.close();
results.push("dispose aborts listeners and RAF, releases Three and WebGL, and reload builds one clean assembly");

console.log(JSON.stringify({passed:true,results},null,2));
await browser.close();
