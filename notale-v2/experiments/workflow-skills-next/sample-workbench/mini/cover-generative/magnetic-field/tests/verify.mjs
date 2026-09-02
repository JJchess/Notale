import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43141/";
const url = new URL("_mini/cover-generative/magnetic-field/candidate/pages/", base).href;
const sample = new URL("../", import.meta.url);
const shots = new URL("../shots/", import.meta.url);
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
const checks = [];
const failures = [];
const runtime = { console: [], page: [], failed: [], http: [], external: [] };
const check = (condition, name, detail) => {
  checks.push({ name, status: condition ? "pass" : "fail", detail });
  if (!condition) failures.push(name);
};

function track(page, label, allowFailure = false) {
  page.on("console", message => {
    const expected = allowFailure && message.text().includes("Failed to load resource");
    if (message.type() === "error" && !expected) runtime.console.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", error => runtime.page.push(`${label}: ${error.message}`));
  page.on("requestfailed", request => {
    if (!allowFailure) runtime.failed.push(`${label}: ${request.url()}`);
  });
  page.on("response", response => {
    if (response.status() >= 400) runtime.http.push(`${label}: ${response.status()} ${response.url()}`);
  });
  page.on("request", request => {
    const host = new URL(request.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") runtime.external.push(request.url());
  });
}

async function ready(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#field").width > 0 ||
    document.querySelector("#stage").classList.contains("field-fallback"));
}

const hashCanvas = async page => {
  const data = await page.locator("#field").evaluate(canvas => canvas.toDataURL());
  return createHash("sha256").update(data).digest("hex");
};

const state = page => page.evaluate(() => {
  const stage = document.querySelector("#stage").getBoundingClientRect();
  const magnet = document.querySelector(".dipole").getBoundingClientRect();
  const canvas = document.querySelector("#field");
  const fallback = document.querySelector(".fallback-copy");
  return {
    stage: stage.toJSON(),
    magnet: magnet.toJSON(),
    canvas: [canvas.width, canvas.height],
    fallback: getComputedStyle(fallback).display !== "none",
    fallbackText: fallback.textContent.trim(),
    title: document.querySelector("h1").textContent,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
  };
});

const virtualContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await virtualContext.addInitScript(() => {
  const callbacks = new Map();
  let identifier = 0;
  window.requestAnimationFrame = callback => {
    callbacks.set(++identifier, callback);
    return identifier;
  };
  window.cancelAnimationFrame = id => callbacks.delete(id);
  window.stepAnimation = time => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(time));
  };
});
const criticalPage = await virtualContext.newPage();
track(criticalPage, "critical");
await ready(criticalPage);
let current = await state(criticalPage);
check(current.stage.width === 1600 && current.stage.height === 900 &&
  current.scroll.join() === "1600,900", "layout-1600x900");
check(Math.round(current.magnet.x) === 982 && Math.round(current.magnet.y) === 412 &&
  Math.round(current.magnet.width) === 324, "dipole-geometry");
check(current.title === "磁场" && !current.fallback, "semantic-cover-content");

const fieldMetrics = await criticalPage.locator("#field").evaluate(canvas => {
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let visibleFieldSamples = 0;
  let titleFieldLeaks = 0;
  for (let y = 40; y < 860; y += 4) {
    for (let x = 40; x < 1560; x += 4) {
      const offset = (y * canvas.width + x) * 4;
      const differs = pixels[offset] !== 16 || pixels[offset + 1] !== 17 || pixels[offset + 2] !== 15;
      if (x > 700 && differs) visibleFieldSamples += 1;
      const titleDistance = Math.hypot((x - 382) / 356, (y - 431) / 342);
      if (titleDistance < 1 && differs) titleFieldLeaks += 1;
    }
  }
  return { visibleFieldSamples, titleFieldLeaks };
});
check(fieldMetrics.visibleFieldSamples > 800, "complete-streamline-field", JSON.stringify(fieldMetrics));
check(fieldMetrics.titleFieldLeaks === 0, "title-exclusion-field", JSON.stringify(fieldMetrics));

const frame0 = await hashCanvas(criticalPage);
await criticalPage.screenshot({ path: new URL("frame-0000.png", shots).pathname });
await criticalPage.evaluate(() => window.stepAnimation(100));
await criticalPage.evaluate(() => window.stepAnimation(1100));
const frame1000 = await hashCanvas(criticalPage);
await criticalPage.screenshot({ path: new URL("frame-1000.png", shots).pathname });
await criticalPage.evaluate(() => window.stepAnimation(5300));
const frame5200 = await hashCanvas(criticalPage);
await criticalPage.screenshot({ path: new URL("frame-5200.png", shots).pathname });
check(new Set([frame0, frame1000, frame5200]).size === 3,
  "critical-frames-0-1000-5200", `${frame0.slice(0, 8)} ${frame1000.slice(0, 8)} ${frame5200.slice(0, 8)}`);

await criticalPage.keyboard.press("R");
const resetOne = await hashCanvas(criticalPage);
await criticalPage.keyboard.press("R");
const resetTwo = await hashCanvas(criticalPage);
check(resetOne === frame0 && resetTwo === frame0, "r-rebuilds-same-seed-twice");

await criticalPage.evaluate(() => window.stepAnimation(100));
await criticalPage.evaluate(() => window.stepAnimation(1100));
const beforeDispose = await hashCanvas(criticalPage);
await criticalPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await criticalPage.evaluate(() => window.stepAnimation(5300));
await criticalPage.keyboard.press("R");
const afterDispose = await hashCanvas(criticalPage);
check(afterDispose === beforeDispose, "pagehide-stops-loop-and-input");
await criticalPage.reload({ waitUntil: "networkidle" });
check(await hashCanvas(criticalPage) === frame0, "reload-restores-deterministic-model");
await criticalPage.close();
await virtualContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  reducedMotion: "reduce"
});
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await ready(reducedPage);
const reducedHash = await hashCanvas(reducedPage);
check(reducedHash === frame5200, "reduced-motion-is-5200ms-frame");
await reducedPage.setViewportSize({ width: 1280, height: 720 });
await reducedPage.waitForTimeout(100);
current = await state(reducedPage);
check(current.stage.width === 1280 && current.stage.height === 720 &&
  current.scroll.join() === "1280,720", "layout-1280x720");
check(await hashCanvas(reducedPage) === reducedHash, "deterministic-active-resize");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reducedContext.close();

async function verifyFallback(label, prepare) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await prepare(context);
  const page = await context.newPage();
  track(page, label, true);
  await ready(page);
  const fallbackState = await state(page);
  check(fallbackState.fallback && fallbackState.fallbackText.includes("N 极") &&
    fallbackState.title === "磁场", `${label}-semantic-static-fallback`);
  await context.close();
}

await verifyFallback("seed-failure", context =>
  context.route("**/seedrandom.min.js", route => route.abort()));
await verifyFallback("canvas-failure", context => context.addInitScript(() => {
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...argumentsList) {
    if (this.id === "field") return null;
    return nativeContext.apply(this, argumentsList);
  };
}));

const authorPaths = [
  "candidate/pages/index.html",
  "candidate/pages/assets/style.css",
  "candidate/pages/assets/app.js"
];
let miniChars = 0;
const authorFiles = [];
for (const path of authorPaths) {
  const text = await readFile(new URL(path, sample), "utf8");
  const chars = [...text].length;
  miniChars += chars;
  authorFiles.push({ path, chars, sha256: createHash("sha256").update(text).digest("hex") });
}
check(miniChars < 10000, "author-layer-under-10000", `${miniChars} Unicode characters`);
check(runtime.console.length === 0 && runtime.page.length === 0, "zero-runtime-errors");
check(runtime.failed.length === 0 && runtime.http.length === 0, "zero-unexpected-request-errors");
check(runtime.external.length === 0, "zero-external-requests");

const result = {
  status: failures.length ? "fail" : "pass",
  url,
  miniChars,
  authorFiles,
  checks,
  failures,
  runtime,
  frames: { frame0, frame1000, frame5200 },
  testedAt: new Date().toISOString()
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
