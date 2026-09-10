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
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((request, response) => {
  const relative = request.url === "/" ? "index.html" : request.url.slice(1);
  const target = path.join(pagesDir, relative);
  response.setHeader("Content-Type", `${types[path.extname(target)]}; charset=utf-8`);
  response.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const snapshot = page => page.evaluate(() => window.ClimateMini.snapshot());
const expectState = (state, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(state[key], value);
};

try {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    expectState(await snapshot(page), {
      phase: "predict", caseIndex: 0, cityId: 0, analogueId: 7, cityCount: 70
    });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.scrollingElement.scrollWidth,
      scrollHeight: document.scrollingElement.scrollHeight,
      mapWidth: document.getElementById("map").getBoundingClientRect().width
    }));
    assert.ok(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height);
    assert.ok(layout.mapWidth > 600);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.click("[data-zone=Arid]");
  await page.click("#confirm");
  expectState(await snapshot(page), { phase: "revealed", prediction: "Arid", analogueId: 7 });
  assert.match(await page.textContent("#status"), /chose Arid.*Temperate/);
  assert.match(await page.textContent("#evidence"), /London.*2\.11°C/s);
  await page.waitForTimeout(900);
  const osloGeometry = await page.evaluate(() => ({
    ghost: document.getElementById("ghost").getAttribute("transform"),
    future: document.getElementById("traveler").getAttribute("transform"),
    analogue: document.getElementById("analogue").getAttribute("transform"),
    route: document.getElementById("route").getAttribute("d")
  }));
  assert.notEqual(osloGeometry.ghost, osloGeometry.future);
  assert.notEqual(osloGeometry.future, osloGeometry.analogue);
  assert.match(osloGeometry.route, /^M.*Q/);
  await page.screenshot({ path: path.join(testDir, "oslo-wrong-1600x900.png") });

  await page.click("#reset");
  await page.focus("[data-zone=Temperate]");
  await page.keyboard.press("Enter");
  await page.focus("#confirm");
  await page.keyboard.press("Enter");
  assert.match(await page.textContent("#status"), /Prediction matched: Temperate/);
  await page.click("#next");
  expectState(await snapshot(page), { caseIndex: 1, phase: "predict", cityId: 43, analogueId: 43 });
  await page.click("[data-zone=Arid]");
  await page.click("#confirm");
  expectState(await snapshot(page), { phase: "revealed", prediction: "Arid", analogueId: 43 });
  assert.match(await page.textContent("#status"), /Prediction matched: Arid/);
  assert.match(await page.textContent("#evidence"), /New Delhi.*3\.08°C.*same city today/s);
  await page.waitForTimeout(900);
  const delhiGeometry = await page.evaluate(() => ({
    ghost: document.getElementById("ghost").getAttribute("transform"),
    analogue: document.getElementById("analogue").getAttribute("transform"),
    future: document.getElementById("traveler").getAttribute("transform")
  }));
  assert.equal(delhiGeometry.ghost, delhiGeometry.analogue);
  assert.notEqual(delhiGeometry.future, delhiGeometry.ghost);
  await page.screenshot({ path: path.join(testDir, "new-delhi-self-1600x900.png") });

  await page.click("#reset");
  await page.click("[data-zone=Temperate]");
  await page.click("#confirm");
  assert.ok(await page.evaluate(() => document.getAnimations().length > 0));
  await page.click("#reset");
  await page.click("#reset");
  expectState(await snapshot(page), {
    caseIndex: 0, phase: "predict", prediction: null, cityId: 0, analogueId: 7
  });
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  const beforeDispose = await snapshot(page);
  await page.evaluate(() => window.ClimateMini.dispose());
  await page.click("[data-case='1']");
  assert.deepEqual(await snapshot(page), beforeDispose);
  await page.reload();
  expectState(await snapshot(page), { phase: "predict", caseIndex: 0, cityCount: 70 });
  await page.close();

  const reduced = await browser.newPage({
    viewport: { width: 1280, height: 720 }, reducedMotion: "reduce"
  });
  await reduced.goto(url);
  await reduced.click("[data-zone=Temperate]");
  await reduced.click("#confirm");
  expectState(await snapshot(reduced), { phase: "revealed", analogueId: 7 });
  const duration = await reduced.$eval("#traveler", element => getComputedStyle(element).transitionDuration);
  assert.ok(parseFloat(duration) <= 0.01);
  await reduced.close();

  const fallback = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await fallback.addInitScript(() => {
    Object.defineProperty(window, "CITIES", { value: undefined, writable: false });
  });
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(url);
  expectState(await snapshot(fallbackPage), { phase: "fallback", cityCount: 0, fallback: true });
  assert.match(await fallbackPage.textContent("#world"), /70 records.*projected subtype.*temperature.*id\/name/s);
  await fallback.close();

  const report = JSON.parse(fs.readFileSync(path.join(sampleDir, "report.json"), "utf8"));
  let total = 0;
  for (const file of report.author_files) {
    const content = fs.readFileSync(path.join(sampleDir, file.path), "utf8");
    const chars = [...content].length;
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(chars, file.chars);
    assert.equal(hash, file.sha256);
    assert.ok(content.split("\n").every(line => line.length <= 120));
    total += chars;
  }
  for (const file of report.reused_files) {
    const content = fs.readFileSync(path.join(sampleDir, file.path));
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(hash, file.sha256);
  }
  assert.equal(total, report.mini_chars);
  assert.ok(total <= 9800 && total < 10000);
  assert.deepEqual(errors, []);
  console.log("PASS 70-city runtime analogue, Oslo wrong/correct, New Delhi self-analogue");
  console.log("PASS keyboard/pointer, moving reset, reduced, fallback, dispose, 2 viewports");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
