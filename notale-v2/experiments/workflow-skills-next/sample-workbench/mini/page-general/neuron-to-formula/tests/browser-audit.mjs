import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const URL="http://127.0.0.1:41031/sample-workbench/mini/page-general/neuron-to-formula/candidate/pages/";
const browser=await chromium.launch({headless:true});
const results=[];

async function open(options={}){
  const context=await browser.newContext({
    viewport:options.viewport||{width:1600,height:900},
    reducedMotion:options.reduced?"reduce":"no-preference"
  });
  if(options.noCanvas){
    await context.addInitScript(()=>HTMLCanvasElement.prototype.getContext=function(){return null});
  }
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>message.type()==="error"&&errors.push(message.text()));
  await page.goto(URL,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__NOTALE_READY__===true);
  return{context,page,errors};
}

const normal=await open();
const expectedValues=[0,.38,.75,1];
const endpoints=[];
for(let index=0;index<4;index++){
  await normal.page.evaluate(index=>MiniNeuron.goTo(index,true),index);
  endpoints.push(await normal.page.evaluate(()=>({
    model:MiniNeuron.inspect(),name:stateName.textContent,progress:progress.textContent,
    formula:formula.textContent.replace(/\s/g,""),image:visual.toDataURL()
  })));
}
assert.deepEqual(endpoints.map(item=>item.name),["生物结构","加权输入","求和、偏置与激活","输出"]);
assert.deepEqual(endpoints.map(item=>item.progress),["1 / 4","2 / 4","3 / 4","4 / 4"]);
assert.deepEqual(endpoints.map(item=>item.model.value),expectedValues);
assert.deepEqual(endpoints[0].model.ids,["x1:w1","x2:w2","x3:w3","x4:w4","x5:w5"]);
assert.equal(endpoints[3].formula,"a=σ(Σxᵢwᵢ+b)");
assert.equal(new Set(endpoints.map(item=>item.image)).size,4);
results.push("four endpoints preserve stable x1:w1 through x5:w5 identities and the final formula");

await normal.page.evaluate(()=>{MiniNeuron.goTo(1,true);MiniNeuron.goTo(2)});
await normal.page.waitForTimeout(450);
const midpoint=await normal.page.evaluate(()=>MiniNeuron.inspect());
assert.ok(midpoint.value>.38&&midpoint.value<.75&&midpoint.animating);
await normal.page.waitForTimeout(600);
assert.equal((await normal.page.evaluate(()=>MiniNeuron.inspect())).value,.75);
results.push("the weighted-input to activation transition remains a continuous geometry morph");

async function resetSnapshot(){
  await normal.page.locator("#reset").click();
  await normal.page.waitForTimeout(1000);
  return normal.page.evaluate(()=>({model:MiniNeuron.inspect(),image:visual.toDataURL()}));
}
const resetOne=await resetSnapshot(),resetTwo=await resetSnapshot();
assert.deepEqual(resetOne,resetTwo);
assert.deepEqual(resetOne.model.ends,endpoints[0].model.ends);
assert.equal(resetOne.model.seed,20250815);
assert.deepEqual(normal.errors,[]);
results.push("seed 20250815 and repeated Reset reproduce identical neuron geometry");

for(const [width,height] of [[1600,900],[1280,720]]){
  const run=await open({viewport:{width,height}});
  await run.page.evaluate(()=>MiniNeuron.goTo(3,true));
  const dimensions=await run.page.evaluate(()=>({
    stage:[stage.offsetWidth,stage.offsetHeight,stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],
    canvas:[visual.width,visual.height,visual.offsetWidth,visual.offsetHeight],ratio:Deck.ratio()
  }));
  assert.deepEqual(dimensions.stage.slice(0,2),[1600,900]);
  assert.ok(Math.abs(dimensions.stage[2]-width)<.1&&Math.abs(dimensions.stage[3]-height)<.1);
  assert.equal(dimensions.canvas[0],Math.round(dimensions.canvas[2]*dimensions.ratio));
  assert.equal(dimensions.canvas[1],Math.round(dimensions.canvas[3]*dimensions.ratio));
  assert.deepEqual(run.errors,[]);
  await run.context.close();
}
results.push("1600x900 and 1280x720 preserve stage containment and DPR-aware Canvas backing stores");
await normal.context.close();

const reduced=await open({reduced:true});
const reducedState=await reduced.page.evaluate(()=>MiniNeuron.inspect());
assert.deepEqual([reducedState.index,reducedState.value,reducedState.animating],[3,1,false]);
assert.equal(await reduced.page.locator("#progress").textContent(),"4 / 4");
assert.deepEqual(reduced.errors,[]);
await reduced.context.close();
results.push("reduced motion opens on the complete, meaningful output state without RAF interpolation");

const fallback=await open({noCanvas:true});
assert.equal(await fallback.page.locator("#visual").isHidden(),true);
assert.equal(await fallback.page.locator("#fallback").isVisible(),true);
assert.match(await fallback.page.locator("#fallback").innerText(),/x₁…x₅.*w₁…w₅.*Σ\+b.*σ.*a/s);
assert.equal(await fallback.page.locator("button:enabled").count(),0);
assert.deepEqual(fallback.errors,[]);
await fallback.context.close();
results.push("Canvas failure exposes the same five-input, weighted-sum, activation, and output relation");

const lifecycle=await open();
await lifecycle.page.evaluate(()=>MiniNeuron.goTo(3));
await lifecycle.page.waitForTimeout(100);
await lifecycle.page.evaluate(()=>MiniNeuron.dispose());
const disposed=await lifecycle.page.evaluate(()=>({ready:__NOTALE_READY__,state:MiniNeuron.inspect()}));
await lifecycle.page.locator("#reset").click();
assert.equal(await lifecycle.page.evaluate(()=>MiniNeuron.inspect().value),disposed.state.value);
assert.deepEqual([disposed.ready,disposed.state.animating],[false,false]);
await lifecycle.page.reload({waitUntil:"networkidle"});
await lifecycle.page.waitForFunction(()=>window.__NOTALE_READY__===true);
assert.equal(await lifecycle.page.locator("canvas").count(),1);
assert.deepEqual((await lifecycle.page.evaluate(()=>MiniNeuron.inspect())).ids,
  ["x1:w1","x2:w2","x3:w3","x4:w4","x5:w5"]);
assert.deepEqual(lifecycle.errors,[]);
await lifecycle.context.close();
results.push("dispose stops RAF, aborts controls and resize work, and reload creates one clean seeded scene");

console.log(JSON.stringify({passed:true,results},null,2));
await browser.close();
