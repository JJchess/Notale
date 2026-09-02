import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const ROOT = "http://127.0.0.1:43127/";
const urls = {
  baseline: `${ROOT}page-chart/swarm-spectrum/pages/`,
  candidate: `${ROOT}_improve/page-chart/swarm-spectrum/candidate/pages/`,
};
const browser = await chromium.launch({ headless: true });
const results = [];
const sha = value => createHash("sha256").update(value).digest("hex");

async function open(kind, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1600, height: 900 },
    reducedMotion: options.reduced ? "reduce" : "no-preference",
    hasTouch: options.touch ?? false,
  });
  if (options.baseHook) {
    await context.route("**/assets/base.js", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + options.baseHook });
    });
  }
  if (options.abortBase) await context.route("**/assets/base.js", route => route.abort());
  if (options.abortData) await context.route("**/data/simpson.js", route => route.abort());
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("ERR_FAILED")) errors.push(message.text());
  });
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(urls[kind], { waitUntil: "networkidle" });
  if (options.abortBase || options.abortData) {
    await page.waitForSelector("html:not(.js) .fallback");
  } else {
    await page.waitForFunction(() => document.querySelectorAll("#chart .node").length === 101);
    await page.evaluate(() => document.fonts.ready);
  }
  return { context, page, errors, failed };
}

async function state(page) {
  return page.evaluate(() => ({
    viewBox: chart.getAttribute("viewBox"),
    ticks: [...chart.querySelectorAll(".tick")].map(tick => [tick.getAttribute("transform"), tick.textContent]),
    nodes: [...chart.querySelectorAll(".node")].map(node => ({
      name: node.querySelector(".label").textContent,
      transform: node.getAttribute("transform"),
      radius: node.querySelector(".bubble").getAttribute("r"),
      fontSize: node.querySelector(".label").getAttribute("font-size"),
      current: node.hasAttribute("aria-current"),
    })),
    tip: [tip.hidden, tip.querySelector("strong")?.textContent ?? "", tip.textContent.replace(/\s+/g, " ").trim()],
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  }));
}

const nodeByName = (page, name) => page.locator(".node").filter({ has: page.locator(".label", { hasText: name }) });

async function capture(kind, viewport, reduced, action) {
  const run = await open(kind, { viewport, reduced });
  if (action === "focus") await nodeByName(run.page, "stone").focus();
  if (action === "pin") await nodeByName(run.page, "cucumber").click();
  if (action === "reset") {
    await nodeByName(run.page, "cucumber").click();
    await run.page.keyboard.press("Escape");
    await run.page.keyboard.press("Escape");
  }
  const snapshot = await state(run.page);
  const screenshot = await run.page.screenshot();
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.failed, []);
  await run.context.close();
  return { snapshot, screenshot };
}

const fixedStates = [
  [{ width: 1600, height: 900 }, false, "initial"],
  [{ width: 1600, height: 900 }, true, "initial"],
  [{ width: 1600, height: 900 }, false, "focus"],
  [{ width: 1600, height: 900 }, false, "pin"],
  [{ width: 1600, height: 900 }, false, "reset"],
  [{ width: 1280, height: 720 }, false, "initial"],
  [{ width: 1280, height: 720 }, true, "initial"],
];
for (const [viewport, reduced, action] of fixedStates) {
  const baseline = await capture("baseline", viewport, reduced, action);
  const candidate = await capture("candidate", viewport, reduced, action);
  assert.deepEqual(candidate.snapshot, baseline.snapshot);
  assert.equal(sha(candidate.screenshot), sha(baseline.screenshot));
  results.push(`pixel/model exact: ${viewport.width}x${viewport.height} ${reduced ? "reduced" : "normal"} ${action}`);
}

const dataRun = await open("candidate");
const layout = await dataRun.page.evaluate(() => {
  const records = SIMILE_CSV.trim().split(/\r?\n/).slice(1).map((line, order) => {
    const fields = line.split(",");
    return { order, vehicle: fields[0], score: +fields[1], count: +fields[2], adjectives: +fields[3] };
  }).filter(record => record.count >= 200);
  const byName = new Map(records.map(record => [record.vehicle, record]));
  return [...chart.querySelectorAll(".node")].map(node => {
    const match = node.getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/);
    const record = byName.get(node.querySelector(".label").textContent);
    return { ...record, x: +match[1], y: +match[2], r: +node.querySelector(".bubble").getAttribute("r") };
  });
});
assert.equal(layout.length, 101);
assert.deepEqual(layout.map(item => item.count), [...layout].sort((a, b) => b.count - a.count).map(item => item.count));
for (const item of layout) {
  assert.ok(Math.abs(item.x - (54 + 1455 * item.score)) < 1e-9);
  assert.ok(Math.abs(item.r - (8 + 40 * Math.sqrt(item.count / 2880))) < 1e-9);
}
for (let first = 0; first < layout.length; first++) {
  for (let second = first + 1; second < layout.length; second++) {
    const a = layout[first], b = layout[second];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1e-5 >= a.r + b.r + 3);
  }
}
const layoutSignature = layout.map(item => [item.vehicle, `translate(${item.x} ${item.y})`, String(item.r)]);
const layoutHash = sha(Buffer.from(JSON.stringify(layoutSignature)));
assert.equal(layoutHash, sha(Buffer.from(JSON.stringify(await dataRun.page.reload({ waitUntil: "networkidle" }).then(async () => {
  await dataRun.page.waitForFunction(() => document.querySelectorAll("#chart .node").length === 101);
  return dataRun.page.evaluate(() => [...chart.querySelectorAll(".node")].map(node => [node.querySelector(".label").textContent, node.getAttribute("transform"), node.querySelector(".bubble").getAttribute("r")]));
})))));
assert.deepEqual(dataRun.errors, []);
await dataRun.context.close();
results.push(`101 CSV records, sqrt radii and runtime dodge verified ${layoutHash}`);

const input = await open("candidate");
await nodeByName(input.page, "stone").hover();
assert.equal(await input.page.locator("#tip strong").textContent(), "stone");
await input.page.mouse.move(20, 20);
assert.equal(await input.page.locator("#tip").isHidden(), true);
const cucumber = nodeByName(input.page, "cucumber");
const hell = nodeByName(input.page, "hell");
await cucumber.focus();
await input.page.keyboard.press("Enter");
await hell.focus();
assert.equal(await input.page.locator("#tip strong").textContent(), "cucumber");
assert.equal(await cucumber.getAttribute("aria-current"), "");
assert.equal(await hell.getAttribute("aria-current"), null);
await input.page.keyboard.press("Enter");
assert.equal(await input.page.locator("#tip strong").textContent(), "hell");
assert.equal(await hell.getAttribute("aria-current"), "");
await input.page.keyboard.press("Space");
assert.equal(await input.page.locator("#tip").isHidden(), true);
await input.page.keyboard.press("Escape");
await input.page.keyboard.press("Escape");
assert.equal((await state(input.page)).nodes.some(node => node.current), false);
assert.deepEqual(input.errors, []);
await input.context.close();
results.push("mouse, keyboard pin transfer, rapid toggle and double reset");

const touch = await open("candidate", { touch: true });
const target = nodeByName(touch.page, "cucumber");
const box = await target.boundingBox();
await touch.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
assert.equal(await touch.page.locator("#tip strong").textContent(), "cucumber");
assert.equal(await target.getAttribute("aria-current"), "");
await touch.context.close();
results.push("real touch pins canonical evidence");

for (const failure of ["abortData", "abortBase"]) {
  const run = await open("candidate", { [failure]: true });
  const text = await run.page.locator(".fallback").innerText();
  assert.match(text, /0%/);
  assert.match(text, /100%/);
  assert.match(text, /2,880/);
  assert.match(text, /4\.23%/);
  assert.match(text, /92\.45%/);
  assert.match(text, /Seventy-five of 101/);
  assert.equal(run.failed.length, 1);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}
results.push("data-wrapper and chassis-script failures retain core textual evidence");

const lifecycleHook = `;window.__owners={resizes:0,loops:0};
{const original=Deck.onResize;Deck.onResize=function(...args){window.__owners.resizes++;const stop=original(...args);let live=true;return()=>{if(live){live=false;window.__owners.resizes--}stop()}}}
{const original=Deck.loop;Deck.loop=function(...args){window.__owners.loops++;return original(...args)}}`;
const lifecycle = await open("candidate", { baseHook: lifecycleHook });
await nodeByName(lifecycle.page, "cucumber").click();
assert.deepEqual(await lifecycle.page.evaluate(() => window.__owners), { resizes: 1, loops: 0 });
await lifecycle.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
assert.deepEqual(await lifecycle.page.evaluate(() => window.__owners), { resizes: 0, loops: 0 });
assert.equal(await lifecycle.page.locator("#tip").isHidden(), true);
await nodeByName(lifecycle.page, "hell").focus();
await lifecycle.page.keyboard.press("Enter");
await nodeByName(lifecycle.page, "hell").click();
assert.equal(await lifecycle.page.locator("#tip").isHidden(), true);
await lifecycle.page.setViewportSize({ width: 1280, height: 720 });
await lifecycle.page.reload({ waitUntil: "networkidle" });
await lifecycle.page.waitForFunction(() => document.querySelectorAll("#chart .node").length === 101);
assert.equal(await lifecycle.page.locator("#chart").count(), 1);
assert.equal(await lifecycle.page.locator(".node").count(), 101);
assert.deepEqual(lifecycle.errors, []);
await lifecycle.context.close();
results.push("no RAF owner; pagehide releases resize/listeners; resize and reload are clean");

console.log(JSON.stringify({ passed: true, results }, null, 2));
await browser.close();
