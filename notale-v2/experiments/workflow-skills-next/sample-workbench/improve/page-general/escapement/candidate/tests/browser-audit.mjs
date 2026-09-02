import {chromium} from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";

const ROOT = "http://127.0.0.1:43127/";
const URLS = {
  baseline:`${ROOT}page-general/escapement/pages/`,
  candidate:`${ROOT}_improve/page-general/escapement/candidate/pages/`,
};
const shots = new URL("../../shots/", import.meta.url);
await mkdir(shots, {recursive:true});

const browser = await chromium.launch({headless:true});
const checks = [];
const failures = [];
const runtime = [];
const fixed = {baseline:{}, candidate:{}};
const assert = (condition, message) => {
  checks.push({message, passed:Boolean(condition)});
  if (!condition) failures.push(message);
};
const hash = value => createHash("sha256").update(
  Buffer.isBuffer(value) ? value : JSON.stringify(value)
).digest("hex");
const ae = (left, right) => Number(spawnSync(
  "compare", ["-metric", "AE", left, right, "null:"]
).stderr.toString().trim());

const probeSource = `<script>
window.__escapementProbe={geometryDisposals:0,materialDisposals:0,rendererDisposals:0,contextLosses:0};
for(const [prototype,key] of [[THREE.BufferGeometry.prototype,"geometryDisposals"],[THREE.Material.prototype,"materialDisposals"]]){
  const original=prototype.dispose;
  prototype.dispose=function(...args){__escapementProbe[key]++;return original.apply(this,args)};
}
function numberDigest(values){
  let a=2166136261,b=2246822519;
  for(const value of values){
    const integer=Math.round(Number(value)*1e7);
    a=Math.imul(a^(integer&0xffffffff),16777619);
    b=Math.imul(b^((integer/0x100000000)|0),3266489917);
  }
  return [a>>>0,b>>>0,values.length];
}
function sceneSignature(scene,camera,renderer){
  const geometries=[],materials=[],objects=[];
  const geometryIndex=geometry=>{
    if(!geometry)return -1;
    let index=geometries.findIndex(record=>record.source===geometry);
    if(index>=0)return index;
    const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>[name,{
      itemSize:attribute.itemSize,count:attribute.count,normalized:attribute.normalized,digest:numberDigest(attribute.array)
    }]));
    index=geometries.length;
    geometries.push({source:geometry,type:geometry.type,attributes,index:geometry.index?numberDigest(geometry.index.array):null});
    return index;
  };
  const materialIndex=material=>{
    if(!material)return -1;
    if(Array.isArray(material))return material.map(materialIndex);
    let index=materials.findIndex(record=>record.source===material);
    if(index>=0)return index;
    index=materials.length;
    materials.push({source:material,type:material.type,color:material.color?.getHex(),emissive:material.emissive?.getHex(),roughness:material.roughness,metalness:material.metalness,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,side:material.side,wireframe:material.wireframe});
    return index;
  };
  scene.updateMatrixWorld(true);
  scene.traverse(object=>objects.push({
    type:object.type,position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray(),visible:object.visible,renderOrder:object.renderOrder,castShadow:object.castShadow,receiveShadow:object.receiveShadow,geometry:geometryIndex(object.geometry),material:materialIndex(object.material)
  }));
  return {
    objects,
    geometries:geometries.map(({source,...record})=>record),
    materials:materials.map(({source,...record})=>record),
    camera:{type:camera.type,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:Array.from(camera.projectionMatrix.elements)},
    render:{...renderer.info.render,memory:{...renderer.info.memory}},
  };
}
const WebGLRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
  const renderer=new WebGLRenderer(...args);
  const render=renderer.render;
  renderer.render=function(scene,camera){
    const result=render.apply(this,arguments);
    __escapementProbe.scene=sceneSignature(scene,camera,this);
    return result;
  };
  const dispose=renderer.dispose;
  renderer.dispose=function(...args){__escapementProbe.rendererDisposals++;return dispose.apply(this,args)};
  const forceContextLoss=renderer.forceContextLoss;
  renderer.forceContextLoss=function(...args){__escapementProbe.contextLosses++;return forceContextLoss.apply(this,args)};
  return renderer;
};
THREE.WebGLRenderer.prototype=WebGLRenderer.prototype;
</script>`;

async function instrument(context, kind, partialFailure = false) {
  await context.route(URLS[kind], async route => {
    const response = await route.fetch();
    const failureSource = partialFailure ? `<script>
const NativeExtrudeGeometry=THREE.ExtrudeGeometry;
let extrudeCalls=0;
THREE.ExtrudeGeometry=function(...args){
  if(++extrudeCalls===2)throw new Error("injected partial construction failure");
  return new NativeExtrudeGeometry(...args);
};
THREE.ExtrudeGeometry.prototype=NativeExtrudeGeometry.prototype;
</script>` : "";
    const html = (await response.text()).replace(
      '<script src="mechanism.js"></script>',
      `${probeSource}${failureSource}<script src="mechanism.js"></script>`
    );
    await route.fulfill({response, body:html, contentType:"text/html"});
  });
}

function track(page, label) {
  page.on("pageerror", error => runtime.push({label,type:"page",text:error.message}));
  page.on("console", message => {
    if (message.type() === "error") runtime.push({label,type:"console",text:message.text()});
  });
  page.on("requestfailed", request => runtime.push({label,type:"request",text:request.url()}));
}

async function open(kind, {viewport={width:1600,height:900},reduced=false,partialFailure=false} = {}) {
  const context = await browser.newContext({viewport,hasTouch:true,reducedMotion:reduced?"reduce":"no-preference"});
  await instrument(context, kind, partialFailure);
  const page = await context.newPage();
  track(page, `${kind}-${reduced?"reduced":"normal"}${partialFailure?"-partial-failure":""}`);
  await page.goto(URLS[kind], {waitUntil:"networkidle"});
  await page.waitForFunction(partialFailure
    ? () => window.__escapement?.getState().renderer === "fallback"
    : () => window.__escapement && window.__escapementProbe?.scene
  );
  return {context,page};
}

async function snapshot(page) {
  return page.evaluate(() => ({
    state:window.__escapement.getState(),
    copy:{
      title:document.getElementById("stateTitle").textContent,
      text:document.getElementById("stateCopy").textContent,
      reading:document.getElementById("wheelReading").textContent,
    },
    timeline:{
      value:document.getElementById("timeline").value,
      fill:document.querySelector(".track-fill").style.transform,
      active:[...document.querySelectorAll(".beat")].map(button=>button.getAttribute("aria-current")),
    },
    callouts:[...document.querySelectorAll(".callout-leader,.callout-dot")].map(node=>[node.id,node.getAttribute("d"),node.getAttribute("cx"),node.getAttribute("cy")]),
    stage:document.getElementById("stage").getBoundingClientRect().toJSON(),
    canvas:{
      width:document.getElementById("mechanismCanvas").width,
      height:document.getElementById("mechanismCanvas").height,
      rect:document.getElementById("mechanismCanvas").getBoundingClientRect().toJSON(),
    },
    overflow:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    probe:window.__escapementProbe,
  }));
}

async function capture(kind, id, progress, viewport={width:1600,height:900}, reduced=false) {
  const {context,page}=await open(kind,{viewport,reduced});
  await page.evaluate(value=>window.__escapement.setProgress(value),progress);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await snapshot(page);
  if (kind === "candidate") delete state.state.disposed;
  delete state.probe.scene.render.frame;
  const imagePath=new URL(`cross-${kind}-${id}.png`,shots).pathname;
  const image=await page.screenshot({path:imagePath});
  const {objects,geometries,materials,camera,render}=state.probe.scene;
  fixed[kind][id]={
    stateHash:hash({...state,probe:undefined}),
    sceneHash:hash({objects,geometries,materials,camera}),
    objectHash:hash(objects),
    geometryHash:hash(geometries),
    materialHash:hash(materials),
    cameraHash:hash(camera),
    renderHash:hash(render),
    pixelHash:hash(image),
    imagePath,
    state,
  };
  await page.evaluate(()=>window.__escapement.destroy());
  await context.close();
}

for (const kind of ["baseline","candidate"]) {
  for (const progress of [0,1,2,3,1.5]) await capture(kind,`1600x900-p${progress}`,progress);
  await capture(kind,"1280x720-p0",0,{width:1280,height:720});
  await capture(kind,"1280x720-p2",2,{width:1280,height:720});
  await capture(kind,"1600x900-reduced-p2",2,{width:1600,height:900},true);
  await capture(kind,"1600x900-reduced-p3",3,{width:1600,height:900},true);
}

for (const [id,baseline] of Object.entries(fixed.baseline)) {
  const candidate=fixed.candidate[id];
  assert(Boolean(candidate),`candidate fixed state exists: ${id}`);
  assert(baseline.stateHash===candidate?.stateHash,`DOM, mechanism copy and public state match: ${id}`);
  assert(baseline.objectHash===candidate?.objectHash,`object transforms and ownership match: ${id}`);
  assert(baseline.geometryHash===candidate?.geometryHash,`procedural geometry matches: ${id}`);
  assert(baseline.materialHash===candidate?.materialHash,`material state matches: ${id}`);
  assert(baseline.cameraHash===candidate?.cameraHash,`camera and projection match: ${id}`);
  const pixelAe=ae(baseline.imagePath,candidate.imagePath);
  baseline.pixelAe=candidate.pixelAe=pixelAe;
  assert(pixelAe<=8,`pixel AE <= 8: ${id} (AE ${pixelAe})`);
}

const phase0=fixed.candidate["1600x900-p0"].state;
const phase3=fixed.candidate["1600x900-p3"].state;
assert(phase0.probe.scene.objects.length===phase3.probe.scene.objects.length,"all mechanism objects retain stable identity across the cycle");
assert(phase0.probe.scene.geometries.length===phase3.probe.scene.geometries.length,"all procedural geometries persist across the cycle");
assert(phase0.copy.reading==="停住 · 0 齿"&&phase3.copy.reading==="停住 · 1 齿","the cycle visibly releases exactly one tooth then relocks");
assert(phase0.overflow[0]===1600&&phase0.overflow[1]===900,"1600x900 has no document overflow");
assert(fixed.candidate["1280x720-p2"].state.overflow[0]===1280&&fixed.candidate["1280x720-p2"].state.overflow[1]===720,"1280x720 has no document overflow");

async function exerciseInputsAndLifecycle() {
  const {context,page}=await open("candidate");
  const initialPath=new URL("cross-candidate-input-initial.png",shots).pathname;
  await page.screenshot({path:initialPath});

  const canvas=page.locator("#mechanismCanvas");
  const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.58,box.y+box.height*.57,{steps:5});
  await page.mouse.up();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const mousePath=new URL("cross-candidate-mouse-drag.png",shots).pathname;
  await page.screenshot({path:mousePath});
  assert(ae(initialPath,mousePath)>100,"mouse drag changes the inspectable view");

  await canvas.dblclick();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const resetViewPath=new URL("cross-candidate-view-reset.png",shots).pathname;
  await page.screenshot({path:resetViewPath});
  const viewResetAe=ae(initialPath,resetViewPath);
  assert(viewResetAe<=32,`double click restores the authored view within WebGL raster tolerance (AE ${viewResetAe})`);

  const client=await context.newCDPSession(page);
  const start={x:box.x+box.width*.55,y:box.y+box.height*.5};
  const end={x:start.x-90,y:start.y+45};
  await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...start,id:1,radiusX:2,radiusY:2,force:1}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...end,id:1,radiusX:2,radiusY:2,force:1}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  assert(await page.evaluate(()=>document.getElementById("renderShell").dataset.dragging==="false"),"touch drag releases pointer state");

  await page.locator("h1").click();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(()=>Math.abs(window.__escapement.getState().progress-1)<.001);
  assert((await page.evaluate(()=>window.__escapement.getState())).id==="release","keyboard ArrowRight reaches release");
  await page.keyboard.press("4");
  await page.waitForFunction(()=>Math.abs(window.__escapement.getState().progress-3)<.001);
  await page.keyboard.press("r");
  assert((await page.evaluate(()=>window.__escapement.getState())).id==="lock","keyboard reset restores lock");

  await page.locator('.beat[data-state="2"]').click();
  await page.waitForFunction(()=>Math.abs(window.__escapement.getState().progress-2)<.001);
  assert((await page.locator("#wheelReading").textContent())==="前进 · 1 齿","beat control synchronizes the one-tooth reading");
  await page.locator("#timeline").evaluate(input=>{input.value="1.5";input.dispatchEvent(new Event("input",{bubbles:true}))});
  assert(Math.abs((await page.evaluate(()=>window.__escapement.getState().progress))-1.5)<.001,"range input preserves the continuous mechanism midpoint");

  await page.locator("#playButton").click();
  assert((await page.evaluate(()=>window.__escapement.getState())).playing,"play starts the authored controller");
  await page.locator("#resetButton").click();
  const afterInterrupt=await page.evaluate(()=>window.__escapement.getState());
  assert(!afterInterrupt.playing&&afterInterrupt.id==="lock","reset interrupts playback and restores the initial mechanism state");

  await page.evaluate(()=>window.__escapement.setProgress(2));
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const resized=await snapshot(page);
  assert(resized.state.id==="step"&&resized.overflow[0]===1280&&resized.overflow[1]===720,"resize preserves mechanism state without overflow");

  const disposal=await page.evaluate(()=>{
    const handle=window.__heldEscapement=window.__escapement;
    handle.destroy();
    handle.setProgress(3);
    handle.play();
    handle.reset();
    return {state:handle.getState(),removed:window.__escapement===undefined,probe:window.__escapementProbe};
  });
  assert(disposal.state.disposed&&disposal.state.renderer==="disposed"&&disposal.state.id==="step","destroy makes retained public mutators inert");
  assert(disposal.removed,"destroy releases the global API and scene closure");
  assert(disposal.probe.geometryDisposals>20&&disposal.probe.materialDisposals>10,"destroy releases owned procedural geometry and materials");
  assert(disposal.probe.rendererDisposals===1&&disposal.probe.contextLosses===1,"destroy releases renderer and WebGL context once");

  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__escapement&&window.__escapementProbe?.scene);
  assert(await page.evaluate(()=>document.querySelectorAll("#mechanismCanvas").length===1&&window.__escapement.getState().renderer==="webgl"),"reload creates one clean mechanism and API");
  await context.close();
}

async function exerciseReduced() {
  const {context,page}=await open("candidate",{reduced:true});
  const initial=await page.evaluate(()=>window.__escapement.getState());
  assert(initial.id==="step"&&!initial.playing,"reduced motion opens on the decisive one-tooth state");
  await page.locator('.beat[data-state="3"]').click();
  const relock=await page.evaluate(()=>window.__escapement.getState());
  assert(relock.id==="relock"&&relock.progress===3,"reduced motion changes beat without interpolation");
  await context.close();
}

async function exerciseFallback() {
  const context=await browser.newContext({viewport:{width:1600,height:900}});
  await context.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      return String(type).includes("webgl")?null:getContext.call(this,type,...args);
    };
  });
  const page=await context.newPage();
  track(page,"candidate-fallback");
  await page.goto(URLS.candidate,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__escapement?.getState().renderer==="fallback");
  const fallback=await page.evaluate(()=>({
    state:window.__escapement.getState(),
    failed:document.getElementById("stage").classList.contains("webgl-failed"),
    svg:getComputedStyle(document.querySelector(".fallback-svg")).display,
    note:getComputedStyle(document.querySelector(".fallback-note")).display,
    shapes:document.querySelectorAll(".fallback-svg path,.fallback-svg circle,.fallback-svg rect").length,
  }));
  assert(fallback.failed&&fallback.svg!=="none"&&fallback.note!=="none"&&fallback.shapes>=15,"WebGL denial preserves the authored decisive mechanism still");
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false})));
  assert(await page.evaluate(()=>window.__escapement===undefined),"fallback pagehide releases its API");
  await context.close();
}

async function exercisePartialFailure() {
  const {context,page}=await open("candidate",{partialFailure:true});
  const result=await page.evaluate(()=>({
    state:window.__escapement.getState(),
    failed:document.getElementById("stage").classList.contains("webgl-failed"),
    probe:window.__escapementProbe,
  }));
  assert(result.failed&&result.state.renderer==="fallback","partial scene-construction failure activates the semantic fallback");
  assert(result.probe.geometryDisposals>0&&result.probe.materialDisposals>0,"partial failure releases already-created geometry and materials");
  assert(result.probe.rendererDisposals===1&&result.probe.contextLosses===1,"partial failure releases its renderer and context immediately");
  await context.close();
}

await exerciseInputsAndLifecycle();
await exerciseReduced();
await exerciseFallback();
await exercisePartialFailure();

const expectedDiagnostics=runtime.filter(error=>
  (error.label==="candidate-fallback"&&error.type==="console"&&error.text==="THREE.WebGLRenderer: Error creating WebGL context.")
);
const unexpectedRuntime=runtime.filter(error=>!expectedDiagnostics.includes(error));
assert(expectedDiagnostics.length===1,"forced WebGL denial emits only Three.js's expected context diagnostic");
assert(unexpectedRuntime.length===0,"all audited paths have zero unexpected runtime errors or failed requests");

const result={
  passed:failures.length===0,
  failures,
  checks,
  runtime,
  unexpectedRuntime,
  fixed:Object.fromEntries(Object.entries(fixed).map(([kind,records])=>[kind,
    Object.fromEntries(Object.entries(records).map(([id,record])=>[id,{
      stateHash:record.stateHash,sceneHash:record.sceneHash,objectHash:record.objectHash,geometryHash:record.geometryHash,materialHash:record.materialHash,cameraHash:record.cameraHash,renderHash:record.renderHash,pixelHash:record.pixelHash,pixelAe:record.pixelAe,
      objectCount:record.state.probe.scene.objects.length,
      geometryCount:record.state.probe.scene.geometries.length,
      materialCount:record.state.probe.scene.materials.length,
    }]))
  ])),
  testedAt:new Date().toISOString(),
};
await writeFile(new URL("cross-audit.json",shots),JSON.stringify(result,null,2));
await browser.close();
if(failures.length){
  console.error(failures.join("\n"));
  process.exitCode=1;
}else console.log(`PASS ${checks.length} checks`);
