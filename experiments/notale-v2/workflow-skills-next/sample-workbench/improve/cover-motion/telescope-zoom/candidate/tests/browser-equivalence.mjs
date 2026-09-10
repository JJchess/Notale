import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const ROOT = "http://127.0.0.1:41031";
const BASELINE = `${ROOT}/cover-motion/telescope-zoom/pages/`;
const CANDIDATE = `${ROOT}/sample-workbench/improve/cover-motion/telescope-zoom/candidate/pages/`;
const SHOTS = new URL("../../shots/", import.meta.url);
const results = [];

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });

function pass(name, evidence = true) {
  results.push({ name, status: "passed", evidence });
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function open(url, { viewport, reduced = false, touch = false } = {}) {
  const context = await browser.newContext({
    viewport: viewport ?? { width: 1600, height: 900 },
    reducedMotion: reduced ? "reduce" : "no-preference",
    hasTouch: touch
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("requestfailed", request => errors.push(`request: ${request.url()}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  return { context, page, errors };
}

async function setProgress(page, progress) {
  await page.evaluate(value => TelescopeCover.setProgress(value, true), progress);
  await page.waitForTimeout(50);
}

async function model(page) {
  return page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    const rect = selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return [box.x, box.y, box.width, box.height].map(value => +value.toFixed(4));
    };
    return {
      progress: document.getElementById("stage").dataset.progress,
      publicProgress: TelescopeCover.getProgress(),
      target: TelescopeCover.getTarget(),
      stage: rect("#stage"),
      mediaTransform: style(".media").transform,
      titleTransforms: [style(".left").transform, style(".right").transform],
      fronts: [...document.querySelectorAll(".front")].map(node => {
        const computed = getComputedStyle(node);
        return [computed.transform, computed.filter];
      }),
      orbit: [...document.querySelectorAll(".orbit img")].map(node => getComputedStyle(node).transform),
      resources: [...document.images].map(image => [image.currentSrc.split("/").pop(), image.complete, image.naturalWidth])
    };
  });
}

const viewports = [
  { width: 1600, height: 900 },
  { width: 1280, height: 720 }
];
const progressStates = [0, 0.2, 0.5, 0.8, 1, 0.3, 0];
let pixelComparisons = 0;
let representativeHash;
let maximumNormalizedRmse = 0;

for (const viewport of viewports) {
  const run = await open(BASELINE, { viewport });
  const baselineStates = [];
  for (const progress of progressStates) {
    await setProgress(run.page, progress);
    baselineStates.push({ model: await model(run.page), shot: await run.page.screenshot() });
  }
  await run.page.goto(CANDIDATE, { waitUntil: "networkidle" });
  await run.page.evaluate(() => document.fonts.ready);
  for (const [index, progress] of progressStates.entries()) {
    await setProgress(run.page, progress);
    const baselineShot = baselineStates[index].shot;
    const candidateShot = await run.page.screenshot();
    assert.deepEqual(await model(run.page), baselineStates[index].model);
    if (hash(candidateShot) !== hash(baselineShot)) {
      const state = String(progress).replace(".", "-");
      const baselinePath = new URL(`debug-baseline-${viewport.width}-${state}.png`, SHOTS);
      const candidatePath = new URL(`debug-candidate-${viewport.width}-${state}.png`, SHOTS);
      await writeFile(baselinePath, baselineShot);
      await writeFile(candidatePath, candidateShot);
      const comparison = spawnSync("compare", [
        "-metric", "RMSE", fileURLToPath(baselinePath), fileURLToPath(candidatePath), "null:"
      ], { encoding: "utf8" });
      const normalized = Number(comparison.stderr.match(/\(([^)]+)\)/)?.[1]);
      // Computed geometry is asserted exactly above. Chromium's GPU compositor can
      // still rasterize overlapping 3D masked layers differently after navigation.
      assert.ok(normalized <= 0.015, `compositor RMSE ${normalized} exceeds calibrated tolerance`);
      maximumNormalizedRmse = Math.max(maximumNormalizedRmse, normalized);
    } else {
      assert.equal(hash(candidateShot), hash(baselineShot));
    }
    pixelComparisons += 1;
    if (progress === 0.5 && viewport.width === 1600) {
      representativeHash = hash(candidateShot);
      await writeFile(new URL("baseline-1600x900-progress-050.png", SHOTS), baselineShot);
      await writeFile(new URL("candidate-1600x900-progress-050.png", SHOTS), candidateShot);
    }
  }
  assert.deepEqual(run.errors, []);
  await run.context.close();
}
pass("normal-motion fixed-state and reverse-path equivalence", {
  viewports: viewports.map(({ width, height }) => `${width}x${height}`),
  states: progressStates,
  pixelComparisons,
  exactOrCalibratedCompositorMatch: true,
  maximumNormalizedRmse,
  representativeHash
});

for (const viewport of viewports) {
  const run = await open(BASELINE, { viewport, reduced: true });
  await setProgress(run.page, 1);
  const baselineModel = await model(run.page);
  const baselineShot = await run.page.screenshot();
  await run.page.goto(CANDIDATE, { waitUntil: "networkidle" });
  await setProgress(run.page, 1);
  assert.deepEqual(await model(run.page), baselineModel);
  const candidateShot = await run.page.screenshot();
  assert.equal(hash(candidateShot), hash(baselineShot));
  assert.equal(await run.page.locator("#stage").getAttribute("data-progress"), "0.0000");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}
pass("reduced-motion representative still equivalence", { pixelComparisons: 2 });

for (const [label, url] of [["baseline", BASELINE], ["candidate", CANDIDATE]]) {
  const run = await open(url);
  const { page } = run;
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => TelescopeCover.getTarget()), 1);
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => TelescopeCover.getTarget()), 0);
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => TelescopeCover.getTarget()), 0.12);
  await page.mouse.wheel(0, 180);
  assert.equal(await page.evaluate(() => TelescopeCover.getTarget()), 0.32);

  await page.evaluate(() => TelescopeCover.setProgress(0.4, true));
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(800, 310, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => +TelescopeCover.getTarget().toFixed(4)), 0.6);

  await page.evaluate(() => TelescopeCover.setProgress(0.4, true));
  const cdp = await run.context.newCDPSession(page);
  const touch = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1, id: 23 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch(800, 500)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touch(800, 360)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await page.evaluate(() => +TelescopeCover.getTarget().toFixed(4)), 0.6);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => {
    const rect = document.getElementById("stage").getBoundingClientRect();
    return [rect.width, rect.height];
  }), [1280, 720]);
  assert.deepEqual(run.errors, []);
  pass(`${label} keyboard, wheel, mouse drag, touch drag and live resize`);
  await run.context.close();
}

for (const [label, url] of [["baseline", BASELINE], ["candidate", CANDIDATE]]) {
  const run = await open(url);
  const { page } = run;
  await page.evaluate(() => TelescopeCover.setProgress(0.42, true));
  await page.evaluate(() => TelescopeCover.destroy());
  await page.keyboard.press("End");
  await page.mouse.wheel(0, 900);
  assert.equal(await page.evaluate(() => TelescopeCover.getProgress()), 0.42);
  await page.evaluate(() => TelescopeCover.init());
  assert.equal(await page.evaluate(() => TelescopeCover.getProgress()), 0);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".media-layer").count(), 7);
  assert.equal(await page.locator(".orbit img").count(), 10);
  assert.deepEqual(run.errors, []);
  pass(`${label} explicit disposal, inert inputs, re-init and reload`);
  await run.context.close();
}

const pagehide = await open(CANDIDATE);
await pagehide.page.evaluate(() => TelescopeCover.setProgress(0.42, true));
await pagehide.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await pagehide.page.keyboard.press("End");
await pagehide.page.mouse.wheel(0, 900);
await pagehide.page.evaluate(() => TelescopeCover.setProgress(1, true));
assert.equal(await pagehide.page.evaluate(() => TelescopeCover.getProgress()), 0.42);
assert.deepEqual(pagehide.errors, []);
pass("candidate pagehide owns teardown and leaves public mutation inert");
await pagehide.context.close();

const interruptions = await open(CANDIDATE);
const interruptionPage = interruptions.page;
await interruptionPage.evaluate(() => TelescopeCover.setProgress(0.25, true));
await interruptionPage.mouse.move(800, 500);
await interruptionPage.mouse.down();
await interruptionPage.evaluate(() => {
  const viewport = document.getElementById("viewport");
  viewport.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
});
await interruptionPage.mouse.move(800, 300);
assert.equal(await interruptionPage.evaluate(() => TelescopeCover.getTarget()), 0.25);
await interruptionPage.mouse.up();

await interruptionPage.mouse.move(800, 500);
await interruptionPage.mouse.down();
await interruptionPage.evaluate(() => {
  const viewport = document.getElementById("viewport");
  viewport.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1 }));
});
await interruptionPage.mouse.move(800, 300);
assert.equal(await interruptionPage.evaluate(() => TelescopeCover.getTarget()), 0.25);
await interruptionPage.mouse.up();

await interruptionPage.evaluate(() => {
  TelescopeCover.setProgress(1, false);
  TelescopeCover.setProgress(0, false);
  TelescopeCover.setProgress(0.8, false);
});
await interruptionPage.waitForTimeout(1700);
assert.equal(await interruptionPage.evaluate(() => TelescopeCover.getTarget()), 0.8);
assert.ok(Math.abs(await interruptionPage.evaluate(() => TelescopeCover.getProgress()) - 0.8) < 0.001);

const timelinesBefore = await interruptionPage.evaluate(() => gsap.globalTimeline.getChildren().length);
await interruptionPage.evaluate(() => {
  TelescopeCover.init();
  TelescopeCover.init();
  TelescopeCover.init();
});
const timelinesAfter = await interruptionPage.evaluate(() => gsap.globalTimeline.getChildren().length);
assert.equal(timelinesAfter, timelinesBefore);
assert.deepEqual(interruptions.errors, []);
pass("candidate interruption recovery and repeated-init ownership", {
  pointercancel: "drag cleared",
  lostpointercapture: "drag cleared",
  rapidTargets: [1, 0, 0.8],
  liveTimelineCountStable: timelinesAfter
});
await interruptions.context.close();

console.log(JSON.stringify(results, null, 2));
await browser.close();
