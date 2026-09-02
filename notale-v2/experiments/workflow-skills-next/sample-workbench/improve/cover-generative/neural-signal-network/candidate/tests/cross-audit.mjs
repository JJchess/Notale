import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const ROOT = "http://127.0.0.1:43127/";
const urls = {
  baseline: `${ROOT}cover-generative/neural-signal-network/pages/`,
  candidate: `${ROOT}_improve/cover-generative/neural-signal-network/candidate/pages/`,
};
const browser = await chromium.launch({ headless: true });
const results = [];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fixedLoop = `;window.__loopFrame=null;window.__loopStopped=false;Deck.loop=function(frame,options){window.__loopFrame=frame;if(Deck.reduced())frame(options?.still||0,0);else for(let step=1;step<=10;step++)frame(step*50,50);return()=>{window.__loopStopped=true}};`;

async function open(kind, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1600, height: 900 },
    reducedMotion: options.reduced ? "reduce" : "no-preference",
    hasTouch: options.touch ?? false,
  });
  if (options.baseHook) {
    await context.route("**/assets/base.js", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + options.baseHook });
    });
  }
  if (options.noSeed) await context.route("**/seedrandom.min.js", route => route.abort());
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("ERR_FAILED")) errors.push(message.text());
  });
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(urls[kind], { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#nodes").textContent === "720");
  return { context, page, errors, failed };
}

async function capture(kind, viewport, reduced, action) {
  const run = await open(kind, { viewport, reduced, baseHook: fixedLoop });
  if (action === "pointer") {
    await run.page.mouse.move(viewport.width * .75, viewport.height * .5);
    await run.page.evaluate(() => window.__loopFrame(550, 50));
  }
  if (action === "inject") await run.page.mouse.click(viewport.width * .72, viewport.height * .57);
  if (action === "keyboard") {
    await run.page.locator("#stage").focus();
    await run.page.keyboard.press("Enter");
  }
  if (action === "reset") {
    await run.page.locator("#stage").focus();
    await run.page.keyboard.press("Enter");
    await run.page.keyboard.press("r");
    await run.page.keyboard.press("R");
  }
  const screenshot = await run.page.screenshot();
  const model = await run.page.evaluate(() => ({
    canvas: [net.width, net.height, net.getBoundingClientRect().toJSON()],
    title: document.querySelector("h1").textContent,
    readouts: [...document.querySelectorAll(".stats dd")].map(node => [node.textContent, node.className]),
    stage: stage.getBoundingClientRect().toJSON(),
  }));
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.failed, []);
  await run.context.close();
  return { screenshot, model };
}

const fixedStates = [
  [{ width: 1600, height: 900 }, false, "initial"],
  [{ width: 1600, height: 900 }, false, "pointer"],
  [{ width: 1600, height: 900 }, true, "initial"],
  [{ width: 1600, height: 900 }, true, "inject"],
  [{ width: 1600, height: 900 }, true, "keyboard"],
  [{ width: 1600, height: 900 }, true, "reset"],
  [{ width: 1280, height: 720 }, false, "initial"],
  [{ width: 1280, height: 720 }, true, "initial"],
  [{ width: 1280, height: 720 }, true, "inject"],
];
for (const [viewport, reduced, action] of fixedStates) {
  const baseline = await capture("baseline", viewport, reduced, action);
  const candidate = await capture("candidate", viewport, reduced, action);
  assert.deepEqual(candidate.model, baseline.model);
  assert.equal(sha(candidate.screenshot), sha(baseline.screenshot));
  results.push(`pixel/model exact: ${viewport.width}x${viewport.height} ${reduced ? "reduced" : "normal"} ${action}`);
}

const touch = await open("candidate", { reduced: true, touch: true, baseHook: fixedLoop });
const touchPoint = await touch.page.locator("#stage").boundingBox();
await touch.page.touchscreen.tap(touchPoint.x + touchPoint.width * .72, touchPoint.y + touchPoint.height * .57);
assert.equal(await touch.page.evaluate(() => NeuralSignalNetwork.getState().injectedCount), 1);
assert.deepEqual(touch.errors, []);
await touch.context.close();
results.push("real touch injects one propagated signal");

for (let runIndex = 0; runIndex < 2; runIndex++) {
  const fallback = await open("candidate", { reduced: true, baseHook: fixedLoop + "Deck.fit=()=>null;" });
  const state = await fallback.page.evaluate(() => ({
    state: NeuralSignalNetwork.getState(),
    paths: [...document.querySelectorAll(".fallback-network path")].map(path => path.getAttribute("d")),
  }));
  assert.equal(state.state.fallback, true);
  assert.equal(state.state.edgeCount, 3807);
  assert.equal(state.paths.length, 3);
  const screenshotHash = sha(await fallback.page.screenshot());
  if (runIndex === 0) results.push(`Canvas fallback deterministic hash ${screenshotHash}`);
  else assert.equal(screenshotHash, results.at(-1).split(" ").at(-1));
  assert.deepEqual(fallback.errors, []);
  await fallback.context.close();
}

let dependencyHash;
for (let runIndex = 0; runIndex < 2; runIndex++) {
  const dependency = await open("candidate", { reduced: true, baseHook: fixedLoop, noSeed: true });
  const state = await dependency.page.evaluate(() => NeuralSignalNetwork.getState());
  const model = await dependency.page.evaluate(() => NeuralSignalNetwork.inspectModel());
  const modelHash = sha(Buffer.from(JSON.stringify(model)));
  assert.equal(state.ready, true);
  assert.equal(state.fallback, true);
  assert.equal(model.x.length, 720);
  assert.ok(model.edges.length > 3000);
  if (dependencyHash) assert.equal(modelHash, dependencyHash);
  else dependencyHash = modelHash;
  assert.equal(dependency.failed.length, 1);
  assert.deepEqual(dependency.errors, []);
  await dependency.context.close();
}
results.push(`seedrandom failure retains deterministic live graph ${dependencyHash}`);

const lifecycleHook = `;window.__owners={loops:0,resizes:0};
{const original=Deck.loop;Deck.loop=function(...args){window.__owners.loops++;const stop=original(...args);let live=true;return()=>{if(live){live=false;window.__owners.loops--}stop()}}}
{const original=Deck.onResize;Deck.onResize=function(...args){window.__owners.resizes++;const stop=original(...args);let live=true;return()=>{if(live){live=false;window.__owners.resizes--}stop()}}}`;
const lifecycle = await open("candidate", { baseHook: lifecycleHook });
await lifecycle.page.setViewportSize({ width: 1280, height: 720 });
await lifecycle.page.waitForTimeout(50);
assert.deepEqual(await lifecycle.page.evaluate(() => window.__owners), { loops: 1, resizes: 1 });
const cachedApi = await lifecycle.page.evaluateHandle(() => NeuralSignalNetwork);
await lifecycle.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
const disposedState = await lifecycle.page.evaluate(api => api.getState(), cachedApi);
const disposedModel = await lifecycle.page.evaluate(api => api.inspectModel(), cachedApi);
await lifecycle.page.evaluate(api => {
  api.reset(); api.inject(100, 100); api.pointer(100, 100); api.step(500);
}, cachedApi);
assert.equal(disposedState.ready, false);
assert.equal(disposedState.disposed, true);
assert.deepEqual(await lifecycle.page.evaluate(api => api.getState(), cachedApi), disposedState);
assert.deepEqual(await lifecycle.page.evaluate(api => api.inspectModel(), cachedApi), disposedModel);
assert.deepEqual(await lifecycle.page.evaluate(() => window.__owners), { loops: 0, resizes: 0 });
await lifecycle.page.keyboard.press("Enter");
assert.deepEqual(await lifecycle.page.evaluate(api => api.getState(), cachedApi), disposedState);
await lifecycle.page.reload({ waitUntil: "networkidle" });
await lifecycle.page.waitForFunction(() => NeuralSignalNetwork.getState().ready);
assert.equal(await lifecycle.page.locator("canvas").count(), 1);
assert.deepEqual(lifecycle.errors, []);
await lifecycle.context.close();
results.push("resize, pagehide, cached API, RAF/resize ownership and reload");

console.log(JSON.stringify({ passed: true, results }, null, 2));
await browser.close();
