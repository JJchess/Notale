import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.dirname(testDir);
const pagesDir = path.join(sampleDir, "candidate/pages");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".csv":"text/csv" };
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
const snapshot = page => page.evaluate(() => LennaMini.snapshot());

function aggregateCsv() {
  const text = fs.readFileSync(path.join(pagesDir, "assets/data/data.csv"), "utf8");
  const years = new Map();
  let records = 0;
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const comma = line.lastIndexOf(",");
    const domain = line.slice(0, comma);
    const year = Number.parseInt(line.slice(comma + 1), 10);
    if (!Number.isInteger(year) || year < 1972) continue;
    const key = domain.endsWith(".org") ? ".org" : domain.endsWith(".edu") ? ".edu" :
      domain.endsWith(".com") ? ".com" : "other";
    const row = years.get(year) || { year, value:0, ".org":0, ".edu":0, ".com":0, other:0 };
    row.value += 1;
    row[key] += 1;
    years.set(year, row);
    records += 1;
  }
  return { records, rows:[...years.values()].sort((a, b) => a.year - b.year) };
}

async function open(options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  if (options.noData) await context.route("**/assets/data/data.csv", route => route.abort());
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil:"networkidle" });
  if (options.noData) await page.waitForSelector("#fallback:not([hidden])");
  else await page.waitForFunction(() => LennaMini.snapshot().ready);
  return { context, page };
}

try {
  const canonical = aggregateCsv();
  assert.equal(canonical.records, 4801);
  assert.equal(canonical.rows.length, 45);
  assert.deepEqual(canonical.rows[0], { year:1972, value:2, ".org":1, ".edu":0, ".com":1, other:0 });
  assert.deepEqual(canonical.rows.find(row => row.year === 1995),
    { year:1995, value:287, ".org":222, ".edu":14, ".com":34, other:17 });
  assert.deepEqual(canonical.rows.at(-1),
    { year:2021, value:252, ".org":36, ".edu":0, ".com":148, other:68 });

  for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
    const run = await open({ viewport });
    assert.deepEqual(await snapshot(run.page),
      { ready:true, state:"1972", stateIndex:0, destroyed:false });
    const layout = await run.page.evaluate(() => ({
      width:innerWidth, height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
      scrollHeight:document.documentElement.scrollHeight,
      stage:[stage.getBoundingClientRect().width, stage.getBoundingClientRect().height],
      bars:document.querySelectorAll(".bar").length,
      segments:document.querySelectorAll(".segment").length,
      visible:[...document.querySelectorAll(".bar")].filter(node => node.style.display !== "none").length
    }));
    assert.deepEqual([layout.scrollWidth, layout.scrollHeight], [layout.width, layout.height]);
    assert.deepEqual(layout.stage, [layout.width, layout.height]);
    assert.deepEqual([layout.bars, layout.segments, layout.visible], [45, 143, 1]);
    await run.page.screenshot({ path:path.join(testDir, `${viewport.width}-1972.png`) });
    await run.context.close();
  }

  const motion = await open();
  await motion.page.evaluate(() => { window.peakBarIdentity = document.querySelector(".bar[data-year='1995']"); });
  await motion.page.focus("#next");
  await motion.page.keyboard.press("Enter");
  await motion.page.waitForTimeout(420);
  const intermediate = await motion.page.evaluate(() => {
    const visible = [...document.querySelectorAll(".bar")].filter(node => node.style.display !== "none");
    return {
      state:LennaMini.snapshot().state,
      opacity:visible.map(node => Number(getComputedStyle(node).opacity)),
      delays:visible.map(node => Number(node.dataset.revealDelay || 0)),
      sameNode:peakBarIdentity === document.querySelector(".bar[data-year='1995']")
    };
  });
  assert.equal(intermediate.state, "1995");
  assert.equal(intermediate.sameNode, true);
  assert.ok(intermediate.opacity.some(value => value > 0 && value < 1));
  assert.ok(intermediate.opacity.some(value => value === 0));
  assert.deepEqual(intermediate.delays.slice(1),
    Array.from({ length:18 }, (_, index) => index * 80));
  await motion.page.waitForTimeout(1500);
  assert.equal(await motion.page.locator(".bar.current").getAttribute("data-year"), "1995");
  assert.match(await motion.page.locator("#copy").innerText(), /1995.*287/);
  assert.equal(await motion.page.locator(".x-axis text.current").textContent(), "1995");
  assert.equal(await motion.page.locator(".x-axis text").filter({ hasText:"1996" }).isVisible(), false);
  await motion.page.screenshot({ path:path.join(testDir, "1600-1995.png") });

  await motion.page.click("#next");
  await motion.page.waitForTimeout(500);
  assert.equal((await snapshot(motion.page)).state, "domains");
  assert.equal(await motion.page.locator(".segment").count(), 143);
  assert.equal(await motion.page.locator(".segment").first().isVisible(), true);
  assert.equal(await motion.page.locator(".domain-key").isVisible(), true);
  const peakGeometry = await motion.page.evaluate(() => {
    const segments = [...document.querySelectorAll(".segment[data-year='1995']")];
    const bar = document.querySelector(".bar[data-year='1995']");
    return {
      categories:segments.map(node => node.dataset.domain),
      stackHeight:segments.reduce((sum, node) => sum + Number(node.getAttribute("height")), 0),
      barHeight:Number(bar.getAttribute("height"))
    };
  });
  assert.deepEqual(peakGeometry.categories, [".org", ".edu", ".com", "other"]);
  assert.ok(Math.abs(peakGeometry.stackHeight - peakGeometry.barHeight) < 1e-8);
  await motion.page.screenshot({ path:path.join(testDir, "1600-domains.png") });

  await motion.page.click("#previous");
  assert.equal((await snapshot(motion.page)).state, "1995");
  await motion.page.click("#reset");
  await motion.page.click("#reset");
  assert.deepEqual(await snapshot(motion.page),
    { ready:true, state:"1972", stateIndex:0, destroyed:false });
  assert.equal(await motion.page.locator(".bar").filter({ visible:true }).count(), 1);
  await motion.context.close();

  const reduced = await open({ reduced:true, viewport:{ width:1280, height:720 } });
  await reduced.page.click("#next");
  const reducedOpacity = await reduced.page.locator(".bar").evaluateAll(nodes => nodes
    .filter(node => node.style.display !== "none").map(node => Number(getComputedStyle(node).opacity)));
  assert.ok(reducedOpacity.every(value => value === 1));
  await reduced.page.click("#next");
  const segmentOpacity = await reduced.page.locator(".segment").evaluateAll(nodes =>
    nodes.map(node => Number(getComputedStyle(node).opacity)));
  assert.ok(segmentOpacity.every(value => value === 1));
  await reduced.page.screenshot({ path:path.join(testDir, "1280-reduced-domains.png") });
  await reduced.context.close();

  const fallback = await open({ noData:true });
  assert.equal(await fallback.page.locator("#fallback").isVisible(), true);
  assert.equal(await fallback.page.locator(".bar").count(), 0);
  assert.match(await fallback.page.locator("#fallback").innerText(), /data\.csv.*不会用占位数值/s);
  await fallback.context.close();

  const lifecycle = await open();
  await lifecycle.page.click("#next");
  await lifecycle.page.evaluate(() => LennaMini.destroy());
  const disposed = await snapshot(lifecycle.page);
  assert.equal(disposed.destroyed, true);
  await lifecycle.page.click("#next");
  await lifecycle.page.click("#reset");
  assert.deepEqual(await snapshot(lifecycle.page), disposed);
  assert.equal(await lifecycle.page.evaluate(() =>
    [...document.querySelectorAll(".bar,.segment")].some(node => Boolean(node.__transition))), false);
  await lifecycle.page.setViewportSize({ width:1280, height:720 });
  await lifecycle.page.reload({ waitUntil:"networkidle" });
  await lifecycle.page.waitForFunction(() => LennaMini.snapshot().ready);
  assert.deepEqual(await snapshot(lifecycle.page),
    { ready:true, state:"1972", stateIndex:0, destroyed:false });
  await lifecycle.context.close();

  const dataHash = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(pagesDir, "assets/data/data.csv"))).digest("hex");
  assert.equal(dataHash, "18dbc5fd90fbb6c536f5d2129ac0d093d574708e98dbc274a516169cf97ab249");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:true, checks:[
    "4,801 records aggregate to 45 annual rows and 143 stable stack segments",
    "1972, 1995 and domains states retain exact values and shared geometry",
    "80ms reveal has observable intermediate frames and stable bar identity",
    "two viewports, reduced motion, double reset and truthful data fallback",
    "transition interruption, Abort teardown, resize and clean reload"
  ] }, null, 2));
} finally {
  await browser.close();
  server.close();
}
