import {chromium} from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import {createHash} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";

const ROOT = "http://127.0.0.1:43127/";
const URLS = {
  baseline: `${ROOT}cover-generative/tactile-grid/pages/`,
  candidate: `${ROOT}_improve/cover-generative/tactile-grid/candidate/pages/`,
};
const shots = new URL("../../shots/", import.meta.url);
await mkdir(shots, {recursive: true});

const browser = await chromium.launch({headless: true});
const failures = [];
const checks = [];
const runtime = {console: [], page: [], failed: [], http: [], external: []};
const fixedStates = {baseline: {}, candidate: {}};
const stateMismatches = {};
const assert = (condition, message) => {
  checks.push({message, passed: Boolean(condition)});
  if (!condition) failures.push(message);
};
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function track(page, label) {
  page.on("console", message => {
    if (message.type() === "error") runtime.console.push({label, text: message.text()});
  });
  page.on("pageerror", error => runtime.page.push({label, text: error.message}));
  page.on("requestfailed", request => runtime.failed.push({
    label,
    url: request.url(),
    text: request.failure()?.errorText,
  }));
  page.on("response", response => {
    if (response.status() >= 400) runtime.http.push({
      label,
      url: response.url(),
      status: response.status(),
    });
  });
  page.on("request", request => {
    const host = new URL(request.url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) {
      runtime.external.push({label, url: request.url()});
    }
  });
}

async function stopAutomaticLoop(context) {
  await context.addInitScript(() => {
    const probe = window.__canvasListenerProbe = {add: {}, remove: {}};
    const pagehideProbe = window.__pagehideListenerProbe = {add: 0, remove: 0};
    const addEventListener = HTMLCanvasElement.prototype.addEventListener;
    const removeEventListener = HTMLCanvasElement.prototype.removeEventListener;
    HTMLCanvasElement.prototype.addEventListener = function(type, ...args) {
      probe.add[type] = (probe.add[type] || 0) + 1;
      return addEventListener.call(this, type, ...args);
    };
    HTMLCanvasElement.prototype.removeEventListener = function(type, ...args) {
      probe.remove[type] = (probe.remove[type] || 0) + 1;
      return removeEventListener.call(this, type, ...args);
    };
    const addWindowListener = window.addEventListener;
    const removeWindowListener = window.removeEventListener;
    window.addEventListener = function(type, ...args) {
      if (type === "pagehide") pagehideProbe.add += 1;
      return addWindowListener.call(this, type, ...args);
    };
    window.removeEventListener = function(type, ...args) {
      if (type === "pagehide") pagehideProbe.remove += 1;
      return removeWindowListener.call(this, type, ...args);
    };
  });
  await context.route("**/assets/base.js", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const hook = `;Deck.loop=function(frame){window.__renderFrame=frame;window.__loopStopped=false;return function(){window.__loopStopped=true}};`;
    await route.fulfill({response, body: source + hook});
  });
}

async function ready(page, url) {
  await page.goto(url, {waitUntil: "networkidle"});
  await page.waitForFunction(() => window.__TACTILE__ && window.__renderFrame);
  await page.evaluate(() => document.fonts.ready);
}

async function freezeIntro(page) {
  await page.evaluate(() => {
    gsap.killTweensOf(".i,.intro");
    document.querySelectorAll(".i,.intro").forEach(node => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
  });
}

const readState = page => page.evaluate(() => {
  const {trail, seed, auto} = window.__TACTILE__.state();
  return {
  api: {trail, seed, auto},
  stage: document.querySelector("main").getBoundingClientRect().toJSON(),
  canvas: {
    width: document.querySelector("canvas").width,
    height: document.querySelector("canvas").height,
    rect: document.querySelector("canvas").getBoundingClientRect().toJSON(),
  },
  scroll: [
    document.documentElement.scrollWidth,
    document.documentElement.scrollHeight,
    document.body.scrollWidth,
    document.body.scrollHeight,
  ],
  copy: [...document.querySelectorAll(".title,.tags,.meta,.hero h1,.bottom>span")].map(node => {
    const style = getComputedStyle(node);
    return {
      text: node.textContent.replace(/\s+/g, ""),
      rect: node.getBoundingClientRect().toJSON(),
      opacity: style.opacity,
      transform: style.transform,
      color: style.color,
      font: style.font,
    };
  }),
};
});

async function captureBothSizes(page, kind, mode, stateName) {
  await page.evaluate(() => {
    document.querySelector("canvas").style.pointerEvents = "none";
  });
  for (const viewport of [{width: 1600, height: 900}, {width: 1280, height: 720}]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({scale, width, height}) => {
      const rect = document.querySelector("main").getBoundingClientRect();
      return Math.abs(Deck.s - scale) < 1e-6
        && Math.abs(rect.width - width) < 1e-3
        && Math.abs(rect.height - height) < 1e-3;
    }, {scale: viewport.width / 1600, width: viewport.width, height: viewport.height});
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const id = `${mode}-${stateName}-${viewport.width}x${viewport.height}`;
    const state = await readState(page);
    const screenshot = await page.screenshot({path: new URL(`${kind}-${id}.png`, shots).pathname});
    fixedStates[kind][id] = {
      stateHash: hash(state),
      pixelHash: createHash("sha256").update(screenshot).digest("hex"),
      state,
    };
  }
  await page.setViewportSize({width: 1600, height: 900});
  await page.waitForFunction(() => Math.abs(Deck.s - 1) < 1e-6);
  await page.evaluate(() => {
    document.querySelector("canvas").style.pointerEvents = "";
  });
}

async function captureNormal(kind) {
  const context = await browser.newContext({
    viewport: {width: 1600, height: 900},
    hasTouch: true,
    reducedMotion: "no-preference",
  });
  await stopAutomaticLoop(context);
  const page = await context.newPage();
  track(page, `${kind}-fixed-normal`);
  await ready(page, URLS[kind]);
  await freezeIntro(page);
  await page.evaluate(() => __TACTILE__.reset());

  await page.evaluate(() => __renderFrame(0, 0));
  await captureBothSizes(page, kind, "normal", "initial");
  await page.evaluate(() => __renderFrame(1500, 1500));
  await captureBothSizes(page, kind, "normal", "auto-wave-1");
  await page.evaluate(() => __renderFrame(3000, 1500));
  await captureBothSizes(page, kind, "normal", "auto-wave-2");

  await page.mouse.move(1180, 540);
  await page.evaluate(() => __renderFrame(3016, 16));
  await captureBothSizes(page, kind, "normal", "mouse-wave");
  await page.touchscreen.tap(500, 650);
  await page.evaluate(() => __renderFrame(3032, 16));
  await captureBothSizes(page, kind, "normal", "touch-wave");

  await page.locator("main").focus();
  await page.keyboard.press("r");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.evaluate(() => __renderFrame(16, 16));
  await captureBothSizes(page, kind, "normal", "keyboard-wave");
  await page.keyboard.press("r");
  await captureBothSizes(page, kind, "normal", "reset");
  await context.close();
}

async function captureReduced(kind) {
  const context = await browser.newContext({
    viewport: {width: 1600, height: 900},
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await stopAutomaticLoop(context);
  const page = await context.newPage();
  track(page, `${kind}-fixed-reduced`);
  await ready(page, URLS[kind]);
  await freezeIntro(page);
  await page.evaluate(() => __TACTILE__.reset());

  await captureBothSizes(page, kind, "reduced", "initial");
  await page.mouse.move(1180, 540);
  await captureBothSizes(page, kind, "reduced", "mouse-wave");
  await page.touchscreen.tap(500, 650);
  await captureBothSizes(page, kind, "reduced", "touch-wave");
  await page.locator("main").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await captureBothSizes(page, kind, "reduced", "keyboard-wave");
  await page.keyboard.press("r");
  await captureBothSizes(page, kind, "reduced", "reset");
  await context.close();
}

for (const kind of ["baseline", "candidate"]) {
  await captureNormal(kind);
  await captureReduced(kind);
}

for (const id of Object.keys(fixedStates.baseline)) {
  const baseline = fixedStates.baseline[id];
  const candidate = fixedStates.candidate[id];
  assert(Boolean(candidate), `candidate fixed state exists: ${id}`);
  assert(baseline.stateHash === candidate?.stateHash, `fixed DOM/state hash: ${id}`);
  assert(baseline.pixelHash === candidate?.pixelHash, `fixed pixel hash: ${id}`);
  if (baseline.stateHash !== candidate?.stateHash || baseline.pixelHash !== candidate?.pixelHash) {
    stateMismatches[id] = {baseline: baseline.state, candidate: candidate?.state};
  }
}

const probeModule = `<script type="module">
import * as THREE from "three";
import {EffectComposer} from "./media/three/examples/jsm/postprocessing/EffectComposer.js";
import {ShaderPass} from "./media/three/examples/jsm/postprocessing/ShaderPass.js";
import {OutputPass} from "./media/three/examples/jsm/postprocessing/OutputPass.js";
const probe=window.__resourceProbe={offsetWrites:0,textureDisposals:0,geometryDisposals:0,materialDisposals:0,composerDisposals:0,shaderPassDisposals:0,outputPassDisposals:0,scene:{}};
const wrap=(prototype,method,key)=>{const original=prototype[method];prototype[method]=function(...args){probe[key]++;return original.apply(this,args)}};
wrap(THREE.InstancedBufferAttribute.prototype,"setXY","offsetWrites");
wrap(THREE.Texture.prototype,"dispose","textureDisposals");
wrap(THREE.BufferGeometry.prototype,"dispose","geometryDisposals");
wrap(THREE.Material.prototype,"dispose","materialDisposals");
wrap(EffectComposer.prototype,"dispose","composerDisposals");
wrap(ShaderPass.prototype,"dispose","shaderPassDisposals");
wrap(OutputPass.prototype,"dispose","outputPassDisposals");
const add=THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add=function(...objects){
  const result=add.apply(this,objects);
  if(this.isScene){
    const grid=this.children.find(node=>node.isInstancedMesh);
    if(grid) Object.assign(probe.scene,{instances:grid.count,matrices:grid.instanceMatrix.count,offsets:grid.geometry.getAttribute("aOffset")?.count,castShadow:grid.castShadow,receiveShadow:grid.receiveShadow,customDepth:Boolean(grid.customDepthMaterial),lights:this.children.filter(node=>node.isLight).map(light=>[light.type,light.intensity])});
  }
  return result;
};
const addPass=EffectComposer.prototype.addPass;
EffectComposer.prototype.addPass=function(pass){
  if(pass.scene?.isScene) probe.scene.camera=[pass.camera.fov,pass.camera.near,pass.camera.far];
  return addPass.apply(this,arguments);
};
</script>`;

async function installResourceProbe(context, kind) {
  await context.route(URLS[kind], async route => {
    const response = await route.fetch();
    let html = await response.text();
    if (kind === "baseline") {
      html = html.replace("<script type=module>\nimport * as T", `${probeModule}<script type=module>\nimport * as T`);
    } else {
      html = html.replace("<script type=\"module\" src=\"tactile-grid.js\"></script>", `${probeModule}<script type=\"module\" src=\"tactile-grid.js\"></script>`);
    }
    await route.fulfill({response, body: html, contentType: "text/html"});
  });
}

async function exerciseLifecycle(kind) {
  const context = await browser.newContext({viewport: {width: 1600, height: 900}, hasTouch: true});
  await stopAutomaticLoop(context);
  await installResourceProbe(context, kind);
  const page = await context.newPage();
  track(page, `${kind}-lifecycle`);
  await ready(page, URLS[kind]);
  await freezeIntro(page);
  let probe = await page.evaluate(() => window.__resourceProbe);
  assert(probe.offsetWrites === 1600, `${kind}: writes 1600 shader offsets`);

  await page.evaluate(() => __renderFrame(0, 0));
  probe = await page.evaluate(() => window.__resourceProbe);
  assert(probe.scene?.instances === 1600 && probe.scene?.matrices === 1600 && probe.scene?.offsets === 1600, `${kind}: rendered grid is true 40x40 instancing`);
  assert(probe.scene?.castShadow && probe.scene?.receiveShadow && probe.scene?.customDepth, `${kind}: shadow and custom depth material preserved`);
  assert(JSON.stringify(probe.scene?.camera) === JSON.stringify([40, .1, 200]), `${kind}: camera contract preserved`);
  assert(JSON.stringify(probe.scene?.lights) === JSON.stringify([["AmbientLight", .5], ["DirectionalLight", 4], ["DirectionalLight", 1]]), `${kind}: three-light rig preserved`);

  await page.mouse.move(1180, 540);
  let state = await page.evaluate(() => __TACTILE__.state());
  assert(state.trail === 1 && state.auto === 0, `${kind}: real mouse move creates one wave and exits auto mode`);
  await page.touchscreen.tap(500, 650);
  state = await page.evaluate(() => __TACTILE__.state());
  assert(state.trail === 2 && state.auto === 0, `${kind}: real touch adds a distinct wave`);
  await page.locator("main").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  state = await page.evaluate(() => __TACTILE__.state());
  assert(state.trail === 3, `${kind}: keyboard cursor and Enter add a wave`);
  await page.keyboard.press("r");
  state = await page.evaluate(() => __TACTILE__.state());
  assert(state.trail === 0 && state.seed === 9137 && state.auto === 1, `${kind}: reset replaces complete mutable state`);

  await page.setViewportSize({width: 1280, height: 720});
  await page.waitForFunction(() => Math.abs(Deck.s - .8) < 1e-6);
  const geometry = await readState(page);
  assert(geometry.stage.width === 1280 && geometry.stage.height === 720, `${kind}: 1280x720 stage fit`);
  assert(geometry.canvas.width === 1600 && geometry.canvas.height === 900, `${kind}: renderer retains 1600x900 logical buffer`);
  assert(geometry.scroll.join() === "1280,720,1280,720", `${kind}: resize has no overflow`);

  await page.evaluate(() => {
    window.__heldTactileApi = window.__TACTILE__;
    dispatchEvent(new PageTransitionEvent("pagehide", {persisted: false}));
  });
  const teardown = await page.evaluate(() => ({
    probe: window.__resourceProbe,
    canvasListeners: window.__canvasListenerProbe,
    pagehideListeners: window.__pagehideListenerProbe,
    loopStopped: window.__loopStopped,
    before: window.__heldTactileApi.state(),
    apiRemoved: window.__TACTILE__ === undefined,
  }));
  assert(teardown.loopStopped, `${kind}: pagehide stops the owned loop`);
  assert(teardown.probe.textureDisposals >= 1, `${kind}: pagehide disposes textures`);
  assert(teardown.probe.geometryDisposals >= 1, `${kind}: pagehide disposes geometry`);
  assert(teardown.probe.materialDisposals >= 2, `${kind}: pagehide disposes materials`);
  assert(teardown.probe.composerDisposals === 1, `${kind}: pagehide disposes composer once`);
  if (kind === "candidate") {
    assert(teardown.probe.shaderPassDisposals >= 2, "candidate: disposes the tactile ShaderPass and composer copy pass");
    assert(teardown.probe.outputPassDisposals === 1, "candidate: disposes the OutputPass");
    assert(teardown.apiRemoved, "candidate: pagehide releases the public API closure");
    assert(teardown.pagehideListeners.remove >= 1, "candidate: teardown removes its pagehide listener");
  }
  assert(
    ["webglcontextlost", "webglcontextrestored", "webglcontextcreationerror"].every(type =>
      teardown.canvasListeners.add[type] >= 1 &&
      teardown.canvasListeners.remove[type] === teardown.canvasListeners.add[type]
    ),
    `${kind}: renderer dispose removes all owned WebGL context listeners`,
  );

  await page.mouse.move(900, 400);
  await page.locator("main").dispatchEvent("keydown", {key: "Enter"});
  await page.evaluate(() => {
    window.__heldTactileApi.reset();
    window.__heldTactileApi.destroy();
  });
  const after = await page.evaluate(() => ({
    state: __heldTactileApi.state(),
    probe: __resourceProbe,
    canvasListeners: __canvasListenerProbe,
  }));
  assert(JSON.stringify(after.state) === JSON.stringify(teardown.before), `${kind}: disposed input and reset cannot mutate state`);
  assert(after.probe.composerDisposals === 1, `${kind}: repeated destroy is idempotent`);
  assert(JSON.stringify(after.canvasListeners.remove) === JSON.stringify(teardown.canvasListeners.remove), `${kind}: repeated destroy does not repeat renderer teardown`);

  await page.reload({waitUntil: "networkidle"});
  await page.waitForFunction(() => window.__TACTILE__ && window.__resourceProbe);
  const reinit = await page.evaluate(() => ({
    canvases: document.querySelectorAll("canvas").length,
    state: __TACTILE__.state(),
    instances: __resourceProbe.scene.instances,
    offsetWrites: __resourceProbe.offsetWrites,
  }));
  assert(reinit.canvases === 1 && reinit.instances === 1600 && reinit.offsetWrites === 1600, `${kind}: reload creates one grid and one canvas`);
  assert(reinit.state.trail === 0 && reinit.state.seed === 9137 && reinit.state.auto === 1, `${kind}: reload restores canonical state`);
  await context.close();
}

await exerciseLifecycle("baseline");
await exerciseLifecycle("candidate");

async function exerciseFallback() {
  const context = await browser.newContext({viewport: {width: 1600, height: 900}});
  await context.addInitScript(() => {
    const pagehideProbe = window.__pagehideListenerProbe = {add: 0, remove: 0};
    const addWindowListener = window.addEventListener;
    const removeWindowListener = window.removeEventListener;
    window.addEventListener = function(type, ...args) {
      if (type === "pagehide") pagehideProbe.add += 1;
      return addWindowListener.call(this, type, ...args);
    };
    window.removeEventListener = function(type, ...args) {
      if (type === "pagehide") pagehideProbe.remove += 1;
      return removeWindowListener.call(this, type, ...args);
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (String(type).startsWith("webgl")) return null;
      return getContext.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  const expectedConsole = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") expectedConsole.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(URLS.candidate, {waitUntil: "networkidle"});
  await page.waitForFunction(() => window.__TACTILE__);
  const fallback = await page.evaluate(() => ({
    className: document.documentElement.className,
    state: __TACTILE__.state(),
    visible: [...document.querySelectorAll(".intro")].every(node => +getComputedStyle(node).opacity === 1),
  }));
  assert(fallback.className.includes("webgl-fallback"), "candidate: WebGL creation failure selects fallback");
  assert(fallback.state.renderer === null && fallback.state.trail === 0, "candidate: fallback exposes a stable empty renderer state");
  assert(fallback.visible, "candidate: fallback keeps all title copy visible");
  assert(pageErrors.length === 0, "candidate: WebGL fallback has no uncaught page error");
  assert(expectedConsole.length <= 1, "candidate: only Three's expected WebGL construction diagnostic is emitted");
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", {persisted: false})));
  assert(await page.evaluate(() => window.__TACTILE__ === undefined), "candidate: fallback pagehide tears down its API");
  assert(await page.evaluate(() => __pagehideListenerProbe.remove >= 1), "candidate: fallback removes its pagehide listener");
  await context.close();
  return expectedConsole;
}

const fallbackConsole = await exerciseFallback();
assert(runtime.console.length === 0, "normal runs have zero console errors");
assert(runtime.page.length === 0, "normal runs have zero page errors");
assert(runtime.failed.length === 0, "normal runs have zero failed requests");
assert(runtime.http.length === 0, "normal runs have zero HTTP errors");
assert(runtime.external.length === 0, "normal runs have zero external requests");

const result = {
  passed: failures.length === 0,
  failures,
  checks,
  runtime,
  fallbackConsole,
  stateMismatches,
  fixedStates: Object.fromEntries(Object.entries(fixedStates).map(([kind, states]) => [
    kind,
    Object.fromEntries(Object.entries(states).map(([id, record]) => [id, {
      stateHash: record.stateHash,
      pixelHash: record.pixelHash,
    }])),
  ])),
  testedAt: new Date().toISOString(),
};
await writeFile(new URL("verification.json", shots), JSON.stringify(result, null, 2));
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} checks`);
}
