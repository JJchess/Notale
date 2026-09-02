import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43143/";
const url = new URL("_mini/cover-generative/mycelium-growth/candidate/pages/", base).href;
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

function track(page, label) {
  page.on("console", message => {
    if (message.type() === "error") runtime.console.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", error => runtime.page.push(`${label}: ${error.message}`));
  page.on("requestfailed", request => runtime.failed.push(`${label}: ${request.url()}`));
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
  await page.waitForFunction(() => document.querySelector("#growth").width > 0 ||
    document.body.classList.contains("context-fallback"));
}

const hashCanvas = async page => {
  const data = await page.locator("#growth").evaluate(canvas => canvas.toDataURL());
  return createHash("sha256").update(data).digest("hex");
};

const state = page => page.evaluate(() => {
  const stage = document.querySelector("#stage").getBoundingClientRect();
  const canvas = document.querySelector("#growth");
  const fallback = document.querySelector(".fallback-copy");
  return {
    stage: stage.toJSON(),
    canvas: [canvas.width, canvas.height],
    fallback: getComputedStyle(fallback).display !== "none",
    fallbackText: fallback.textContent.trim(),
    fallbackNetwork: getComputedStyle(document.querySelector(".fallback-network")).display,
    title: document.querySelector("h1").textContent,
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
  };
});

const normalContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await normalContext.addInitScript(() => {
  window.capturedGrowthLines = [];
  window.growthStrokeCount = 0;
  const nativeMove = CanvasRenderingContext2D.prototype.moveTo;
  const nativeLine = CanvasRenderingContext2D.prototype.lineTo;
  const nativeStroke = CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
    if (this.canvas.id === "growth") this.growthStart = [x, y];
    return nativeMove.call(this, x, y);
  };
  CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
    if (this.canvas.id === "growth" && this.growthStart) {
      window.capturedGrowthLines.push([...this.growthStart, x, y]);
    }
    return nativeLine.call(this, x, y);
  };
  CanvasRenderingContext2D.prototype.stroke = function (...argumentsList) {
    if (this.canvas.id === "growth") window.growthStrokeCount += 1;
    return nativeStroke.apply(this, argumentsList);
  };
});
const normalPage = await normalContext.newPage();
track(normalPage, "normal");
await ready(normalPage);
let current = await state(normalPage);
check(current.stage.width === 1600 && current.stage.height === 900 &&
  current.scroll.join() === "1600,900", "layout-1600x900");
check(current.title === "菌丝" && !current.fallback, "semantic-cover-content");

const growthEvidence = await normalPage.evaluate(() => {
  const lines = window.capturedGrowthLines;
  const titleLeaks = lines.filter(line => {
    const [startX, startY, endX, endY] = line;
    const inside = (x, y) => x > 64 && x < 688 && y > 104 && y < 582;
    return inside(startX, startY) || inside(endX, endY);
  }).length;
  const outgoing = new Map();
  for (const [startX, startY] of lines) {
    const key = `${Math.round(startX)},${Math.round(startY)}`;
    outgoing.set(key, (outgoing.get(key) || 0) + 1);
  }
  const branchNodes = [...outgoing.values()].filter(count => count > 1).length;
  const nutrients = [[706, 661], [790, 390], [938, 536], [1065, 224], [1220, 378], [1438, 470]];
  const nutrientVisits = nutrients.filter(([x, y]) => lines.some(line =>
    Math.hypot(line[2] - x, line[3] - y) < 48)).length;

  function growthFrame(fraction) {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    context.fillStyle = "#11140f";
    context.fillRect(0, 0, 1600, 900);
    context.beginPath();
    for (const line of lines.slice(0, Math.floor(lines.length * fraction))) {
      context.moveTo(line[0], line[1]);
      context.lineTo(line[2], line[3]);
    }
    context.strokeStyle = "#c8c5b0";
    context.lineWidth = 1.75;
    context.stroke();
    return canvas.toDataURL();
  }
  return {
    segmentCount: lines.length,
    titleLeaks,
    branchNodes,
    nutrientVisits,
    frames: [.2, .6, 1].map(growthFrame)
  };
});
check(growthEvidence.segmentCount > 1800 && growthEvidence.segmentCount <= 680 * 112,
  "bounded-dense-growth", `${growthEvidence.segmentCount} segments`);
check(growthEvidence.titleLeaks === 0, "title-exclusion", `${growthEvidence.titleLeaks} leaks`);
check(growthEvidence.branchNodes > 12, "energy-threshold-branching", `${growthEvidence.branchNodes} branch nodes`);
check(growthEvidence.nutrientVisits >= 5, "nutrient-directed-growth",
  `${growthEvidence.nutrientVisits} of 6 sources reached`);
const growthHashes = growthEvidence.frames.map(frame => createHash("sha256").update(frame).digest("hex"));
check(new Set(growthHashes).size === 3, "critical-early-mid-full-growth-frames",
  growthHashes.map(hash => hash.slice(0, 8)).join(" "));

const initialHash = await hashCanvas(normalPage);
const strokesBeforeReset = await normalPage.evaluate(() => window.growthStrokeCount);
await normalPage.keyboard.press("R");
const resetOne = await hashCanvas(normalPage);
await normalPage.keyboard.press("R");
const resetTwo = await hashCanvas(normalPage);
const strokesAfterReset = await normalPage.evaluate(() => window.growthStrokeCount);
check(resetOne === initialHash && resetTwo === initialHash && strokesAfterReset > strokesBeforeReset,
  "r-rebuilds-same-seed-twice");
await normalPage.screenshot({ path: new URL("normal-1600.png", shots).pathname });

await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
const enlarged = await state(normalPage);
check(enlarged.canvas[0] === 2000 && enlarged.canvas[1] === 1125, "active-resize-redraws-canvas");
await normalPage.setViewportSize({ width: 1600, height: 900 });
await normalPage.waitForTimeout(100);
check(await hashCanvas(normalPage) === initialHash, "resize-return-is-deterministic");

const strokesBeforeDispose = await normalPage.evaluate(() => window.growthStrokeCount);
await normalPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await normalPage.keyboard.press("R");
await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
check(await normalPage.evaluate(() => window.growthStrokeCount) === strokesBeforeDispose,
  "pagehide-removes-reset-and-resize-listeners");
await normalPage.reload({ waitUntil: "networkidle" });
check((await state(normalPage)).title === "菌丝", "reload-restores-cover");
await normalContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce"
});
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await ready(reducedPage);
current = await state(reducedPage);
check(current.stage.width === 1280 && current.stage.height === 720 &&
  current.scroll.join() === "1280,720", "layout-1280x720");
check(await hashCanvas(reducedPage) === initialHash, "reduced-motion-same-representative-still");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reducedContext.close();

const fallbackContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await fallbackContext.addInitScript(() => {
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...argumentsList) {
    if (this.id === "growth") return null;
    return nativeContext.apply(this, argumentsList);
  };
});
const fallbackPage = await fallbackContext.newPage();
track(fallbackPage, "fallback");
await ready(fallbackPage);
current = await state(fallbackPage);
check(current.fallback && current.fallbackNetwork === "block" &&
  current.fallbackText.includes("养分") && current.title === "菌丝",
"context-failure-preserves-2d-relationship");
await fallbackContext.close();

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
check(runtime.failed.length === 0 && runtime.http.length === 0, "zero-request-errors");
check(runtime.external.length === 0, "zero-external-requests");

const result = {
  status: failures.length ? "fail" : "pass",
  url,
  miniChars,
  authorFiles,
  checks,
  failures,
  runtime,
  growth: {
    segmentCount: growthEvidence.segmentCount,
    branchNodes: growthEvidence.branchNodes,
    nutrientVisits: growthEvidence.nutrientVisits,
    frameHashes: growthHashes
  },
  testedAt: new Date().toISOString()
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
