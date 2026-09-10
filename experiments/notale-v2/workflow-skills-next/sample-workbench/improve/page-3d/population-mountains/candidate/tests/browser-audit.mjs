import {chromium} from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";

const ROOT = "http://127.0.0.1:43127/";
const URLS = {
  baseline: `${ROOT}page-3d/population-mountains/pages/`,
  candidate: `${ROOT}_improve/page-3d/population-mountains/candidate/pages/`,
};
const shots = new URL("../../shots/", import.meta.url);
await mkdir(shots, {recursive:true});

const browser = await chromium.launch({headless:true});
const checks = [];
const failures = [];
const errors = [];
const fixed = {baseline:{}, candidate:{}};
const assert = (condition, message) => {
  checks.push({message, passed:Boolean(condition)});
  if (!condition) failures.push(message);
};
const hash = value => createHash("sha256").update(
  Buffer.isBuffer(value) ? value : JSON.stringify(value)
).digest("hex");

const probeSource = `<script>
window.__populationProbe={geometryDisposals:0,materialDisposals:0,rendererDisposals:0,contextLosses:0};
for(const [prototype,key] of [[THREE.BufferGeometry.prototype,"geometryDisposals"],[THREE.Material.prototype,"materialDisposals"]]){
  const original=prototype.dispose;
  prototype.dispose=function(...args){__populationProbe[key]++;return original.apply(this,args)};
}
const WebGLRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
  const renderer=new WebGLRenderer(...args);
  const render=renderer.render;
  renderer.render=function(scene,camera){
    const mesh=scene.children.find(object=>object.isInstancedMesh);
    __populationProbe.scene={
      childTypes:scene.children.map(object=>object.type),
      camera:{position:camera.position.toArray(),up:camera.up.toArray(),quaternion:camera.quaternion.toArray(),projection:Array.from(camera.projectionMatrix.elements)},
      instances:mesh?.count,
      matrices:mesh?Array.from(mesh.instanceMatrix.array):[],
      colors:mesh?.instanceColor?Array.from(mesh.instanceColor.array):[],
      entities:mesh?.userData.entities||[],
      geometry:mesh?.geometry?.parameters,
      castShadow:mesh?.castShadow,
      receiveShadow:mesh?.receiveShadow,
    };
    const result=render.apply(this,arguments);
    __populationProbe.render={...this.info.render,memory:{...this.info.memory}};
    return result;
  };
  const dispose=renderer.dispose;
  renderer.dispose=function(...args){__populationProbe.rendererDisposals++;return dispose.apply(this,args)};
  const forceContextLoss=renderer.forceContextLoss;
  renderer.forceContextLoss=function(...args){__populationProbe.contextLosses++;return forceContextLoss.apply(this,args)};
  return renderer;
};
THREE.WebGLRenderer.prototype=WebGLRenderer.prototype;
</script>`;

async function instrument(context, kind) {
  await context.route(URLS[kind], async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '<script src="assets/page.js"></script>',
      `${probeSource}<script src="assets/page.js"></script>`
    );
    await route.fulfill({response, body:html, contentType:"text/html"});
  });
}

function track(page, label) {
  page.on("pageerror", error => errors.push({label, type:"page", text:error.message}));
  page.on("console", message => {
    if (message.type() === "error") errors.push({label, type:"console", text:message.text()});
  });
  page.on("requestfailed", request => errors.push({label, type:"request", text:request.url()}));
}

async function open(kind, options = {}) {
  const context = await browser.newContext({
    viewport:{width:1600, height:900},
    hasTouch:true,
    reducedMotion:options.reduced ? "reduce" : "no-preference",
  });
  await instrument(context, kind);
  const page = await context.newPage();
  track(page, `${kind}-${options.reduced ? "reduced" : "normal"}`);
  await page.goto(URLS[kind], {waitUntil:"networkidle"});
  await page.waitForFunction(() => window.__POPULATION_READY__ && window.PopulationScene && window.__populationProbe?.scene);
  return {context, page};
}

async function settleSize(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(({width, height}) => {
    const rect = document.querySelector("main").getBoundingClientRect();
    return Math.abs(rect.width - width) < 1e-3 && Math.abs(rect.height - height) < 1e-3;
  }, viewport);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

async function snapshot(page) {
  return page.evaluate(() => ({
    state:PopulationScene.getState(),
    copy:{
      title:document.getElementById("viewTitle").textContent,
      text:document.getElementById("viewText").textContent,
    },
    pressed:[...document.querySelectorAll("button[data-view]")].map(button => [button.dataset.view, button.getAttribute("aria-pressed")]),
    stage:document.querySelector("main").getBoundingClientRect().toJSON(),
    canvas:{
      width:document.getElementById("gl").width,
      height:document.getElementById("gl").height,
      rect:document.getElementById("gl").getBoundingClientRect().toJSON(),
    },
    scroll:[document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    probe:__populationProbe,
  }));
}

async function capture(kind, view, viewport, reduced = false) {
  const {context, page} = await open(kind, {reduced});
  await page.evaluate(name => PopulationScene.setView(name, true), view);
  await settleSize(page, viewport);
  const state = await snapshot(page);
  const imagePath = new URL(`cross-${kind}-${reduced ? "reduced-" : ""}${view}-${viewport.width}x${viewport.height}.png`, shots).pathname;
  const image = await page.screenshot({path:imagePath});
  const mesh = state.probe.scene;
  fixed[kind][`${reduced ? "reduced-" : ""}${view}-${viewport.width}x${viewport.height}`] = {
    stateHash:hash({...state, probe:{scene:{...mesh, matrices:undefined, colors:undefined, entities:undefined}, render:state.probe.render}}),
    pixelHash:hash(image),
    matrixHash:hash(mesh.matrices),
    colorHash:hash(mesh.colors),
    entityHash:hash(mesh.entities),
    imagePath,
    state,
  };
  await context.close();
}

for (const kind of ["baseline", "candidate"]) {
  for (const view of ["top", "tilt", "profile"]) {
    await capture(kind, view, {width:1600, height:900});
  }
  await capture(kind, "tilt", {width:1280, height:720});
  await capture(kind, "profile", {width:1600, height:900}, true);
}

for (const [id, baseline] of Object.entries(fixed.baseline)) {
  const candidate = fixed.candidate[id];
  assert(Boolean(candidate), `candidate state exists: ${id}`);
  assert(baseline.stateHash === candidate?.stateHash, `DOM, camera and renderer state match: ${id}`);
  const comparison = spawnSync("compare", ["-metric", "AE", baseline.imagePath, candidate.imagePath, "null:"]);
  const pixelAe = Number(comparison.stderr.toString().trim());
  baseline.pixelAe = candidate.pixelAe = pixelAe;
  assert(pixelAe <= 8, `PNG pixel AE <= 8: ${id} (AE ${pixelAe})`);
  assert(baseline.matrixHash === candidate?.matrixHash, `instance matrices match: ${id}`);
  assert(baseline.colorHash === candidate?.colorHash, `instance colors match: ${id}`);
  assert(baseline.entityHash === candidate?.entityHash, `entity order matches: ${id}`);
}

const canonical = fixed.candidate["top-1600x900"].state.probe.scene;
assert(canonical.instances === 4732, "candidate renders all 4,732 populated cells");
assert(canonical.entities.length === 4732 && new Set(canonical.entities).size === 4732, "all mesh entities have unique stable IDs");
assert(canonical.geometry.width === .88 && canonical.geometry.height === 1 && canonical.geometry.depth === .88, "cell geometry remains .88 x 1 x .88");
assert(canonical.castShadow && canonical.receiveShadow, "population mesh preserves contact-height shadows");

async function exerciseInputsAndLifecycle() {
  const {context, page} = await open("candidate");
  await page.locator('button[data-view="tilt"]').click();
  assert((await page.evaluate(() => PopulationScene.getState())).transitioning, "mouse click starts authored camera transition");
  await page.waitForFunction(() => PopulationScene.getState().view === "tilt" && !PopulationScene.getState().transitioning);

  const profile = page.locator('button[data-view="profile"]');
  const box = await profile.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => PopulationScene.getState().view === "profile" && !PopulationScene.getState().transitioning);
  assert((await page.evaluate(() => PopulationScene.getState())).view === "profile", "touch enters profile view");

  const top = page.locator('button[data-view="top"]');
  await top.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => PopulationScene.getState().view === "top" && !PopulationScene.getState().transitioning);
  assert((await page.evaluate(() => PopulationScene.getState())).view === "top", "keyboard Enter enters top view");

  await page.evaluate(() => PopulationScene.setView("tilt", true));
  await page.evaluate(() => PopulationScene.reset());
  const resetA = new URL("cross-candidate-reset-a.png", shots).pathname;
  await page.screenshot({path:resetA});
  await page.evaluate(() => PopulationScene.setView("profile", true));
  await page.evaluate(() => PopulationScene.reset());
  const resetB = new URL("cross-candidate-reset-b.png", shots).pathname;
  await page.screenshot({path:resetB});
  const resetComparison = spawnSync("compare", ["-metric", "AE", resetA, resetB, "null:"]);
  const resetAe = Number(resetComparison.stderr.toString().trim());
  assert(resetAe <= 8, `double reset restores the same top view (pixel AE ${resetAe})`);

  const handleState = await page.evaluate(() => {
    const handle = window.__heldPopulation = PopulationScene;
    handle.setView("tilt", true);
    handle.dispose();
    handle.reset();
    return {state:handle.getState(), removed:window.PopulationScene === undefined, probe:__populationProbe};
  });
  assert(handleState.state.disposed && !handleState.state.ready, "dispose makes a held API inert");
  assert(handleState.removed, "dispose releases the global scene API closure");
  assert(handleState.probe.geometryDisposals >= 3, "dispose releases all owned scene geometries");
  assert(handleState.probe.materialDisposals >= 3, "dispose releases all owned scene materials");
  assert(handleState.probe.rendererDisposals === 1 && handleState.probe.contextLosses === 1, "dispose releases renderer and context once");

  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(() => window.__POPULATION_READY__ && window.PopulationScene);
  const reloaded = await page.evaluate(() => ({canvas:document.querySelectorAll("#gl").length, fallback:document.querySelectorAll("#fallbackChart").length, state:PopulationScene.getState()}));
  assert(reloaded.canvas === 1 && reloaded.fallback === 1 && reloaded.state.ready, "reload restores one 3D canvas, one fallback canvas and a ready API");
  await context.close();
}

async function exerciseInvalidAndReduced() {
  const {context, page} = await open("candidate");
  await page.evaluate(() => PopulationScene.setView("not-a-view"));
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => PopulationScene.getState());
  assert(state.view === "tilt" && !state.transitioning, "invalid view does not cancel the authored automatic sequence");
  await context.close();

  const reducedPage = await open("candidate", {reduced:true});
  const initial = await reducedPage.page.evaluate(() => PopulationScene.getState());
  await reducedPage.page.evaluate(() => PopulationScene.setView("top", false));
  const after = await reducedPage.page.evaluate(() => PopulationScene.getState());
  assert(initial.view === "profile" && !initial.transitioning, "reduced motion opens on the decisive profile view");
  assert(after.view === "top" && !after.transitioning, "reduced motion changes named views without travel");
  await reducedPage.context.close();
}

async function exerciseFallback() {
  const context = await browser.newContext({viewport:{width:1600, height:900}});
  await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return String(type).includes("webgl") ? null : getContext.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  track(page, "candidate-fallback");
  await page.goto(URLS.candidate, {waitUntil:"networkidle"});
  await page.waitForFunction(() => window.__POPULATION_READY__ && window.PopulationScene);
  const fallback = await page.evaluate(() => {
    const panel = document.getElementById("fallback");
    const chart = document.getElementById("fallbackChart");
    return {
      state:PopulationScene.getState(),
      visible:!panel.hidden,
      title:panel.querySelector("h2").textContent,
      copy:panel.querySelector("p").textContent,
      chart:Array.from(chart.getContext("2d").getImageData(0, 0, chart.width, chart.height).data).some(value => value !== 0),
    };
  });
  assert(fallback.state.view === "profile" && fallback.visible && fallback.chart, "WebGL failure retains the real population profile evidence");
  assert(fallback.title.includes("人口密度") && fallback.copy.includes("柱高与居民数成正比"), "fallback states the same population-height claim");
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", {persisted:false})));
  assert(await page.evaluate(() => window.PopulationScene === undefined && !window.__POPULATION_READY__), "fallback pagehide releases its API");
  await context.close();
}

await exerciseInputsAndLifecycle();
await exerciseInvalidAndReduced();
await exerciseFallback();
const expectedFallbackDiagnostics = errors.filter(error =>
  error.label === "candidate-fallback" &&
  error.type === "console" &&
  error.text === "THREE.WebGLRenderer: Error creating WebGL context."
);
const unexpectedErrors = errors.filter(error => !expectedFallbackDiagnostics.includes(error));
assert(expectedFallbackDiagnostics.length === 1, "forced WebGL failure emits only Three.js's expected context diagnostic");
assert(unexpectedErrors.length === 0, "all other audited browser paths have zero page, console and request errors");

const result = {
  passed:failures.length === 0,
  failures,
  checks,
  errors,
  unexpectedErrors,
  fixed:Object.fromEntries(Object.entries(fixed).map(([kind, records]) => [kind,
    Object.fromEntries(Object.entries(records).map(([id, record]) => [id, {
      stateHash:record.stateHash,
      pixelHash:record.pixelHash,
      matrixHash:record.matrixHash,
      colorHash:record.colorHash,
      entityHash:record.entityHash,
      pixelAe:record.pixelAe,
    }]))
  ])),
  testedAt:new Date().toISOString(),
};
await writeFile(new URL("cross-audit.json", shots), JSON.stringify(result, null, 2));
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} checks`);
}
