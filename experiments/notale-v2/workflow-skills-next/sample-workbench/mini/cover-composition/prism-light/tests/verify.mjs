import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43145/";
const url = new URL("_mini/cover-composition/prism-light/candidate/pages/", base).href;
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

const state = page => page.evaluate(() => {
  const stage = document.querySelector("#stage");
  const bounds = stage.getBoundingClientRect();
  const styles = selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return { opacity: Number(style.opacity), transform: style.transform, animation: style.animationName };
  };
  return {
    classes: [...stage.classList],
    bounds: bounds.toJSON(),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    title: document.querySelector("h1").textContent,
    description: document.querySelector("svg desc").textContent,
    prism: styles(".prism"),
    beam: styles(".beam"),
    spectrum: styles(".spectrum"),
    sheen: styles(".sheen")
  };
});

const normalContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const normalPage = await normalContext.newPage();
track(normalPage, "normal");
await normalPage.goto(url, { waitUntil: "networkidle" });
let current = await state(normalPage);
check(current.bounds.width === 1600 && current.bounds.height === 900 &&
  current.scroll.join() === "1600,900", "layout-1600x900");
check(current.title === "解剖一束光" && current.description.includes("连续光谱"),
  "semantic-cover-content");

const visualEvidence = await normalPage.evaluate(() => ({
  spectrumStops: document.querySelectorAll("#spectrum stop").length,
  filters: document.querySelectorAll("svg filter").length,
  prismFaces: document.querySelectorAll(".prism > polygon").length,
  beamLayers: document.querySelectorAll(".beam path").length,
  internalLayers: document.querySelectorAll(".inside path").length,
  fanLayers: document.querySelectorAll(".spectrum polygon").length,
  flares: document.querySelectorAll(".flare").length,
  sheens: document.querySelectorAll(".sheen").length
}));
check(visualEvidence.spectrumStops === 8 && visualEvidence.filters === 4 &&
  visualEvidence.prismFaces === 2 && visualEvidence.beamLayers === 3 &&
  visualEvidence.internalLayers === 3 && visualEvidence.fanLayers === 2 &&
  visualEvidence.flares === 1 && visualEvidence.sheens === 1,
"retained-optical-layer-quality", JSON.stringify(visualEvidence));

await normalPage.waitForFunction(() => document.querySelector("#stage").classList.contains("settled"));
await normalPage.keyboard.press("R");
const timing = await normalPage.evaluate(() => Object.fromEntries(document.getAnimations()
  .filter(animation => animation.animationName !== "sheen-drift")
  .map(animation => [animation.animationName, animation.effect.getTiming()])));
check(timing["prism-settle"]?.delay === 0 && timing["beam-settle"]?.delay === 180 &&
  timing["spectrum-settle"]?.delay === 420 && timing["prism-settle"]?.duration === 1050 &&
  timing["beam-settle"]?.duration === 950 && timing["spectrum-settle"]?.duration === 1150,
"ordered-entry-timing", JSON.stringify(timing));
current = await state(normalPage);
check(current.classes.includes("entering") && current.prism.opacity < 1 &&
  current.beam.opacity < 1 && current.spectrum.opacity < 1, "entry-initial-frame");
await normalPage.screenshot({ path: new URL("entry-early.png", shots).pathname });
await normalPage.waitForTimeout(650);
current = await state(normalPage);
check(current.prism.opacity > current.spectrum.opacity && current.spectrum.opacity > .45,
  "entry-mid-frame", `prism ${current.prism.opacity}; spectrum ${current.spectrum.opacity}`);
await normalPage.screenshot({ path: new URL("entry-mid.png", shots).pathname });
await normalPage.waitForFunction(() => document.querySelector("#stage").classList.contains("settled"));
current = await state(normalPage);
check(current.prism.opacity === 1 && current.beam.opacity === 1 && current.spectrum.opacity === 1 &&
  current.prism.transform === "none" && current.beam.transform === "none" &&
  current.spectrum.transform === "none", "settled-representative-frame");
check(current.sheen.animation === "sheen-drift", "settled-ambient-sheen");
await normalPage.screenshot({ path: new URL("settled-1600.png", shots).pathname });

await normalPage.keyboard.press("R");
check((await state(normalPage)).classes.includes("entering"), "r-replays-entry");
await normalPage.waitForFunction(() => document.querySelector("#stage").classList.contains("settled"));
await normalPage.locator("#stage").focus();
await normalPage.keyboard.press("Enter");
check((await state(normalPage)).classes.includes("entering"), "focused-enter-replays-entry");
await normalPage.waitForFunction(() => document.querySelector("#stage").classList.contains("settled"));

const visibilityStates = await normalPage.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new Event("visibilitychange"));
  const paused = document.querySelector("#stage").classList.contains("paused") &&
    getComputedStyle(document.querySelector(".sheen")).animationPlayState === "paused";
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.dispatchEvent(new Event("visibilitychange"));
  return [paused, !document.querySelector("#stage").classList.contains("paused")];
});
check(visibilityStates.every(Boolean), "visibility-pauses-and-resumes-sheen");

await normalPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await normalPage.keyboard.press("R");
await normalPage.keyboard.press("Enter");
const disposed = await state(normalPage);
check(disposed.classes.includes("settled") && disposed.classes.includes("paused") &&
  disposed.sheen.animation === "sheen-drift", "pagehide-stops-motion-and-removes-controls");
await normalPage.reload({ waitUntil: "networkidle" });
check((await state(normalPage)).classes.includes("entering"), "reload-restores-cover");
await normalContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce"
});
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await reducedPage.goto(url, { waitUntil: "networkidle" });
current = await state(reducedPage);
check(current.bounds.width === 1280 && current.bounds.height === 720 &&
  current.scroll.join() === "1280,720", "layout-1280x720");
check(current.classes.includes("settled") && current.prism.opacity === 1 &&
  current.beam.opacity === 1 && current.spectrum.opacity === 1 &&
  current.sheen.animation === "none", "reduced-motion-settled-still");
await reducedPage.screenshot({ path: new URL("reduced-1280.png", shots).pathname });
await reducedContext.close();

const fallbackContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const fallbackPage = await fallbackContext.newPage();
const fallbackRuntime = [];
fallbackPage.on("pageerror", error => fallbackRuntime.push(error.message));
await fallbackPage.route("**/assets/app.js", route => route.abort());
await fallbackPage.goto(url, { waitUntil: "networkidle" });
current = await state(fallbackPage);
check(!current.classes.includes("entering") && !current.classes.includes("settled") &&
  current.prism.opacity === 1 && current.beam.opacity === 1 && current.spectrum.opacity === 1 &&
  current.prism.transform === "none" && current.sheen.animation === "none" &&
  current.description.includes("玻璃棱镜"), "script-failure-static-svg-fallback");
check(fallbackRuntime.length === 0, "fallback-zero-runtime-errors");
await fallbackPage.screenshot({ path: new URL("fallback-static.png", shots).pathname });
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
  visualEvidence,
  testedAt: new Date().toISOString()
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
