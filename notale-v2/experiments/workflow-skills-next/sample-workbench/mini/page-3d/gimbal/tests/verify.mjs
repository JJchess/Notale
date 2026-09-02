import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43148/";
const url = new URL("_mini/page-3d/gimbal/candidate/pages/", base).href;
const shots = new URL("../shots/", import.meta.url);
const checks = [];
const failures = [];
const check = (condition, name, detail) => {
  checks.push({ name, status: condition ? "pass" : "fail", detail });
  if (!condition) failures.push(name);
};
const values = page => page.evaluate(() => Object.fromEntries(
  ["spin", "still", "housing", "drift"].map(id =>
    [id, parseFloat(document.getElementById(id).textContent)])));
const phase = page => page.locator("#phase-name").textContent();

const browser = await chromium.launch({ headless: true });
const runtimeErrors = [];
function track(page, label) {
  page.on("pageerror", error => runtimeErrors.push(`${label}: ${error.message}`));
  page.on("response", response => {
    if (response.status() >= 400) runtimeErrors.push(`${label}: ${response.status()} ${response.url()}`);
  });
}
async function captureDisposal(context) {
  await context.addInitScript(() => {
    window.gpuDisposal = { buffers: 0, programs: 0, lost: 0 };
    for (const Constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      if (!Constructor) continue;
      const prototype = Constructor.prototype;
      for (const [method, key] of [["deleteBuffer", "buffers"], ["deleteProgram", "programs"]]) {
        const native = prototype[method];
        prototype[method] = function (...args) {
          gpuDisposal[key]++;
          return native.apply(this, args);
        };
      }
      const nativeExtension = prototype.getExtension;
      prototype.getExtension = function (name) {
        const extension = nativeExtension.call(this, name);
        if (name === "WEBGL_lose_context" && extension && !extension.captureWrapped) {
          const nativeLoss = extension.loseContext.bind(extension);
          extension.loseContext = () => {
            gpuDisposal.lost++;
            return nativeLoss();
          };
          extension.captureWrapped = true;
        }
        return extension;
      };
    }
  });
}

const normal = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await captureDisposal(normal);
const page = await normal.newPage();
track(page, "normal");
await page.goto(url, { waitUntil: "networkidle" });
check(await phase(page) === "建立角动量", "initial-spin-phase");
await page.waitForFunction(() => document.querySelector("#phase-name").textContent === "外壳转动");
check(true, "housing-motion-phase");
await page.waitForFunction(() => document.querySelector("#phase-name").textContent === "施加横向力矩");
check(true, "torque-phase");
await page.screenshot({ path: new URL("torque-1600.png", shots).pathname });
await page.waitForFunction(() => document.querySelector("#phase-name").textContent === "决定性状态");
const finalOne = await values(page);
check(finalOne.spin < 3 && finalOne.still > 30 && finalOne.still > finalOne.spin * 20,
  "high-speed-versus-still-probe", JSON.stringify(finalOne));
check(Math.abs(finalOne.housing - 45) < .2 && finalOne.drift < 3,
  "decisive-housing-and-rotor-state", JSON.stringify(finalOne));
const sceneEvidence = await page.evaluate(() => ({
  canvas: document.querySelectorAll("canvas").length,
  rings: document.querySelector(".legend").textContent,
  rapier: performance.getEntriesByType("resource").some(entry => entry.name.endsWith("rapier.mjs")),
  layout: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
}));
check(sceneEvidence.canvas === 1 && sceneEvidence.rings.includes("X 外环") &&
  sceneEvidence.rings.includes("Z 内环") && sceneEvidence.rapier,
"three-rings-rotor-and-rapier-loaded", JSON.stringify(sceneEvidence));
check(sceneEvidence.layout.join() === "1600,900", "layout-1600x900");
await page.screenshot({ path: new URL("final-1600.png", shots).pathname });

for (let reset = 0; reset < 2; reset++) {
  await page.click("#reset");
  check(await phase(page) === "建立角动量", `reset-${reset + 1}-returns-to-spin`);
  await page.waitForFunction(() => document.querySelector("#phase-name").textContent === "决定性状态");
  const repeated = await values(page);
  check(JSON.stringify(repeated) === JSON.stringify(finalOne),
    `reset-${reset + 1}-deterministic`, JSON.stringify(repeated));
}
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(80);
const resized = await page.evaluate(() => ({
  stage: document.querySelector("#stage").getBoundingClientRect().toJSON(),
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  canvas: [webgl.width, webgl.height]
}));
check(resized.stage.width === 1280 && resized.stage.height === 720 &&
  resized.scroll.join() === "1280,720" && resized.canvas.join() === "1116,652",
"resize-1280x720-and-redraw", JSON.stringify(resized));
await page.setViewportSize({ width: 1600, height: 900 });
await page.waitForTimeout(80);
await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide")));
await page.waitForTimeout(80);
const disposed = await page.evaluate(() => ({
  marker: document.documentElement.dataset.disposed,
  gpu: { ...gpuDisposal },
  phase: document.querySelector("#phase-name").textContent
}));
await page.click("#reset");
await page.waitForTimeout(80);
check(disposed.marker === "true" && disposed.gpu.buffers > 0 &&
  disposed.gpu.programs > 0 && disposed.gpu.lost === 1,
"rapier-three-loop-and-gpu-disposal", JSON.stringify(disposed));
check(await phase(page) === disposed.phase, "disposed-reset-listener-removed");
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#phase-name").textContent === "决定性状态");
check(JSON.stringify(await values(page)) === JSON.stringify(finalOne), "clean-reload-deterministic");
await normal.close();

const reduced = await browser.newContext({
  viewport: { width: 1280, height: 720 }, reducedMotion: "reduce"
});
const reducedPage = await reduced.newPage();
track(reducedPage, "reduced");
await reducedPage.goto(url, { waitUntil: "networkidle" });
const reducedValues = await values(reducedPage);
check(await phase(reducedPage) === "决定性状态" &&
  JSON.stringify(reducedValues) === JSON.stringify(finalOne),
"reduced-motion-terminal-state", JSON.stringify(reducedValues));
await reducedPage.waitForTimeout(200);
check(JSON.stringify(await values(reducedPage)) === JSON.stringify(reducedValues),
  "reduced-motion-has-no-running-loop");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reduced.close();

for (const failure of ["webgl", "rapier"]) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (failure === "webgl") await context.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes("webgl")) return null;
      return native.call(this, type, ...args);
    };
  });
  if (failure === "rapier") await context.route("**/rapier.mjs", route => route.abort());
  const fallbackPage = await context.newPage();
  await fallbackPage.goto(url, { waitUntil: "networkidle" });
  const evidence = await fallbackPage.evaluate(() => ({
    visible: !document.querySelector("#fallback").hidden,
    ellipses: document.querySelectorAll("#fallback ellipse").length,
    rotor: document.querySelectorAll("#fallback circle").length,
    copy: document.querySelector("#fallback p").textContent
  }));
  check(evidence.visible && evidence.ellipses === 3 && evidence.rotor === 1 &&
    evidence.copy.includes("L = Iω"), `${failure}-truthful-svg-fallback`, JSON.stringify(evidence));
  if (failure === "webgl") await fallbackPage.screenshot({
    path: new URL("fallback.png", shots).pathname
  });
  await context.close();
}

const sourceRoot = new URL("../candidate/pages/", import.meta.url);
const authorPaths = ["index.html", "assets/style.css", "assets/app.mjs"];
const authorChars = (await Promise.all(authorPaths.map(path => readFile(new URL(path, sourceRoot), "utf8"))))
  .reduce((sum, source) => sum + [...source].length, 0);
check(authorChars === 9999, "author-layer-exactly-9999");
const appSource = await readFile(new URL("assets/app.mjs", sourceRoot), "utf8");
check(appSource.includes("world.timestep = 1 / 240") &&
  appSource.includes("numSolverIterations = 32") &&
  appSource.includes("applyTorqueImpulse") && appSource.includes("world.free()"),
"fixed-step-rapier-and-world-free-static-proof");
check(runtimeErrors.length === 0, "no-runtime-or-http-errors", runtimeErrors.join(" | "));

await browser.close();
const result = { checks, failures };
await writeFile(new URL("../verification.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
