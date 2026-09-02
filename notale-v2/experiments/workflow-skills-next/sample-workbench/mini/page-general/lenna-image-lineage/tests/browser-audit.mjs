import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL="http://127.0.0.1:41031/sample-workbench/mini/page-general/lenna-image-lineage/candidate/pages/";
const SHOTS="experiments/workflow-skills-next/sample-workbench/mini/page-general/lenna-image-lineage/shots";
const browser=await chromium.launch({headless:true});
const results=[];

async function open(options={}){
  const context=await browser.newContext({
    viewport:options.viewport||{width:1600,height:900},
    reducedMotion:options.reduced?"reduce":"no-preference"
  });
  if(options.noGsap)await context.route("**/gsap.min.js",route=>route.fulfill({body:"",contentType:"text/javascript"}));
  if(options.badAsset)await context.route("**/screenshots/pic3.jpg",route=>route.abort());
  if(options.lifecycle){
    await context.route("**/story.js",async route=>{
      const response=await route.fetch();
      const probe=`window.__lineageProbe={removed:0,killed:0};
const remove=EventTarget.prototype.removeEventListener;
EventTarget.prototype.removeEventListener=function(...args){__lineageProbe.removed++;return remove.apply(this,args)};
const kill=gsap.core.Timeline.prototype.kill;
gsap.core.Timeline.prototype.kill=function(...args){__lineageProbe.killed++;return kill.apply(this,args)};\n`;
      await route.fulfill({response,body:probe+await response.text()});
    });
  }
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>message.type()==="error"&&errors.push(message.text()));
  await page.goto(URL,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__NOTALE_READY__===true);
  return {context,page,errors};
}

async function state(page,index){
  await page.evaluate(index=>MiniLineage.goTo(index,true),index);
  return page.evaluate(()=>({
    name:document.querySelector("#stage").dataset.state,
    seeds:document.querySelectorAll(".seed").length,
    echoes:document.querySelectorAll(".echo").length,
    contexts:document.querySelectorAll(".context").length,
    identities:new Set([...document.querySelectorAll(".network-image")].map(node=>node.dataset.identity)).size,
    visibleEchoes:[...document.querySelectorAll(".echo")].filter(node=>+getComputedStyle(node).opacity>.9).length,
    visibleContexts:[...document.querySelectorAll(".context")].filter(node=>+getComputedStyle(node).opacity>.9).length,
    portrait:+getComputedStyle(document.querySelector("#portrait")).opacity,
    progress:document.querySelector("#progress").textContent
  }));
}

const normal=await open();
const endpoints=[];
for(let index=0;index<4;index++)endpoints.push(await state(normal.page,index));
assert.deepEqual(endpoints.map(value=>value.name),["five","field","contexts","portrait"]);
assert.deepEqual(endpoints.map(value=>value.progress),["1 / 4","2 / 4","3 / 4","4 / 4"]);
for(const value of endpoints)assert.deepEqual([value.seeds,value.echoes,value.contexts,value.identities],[5,20,5,30]);
assert.equal(endpoints[1].visibleEchoes,20);
assert.equal(endpoints[2].visibleContexts,5);
assert.equal(endpoints[3].portrait,1);
results.push("four endpoints retain 5 seeds, 20 echoes, 5 contexts, 30 stable identities, and the pixel portrait");

async function opacity(page,selector){return page.locator(selector).evaluate(node=>+getComputedStyle(node).opacity)}
await state(normal.page,0);await normal.page.locator("#next").click();await normal.page.waitForTimeout(650);
assert.ok(await opacity(normal.page,".echo:nth-of-type(9)")>0&&await opacity(normal.page,".echo:nth-of-type(9)")<1);
await normal.page.waitForTimeout(900);
await normal.page.locator("#next").click();await normal.page.waitForTimeout(700);
assert.ok(await opacity(normal.page,".context:first-child")>0&&await opacity(normal.page,".context:first-child")<1);
await normal.page.waitForTimeout(850);
await normal.page.locator("#next").click();await normal.page.waitForTimeout(700);
assert.ok(await opacity(normal.page,"#portrait")>0&&await opacity(normal.page,"#portrait")<1);
await normal.page.waitForTimeout(850);
results.push("all three segment midpoints preserve continuous identity rather than swapping scenes");

await state(normal.page,1);await normal.page.keyboard.press("ArrowRight");await normal.page.waitForTimeout(350);
await normal.page.keyboard.press("ArrowLeft");await normal.page.waitForTimeout(1500);
assert.equal(await normal.page.locator("#stage").getAttribute("data-state"),"field");
async function resetSnapshot(){
  await normal.page.locator("#reset").click();await normal.page.waitForTimeout(1500);
  return normal.page.evaluate(()=>[document.querySelector("#stage").dataset.state,
    getComputedStyle(document.querySelector(".seed")).transform,
    getComputedStyle(document.querySelector(".echo")).transform,
    document.querySelector("#progress").textContent]);
}
assert.deepEqual(await resetSnapshot(),await resetSnapshot());
assert.deepEqual(normal.errors,[]);
results.push("button and arrow navigation reverse cleanly; repeated Reset is deterministic");

for(const [width,height] of [[1600,900],[1280,720]]){
  const run=await open({viewport:{width,height}});await state(run.page,2);
  const box=await run.page.locator("#stage").boundingBox();
  assert.ok(Math.abs(box.width-width)<.1&&Math.abs(box.height-height)<.1);
  assert.deepEqual(run.errors,[]);await run.context.close();
}
results.push("1600x900 and 1280x720 retain the full context composition");
await normal.context.close();

const reduced=await open({reduced:true});
await reduced.page.keyboard.press("ArrowRight");
assert.equal(await reduced.page.locator("#stage").getAttribute("data-state"),"field");
await reduced.page.waitForFunction(()=>+getComputedStyle(document.querySelectorAll(".echo")[19]).opacity===1);
assert.equal(await reduced.page.locator(".echo").nth(19).evaluate(node=>+getComputedStyle(node).opacity),1);
await reduced.page.locator("#next").click();
assert.equal(await reduced.page.locator("#stage").getAttribute("data-state"),"contexts");
await reduced.page.waitForFunction(()=>+getComputedStyle(document.querySelector(".context")).opacity===1);
assert.equal(await reduced.page.locator(".context").count(),5);
await reduced.page.screenshot({path:`${SHOTS}/reduced-contexts.png`});
assert.deepEqual(reduced.errors,[]);await reduced.context.close();
results.push("reduced motion seeks directly to complete representative states");

for(const option of [{noGsap:true},{badAsset:true}]){
  const run=await open(option);
  assert.ok(await run.page.locator("#stage").evaluate(node=>node.classList.contains("has-fallback")));
  assert.equal(await run.page.locator(".seed:visible").count(),5);
  assert.equal(await opacity(run.page,"#portrait"),1);
  assert.match(await run.page.locator("#caption p:nth-child(4)").innerText(),/20 echoes/);
  assert.ok(run.errors.every(message=>message.includes("Failed to load resource")));
  await run.context.close();
}
results.push("missing GSAP and a failed media asset retain the five-to-portrait relation");

const lifecycle=await open({lifecycle:true});
await lifecycle.page.evaluate(()=>dispatchEvent(new PageTransitionEvent("pagehide")));
assert.equal(await lifecycle.page.evaluate(()=>__NOTALE_READY__),false);
assert.ok(await lifecycle.page.evaluate(()=>__lineageProbe.killed>=1));
assert.ok(await lifecycle.page.evaluate(()=>__lineageProbe.removed>=7));
const before=await lifecycle.page.locator("#stage").getAttribute("data-state");
await lifecycle.page.keyboard.press("ArrowRight");await lifecycle.page.locator("#next").click();
assert.equal(await lifecycle.page.locator("#stage").getAttribute("data-state"),before);
await lifecycle.page.reload({waitUntil:"networkidle"});
await lifecycle.page.waitForFunction(()=>window.__NOTALE_READY__===true);
assert.equal(await lifecycle.page.locator(".network-image").count(),30);
assert.deepEqual(lifecycle.errors,[]);await lifecycle.context.close();
results.push("pagehide kills the timeline and listeners; reload creates one clean 30-node scene");

console.log(JSON.stringify({passed:true,results},null,2));
await browser.close();
