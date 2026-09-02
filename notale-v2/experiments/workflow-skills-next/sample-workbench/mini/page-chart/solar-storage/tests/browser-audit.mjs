import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL="http://127.0.0.1:41031/sample-workbench/mini/page-chart/solar-storage/candidate/pages/";
const SHOTS="experiments/workflow-skills-next/sample-workbench/mini/page-chart/solar-storage/shots";
const browser=await chromium.launch({headless:true});
const results=[];

async function open(options={}){
 const context=await browser.newContext({viewport:options.viewport||{width:1600,height:900},reducedMotion:options.reduced?"reduce":"no-preference"});
 if(options.noEcharts)await context.route("**/echarts.min.js",route=>route.fulfill({body:"",contentType:"text/javascript"}));
 if(options.rendererFailure||options.lifecycle){
  await context.route("**/solar-storage.js",async route=>{
   const response=await route.fetch();
   let hook="";
   if(options.rendererFailure)hook='echarts.init=function(){throw Error("forced renderer failure")};\n';
   if(options.lifecycle)hook=`window.__solarProbe={cleared:0,cancelled:0,disconnected:0,disposed:0,removed:0};
const clear=window.clearTimeout;window.clearTimeout=function(...args){__solarProbe.cleared++;return clear.apply(this,args)};
const cancel=window.cancelAnimationFrame;window.cancelAnimationFrame=function(...args){__solarProbe.cancelled++;return cancel.apply(this,args)};
const NativeObserver=window.ResizeObserver;window.ResizeObserver=class extends NativeObserver{disconnect(){__solarProbe.disconnected++;return super.disconnect()}};
const init=echarts.init;echarts.init=function(...args){const instance=init.apply(this,args);const dispose=instance.dispose.bind(instance);instance.dispose=function(){__solarProbe.disposed++;return dispose()};return instance};
const remove=EventTarget.prototype.removeEventListener;EventTarget.prototype.removeEventListener=function(...args){__solarProbe.removed++;return remove.apply(this,args)};\n`;
   await route.fulfill({response,body:hook+await response.text()});
  });
 }
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 page.on("console",message=>message.type()==="error"&&errors.push(message.text()));
 await page.goto(URL,{waitUntil:"networkidle"});await page.waitForFunction(()=>window.__NOTALE_READY__===true);
 return{context,page,errors};
}

const normal=await open();
const evidence=await normal.page.evaluate(()=>{
 const option=echarts.getInstanceByDom(document.querySelector("#chart")).getOption();
 const records=option.dataset[0].source;
 const at14=records.find(record=>record[1]===14),at20=records.find(record=>record[1]===20);
 const solarPeak=records.reduce((best,record)=>record[3]>best[3]?record:best);
 const demandPeak=records.reduce((best,record)=>record[2]>best[2]?record:best);
 return{records,at14,at20,solarPeak,demandPeak,y:[option.yAxis[0].min,option.yAxis[0].max],
  series:option.series.map(series=>[series.id,series.encode.x,series.encode.y])};
});
assert.equal(evidence.records.length,13);
assert.deepEqual(evidence.at14,["h14",14,64,88]);assert.deepEqual(evidence.at20,["h20",20,78,25]);
assert.equal(evidence.at14[3]-evidence.at14[2],24);assert.equal(evidence.at20[2]-evidence.at20[3],53);
assert.equal(evidence.demandPeak[1]-evidence.solarPeak[1],6);assert.deepEqual(evidence.y,[0,100]);
assert.deepEqual(evidence.series,[["solar","hour","solar"],["demand","hour","demand"]]);
assert.equal(await normal.page.locator("#chart svg").count(),1);
const geometry=await normal.page.evaluate(()=>({
 surplus:document.querySelector("#surplus").points.length,gap:document.querySelector("#gap").points.length,
 route:document.querySelector("#transferFlow").getAttribute("d"),viewBox:document.querySelector("#overlay").getAttribute("viewBox")
}));
assert.deepEqual([geometry.surplus,geometry.gap],[8,9]);assert.match(geometry.route,/^M.+ C/);
assert.match(await normal.page.locator("#tag14").innerText(),/\+24 GW.*14:00/s);
assert.match(await normal.page.locator("#tag20").innerText(),/−53 GW.*20:00/s);
results.push("13 stable records drive two series on one 0-100 GW domain and computed SVG surplus/gap/transfer geometry");

assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"overview");
await normal.page.locator("#replay").click();await normal.page.waitForTimeout(500);
assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"transfer");
const midpoint=await normal.page.locator("#transferTag").evaluate(node=>+getComputedStyle(node).opacity);
assert.ok(midpoint>0&&midpoint<1);
assert.equal(await normal.page.locator("#transferFlow").evaluate(node=>getComputedStyle(node).animationName),"flow");
await normal.page.screenshot({path:`${SHOTS}/transfer-audit.png`});
await normal.page.waitForTimeout(1600);
assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"settled");
assert.equal(await normal.page.locator("#transferTag").evaluate(node=>+getComputedStyle(node).opacity),1);
results.push("Replay passes overview through a visible transfer midpoint and settles with the same marks and scales");

await normal.page.locator("#replay").click();await normal.page.waitForTimeout(700);
assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"transfer");
await normal.page.locator("#reset").click();await normal.page.waitForTimeout(1500);
assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"overview");
async function resetSnapshot(){
 await normal.page.locator("#reset").click();
 return normal.page.evaluate(()=>[stage.dataset.state,surplus.getAttribute("points"),gap.getAttribute("points"),transferFlow.getAttribute("d")]);
}
assert.deepEqual(await resetSnapshot(),await resetSnapshot());assert.deepEqual(normal.errors,[]);
results.push("Reset interrupts replay and repeated Reset restores identical data-bound geometry");
await normal.context.close();

for(const [width,height] of [[1600,900],[1280,720]]){
 const run=await open({viewport:{width,height}});const box=await run.page.locator("#stage").boundingBox();
 assert.ok(Math.abs(box.width-width)<.1&&Math.abs(box.height-height)<.1);
 const sizes=await run.page.evaluate(()=>({plot:[plot.clientWidth,plot.clientHeight],view:[overlay.viewBox.baseVal.width,overlay.viewBox.baseVal.height],
  tagRight:tag20.getBoundingClientRect().right,plotRight:plot.getBoundingClientRect().right}));
 assert.deepEqual(sizes.view,sizes.plot);assert.ok(sizes.tagRight<=sizes.plotRight);
 assert.deepEqual(run.errors,[]);await run.context.close();
}
results.push("1600x900 and 1280x720 keep overlay viewBox, annotations, and ECharts host aligned");

const reduced=await open({reduced:true});
assert.equal(await reduced.page.locator("#stage").getAttribute("data-state"),"settled");
assert.equal(await reduced.page.locator("#transferFlow").evaluate(node=>getComputedStyle(node).animationName),"none");
await reduced.page.locator("#replay").click();assert.equal(await reduced.page.locator("#stage").getAttribute("data-state"),"settled");
assert.deepEqual(reduced.errors,[]);await reduced.context.close();
results.push("reduced motion opens and replays directly at the complete settled evidence state");

for(const options of [{noEcharts:true},{rendererFailure:true}]){
 const run=await open(options);
 assert.equal(await run.page.locator("#fallback").isVisible(),true);
 assert.match(await run.page.locator("#fallback").innerText(),/88 − 64 = 24 GW[\s\S]*6 小时[\s\S]*78 − 25 = 53 GW/);
 assert.equal(await run.page.locator("#chart:visible").count(),0);
 assert.ok(run.errors.every(message=>message.includes("Failed to load resource")));
 await run.context.close();
}
results.push("missing ECharts and forced renderer failure retain the 24 GW / 6 h / 53 GW relation");

const lifecycle=await open({lifecycle:true});
await lifecycle.page.locator("#replay").click();await lifecycle.page.waitForTimeout(450);
await lifecycle.page.evaluate(()=>dispatchEvent(new PageTransitionEvent("pagehide")));
const probe=await lifecycle.page.evaluate(()=>__solarProbe);
assert.ok(probe.cleared>=2&&probe.cancelled>=1&&probe.disconnected>=1&&probe.disposed>=1&&probe.removed>=4);
assert.equal(await lifecycle.page.evaluate(()=>__NOTALE_READY__),false);
const before=await lifecycle.page.locator("#stage").getAttribute("data-state");
await lifecycle.page.locator("#reset").click();assert.equal(await lifecycle.page.locator("#stage").getAttribute("data-state"),before);
await lifecycle.page.reload({waitUntil:"networkidle"});await lifecycle.page.waitForFunction(()=>__NOTALE_READY__===true);
assert.equal(await lifecycle.page.locator("#chart svg").count(),1);assert.deepEqual(lifecycle.errors,[]);
await lifecycle.context.close();
results.push("pagehide clears timers/RAF, disconnects observer/listeners, disposes chart, and reload restores one renderer");

console.log(JSON.stringify({passed:true,results},null,2));await browser.close();
