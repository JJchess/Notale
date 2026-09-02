import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(path.dirname(testDir), "candidate/pages");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json" };
const server = http.createServer((request, response) => {
  const relative = request.url === "/" ? "index.html" : request.url.slice(1);
  const target = path.join(pagesDir, relative);
  response.setHeader("Content-Type", `${types[path.extname(target)]}; charset=utf-8`);
  response.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless:true });
const errors = [];

async function open(options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  if (options.noData) await context.route("**/assets/network.json", route => route.abort());
  if (options.noD3) await context.route("**/assets/lib/d3.min.js", route => route.abort());
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil:"networkidle" });
  if (options.noData || options.noD3) await page.waitForSelector("#fallback:not([hidden])");
  else await page.waitForFunction(() => PollinatorMini.snapshot().ready);
  return { context, page };
}
const snap = page => page.evaluate(() => PollinatorMini.snapshot());

try {
  const data = JSON.parse(fs.readFileSync(path.join(pagesDir, "assets/network.json"), "utf8"));
  assert.equal(data.nodes.length, 16);
  assert.equal(data.links.length, 28);
  assert.deepEqual(data.nodes.map(row => row[0]), ["clover","sage","hawthorn","bramble",
    "osmia","leafcutter","longhorn","bumble","hoverfly","reed","ringlet","moth",
    "loosestrife","vetchling","scabious","angelica"]);
  assert.deepEqual(data.links.slice(0, 8).map(row => row[2]), [32,21,10,28,19,24,17,18]);

  let firstSignature;
  for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
    const run = await open({ viewport });
    const state = await snap(run.page);
    assert.deepEqual(state.bridges, ["bumble", "hoverfly"]);
    assert.equal(state.ticks, 340);
    assert.deepEqual([state.nodes, state.links], [16, 28]);
    if (!firstSignature) firstSignature = state.signature;
    else assert.equal(state.signature, firstSignature);
    const geometry = await run.page.evaluate(() => ({
      nodes:document.querySelectorAll(".node").length,
      edges:document.querySelectorAll(".edge").length,
      viewport:[innerWidth, innerHeight],
      scroll:[document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      stage:[stage.getBoundingClientRect().width, stage.getBoundingClientRect().height]
    }));
    assert.deepEqual([geometry.nodes, geometry.edges], [16, 28]);
    assert.deepEqual(geometry.scroll, geometry.viewport);
    assert.deepEqual(geometry.stage, geometry.viewport);
    await run.page.screenshot({ path:path.join(testDir, `${viewport.width}-bridge.png`) });
    await run.context.close();
  }

  const interaction = await open();
  await interaction.page.click("#full");
  await interaction.page.waitForTimeout(260);
  assert.equal((await snap(interaction.page)).state.view, "full");
  assert.ok((await interaction.page.locator(".edge").evaluateAll(nodes =>
    nodes.map(node => Number(getComputedStyle(node).opacity)))).every(value => value === .55));
  await interaction.page.locator("[data-pick=bumble]").focus();
  await interaction.page.keyboard.press("Enter");
  await interaction.page.waitForTimeout(260);
  assert.equal((await snap(interaction.page)).state.selected, "bumble");
  assert.equal(await interaction.page.locator(".edge").evaluateAll(nodes =>
    nodes.filter(node => Number(getComputedStyle(node).opacity) > .9).length), 8);
  assert.match(await interaction.page.locator("#status").textContent(), /林缘 91.*湿草甸 78.*8 条边/);
  await interaction.page.screenshot({ path:path.join(testDir, "1600-bridge-node.png") });
  await interaction.page.click("[data-pick=osmia]");
  await interaction.page.waitForTimeout(260);
  assert.equal((await snap(interaction.page)).state.selected, "osmia");
  assert.equal(await interaction.page.locator(".edge").evaluateAll(nodes =>
    nodes.filter(node => Number(getComputedStyle(node).opacity) > .9).length), 2);
  assert.match(await interaction.page.locator("#status").textContent(), /林缘 58.*湿草甸 0.*留在一侧/);
  await interaction.page.screenshot({ path:path.join(testDir, "1600-local-node.png") });
  await interaction.page.click("#reset");
  await interaction.page.click("#reset");
  assert.deepEqual((await snap(interaction.page)).state, { view:"bridge", selected:null });
  assert.equal((await snap(interaction.page)).signature, firstSignature);
  await interaction.context.close();

  const reduced = await open({ reduced:true, viewport:{ width:1280, height:720 } });
  await reduced.page.click("[data-pick=bumble]");
  await reduced.page.waitForTimeout(100);
  assert.equal(await reduced.page.locator(".edge").evaluateAll(nodes =>
    nodes.filter(node => Number(getComputedStyle(node).opacity) > .9).length), 8);
  await reduced.page.screenshot({ path:path.join(testDir, "1280-reduced.png") });
  await reduced.context.close();

  const noData = await open({ noData:true });
  assert.equal(await noData.page.locator("#network").isVisible(), false);
  assert.match(await noData.page.locator("#status").textContent(), /没有用占位关系/);
  assert.match(await noData.page.locator("#fallback").textContent(), /A\/B.*91\/78.*58\/0/s);
  await noData.context.close();

  const noD3 = await open({ noD3:true });
  assert.match(await noD3.page.locator("#status").textContent(), /D3.*文字/);
  await noD3.context.close();

  const lifecycle = await open();
  await lifecycle.page.evaluate(() => PollinatorMini.dispose());
  const disposed = await snap(lifecycle.page);
  assert.equal(disposed.destroyed, true);
  await lifecycle.page.click("#full");
  assert.deepEqual(await snap(lifecycle.page), disposed);
  assert.equal(await lifecycle.page.evaluate(() =>
    [...document.querySelectorAll(".edge,.node")].some(node => Boolean(node.__transition))), false);
  await lifecycle.page.setViewportSize({ width:1280, height:720 });
  await lifecycle.page.reload({ waitUntil:"networkidle" });
  await lifecycle.page.waitForFunction(() => PollinatorMini.snapshot().ready);
  assert.equal((await snap(lifecycle.page)).signature, firstSignature);
  await lifecycle.context.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:true, checks:[
    "exact 16 nodes and 28 links; computed bridge identities and totals",
    "seeded five-force layout settles for exactly 340 deterministic ticks",
    "bridge/full, bridge-node, local-node, keyboard and double reset",
    "1600/1280, reduced motion, data and D3 fallbacks",
    "fixed-stage resize, transition/listener teardown and clean reload"
  ] }, null, 2));
} finally {
  await browser.close();
  server.close();
}
