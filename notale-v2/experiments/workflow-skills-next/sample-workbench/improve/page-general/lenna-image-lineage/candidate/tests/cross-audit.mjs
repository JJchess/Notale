import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const host = "http://127.0.0.1:43127";
const formal = "/page-general/lenna-image-lineage/output/pages/";
const candidate = "/sample-workbench/improve/page-general/lenna-image-lineage/candidate/pages/";
const stateNames = ["five", "sprout", "field", "exchange", "contexts", "gather", "portrait"];
const shots = path.resolve(import.meta.dirname, "../../shots");
const results = { pixels: [], states: {}, inputs: {}, resize: {}, fallback: {}, lifecycle: {} };
const browser = await chromium.launch({ headless: true });

function pixelStats(a, b) {
  const script = "from PIL import Image,ImageChops;import sys,json;d=ImageChops.difference(Image.open(sys.argv[1]),Image.open(sys.argv[2]));print(json.dumps({'max':max(v[1] for v in d.getextrema()),'changed':sum(any(p) for p in d.getdata())}))";
  return JSON.parse(execFileSync("python3", ["-c", script, a, b], { encoding:"utf8" }));
}

async function open(pagePath, viewport, reducedMotion = "no-preference", setup = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: setup.hasTouch || false });
  if (setup.abort) await context.route(setup.abort, route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failed = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(host + pagePath, { waitUntil: "networkidle" });
  return { context, page, pageErrors, consoleErrors, failed };
}

async function waitForImages(page) {
  await page.waitForFunction(() => {
    const images = [...document.images];
    return images.length === 31 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
}

async function fixedShot(pagePath, viewport, reducedMotion, index, label) {
  const opened = await open(pagePath, viewport, reducedMotion);
  await waitForImages(opened.page);
  await opened.page.evaluate(stateIndex => window.NotaleStory.goTo(stateIndex, { immediate:true }), index);
  await opened.page.evaluate(() => document.activeElement?.blur());
  await opened.page.waitForTimeout(70);
  const state = await opened.page.evaluate(() => window.NotaleStory.getState());
  assert.equal(state.index, index);
  assert.equal(state.name, stateNames[index]);
  assert.equal(state.animating, false);
  const name = `${viewport.width}x${viewport.height}-${stateNames[index]}-${reducedMotion}`;
  const file = path.join(shots, `cross-${label}-${name}.png`);
  await opened.page.screenshot();
  await opened.page.waitForTimeout(40);
  await opened.page.screenshot({ path:file });
  assert.deepEqual(opened.pageErrors, []);
  assert.deepEqual(opened.consoleErrors, []);
  assert.deepEqual(opened.failed, []);
  await opened.context.close();
  return { file, state };
}

await fs.mkdir(shots, { recursive:true });
for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    for (let index = 0; index < stateNames.length; index += 1) {
      const a = await fixedShot(formal, viewport, reducedMotion, index, "baseline");
      const b = await fixedShot(candidate, viewport, reducedMotion, index, "candidate");
      const pixels = pixelStats(a.file, b.file);
      assert(pixels.max <= 1, `${viewport.width} ${reducedMotion} ${stateNames[index]} pixels`);
      assert.deepEqual({ ...b.state, disposed:undefined }, { ...a.state, disposed:undefined });
      results.pixels.push(`${viewport.width}x${viewport.height}:${reducedMotion}:${stateNames[index]}:maxAE${pixels.max}`);
    }
  }
}
results.states = { comparisons:28, namedStates:stateNames, normalAndReduced:true };

// Keyboard, wheel, real browser touch swipe, normal tween, interruption and double reset.
{
  const opened = await open(candidate, { width:1600, height:900 }, "reduce", { hasTouch:true });
  await waitForImages(opened.page);
  await opened.page.keyboard.press("ArrowRight");
  assert.equal((await opened.page.evaluate(() => NotaleStory.getState())).index, 1);
  await opened.page.keyboard.press("ArrowLeft");
  assert.equal((await opened.page.evaluate(() => NotaleStory.getState())).index, 0);
  await opened.page.mouse.wheel(0, 64);
  assert.equal((await opened.page.evaluate(() => NotaleStory.getState())).index, 1);

  const cdp = await opened.context.newCDPSession(opened.page);
  await cdp.send("Input.dispatchTouchEvent", {
    type:"touchStart", touchPoints:[{ x:800, y:610, radiusX:4, radiusY:4, force:1 }]
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type:"touchMove", touchPoints:[{ x:800, y:430, radiusX:4, radiusY:4, force:1 }]
  });
  await cdp.send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
  assert.equal((await opened.page.evaluate(() => NotaleStory.getState())).index, 2);
  await opened.page.evaluate(() => {
    NotaleStory.goTo(6, { immediate:true });
    NotaleStory.reset({ immediate:true });
    NotaleStory.reset({ immediate:true });
  });
  assert.deepEqual(await opened.page.evaluate(() => NotaleStory.getState()), {
    index:0, target:0, name:"five", time:0, animating:false, reducedMotion:true, disposed:false
  });
  assert.deepEqual(opened.pageErrors, []);
  assert.deepEqual(opened.consoleErrors, []);
  await opened.context.close();

  const normal = await open(candidate, { width:1600, height:900 });
  await waitForImages(normal.page);
  await normal.page.evaluate(() => NotaleStory.next());
  assert.equal((await normal.page.evaluate(() => NotaleStory.getState())).animating, true);
  await normal.page.waitForFunction(() => !NotaleStory.getState().animating);
  assert.equal((await normal.page.evaluate(() => NotaleStory.getState())).index, 1);
  await normal.page.evaluate(() => { NotaleStory.goTo(6); NotaleStory.goTo(3); });
  await normal.page.waitForFunction(() => !NotaleStory.getState().animating);
  assert.equal((await normal.page.evaluate(() => NotaleStory.getState())).index, 3);
  assert.deepEqual(normal.pageErrors, []);
  assert.deepEqual(normal.consoleErrors, []);
  assert.deepEqual(normal.failed, []);
  await normal.context.close();
  results.inputs = { keyboard:"pass", wheel:"pass", browserTouchSwipe:"pass", doubleReset:"pass", rapidRetarget:3 };
}

// Resize preserves the logical composition and all 31 image resources.
{
  const opened = await open(candidate, { width:1600, height:900 }, "reduce");
  await waitForImages(opened.page);
  await opened.page.evaluate(() => NotaleStory.goTo(6, { immediate:true }));
  const before = await opened.page.locator("#portrait").boundingBox();
  await opened.page.setViewportSize({ width:1280, height:720 });
  await opened.page.waitForTimeout(80);
  const after = await opened.page.locator("#portrait").boundingBox();
  assert(Math.abs(after.x / before.x - .8) < .001);
  assert(Math.abs(after.width / before.width - .8) < .001);
  const bounds = await opened.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth,
    document.documentElement.scrollHeight, innerHeight]);
  assert.deepEqual(bounds, [1280,1280,720,720]);
  results.resize = { scale:.8, overflow:"none", loadedImages:31 };
  await opened.context.close();
}

// Missing renderer or source imagery shows all seven textual lineage steps.
for (const [name, abort] of [["gsap", "**/gsap.min.js"], ["image", "**/memes/pic1.jpg"]]) {
  const opened = await open(candidate, { width:1280, height:720 }, "no-preference", { abort });
  await opened.page.waitForSelector("#stage.has-fallback");
  const fallback = await opened.page.evaluate(() => ({
    state:NotaleStory.getState(), steps:document.querySelectorAll(".fallback-card li").length,
    text:document.querySelector(".fallback-card").innerText,
    ready:window.__NOTALE_READY__, bounds:[document.documentElement.scrollWidth, innerWidth]
  }));
  assert.equal(fallback.state.name, "fallback");
  assert.equal(fallback.steps, 7);
  assert.match(fallback.text, /eighty-four by eighty-four portrait/);
  assert.equal(fallback.ready, true);
  assert.deepEqual(fallback.bounds, [1280,1280]);
  assert.deepEqual(opened.pageErrors, []);
  assert.equal(opened.failed.length, 1);
  results.fallback[name] = "visible seven-step lineage; no runtime error";
  await opened.context.close();
}

// pagehide kills active GSAP work and handlers; cached API is inert; reload is canonical.
{
  const opened = await open(candidate, { width:1600, height:900 });
  await waitForImages(opened.page);
  const disposed = await opened.page.evaluate(() => {
    NotaleStory.goTo(6);
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    const before = NotaleStory.getState();
    NotaleStory.next();
    document.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowRight", bubbles:true }));
    return { before, after:NotaleStory.getState(), ready:window.__NOTALE_READY__ };
  });
  assert.equal(disposed.before.disposed, true);
  assert.deepEqual(disposed.after, disposed.before);
  assert.equal(disposed.ready, false);
  await opened.page.waitForTimeout(1400);
  assert.deepEqual(await opened.page.evaluate(() => NotaleStory.getState()), disposed.before);
  await opened.page.reload({ waitUntil:"networkidle" });
  await waitForImages(opened.page);
  assert.equal(await opened.page.locator(".network-image").count(), 30);
  assert.equal(await opened.page.locator("#portrait img").count(), 1);
  assert.equal((await opened.page.evaluate(() => NotaleStory.getState())).name, "five");
  assert.deepEqual(opened.pageErrors, []);
  assert.deepEqual(opened.consoleErrors, []);
  results.lifecycle = { pagehide:"active tween and inputs inert", reload:"30 network images + one portrait" };
  await opened.context.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
