import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43146/";
const url = new URL("_mini/cover-generative/neural-signal-network/candidate/pages/", base).href;
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

async function installCapture(context) {
  await context.addInitScript(() => {
    window.networkCapture = { frame: 0, strokes: [], fills: [] };
    let start = [0, 0];
    let segments = [];
    let arcs = [];
    const native = {
      clearRect: CanvasRenderingContext2D.prototype.clearRect,
      moveTo: CanvasRenderingContext2D.prototype.moveTo,
      lineTo: CanvasRenderingContext2D.prototype.lineTo,
      arc: CanvasRenderingContext2D.prototype.arc,
      stroke: CanvasRenderingContext2D.prototype.stroke,
      fill: CanvasRenderingContext2D.prototype.fill
    };
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.id === "network") {
        window.networkCapture = { frame: window.networkCapture.frame + 1, strokes: [], fills: [] };
        segments = [];
        arcs = [];
      }
      return native.clearRect.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
      if (this.canvas.id === "network") start = [x, y];
      return native.moveTo.call(this, x, y);
    };
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      if (this.canvas.id === "network") segments.push([...start, x, y]);
      return native.lineTo.call(this, x, y);
    };
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...rest) {
      if (this.canvas.id === "network") arcs.push([x, y, radius]);
      return native.arc.call(this, x, y, radius, ...rest);
    };
    CanvasRenderingContext2D.prototype.stroke = function (...args) {
      if (this.canvas.id === "network") {
        window.networkCapture.strokes.push({ style: this.strokeStyle, width: this.lineWidth, segments });
        segments = [];
      }
      return native.stroke.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fill = function (...args) {
      if (this.canvas.id === "network") {
        window.networkCapture.fills.push({ style: this.fillStyle, arcs });
        arcs = [];
      }
      return native.fill.apply(this, args);
    };
  });
}

const hashCanvas = async page => {
  const data = await page.locator("#network").evaluate(canvas => canvas.toDataURL());
  return createHash("sha256").update(data).digest("hex");
};

const state = page => page.evaluate(() => {
  const stage = document.querySelector("#stage");
  const bounds = stage.getBoundingClientRect();
  return {
    bounds: bounds.toJSON(),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    canvas: [document.querySelector("#network").width, document.querySelector("#network").height],
    title: document.querySelector("h1").textContent,
    description: document.querySelector("#cover-description").textContent,
    dataset: { ...stage.dataset },
    capture: window.networkCapture
  };
});

const normalContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await installCapture(normalContext);
const normalPage = await normalContext.newPage();
track(normalPage, "normal");
await normalPage.goto(url, { waitUntil: "networkidle" });
await normalPage.waitForTimeout(80);
let current = await state(normalPage);
check(current.bounds.width === 1600 && current.bounds.height === 900 &&
  current.scroll.join() === "1600,900", "layout-1600x900");
check(current.title === "神经网络" && current.description.includes("层层连接"),
  "complete-title-frame");

const baseSegments = current.capture.strokes[0].segments;
const baseNodes = current.capture.fills[0].arcs;
const insideTitle = (x, y) => Math.hypot((x - 355) / 475, (y - 470) / 250) < 1;
const titleLeaks = baseNodes.filter(([x, y]) => insideTitle(x, y)).length +
  baseSegments.filter(([x1, y1, x2, y2]) => insideTitle((x1 + x2) / 2, (y1 + y2) / 2)).length;
check(baseNodes.length === 420 && baseSegments.length > 1200,
  "seeded-dense-proximity-graph", `${baseNodes.length} nodes; ${baseSegments.length} edges`);
check(titleLeaks === 0, "title-exclusion-in-topology", `${titleLeaks} node or edge-midpoint leaks`);
const expectedSvgLinks = baseSegments.map(([x1, y1, x2, y2]) =>
  `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`).join("");

const initialHash = await hashCanvas(normalPage);
await normalPage.mouse.click(1180, 470);
await normalPage.waitForTimeout(70);
const injectedHash = await hashCanvas(normalPage);
let capture = (await state(normalPage)).capture;
const injectedLinks = capture.strokes[1].segments.length;
await normalPage.screenshot({ path: new URL("pointer-injected.png", shots).pathname });
await normalPage.waitForTimeout(360);
const propagationHash = await hashCanvas(normalPage);
capture = (await state(normalPage)).capture;
const propagationLinks = capture.strokes[1].segments.length;
await normalPage.waitForTimeout(430);
const representativeHash = await hashCanvas(normalPage);
capture = (await state(normalPage)).capture;
const representativeLinks = capture.strokes[1].segments.length;
check(new Set([initialHash, injectedHash, propagationHash, representativeHash]).size === 4 &&
  injectedLinks > 0 && propagationLinks > injectedLinks && representativeLinks !== propagationLinks,
"runtime-arrival-propagation-frames",
`${injectedLinks} → ${propagationLinks} → ${representativeLinks} active edges`);
check((await normalPage.evaluate(() => document.activeElement.id)) === "stage",
  "pointerdown-injects-and-focuses-stage");

await normalPage.keyboard.press("R");
await normalPage.waitForTimeout(40);
check(await hashCanvas(normalPage) === initialHash, "r-restores-initial-model");
await normalPage.keyboard.press("Enter");
await normalPage.waitForTimeout(80);
check(await hashCanvas(normalPage) !== initialHash, "focused-enter-injects-signal");
await normalPage.keyboard.press("R");
await normalPage.waitForTimeout(40);
const resetOne = await hashCanvas(normalPage);
await normalPage.keyboard.press("R");
await normalPage.waitForTimeout(40);
const resetTwo = await hashCanvas(normalPage);
check(resetOne === initialHash && resetTwo === initialHash, "r-reset-same-seed-twice");

await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
current = await state(normalPage);
check(current.canvas.join() === "2000,1125" &&
  current.capture.strokes[0].segments.length === baseSegments.length,
"fixed-logical-topology-active-resize");
await normalPage.setViewportSize({ width: 1600, height: 900 });
await normalPage.waitForTimeout(100);
check(await hashCanvas(normalPage) === initialHash, "resize-return-is-deterministic");
await normalPage.screenshot({ path: new URL("initial-1600.png", shots).pathname });

const beforeDispose = await hashCanvas(normalPage);
await normalPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await normalPage.mouse.click(1180, 470);
await normalPage.keyboard.press("Enter");
await normalPage.keyboard.press("R");
await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
current = await state(normalPage);
check(await hashCanvas(normalPage) === beforeDispose && current.canvas.join() === "1600,900",
  "pagehide-stops-loop-input-and-resize-work");
await normalPage.reload({ waitUntil: "networkidle" });
await normalPage.mouse.click(1180, 470);
await normalPage.waitForTimeout(80);
check((await state(normalPage)).capture.strokes[1].segments.length > 0, "reload-restores-interaction");
await normalContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce"
});
await installCapture(reducedContext);
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await reducedPage.goto(url, { waitUntil: "networkidle" });
current = await state(reducedPage);
check(current.bounds.width === 1280 && current.bounds.height === 720 &&
  current.scroll.join() === "1280,720", "layout-1280x720");
const reducedHash = await hashCanvas(reducedPage);
check(current.capture.strokes[1].segments.length > 100,
  "reduced-motion-injected-representative-still",
  `${current.capture.strokes[1].segments.length} active edges`);
await reducedPage.mouse.click(1000, 360);
check(await hashCanvas(reducedPage) !== reducedHash, "reduced-pointer-injection-redraws-still");
await reducedPage.keyboard.press("Enter");
check((await state(reducedPage)).capture.strokes[1].segments.length > 0,
  "reduced-keyboard-injection-redraws-still");
await reducedPage.keyboard.press("R");
const reducedResetOne = await hashCanvas(reducedPage);
await reducedPage.keyboard.press("R");
const reducedResetTwo = await hashCanvas(reducedPage);
check(reducedResetOne === reducedHash && reducedResetTwo === reducedHash,
  "reduced-r-reset-same-representative-still");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reducedContext.close();

const seedContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const seedErrors = [];
const seedPage = await seedContext.newPage();
seedPage.on("pageerror", error => seedErrors.push(error.message));
await seedPage.route("**/assets/lib/seedrandom.min.js", route => route.abort());
await seedPage.goto(url, { waitUntil: "networkidle" });
const seedInitial = await hashCanvas(seedPage);
await seedPage.keyboard.press("R");
const seedResetOne = await hashCanvas(seedPage);
await seedPage.keyboard.press("R");
const seedResetTwo = await hashCanvas(seedPage);
current = await state(seedPage);
check(current.dataset.seedFallback === "true" && seedInitial === seedResetOne &&
  seedResetOne === seedResetTwo && seedErrors.length === 0,
"seedrandom-fallback-is-deterministic");
await seedContext.close();

const svgContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await svgContext.addInitScript(() => {
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    if (this.id === "network") return null;
    return nativeContext.apply(this, args);
  };
});
const svgErrors = [];
const svgPage = await svgContext.newPage();
svgPage.on("pageerror", error => svgErrors.push(error.message));
await svgPage.goto(url, { waitUntil: "networkidle" });
const svgEvidence = await svgPage.evaluate(() => ({
  dataset: { ...document.querySelector("#stage").dataset },
  title: document.querySelector("h1").textContent,
  paths: [...document.querySelectorAll(".fallback-network path")].map(path => path.getAttribute("d"))
}));
check(svgEvidence.dataset.rendererFallback === "svg" && svgEvidence.title === "神经网络" &&
  svgEvidence.paths.length === 2 && svgEvidence.paths[0] === expectedSvgLinks &&
  svgEvidence.paths[1].length > 1000 && svgErrors.length === 0,
"canvas-failure-svg-from-same-live-model");
await svgPage.screenshot({ path: new URL("svg-fallback.png", shots).pathname });
await svgContext.close();

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
  graph: { nodes: baseNodes.length, edges: baseSegments.length, titleLeaks },
  propagation: { injectedLinks, propagationLinks, representativeLinks },
  testedAt: new Date().toISOString()
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
