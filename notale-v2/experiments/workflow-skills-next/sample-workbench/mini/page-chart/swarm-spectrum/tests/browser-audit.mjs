import assert from "node:assert/strict";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const ROOT = "http://127.0.0.1:41031/";
const MINI = `${ROOT}_mini/page-chart/swarm-spectrum/candidate/pages/`;
const FULL = `${ROOT}page-chart/swarm-spectrum/pages/`;
const browser = await chromium.launch({ headless:true });
const results = [];

async function open(url = MINI, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  if (options.abortData) await context.route("**/data/simpson.js", route => route.abort());
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => failed.push(request.url()));
  await page.goto(url, { waitUntil:"networkidle" });
  if (options.abortData) await page.waitForSelector("html:not(.js) .fallback");
  else await page.waitForFunction(() => document.querySelectorAll("#chart .node").length === 101);
  return { context, page, errors, failed };
}

function namedNode(page, name) {
  return page.locator(".node").filter({ has:page.locator(".label", { hasText:name }) });
}

async function geometry(page) {
  return page.evaluate(() => [...document.querySelectorAll(".node")].map(node => ({
    name:node.querySelector(".label").textContent,
    transform:node.getAttribute("transform"),
    radius:node.querySelector(".bubble").getAttribute("r"),
    fontSize:node.querySelector(".label").getAttribute("font-size")
  })));
}

const full = await open(FULL);
const mini = await open();
assert.deepEqual(await geometry(mini.page), await geometry(full.page));
assert.deepEqual(mini.errors, []);
assert.deepEqual(mini.failed, []);
await full.context.close();
results.push("all 101 full/mini marks have identical transforms, radii and label sizes");

const encoded = await mini.page.evaluate(() => {
  const source = SIMILE_CSV.trim().split(/\r?\n/).slice(1).map(line => {
    const fields = line.split(",");
    return { name:fields[0], score:+fields[1], count:+fields[2] };
  }).filter(record => record.count >= 200);
  const byName = new Map(source.map(record => [record.name, record]));
  return [...document.querySelectorAll(".node")].map(node => {
    const match = node.getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/);
    return {
      ...byName.get(node.querySelector(".label").textContent),
      x:+match[1], y:+match[2], radius:+node.querySelector(".bubble").getAttribute("r")
    };
  });
});
assert.equal(encoded.length, 101);
assert.equal(new Set(encoded.map(record => record.name)).size, 101);
for (const record of encoded) {
  assert.ok(Math.abs(record.x - (54 + 1455 * record.score)) < 1e-9);
  assert.ok(Math.abs(record.radius - (8 + 40 * Math.sqrt(record.count / 2880))) < 1e-9);
}
for (let first = 0; first < encoded.length; first += 1) {
  for (let second = first + 1; second < encoded.length; second += 1) {
    const a = encoded[first], b = encoded[second];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1e-5 >= a.radius + b.radius + 3);
  }
}
results.push("source count, stable labels, x/r encoding and 3px tangent separation verified");

await namedNode(mini.page, "hell").hover();
assert.match(await mini.page.locator("#tip").innerText(), /hell[\s\S]*4\.23%[\s\S]*679/);
await mini.page.mouse.move(20, 20);
assert.equal(await mini.page.locator("#tip").isHidden(), true);

const cucumber = namedNode(mini.page, "cucumber");
await cucumber.click();
assert.match(await mini.page.locator("#tip").innerText(), /cucumber[\s\S]*92\.45%[\s\S]*310/);
assert.equal(await cucumber.getAttribute("aria-current"), "");
await mini.page.keyboard.press("Escape");
assert.equal(await mini.page.locator("#tip").isHidden(), true);

const hell = namedNode(mini.page, "hell");
await hell.focus();
await mini.page.keyboard.press("Enter");
assert.equal(await hell.getAttribute("aria-current"), "");
await mini.page.keyboard.press("Escape");
await mini.page.keyboard.press("Escape");
assert.equal(await mini.page.locator("[aria-current]").count(), 0);
results.push("pointer and keyboard reach the same low/high focus, pin and reset states");

await mini.page.screenshot({ path:"experiments/workflow-skills-next/sample-workbench/mini/page-chart/swarm-spectrum/shots/1600-normal.png" });
await mini.context.close();

for (const [width, height] of [[1600, 900], [1280, 720]]) {
  for (const reduced of [false, true]) {
    const run = await open(MINI, { viewport:{ width, height }, reduced });
    assert.equal(await run.page.locator(".node").count(), 101);
    assert.equal(await run.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), reduced);
    assert.deepEqual(await run.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [width, height]);
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.failed, []);
    await run.page.screenshot({
      path:`experiments/workflow-skills-next/sample-workbench/mini/page-chart/swarm-spectrum/shots/${width}-${reduced ? "reduced" : "normal"}.png`
    });
    await run.context.close();
  }
}
results.push("1600x900 and 1280x720 normal/reduced renders have 101 marks and no overflow");

const fallback = await open(MINI, { abortData:true });
const fallbackText = await fallback.page.locator(".fallback").innerText();
assert.match(fallbackText, /0%/);
assert.match(fallbackText, /100%/);
assert.match(fallbackText, /4\.23%/);
assert.match(fallbackText, /92\.45%/);
assert.match(fallbackText, /2,880/);
assert.match(fallbackText, /Seventy-five of 101/);
assert.equal(fallback.failed.length, 1);
assert.deepEqual(fallback.errors.filter(message => !message.includes("ERR_FAILED")), []);
await fallback.page.screenshot({ path:"experiments/workflow-skills-next/sample-workbench/mini/page-chart/swarm-spectrum/shots/fallback.png" });
await fallback.context.close();
results.push("data failure preserves units, extrema, maximum count and below-50 conclusion");

const lifecycle = await open();
await namedNode(lifecycle.page, "cucumber").click();
await lifecycle.page.evaluate(() => SwarmMini.dispose());
assert.equal(await lifecycle.page.locator("#tip").isHidden(), true);
await namedNode(lifecycle.page, "hell").click();
assert.equal(await lifecycle.page.locator("#tip").isHidden(), true);
await lifecycle.page.setViewportSize({ width:1280, height:720 });
await lifecycle.page.reload({ waitUntil:"networkidle" });
await lifecycle.page.waitForFunction(() => document.querySelectorAll("#chart .node").length === 101);
assert.equal(await lifecycle.page.locator("#chart").count(), 1);
assert.equal(await lifecycle.page.locator(".node").count(), 101);
assert.deepEqual(lifecycle.errors, []);
assert.deepEqual(lifecycle.failed, []);
await lifecycle.context.close();
results.push("dispose makes author inputs inert; resize and reload restore one clean instance");

console.log(JSON.stringify({ passed:true, results }, null, 2));
await browser.close();
