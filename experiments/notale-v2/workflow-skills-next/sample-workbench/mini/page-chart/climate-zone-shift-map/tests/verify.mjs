import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.dirname(testDir);
const pagesDir = path.join(sampleDir, "candidate/pages");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css" };
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
const snapshot = page => page.evaluate(() => ClimateMapMini.snapshot());
const near = (actual, expected, tolerance = .02) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

function inspectRle() {
  const source = fs.readFileSync(path.join(pagesDir, "assets/data/climate-grid.js"), "utf8");
  const sandbox = { window:{} };
  vm.runInNewContext(source, sandbox);
  const packed = sandbox.window.CLIMATE_GRID_RLE;
  assert.deepEqual([packed.width, packed.height], [1584, 900]);
  const expanded = {};
  for (const year of ["present", "future"]) {
    assert.equal(packed[year].length, 900);
    const values = new Uint8Array(1584 * 900);
    packed[year].forEach((row, rowIndex) => {
      let cursor = 0;
      for (let run = 0; run < row.length; run += 3) {
        assert.equal(row[run], cursor);
        cursor += row[run + 1];
        values.fill(row[run + 2], rowIndex * 1584 + row[run], rowIndex * 1584 + cursor);
      }
      assert.equal(cursor, 1584);
    });
    expanded[year] = values;
  }
  let changed = 0;
  for (let index = 0; index < expanded.present.length; index += 1) {
    if (expanded.present[index] !== expanded.future[index]) changed += 1;
  }
  assert.equal(changed, 133741);
  return changed;
}

async function open(options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? "reduce" : "no-preference"
  });
  if (options.noCanvas) await context.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  if (options.noData) await context.route("**/assets/data/climate-grid.js", route => route.abort());
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil:"networkidle" });
  await page.waitForFunction(() => window.ClimateMapMini?.snapshot().renderer !== "loading");
  return { context, page };
}

try {
  const changed = inspectRle();
  const dataHash = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(pagesDir, "assets/data/climate-grid.js"))).digest("hex");
  assert.equal(dataHash, "281043a6d036e29ca43eb1affee469b0ea56e60fc37834ac57c9eb68d58bfad3");

  for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
    const run = await open({ viewport });
    const state = await snapshot(run.page);
    assert.equal(state.renderer, "canvas-natural-earth-rle");
    assert.deepEqual([state.width, state.height, state.classes], [1584, 900, 30]);
    near(state.cityPoint[0], 831.9657067, .001);
    near(state.cityPoint[1], 136.1652042, .001);
    assert.equal(await run.page.locator("#palette i").count(), 30);
    const layout = await run.page.evaluate(() => ({
      width:innerWidth, height:innerHeight,
      scrollWidth:document.scrollingElement.scrollWidth,
      scrollHeight:document.scrollingElement.scrollHeight,
      canvas:[document.getElementById("present").width, document.getElementById("present").height]
    }));
    assert.ok(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height);
    assert.deepEqual(layout.canvas, [1584, 900]);
    await run.page.screenshot({ path:path.join(testDir, `${viewport.width}-present.png`) });
    await run.context.close();
  }

  const motion = await open();
  await motion.page.focus("[data-year=future]");
  await motion.page.keyboard.press("Enter");
  await motion.page.waitForTimeout(330);
  const mid = await snapshot(motion.page);
  assert.equal(mid.target, 1);
  assert.ok(mid.mix > 0 && mid.mix < 1);
  await motion.page.waitForTimeout(900);
  near((await snapshot(motion.page)).mix, 1);
  assert.match(await motion.page.locator("#annotation").innerText(), /Oslo.*Cold.*5\.3°C.*Temperate.*8\.3°C/s);
  await motion.page.screenshot({ path:path.join(testDir, "1600-future.png") });

  await motion.page.click("#reset");
  await motion.page.click("#reset");
  near((await snapshot(motion.page)).mix, 0);
  await motion.page.click("[data-year=future]");
  await motion.page.waitForTimeout(330);
  const forward = (await snapshot(motion.page)).mix;
  await motion.page.click("[data-year=present]");
  await motion.page.waitForTimeout(220);
  assert.ok((await snapshot(motion.page)).mix < forward);
  await motion.page.waitForTimeout(900);
  near((await snapshot(motion.page)).mix, 0);
  await motion.context.close();

  const reduced = await open({ reduced:true, viewport:{ width:1280, height:720 } });
  await reduced.page.click("[data-year=future]");
  await reduced.page.waitForTimeout(30);
  near((await snapshot(reduced.page)).mix, 1);
  await reduced.page.screenshot({ path:path.join(testDir, "1280-reduced-future.png") });
  await reduced.context.close();

  const canvasFallback = await open({ noCanvas:true });
  assert.equal((await snapshot(canvasFallback.page)).renderer, "dom-grid-natural-earth-rle");
  assert.equal(await canvasFallback.page.locator("#fallbackPresent i").count(), 1100);
  assert.equal(await canvasFallback.page.locator("#fallbackFuture i").count(), 1100);
  await canvasFallback.page.click("[data-year=future]");
  await canvasFallback.page.waitForTimeout(1200);
  near(Number.parseFloat(await canvasFallback.page.locator("#fallbackFuture").evaluate(node =>
    getComputedStyle(node).opacity)), 1);
  await canvasFallback.page.screenshot({ path:path.join(testDir, "canvas-fallback.png") });
  await canvasFallback.context.close();

  const dataFallback = await open({ noData:true });
  assert.equal((await snapshot(dataFallback.page)).renderer, "data-fallback");
  assert.equal(await dataFallback.page.locator("#failure").isVisible(), true);
  assert.equal(await dataFallback.page.locator("[data-year]:disabled").count(), 2);
  assert.match(await dataFallback.page.locator("#failure").innerText(), /Oslo.*cold-to-temperate/s);
  await dataFallback.context.close();

  const lifecycle = await open();
  await lifecycle.page.click("[data-year=future]");
  await lifecycle.page.evaluate(() => ClimateMapMini.dispose());
  const disposedState = await snapshot(lifecycle.page);
  assert.equal(disposedState.disposed, true);
  assert.equal(await lifecycle.page.locator("#present").getAttribute("width"), "1");
  await lifecycle.page.click("[data-year=present]");
  assert.equal((await snapshot(lifecycle.page)).target, disposedState.target);
  await lifecycle.page.setViewportSize({ width:1280, height:720 });
  await lifecycle.page.reload({ waitUntil:"networkidle" });
  await lifecycle.page.waitForFunction(() => ClimateMapMini.snapshot().renderer.includes("canvas"));
  assert.equal((await snapshot(lifecycle.page)).disposed, false);
  await lifecycle.context.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:true, changedPixels:changed, checks:[
    "complete present/future RLE and 30-class palette",
    "Natural Earth Oslo annotation and two viewport sizes",
    "present, mid-crossfade, future, rapid reverse and double reset",
    "reduced motion, Canvas DOM-grid fallback and data fallback",
    "Abort disposal, inert inputs, resize and clean reload"
  ] }, null, 2));
} finally {
  await browser.close();
  server.close();
}
