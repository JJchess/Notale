import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const host = "http://127.0.0.1:43127";
const formal = "/page-general/neuron-to-formula/pages/";
const candidate = "/sample-workbench/improve/page-general/neuron-to-formula/candidate/pages/";
const named = [
  ["bio", 0], ["input", .16], ["weight", .32], ["sum", .49],
  ["bias", .64], ["activation", .79], ["final", 1]
];
const morphs = [["morph-a", .07], ["morph-b", .225], ["morph-c", .405],
  ["morph-d", .565], ["morph-e", .715], ["morph-f", .895]];
const shots = path.resolve(import.meta.dirname, "../../shots");
const results = { pixels: [], canvas: [], model: {}, inputs: {}, resize: {}, fallback: {}, lifecycle: {} };
const browser = await chromium.launch({ headless:true });

function pixelStats(a, b) {
  const script = "from PIL import Image,ImageChops;import sys,json;d=ImageChops.difference(Image.open(sys.argv[1]),Image.open(sys.argv[2]));print(json.dumps({'max':max(v[1] for v in d.getextrema()),'changed':sum(any(p) for p in d.getdata())}))";
  return JSON.parse(execFileSync("python3", ["-c", script, a, b], { encoding:"utf8" }));
}

async function open(pagePath, viewport, reducedMotion = "no-preference", setup = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: setup.hasTouch || false });
  if (setup.noCanvas) {
    await context.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function () { return null; };
    });
  }
  if (setup.abort) await context.route(setup.abort, route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failed = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", request => failed.push(request.url()));
  const query = setup.progress === undefined ? "" : `?t=${setup.progress}`;
  await page.goto(host + pagePath + query, { waitUntil:"networkidle" });
  return { context, page, pageErrors, consoleErrors, failed };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    stateName:document.querySelector("#state-name").textContent,
    stateCopy:document.querySelector("#state-copy").textContent,
    progress:document.querySelector("#progress").value,
    current:[...document.querySelectorAll(".beat")].map(button => button.getAttribute("aria-current")),
    formula:[...document.querySelectorAll("[data-part]")].map(part => ({
      part:part.dataset.part, ready:part.dataset.ready, current:part.dataset.current
    })),
    canvas:document.querySelector("#visual").toDataURL()
  }));
}

async function fixedShot(pagePath, viewport, name, progress, reducedMotion, label) {
  const opened = await open(pagePath, viewport, reducedMotion, { progress });
  await opened.page.waitForFunction(() => document.querySelector("#progress").value !== "");
  await opened.page.evaluate(() => document.activeElement?.blur());
  const model = await snapshot(opened.page);
  const file = path.join(shots, `cross-${label}-${viewport.width}x${viewport.height}-${name}-${reducedMotion}.png`);
  await opened.page.screenshot({ path:file });
  assert.deepEqual(opened.pageErrors, []);
  assert.deepEqual(opened.consoleErrors, []);
  assert.deepEqual(opened.failed, []);
  await opened.context.close();
  return { file, model };
}

await fs.mkdir(shots, { recursive:true });
for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  for (const [name, progress] of named) {
    const a = await fixedShot(formal, viewport, name, progress, "no-preference", "baseline");
    const b = await fixedShot(candidate, viewport, name, progress, "no-preference", "candidate");
    const pixels = pixelStats(a.file, b.file);
    assert(pixels.max <= 8 && pixels.changed <= 100, `${viewport.width} ${name} screenshot`);
    assert.deepEqual(b.model, a.model);
    results.pixels.push(`${viewport.width}x${viewport.height}:${name}:maxAE${pixels.max}`);
    results.canvas.push(`${viewport.width}x${viewport.height}:${name}:`
      + crypto.createHash("sha256").update(a.model.canvas).digest("hex"));
  }
  const a = await fixedShot(formal, viewport, "reduced", undefined, "reduce", "baseline");
  const b = await fixedShot(candidate, viewport, "reduced", undefined, "reduce", "candidate");
  const pixels = pixelStats(a.file, b.file);
  assert(pixels.max <= 8 && pixels.changed <= 100, `${viewport.width} reduced screenshot`);
  assert.deepEqual(b.model, a.model);
  assert.equal(b.model.progress, "100%");
  results.pixels.push(`${viewport.width}x${viewport.height}:reduced:maxAE${pixels.max}`);
}
for (const [name, progress] of morphs) {
  const a = await fixedShot(formal, { width:1600, height:900 }, name, progress, "no-preference", "baseline");
  const b = await fixedShot(candidate, { width:1600, height:900 }, name, progress, "no-preference", "candidate");
  const pixels = pixelStats(a.file, b.file);
  assert(pixels.max <= 8 && pixels.changed <= 100, `${name} screenshot`);
  assert.deepEqual(b.model, a.model);
  results.pixels.push(`1600x900:${name}:maxAE${pixels.max}`);
}
results.model = { namedStates:7, intermediateMorphs:6, reducedFinal:true, formulaReadiness:"deep equal" };

// Direct beats, keys, touch, play/pause/continue, rapid retarget and double reset.
{
  const reduced = await open(candidate, { width:1280, height:720 }, "reduce", { hasTouch:true });
  await reduced.page.keyboard.press("Home");
  assert.equal(await reduced.page.locator("#progress").textContent(), "0%");
  await reduced.page.keyboard.press("ArrowRight");
  assert.equal(await reduced.page.locator("#progress").textContent(), "16%");
  await reduced.page.keyboard.press("End");
  assert.equal(await reduced.page.locator("#progress").textContent(), "100%");
  await reduced.page.keyboard.press("r");
  assert.equal(await reduced.page.locator("#progress").textContent(), "0%");
  await reduced.page.locator('.beat[data-progress="0.32"]').tap();
  assert.equal(await reduced.page.locator("#progress").textContent(), "32%");
  await reduced.page.evaluate(() => document.activeElement?.blur());
  await reduced.page.keyboard.press("Space");
  assert.equal(await reduced.page.locator("#progress").textContent(), "100%");
  await reduced.page.evaluate(() => {
    document.querySelector("#reset").click();
    document.querySelector("#reset").click();
  });
  assert.equal(await reduced.page.locator("#progress").textContent(), "0%");
  assert.equal(await reduced.page.locator("#reset").isDisabled(), true);
  assert.deepEqual(reduced.pageErrors, []);
  assert.deepEqual(reduced.consoleErrors, []);
  await reduced.context.close();

  const normal = await open(candidate, { width:1600, height:900 });
  await normal.page.locator("#play").click();
  await normal.page.waitForTimeout(180);
  await normal.page.locator("#play").click();
  const paused = await normal.page.locator("#progress").textContent();
  assert.equal(await normal.page.locator("#play").innerText(), "继续");
  await normal.page.waitForTimeout(180);
  assert.equal(await normal.page.locator("#progress").textContent(), paused);
  await normal.page.locator("#play").click();
  assert.equal(await normal.page.locator("#play").innerText(), "暂停");
  await normal.page.locator('.beat[data-progress="1"]').click();
  await normal.page.waitForTimeout(80);
  await normal.page.locator('.beat[data-progress="0.32"]').click();
  await normal.page.waitForTimeout(620);
  assert.equal(await normal.page.locator("#progress").textContent(), "32%");
  assert.deepEqual(normal.pageErrors, []);
  assert.deepEqual(normal.consoleErrors, []);
  assert.deepEqual(normal.failed, []);
  await normal.context.close();
  results.inputs = { keyboard:"pass", touchTap:"pass", playPauseContinue:"pass", rapidRetarget:"32%", doubleReset:"pass" };
}

// Resize preserves logical canvas geometry and viewport bounds.
{
  const opened = await open(candidate, { width:1600, height:900 }, "no-preference", { progress:1 });
  const before = await opened.page.locator("#visual").boundingBox();
  const bitmapBefore = await opened.page.locator("#visual").evaluate(canvas => [canvas.width, canvas.height]);
  await opened.page.setViewportSize({ width:1280, height:720 });
  await opened.page.waitForTimeout(80);
  const after = await opened.page.locator("#visual").boundingBox();
  const bitmapAfter = await opened.page.locator("#visual").evaluate(canvas => [canvas.width, canvas.height]);
  assert(Math.abs(after.width / before.width - .8) < .001);
  assert.deepEqual(bitmapBefore, [1464,552]);
  assert.deepEqual(bitmapAfter, [1464,552]);
  assert.deepEqual(await opened.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth,
    document.documentElement.scrollHeight, innerHeight]), [1280,1280,720,720]);
  results.resize = { logicalCanvas:[1464,552], screenScale:.8, overflow:"none" };
  await opened.context.close();
}

// Missing chassis and unavailable Canvas both retain the complete correspondence.
for (const [name, setup] of [["base", { abort:"**/base.js" }], ["canvas", { noCanvas:true }]]) {
  const opened = await open(candidate, { width:1280, height:720 }, "no-preference", setup);
  await opened.page.waitForSelector("#renderer-fallback:visible");
  await opened.page.waitForTimeout(100);
  const fallback = await opened.page.evaluate(() => ({
    renderer:document.querySelector("#stage").dataset.renderer,
    items:document.querySelectorAll("#renderer-fallback li").length,
    text:document.querySelector("#renderer-fallback").innerText,
    formula:[...document.querySelectorAll("[data-part]")].every(part => part.dataset.ready === "true"),
    controls:[...document.querySelectorAll(".beat,.action")].every(button => button.disabled),
    bounds:(() => { const rect = document.querySelector("#stage").getBoundingClientRect(); return [rect.left,rect.right]; })(),
    escaped:[...document.querySelectorAll("#stage *")].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && (rect.left < -.5 || rect.right > innerWidth + .5);
    }).length
  }));
  assert.equal(fallback.renderer, "fallback");
  assert.equal(fallback.items, 6);
  assert.match(fallback.text, /a = σ\(Σ xᵢwᵢ \+ b\)/);
  assert.equal(fallback.formula, true);
  assert.equal(fallback.controls, true);
  assert.deepEqual(fallback.bounds, [0,1280]);
  assert.equal(fallback.escaped, 0);
  assert.deepEqual(opened.pageErrors, []);
  if (name === "base") assert.equal(opened.failed.length, 1);
  results.fallback[name] = "visible six-part correspondence; no runtime error";
  await opened.context.close();
}

// pagehide freezes active playback, removes cached controls, and reloads one canonical renderer.
{
  const opened = await open(candidate, { width:1600, height:900 });
  await opened.page.locator("#play").click();
  await opened.page.waitForTimeout(120);
  const disposedAt = await opened.page.evaluate(() => {
    const cachedFinal = document.querySelector('.beat[data-progress="1"]');
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    cachedFinal.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key:"End" }));
    return document.querySelector("#progress").value;
  });
  await opened.page.waitForTimeout(700);
  assert.equal(await opened.page.locator("#progress").textContent(), disposedAt);
  await opened.page.reload({ waitUntil:"networkidle" });
  assert.equal(await opened.page.locator("#visual").count(), 1);
  assert.equal(await opened.page.locator("#progress").textContent(), "0%");
  assert.equal(await opened.page.locator(".beat").count(), 7);
  assert.deepEqual(opened.pageErrors, []);
  assert.deepEqual(opened.consoleErrors, []);
  results.lifecycle = { pagehide:"playback and cached inputs inert", reload:"one canvas, seven beats, 0%" };
  await opened.context.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
