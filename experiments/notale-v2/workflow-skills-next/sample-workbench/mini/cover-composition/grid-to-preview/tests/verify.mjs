import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.MINI_BASE_URL || "http://127.0.0.1:43139/";
const url = new URL("_mini/cover-composition/grid-to-preview/candidate/pages/", base).href;
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

function track(page, label, allowFailed = false) {
  page.on("console", message => {
    const expectedFallback = label === "fallback" && message.text().includes("ERR_FAILED");
    if (message.type() === "error" && !expectedFallback) {
      runtime.console.push(`${label}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => runtime.page.push(`${label}: ${error.message}`));
  page.on("requestfailed", request => {
    if (!allowFailed) runtime.failed.push(`${label}: ${request.url()}`);
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
  await page.evaluate(() => document.fonts.ready);
}

const state = page => page.evaluate(() => {
  const identity = value => value === "none" || value === "matrix(1, 0, 0, 1, 0, 0)";
  const stage = document.querySelector(".stage").getBoundingClientRect();
  const objects = [...document.querySelectorAll(".object-grid > li")].map(item => {
    const node = item.firstElementChild;
    const style = getComputedStyle(node);
    return {
      rect: item.getBoundingClientRect().toJSON(),
      opacity: Number(style.opacity),
      transform: style.transform,
      identity: identity(style.transform),
      pressed: node.getAttribute?.("aria-pressed"),
      error: item.hasAttribute("data-error"),
    };
  });
  const previews = [...document.querySelectorAll(".preview")].map(node => {
    const style = getComputedStyle(node);
    const images = [...node.querySelectorAll(".preview-image")];
    return {
      product: Number(node.dataset.product),
      opacity: Number(style.opacity),
      transform: style.transform,
      name: node.querySelector(".preview-name").textContent,
      clipPoints: getComputedStyle(node.querySelector(".masked-preview")).clipPath.split(",").length,
      visible: images.filter(image => Number(getComputedStyle(image).opacity) > .5 && !image.hidden).length,
      animations: images.map(image => getComputedStyle(image).animationName),
      error: node.hasAttribute("data-error"),
    };
  });
  return {
    stage: stage.toJSON(),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    objects,
    previews,
    buttons: document.querySelectorAll("button.object").length,
  };
});

async function exerciseViewport(viewport) {
  const page = await browser.newPage({ viewport });
  track(page, `normal-${viewport.width}`);
  await ready(page);
  let current = await state(page);
  check(current.objects.length === 8 && current.buttons === 2, `eight-grid-two-inputs-${viewport.width}`);
  check(current.stage.width === viewport.width && current.stage.height === viewport.height,
    `fit-${viewport.width}`);
  check(current.scroll.join() === `${viewport.width},${viewport.height}`, `no-overflow-${viewport.width}`);
  if (viewport.width === 1600) {
    const x = [66, 453, 840, 1227];
    check(current.objects.every((item, index) =>
      Math.round(item.rect.width) === 307 && Math.round(item.rect.height) === 344 &&
      Math.round(item.rect.x) === x[index % 4] && Math.round(item.rect.y) === (index < 4 ? 100 : 524)),
    "formal-grid-geometry");
  }

  await page.locator('[data-product="0"].object').hover();
  await page.waitForTimeout(620);
  current = await state(page);
  const right = current.previews.find(preview => preview.product === 0);
  check(right.opacity > .99 && right.clipPoints === 12 && right.visible === 1,
    `right-preview-terminal-${viewport.width}`);
  check(current.objects.filter((_, index) => [2, 3, 6, 7].includes(index))
    .every(item => item.opacity < .01 && !item.identity), `right-card-displacement-${viewport.width}`);
  await page.screenshot({ path: new URL(`right-${viewport.width}.png`, shots).pathname });

  await page.mouse.move(800, 20);
  await page.waitForTimeout(620);
  current = await state(page);
  check(current.previews.every(preview => preview.opacity < .01) &&
    current.objects.every(item => item.opacity === 1 && item.identity), `pointer-reset-${viewport.width}`);

  await page.locator('[data-product="3"].object').focus();
  await page.waitForTimeout(620);
  current = await state(page);
  const left = current.previews.find(preview => preview.product === 3);
  check(left.opacity > .99 && left.name.startsWith("Wooden sidetable"), `left-keyboard-${viewport.width}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(620);
  current = await state(page);
  check(current.previews.every(preview => preview.opacity < .01) &&
    current.objects.every(item => item.pressed !== "true"), `escape-reset-${viewport.width}`);
  await page.close();
}

await exerciseViewport({ width: 1600, height: 900 });
await exerciseViewport({ width: 1280, height: 720 });

const resizePage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
track(resizePage, "resize");
await ready(resizePage);
await resizePage.locator('[data-product="0"].object').hover();
await resizePage.waitForTimeout(620);
await resizePage.setViewportSize({ width: 1280, height: 720 });
await resizePage.waitForTimeout(50);
let current = await state(resizePage);
check(current.stage.width === 1280 && current.previews.find(item => item.product === 0).opacity > .99,
  "active-resize-preserves-preview");
await resizePage.close();

const reducedContext = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  reducedMotion: "reduce",
});
const reducedPage = await reducedContext.newPage();
track(reducedPage, "reduced");
await ready(reducedPage);
await reducedPage.locator('[data-product="0"].object').focus();
current = await state(reducedPage);
const reducedPreview = current.previews.find(item => item.product === 0);
check(reducedPreview.opacity === 1 && reducedPreview.visible === 1 &&
  reducedPreview.animations.every(name => name === "none"), "reduced-terminal-no-gallery-loop");
await reducedPage.keyboard.press("Escape");
current = await state(reducedPage);
check(current.previews.every(item => item.opacity === 0) &&
  current.objects.every(item => item.identity), "reduced-reset-immediate");
await reducedPage.screenshot({ path: new URL("reduced.png", shots).pathname });
await reducedContext.close();

const touchContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, hasTouch: true });
const touchPage = await touchContext.newPage();
track(touchPage, "touch");
await ready(touchPage);
for (const product of [0, 3, 3]) {
  const box = await touchPage.locator(`[data-product="${product}"].object`).boundingBox();
  await touchPage.touchscreen.tap(box.x + 20, box.y + 20);
  await touchPage.waitForTimeout(620);
}
current = await state(touchPage);
check(current.previews.every(item => item.opacity < .01) &&
  current.objects.every(item => item.pressed !== "true"), "touch-open-switch-close");
await touchContext.close();

const fallbackContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await fallbackContext.route("**/product-1-detail-1.webp", route => route.abort());
const fallbackPage = await fallbackContext.newPage();
track(fallbackPage, "fallback", true);
await ready(fallbackPage);
await fallbackPage.locator('[data-product="0"].object').focus();
await fallbackPage.waitForTimeout(620);
current = await state(fallbackPage);
const fallbackPreview = current.previews.find(item => item.product === 0);
check(fallbackPreview.error && fallbackPreview.opacity > .99 && fallbackPreview.visible === 1,
  "failed-detail-keeps-static-base-preview", JSON.stringify(fallbackPreview));
await fallbackContext.close();

const lifecyclePage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
track(lifecyclePage, "lifecycle");
await ready(lifecyclePage);
await lifecyclePage.locator('[data-product="0"].object').focus();
await lifecyclePage.waitForTimeout(100);
await lifecyclePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
await lifecyclePage.locator('[data-product="3"].object').focus();
await lifecyclePage.waitForTimeout(100);
current = await state(lifecyclePage);
check(current.previews.every(item => item.opacity === 0) &&
  current.objects.every(item => item.pressed !== "true"), "pagehide-disposes-and-inputs-inert");
await lifecyclePage.reload({ waitUntil: "networkidle" });
current = await state(lifecyclePage);
check(current.objects.length === 8 && current.previews.length === 2, "reload-restores-one-slice");
await lifecyclePage.close();

const authorPaths = [
  "candidate/pages/index.html",
  "candidate/pages/assets/style.css",
  "candidate/pages/assets/app.js",
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
  testedAt: new Date().toISOString(),
};
await writeFile(new URL("verification.json", sample), JSON.stringify(result, null, 2));
await browser.close();
console.log(`${result.status.toUpperCase()} ${checks.length} checks; ${miniChars} chars`);
if (failures.length) process.exitCode = 1;
