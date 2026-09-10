import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43147/";
const url = new URL("_mini/cover-generative/tactile-grid/candidate/pages/", base).href;
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

async function installGpuCapture(context) {
  await context.addInitScript(() => {
    window.gpuCapture = {
      sources: [],
      instances: [],
      textures: [],
      deleted: { buffer: 0, texture: 0, program: 0 },
      lost: 0
    };
    for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Constructor) continue;
      const prototype = Constructor.prototype;
      const wrap = (name, inspect) => {
        const native = prototype[name];
        if (!native) return;
        prototype[name] = function (...args) {
          inspect(args);
          return native.apply(this, args);
        };
      };
      wrap("shaderSource", args => gpuCapture.sources.push(args[1]));
      wrap("drawElementsInstanced", args => gpuCapture.instances.push(args.at(-1)));
      wrap("drawArraysInstanced", args => gpuCapture.instances.push(args.at(-1)));
      for (const name of ["texImage2D", "texSubImage2D"]) {
        wrap(name, args => {
          const data = args.find(value => value instanceof Float32Array && value.length === 4);
          if (data) gpuCapture.textures.push([...data]);
        });
      }
      for (const name of ["deleteBuffer", "deleteTexture", "deleteProgram"]) {
        wrap(name, () => gpuCapture.deleted[name.slice(6).toLowerCase()]++);
      }
      const nativeExtension = prototype.getExtension;
      prototype.getExtension = function (name) {
        const extension = nativeExtension.call(this, name);
        if (name === "WEBGL_lose_context" && extension && !extension.captureWrapped) {
          const nativeLoss = extension.loseContext.bind(extension);
          extension.loseContext = () => {
            gpuCapture.lost++;
            return nativeLoss();
          };
          extension.captureWrapped = true;
        }
        return extension;
      };
    }
  });
}

const hashBuffer = buffer => createHash("sha256").update(buffer).digest("hex");
const canvasHash = async page => hashBuffer(await page.locator("#webgl").screenshot());
const latestWave = page => page.evaluate(() => gpuCapture.textures.at(-1));
const state = page => page.evaluate(() => {
  const bounds = document.querySelector("#stage").getBoundingClientRect();
  const canvas = document.querySelector("#webgl");
  return {
    bounds: bounds.toJSON(),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    canvas: [canvas.width, canvas.height],
    title: document.querySelector("h1").textContent,
    description: document.querySelector("#cover-description").textContent,
    fallback: document.documentElement.classList.contains("webgl-fallback")
  };
});

const normalContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await installGpuCapture(normalContext);
const normalPage = await normalContext.newPage();
track(normalPage, "normal");
await normalPage.goto(url, { waitUntil: "networkidle" });
await normalPage.waitForTimeout(120);
let current = await state(normalPage);
check(current.bounds.width === 1600 && current.bounds.height === 900 &&
  current.scroll.join() === "1600,900" && current.canvas.join() === "1600,900",
"layout-1600x900");
check(current.title === "触觉界面" && current.description.includes("高度与形状") && !current.fallback,
  "complete-title-and-webgl-frame");

const gpuEvidence = await normalPage.evaluate(() => ({
  displacementShaders: gpuCapture.sources.filter(source =>
    source.includes("sampler2D uWaveTexture") && source.includes("transformed.y += vHeight")).length,
  colorShaders: gpuCapture.sources.filter(source =>
    source.includes("mix(uColorBase, uColorHigh") && source.includes("vHeight")).length,
  instanceCount: Math.max(...gpuCapture.instances),
  firstWave: gpuCapture.textures[0]
}));
check(gpuEvidence.instanceCount === 1600 && gpuEvidence.displacementShaders >= 2 &&
  gpuEvidence.colorShaders === 1,
"instanced-data-texture-color-and-depth-shaders", JSON.stringify(gpuEvidence));

const autoEarlyHash = await canvasHash(normalPage);
const firstWave = gpuEvidence.firstWave;
await normalPage.waitForTimeout(520);
const autoWave = await latestWave(normalPage);
const autoLaterHash = await canvasHash(normalPage);
check(firstWave[0] === autoWave[0] && firstWave[1] === autoWave[1] &&
  autoWave[2] > firstWave[2] && autoEarlyHash !== autoLaterHash,
"single-seeded-auto-wave-advances",
`center ${firstWave.slice(0, 2).map(value => value.toFixed(3)).join(", ")}`);
await normalPage.screenshot({ path: new URL("auto-wave-1600.png", shots).pathname });

await normalPage.mouse.click(1160, 520);
await normalPage.waitForTimeout(60);
const pointerWave = await latestWave(normalPage);
check((pointerWave[0] !== firstWave[0] || pointerWave[1] !== firstWave[1]) &&
  pointerWave[2] <= .1 && await normalPage.evaluate(() => document.activeElement.id === "stage"),
"pointerdown-injects-and-focuses");
await normalPage.waitForTimeout(520);
const pointerHash = await canvasHash(normalPage);
check(pointerHash !== autoLaterHash, "pointer-wave-radial-frame-differs");
await normalPage.screenshot({ path: new URL("pointer-wave-1600.png", shots).pathname });

await normalPage.keyboard.press("Enter");
await normalPage.waitForTimeout(60);
const keyboardWave = await latestWave(normalPage);
check(Math.abs(keyboardWave[0]) < .001 && Math.abs(keyboardWave[1]) < .001 &&
  keyboardWave[2] <= .16, "focused-enter-injects-center-wave");

await normalPage.keyboard.press("R");
await normalPage.waitForTimeout(70);
const resetOne = await latestWave(normalPage);
await normalPage.keyboard.press("R");
await normalPage.waitForTimeout(70);
const resetTwo = await latestWave(normalPage);
check(resetOne[0] === firstWave[0] && resetOne[1] === firstWave[1] &&
  resetTwo[0] === firstWave[0] && resetTwo[1] === firstWave[1] &&
  resetOne[2] <= .16 && resetTwo[2] <= .16, "r-reset-same-seed-twice");

await normalPage.setViewportSize({ width: 1280, height: 720 });
await normalPage.waitForTimeout(100);
const compact = await state(normalPage);
check(compact.bounds.width === 1280 && compact.bounds.height === 720 &&
  compact.scroll.join() === "1280,720" && compact.canvas.join() === "1280,720",
"same-page-1600-to-1280-has-no-document-overflow", JSON.stringify(compact));
await normalPage.setViewportSize({ width: 1600, height: 900 });
await normalPage.waitForTimeout(100);

await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
check((await state(normalPage)).canvas.join() === "2000,1125", "dpr-resize-2000x1125");
await normalPage.setViewportSize({ width: 4000, height: 2250 });
await normalPage.waitForTimeout(100);
check((await state(normalPage)).canvas.join() === "3200,1800", "dpr-capped-at-two");
await normalPage.setViewportSize({ width: 1600, height: 900 });
await normalPage.waitForTimeout(100);

await normalPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await normalPage.waitForTimeout(100);
const stoppedUploads = await normalPage.evaluate(() => gpuCapture.textures.length);
await normalPage.mouse.click(1160, 520);
await normalPage.keyboard.press("Enter");
await normalPage.keyboard.press("R");
await normalPage.setViewportSize({ width: 2000, height: 1125 });
await normalPage.waitForTimeout(100);
const afterDispose = await normalPage.evaluate(() => ({
  uploads: gpuCapture.textures.length,
  deleted: { ...gpuCapture.deleted },
  lost: gpuCapture.lost,
  canvas: [document.querySelector("#webgl").width, document.querySelector("#webgl").height]
}));
check(afterDispose.uploads === stoppedUploads && afterDispose.deleted.buffer >= 5 &&
  afterDispose.deleted.texture >= 1 && afterDispose.deleted.program >= 2 &&
  afterDispose.lost === 1 && afterDispose.canvas.join() === "1600,900",
"pagehide-disposes-gpu-loop-input-and-resize", JSON.stringify(afterDispose));
await normalPage.setViewportSize({ width: 1600, height: 900 });
await normalPage.reload({ waitUntil: "networkidle" });
await normalPage.waitForTimeout(100);
check(await normalPage.evaluate(() => Math.max(...gpuCapture.instances)) === 1600,
  "reload-restores-instanced-scene");
await normalContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce"
});
await installGpuCapture(reducedContext);
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await reducedPage.goto(url, { waitUntil: "networkidle" });
await reducedPage.waitForTimeout(80);
current = await state(reducedPage);
const reducedWave = await latestWave(reducedPage);
const reducedHash = await canvasHash(reducedPage);
check(current.bounds.width === 1280 && current.bounds.height === 720 &&
  current.canvas.join() === "1280,720", "layout-1280x720");
check(Math.abs(reducedWave[2] - .82) < .001 &&
  await reducedPage.evaluate(() => gpuCapture.textures.length) <= 3,
"reduced-seeded-representative-still");

await reducedPage.mouse.click(920, 420);
const reducedPointer = await latestWave(reducedPage);
check(Math.abs(reducedPointer[2] - .82) < .001 &&
  (reducedPointer[0] !== reducedWave[0] || reducedPointer[1] !== reducedWave[1]),
"reduced-pointer-wave-is-terminal");
await reducedPage.keyboard.press("Enter");
const reducedKeyboard = await latestWave(reducedPage);
check(reducedKeyboard[0] === 0 && reducedKeyboard[1] === 0 &&
  Math.abs(reducedKeyboard[2] - .82) < .001, "reduced-enter-wave-is-terminal");

await reducedPage.keyboard.press("R");
const reducedResetOne = await canvasHash(reducedPage);
await reducedPage.keyboard.press("R");
const reducedResetTwo = await canvasHash(reducedPage);
check(reducedResetOne === reducedHash && reducedResetTwo === reducedHash,
  "reduced-r-reset-same-still-twice");
await reducedPage.setViewportSize({ width: 4000, height: 2250 });
await reducedPage.waitForTimeout(100);
check((await state(reducedPage)).canvas.join() === "3200,1800", "reduced-resize-redraws-with-dpr-cap");
await reducedPage.setViewportSize({ width: 1280, height: 720 });
await reducedPage.waitForTimeout(100);
check(await canvasHash(reducedPage) === reducedHash, "reduced-resize-return-is-deterministic");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reducedContext.close();

const fallbackContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await fallbackContext.addInitScript(() => {
  const nativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (this.id === "webgl" && String(type).startsWith("webgl")) return null;
    return nativeContext.call(this, type, ...args);
  };
});
const fallbackErrors = [];
const fallbackPage = await fallbackContext.newPage();
fallbackPage.on("pageerror", error => fallbackErrors.push(error.message));
await fallbackPage.goto(url, { waitUntil: "networkidle" });
const fallbackEvidence = await fallbackPage.evaluate(() => {
  const cells = [...document.querySelectorAll("#fallback path")];
  return {
    fallback: document.documentElement.classList.contains("webgl-fallback"),
    cells: cells.length,
    colors: new Set(cells.map(cell => cell.getAttribute("fill"))).size,
    positions: new Set(cells.map(cell => cell.getAttribute("d").split("L")[0])).size,
    title: document.querySelector("h1").textContent
  };
});
check(fallbackEvidence.fallback && fallbackEvidence.cells === 1600 &&
  fallbackEvidence.colors > 30 && fallbackEvidence.positions === 1600 &&
  fallbackEvidence.title === "触觉界面" && fallbackErrors.length === 0,
"webgl-static-copy-preserves-pin-height-color-relation", JSON.stringify(fallbackEvidence));
await fallbackPage.screenshot({ path: new URL("webgl-static-copy.png", shots).pathname });
await fallbackContext.close();

const authorPaths = [
  "candidate/pages/index.html",
  "candidate/pages/assets/style.css",
  "candidate/pages/assets/app.mjs"
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
  gpuEvidence,
  fallbackEvidence,
  disposal: afterDispose,
  testedAt: new Date().toISOString()
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
