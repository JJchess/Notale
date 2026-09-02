import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const ROOT = "http://127.0.0.1:43127/";
const URLS = {
  baseline: `${ROOT}cover-composition/grid-to-preview/pages/`,
  candidate: `${ROOT}_improve/cover-composition/grid-to-preview/candidate/pages/`,
};
const shots = new URL("../../shots/", import.meta.url);
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];
const runtime = { console: [], page: [], failed: [], http: [], external: [] };
const fixedStates = {};
const checks = [];
const assert = (condition, message) => {
  checks.push({ message, passed: Boolean(condition) });
  if (!condition) failures.push(message);
};
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function track(page, label) {
  page.on("console", message => {
    if (message.type() === "error") runtime.console.push({ label, text: message.text() });
  });
  page.on("pageerror", error => runtime.page.push({ label, error: error.message }));
  page.on("requestfailed", request => runtime.failed.push({ label, url: request.url(), error: request.failure()?.errorText }));
  page.on("response", response => {
    if (response.status() >= 400) runtime.http.push({ label, url: response.url(), status: response.status() });
  });
  page.on("request", request => {
    const host = new URL(request.url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) runtime.external.push({ label, url: request.url() });
  });
}

async function instrument(context) {
  await context.route("**/assets/gsap.min.js", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const hook = `;window.__timelines=[];const __timeline=gsap.timeline;gsap.timeline=function(...args){const timeline=__timeline.apply(gsap,args);window.__timelines.push(timeline);return timeline};`;
    await route.fulfill({ response, body: source + hook });
  });
}

async function ready(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("body:not(.loading)");
  await page.evaluate(() => document.fonts.ready);
}

const readState = page => page.evaluate(() => ({
  active: window.__cover?.active ?? null,
  fit: getComputedStyle(document.documentElement).getPropertyValue("--fit"),
  body: [
    document.documentElement.scrollWidth,
    document.documentElement.scrollHeight,
    document.body.scrollWidth,
    document.body.scrollHeight,
  ],
  stage: document.querySelector(".stage").getBoundingClientRect().toJSON(),
  objects: [...document.querySelectorAll(".object")].map(node => {
    const css = getComputedStyle(node);
    return {
      rect: node.getBoundingClientRect().toJSON(),
      opacity: css.opacity,
      transform: css.transform,
      pressed: node.getAttribute("aria-pressed"),
    };
  }),
  previews: [...document.querySelectorAll(".preview")].map(node => {
    const css = getComputedStyle(node);
    return {
      className: node.className,
      rect: node.getBoundingClientRect().toJSON(),
      opacity: css.opacity,
      transform: css.transform,
      name: node.querySelector(".preview-name").textContent,
      clip: getComputedStyle(node.querySelector(".masked-preview")).clipPath,
      visible: [...node.querySelectorAll(".preview-image")]
        .filter(image => +getComputedStyle(image).opacity > 0.5)
        .map(image => image.src.split("/").pop()),
    };
  }),
  broken: [...document.images]
    .filter(image => !image.complete || !image.naturalWidth)
    .map(image => image.src.split("/").pop()),
}));

async function setFixedState(page, name) {
  await page.evaluate(stateName => {
    const pauseAll = () => {
      gsap.ticker.sleep();
      window.__timelines.forEach(timeline => timeline.pause());
    };
    if (stateName === "initial") {
      pauseAll();
      return;
    }
    if (stateName === "reduced-open0") {
      window.__cover.open(0);
      pauseAll();
      return;
    }
    if (stateName.startsWith("open0-")) {
      window.__cover.open(0);
      pauseAll();
      window.__timelines[1].pause(+stateName.split("-")[1], true);
      window.__timelines[2]?.pause(0, true);
      return;
    }
    if (stateName === "close0-0.25") {
      window.__cover.open(0);
      pauseAll();
      window.__timelines[1].pause(0.5, true);
      window.__cover.close();
      pauseAll();
      window.__timelines[1].pause(0.25, true);
      return;
    }
    if (stateName === "open3-0.5") {
      window.__cover.open(3);
      pauseAll();
      window.__timelines[0].pause(0.5, true);
      window.__timelines.at(-1)?.pause(0, true);
      return;
    }
    if (stateName === "rapid-cross") {
      window.__cover.open(0);
      pauseAll();
      window.__timelines[1].pause(0.25, true);
      window.__cover.open(3);
      pauseAll();
      window.__timelines[1].pause(0.125, true);
      window.__timelines[0].pause(0.25, true);
      window.__timelines.at(-1)?.pause(0, true);
    }
  }, name);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

async function captureFixed(kind, viewport, stateName, reduced = false) {
  const context = await browser.newContext({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
  await instrument(context);
  const page = await context.newPage();
  track(page, `${kind}-${viewport.width}-${stateName}`);
  await ready(page, URLS[kind]);
  await setFixedState(page, stateName);
  const state = await readState(page);
  const id = `${viewport.width}x${viewport.height}-${stateName}`;
  await page.screenshot({ path: new URL(`${kind}-${id}.png`, shots).pathname });
  fixedStates[kind] ??= {};
  fixedStates[kind][id] = { hash: hash(state), state };
  await context.close();
}

const viewports = [{ width: 1600, height: 900 }, { width: 1280, height: 720 }];
const frames = ["initial", "open0-0", "open0-0.125", "open0-0.25", "open0-0.5", "close0-0.25", "open3-0.5", "rapid-cross"];
for (const viewport of viewports) {
  for (const frame of frames) {
    await captureFixed("baseline", viewport, frame);
    await captureFixed("candidate", viewport, frame);
  }
  await captureFixed("baseline", viewport, "reduced-open0", true);
  await captureFixed("candidate", viewport, "reduced-open0", true);
}

for (const id of Object.keys(fixedStates.baseline)) {
  assert(fixedStates.baseline[id].hash === fixedStates.candidate[id].hash, `fixed DOM/state hash ${id}`);
}

const identity = value => value === "none" || value === "matrix(1, 0, 0, 1, 0, 0)";
async function exercise(kind) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  track(page, `${kind}-behavior`);
  await ready(page, URLS[kind]);
  let state = await readState(page);
  assert(state.objects.length === 8 && !state.broken.length, `${kind}: all products and assets loaded`);
  assert(state.stage.width === 1600 && state.stage.height === 900 && state.body.join() === "1600,900,1600,900", `${kind}: 1600 canvas and no overflow`);
  assert(state.objects.every(({ rect }, index) => Math.round(rect.width) === 307 && Math.round(rect.height) === 344 && Math.round(rect.x) === [66, 453, 840, 1227][index % 4] && Math.round(rect.y) === (index < 4 ? 100 : 524)), `${kind}: source-aligned grid geometry`);

  await page.locator(".object").nth(0).hover({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(70);
  assert((await readState(page)).active === null, `${kind}: 100ms hover intent has not fired at 70ms`);
  await page.waitForTimeout(680);
  state = await readState(page);
  assert(state.active === 0 && +state.previews[1].opacity > 0.99 && state.previews[1].name === "Candle holder", `${kind}: hover opens right preview`);
  await page.mouse.move(800, 20);
  await page.waitForTimeout(650);
  state = await readState(page);
  assert(state.active === null && state.objects.every(item => +item.opacity === 1 && identity(item.transform)), `${kind}: hover exit resets exactly`);

  await page.evaluate(() => window.__cover.open(0));
  await page.waitForTimeout(180);
  await page.evaluate(() => window.__cover.open(3));
  await page.waitForTimeout(650);
  state = await readState(page);
  assert(state.active === 3 && state.previews[0].name === "Wooden sidetable with smoke glass detail", `${kind}: rapid cross-side interruption resolves correctly`);
  await page.evaluate(() => window.__cover.open(2));
  await page.waitForTimeout(650);
  state = await readState(page);
  assert(state.active === 2 && state.previews[0].visible.every(name => name.startsWith("product-3")), `${kind}: same-side replay changes gallery content`);
  await page.evaluate(() => window.__cover.close());
  await page.waitForTimeout(650);

  await page.locator(".object").nth(0).focus();
  await page.waitForTimeout(600);
  assert((await readState(page)).active === 0, `${kind}: keyboard focus opens`);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);
  assert((await readState(page)).active === 1, `${kind}: keyboard traversal switches product`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(650);
  assert((await readState(page)).active === null, `${kind}: Escape resets`);

  await page.evaluate(() => window.__cover.open(4));
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  state = await readState(page);
  assert(state.active === 4 && state.stage.width === 1280 && state.stage.height === 720 && state.body.join() === "1280,720,1280,720", `${kind}: resize while open preserves state and fit`);
  await page.evaluate(() => window.__cover.close());
  await page.waitForTimeout(650);
  assert((await readState(page)).objects.every(item => +item.opacity === 1 && identity(item.transform)), `${kind}: resized reset returns exact grid`);

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => window.__cover.open(6));
  await page.waitForTimeout(650);
  await page.evaluate(() => window.__cover.close());
  await page.waitForTimeout(650);
  await page.evaluate(() => window.__cover.open(6));
  await page.waitForTimeout(650);
  state = await readState(page);
  assert(state.active === 6 && state.previews[0].name === "Orange clock", `${kind}: reset and replay are repeatable`);
  await page.evaluate(() => window.__cover.close());
  await page.waitForTimeout(650);

  await page.evaluate(() => window.__cover.open(0));
  await page.waitForTimeout(150);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(50);
  state = await readState(page);
  assert(state.active === 0 && +state.previews[1].opacity === 1 && state.previews[1].visible.join() === "product-1.webp", `${kind}: live reduced-motion change rebuilds to terminal frame`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(650);
  state = await readState(page);
  assert(state.active === 0 && +state.previews[1].opacity > 0.99, `${kind}: live motion restoration rebuilds active preview`);
  await page.evaluate(() => window.__cover.close());
  await page.waitForTimeout(650);

  const cachedCover = await page.evaluateHandle(() => window.__cover);
  if (kind === "candidate") {
    await page.evaluate(() => window.__cover.open(0));
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  await page.waitForTimeout(30);
  assert(await page.evaluate(() => window.__cover === undefined), `${kind}: pagehide removes API`);
  if (kind === "candidate") {
    await page.evaluate(api => api.open(0), cachedCover);
    state = await readState(page);
    const cachedActive = await page.evaluate(api => api.active, cachedCover);
    assert(cachedActive === null && state.active === null && state.objects.every(item => item.pressed === "false"), `${kind}: cached API is inert and ARIA state is reset after pagehide`);
  }
  await page.locator(".object").nth(0).hover();
  await page.waitForTimeout(180);
  assert((await readState(page)).previews.every(item => +item.opacity === 0), `${kind}: pagehide removes input listeners`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("body:not(.loading)");
  assert(await page.evaluate(() => Boolean(window.__cover) && document.querySelectorAll(".object").length === 8), `${kind}: reload reinitializes once`);
  await page.close();

  const touchContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, hasTouch: true });
  const touch = await touchContext.newPage();
  track(touch, `${kind}-touch`);
  await ready(touch, URLS[kind]);
  let rect = await touch.locator(".object").nth(0).boundingBox();
  await touch.touchscreen.tap(rect.x + 20, rect.y + 20);
  await touch.waitForTimeout(650);
  assert((await readState(touch)).active === 0, `${kind}: touch opens`);
  rect = await touch.locator(".object").nth(3).boundingBox();
  await touch.touchscreen.tap(rect.x + 20, rect.y + 20);
  await touch.waitForTimeout(650);
  assert((await readState(touch)).active === 3, `${kind}: touch switches`);
  rect = await touch.locator(".object").nth(3).boundingBox();
  await touch.touchscreen.tap(rect.x + 20, rect.y + 20);
  await touch.waitForTimeout(650);
  assert((await readState(touch)).active === null, `${kind}: second touch resets`);
  await touchContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: "reduce" });
  const reduced = await reducedContext.newPage();
  track(reduced, `${kind}-reduced`);
  await ready(reduced, URLS[kind]);
  await reduced.evaluate(() => window.__cover.open(0));
  state = await readState(reduced);
  assert(state.active === 0 && +state.previews[1].opacity === 1 && state.previews[1].visible.join() === "product-1.webp", `${kind}: reduced mode has stable terminal frame`);
  await reduced.evaluate(() => window.__cover.close());
  state = await readState(reduced);
  assert(state.active === null && state.objects.every(item => +item.opacity === 1 && identity(item.transform)), `${kind}: reduced reset is immediate`);
  await reducedContext.close();
}

await exercise("baseline");
await exercise("candidate");
assert(runtime.console.length === 0, "zero console errors");
assert(runtime.page.length === 0, "zero page errors");
assert(runtime.failed.length === 0, "zero failed requests");
assert(runtime.http.length === 0, "zero HTTP errors");
assert(runtime.external.length === 0, "zero external requests");

const result = {
  passed: failures.length === 0,
  failures,
  checks,
  runtime,
  fixedStates: Object.fromEntries(Object.entries(fixedStates).map(([kind, states]) => [kind, Object.fromEntries(Object.entries(states).map(([id, record]) => [id, record.hash]))])),
  testedAt: new Date().toISOString(),
};
await writeFile(new URL("verification.json", shots), JSON.stringify(result, null, 2));
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length} checks`);
}
