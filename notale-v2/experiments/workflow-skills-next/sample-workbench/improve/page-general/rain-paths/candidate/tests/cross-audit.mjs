import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const ROOT = "http://127.0.0.1:43127/";
const urls = {
  baseline: `${ROOT}page-general/rain-paths/pages/`,
  candidate: `${ROOT}_improve/page-general/rain-paths/candidate/pages/`,
};
const browser = await chromium.launch({ headless: true });
const results = [];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function open(kind, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1600, height: 900 },
    reducedMotion: options.reduced ? "reduce" : "no-preference",
    hasTouch: options.touch ?? false,
  });
  if (options.hook) {
    await context.route("**/rain-paths.js", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: options.hook + await response.text() });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => message.type() === "error" && errors.push(`console: ${message.text()}`));
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("requestfailed", request => errors.push(`request: ${request.url()}`));
  await page.goto(urls[kind], { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#stage").classList.contains("ok") || window.RainPaths?.getState().fallback);
  return { context, page, errors };
}

async function reducedShot(kind, viewport, action) {
  const run = await open(kind, { viewport, reduced: true });
  const cards = run.page.locator(".t");
  if (action === "hover") await cards.nth(2).hover();
  if (action === "detail") await cards.nth(2).click();
  if (action === "last") {
    await run.page.mouse.move(viewport.width / 2, viewport.height / 2);
    await run.page.mouse.wheel(0, 2200);
  }
  await run.page.waitForTimeout(50);
  const shot = await run.page.screenshot();
  const model = await run.page.evaluate(() => ({
    detailOpen: document.querySelector("#stage").classList.contains("on"),
    track: getComputedStyle(document.querySelector(".trk")).transform,
    progress: getComputedStyle(document.querySelector(".pg i")).transform,
    detail: [".dn", "h2", ".dr", "p", ".dd"].map(selector =>
      document.querySelector(`.dt ${selector}`).textContent.trim()),
    cards: [...document.querySelectorAll(".t")].map(card => [
      card.getBoundingClientRect().toJSON(), card.dataset.bg, card.dataset.ink,
      card.querySelector("b").textContent, card.querySelector(".r").textContent,
    ]),
  }));
  assert.deepEqual(run.errors, []);
  await run.context.close();
  return { shot, model };
}

for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
  const actions = viewport.width === 1600 ? ["initial", "hover", "detail", "last"] : ["initial", "detail"];
  for (const action of actions) {
    const baseline = await reducedShot("baseline", viewport, action);
    const candidate = await reducedShot("candidate", viewport, action);
    assert.deepEqual(candidate.model, baseline.model);
    assert.equal(hash(candidate.shot), hash(baseline.shot));
    results.push(`pixel/model exact: ${viewport.width}x${viewport.height} ${action}`);
  }
}

const normal = await open("candidate");
await normal.page.locator(".t").nth(2).hover();
await normal.page.evaluate(() => RainPaths.renderAt(2000));
assert.deepEqual(await normal.page.evaluate(() => RainPaths.getState().progress), [0, 0, 1, 0, 0]);
await normal.page.keyboard.press("ArrowRight");
await normal.page.keyboard.press("ArrowRight");
await normal.page.keyboard.press("ArrowLeft");
assert.equal(await normal.page.evaluate(() => RainPaths.getState().currentIndex), 3);
await normal.page.evaluate(() => RainPaths.reset());
await normal.page.mouse.move(800, 450);
await normal.page.mouse.wheel(0, 1160);
const wheelState = await normal.page.evaluate(() => RainPaths.getState());
assert.ok(wheelState.currentIndex > 0);
assert.equal(wheelState.currentIndex, Math.round(wheelState.targetScroll / 580));
await normal.page.evaluate(() => RainPaths.reset());
await normal.page.locator(".t").nth(0).click();
assert.equal(await normal.page.evaluate(() => RainPaths.getState().detailIndex), 0);
await normal.page.keyboard.press("Escape");
assert.equal(await normal.page.evaluate(() => RainPaths.getState().detailIndex), -1);
await normal.page.locator(".t").nth(1).click();
await normal.page.locator(".x").click();
assert.equal(await normal.page.evaluate(() => RainPaths.getState().detailIndex), -1);
await normal.page.setViewportSize({ width: 1280, height: 720 });
await normal.page.waitForTimeout(50);
assert.equal(await normal.page.evaluate(() => document.querySelectorAll("canvas").length), 1);
assert.deepEqual(normal.errors, []);
results.push("normal shader, rapid keys, wheel, click/Escape/close, reset and resize");

const cachedApi = await normal.page.evaluateHandle(() => RainPaths);
await normal.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
const disposedState = await normal.page.evaluate(api => api.getState(), cachedApi);
await normal.page.evaluate(api => { api.selectIndex(4); api.openDetail(4); api.reset(); api.renderAt(5000); }, cachedApi);
assert.equal(disposedState.ready, false);
assert.equal(disposedState.disposed, true);
assert.deepEqual(await normal.page.evaluate(api => api.getState(), cachedApi), disposedState);
await normal.page.reload({ waitUntil: "networkidle" });
await normal.page.waitForFunction(() => RainPaths.getState().ready);
assert.equal(await normal.page.evaluate(() => document.querySelectorAll("canvas").length), 1);
await normal.context.close();
results.push("pagehide makes cached API inert; reload owns one canvas");

const touch = await open("candidate", { touch: true });
const cdp = await touch.context.newCDPSession(touch.page);
const point = x => ({ x, y: 450, radiusX: 4, radiusY: 4, force: 1, id: 17 });
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1000)] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(700)] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
assert.equal(await touch.page.evaluate(() => RainPaths.getState().currentIndex), 1);
assert.deepEqual(touch.errors, []);
await touch.context.close();
results.push("real touch swipe advances exactly one surface");

const countersHook = `window.__released={texture:0,material:0,geometry:0,renderer:0,context:0};
for(const [type,proto] of [["texture",THREE.Texture.prototype],["material",THREE.Material.prototype],["geometry",THREE.BufferGeometry.prototype]]){const original=proto.dispose;proto.dispose=function(){window.__released[type]++;return original.call(this)}}
const OriginalRenderer=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...args){const renderer=new OriginalRenderer(...args);for(const [type,name] of [["renderer","dispose"],["context","forceContextLoss"]]){const original=renderer[name];renderer[name]=function(){window.__released[type]++;return original.call(this)}}return renderer};THREE.WebGLRenderer.prototype=OriginalRenderer.prototype;`;
const owned = await open("candidate", { hook: countersHook });
await owned.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
assert.deepEqual(await owned.page.evaluate(() => window.__released), { texture: 10, material: 5, geometry: 1, renderer: 1, context: 1 });
await owned.context.close();
results.push("pagehide releases all owned WebGL resources exactly once");

const failedTextureHook = `${countersHook}
const originalLoad=THREE.TextureLoader.prototype.load;let loadCount=0;
THREE.TextureLoader.prototype.load=function(url,onLoad,onProgress,onError){loadCount++;if(loadCount===3){const texture=new THREE.Texture();setTimeout(()=>onError?.(new Error("forced texture failure")),0);return texture}return originalLoad.call(this,url,onLoad,onProgress,onError)};`;
const fallback = await open("candidate", { hook: failedTextureHook });
await fallback.page.waitForTimeout(100);
assert.equal(await fallback.page.evaluate(() => RainPaths.getState().fallback), true);
assert.equal(await fallback.page.evaluate(() => window.__released.texture), 10);
assert.equal(await fallback.page.evaluate(() => [...document.querySelectorAll(".t img")].every(image => getComputedStyle(image).visibility !== "hidden")), true);
assert.deepEqual(fallback.errors, []);
await fallback.context.close();
results.push("partial texture failure disposes all ten textures and preserves SVG fallback");

console.log(JSON.stringify({ passed: true, results }, null, 2));
await browser.close();
