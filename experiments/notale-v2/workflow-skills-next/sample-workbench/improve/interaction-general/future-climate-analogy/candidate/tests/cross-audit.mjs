import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const server = "http://127.0.0.1:43127";
const formalPath = "/interaction-general/future-climate-analogy/pages/";
const candidatePath = "/sample-workbench/improve/interaction-general/future-climate-analogy/candidate/pages/";
const shots = path.resolve(import.meta.dirname, "../../shots");
const results = { pixels: [], model: {}, motion: {}, inputs: {}, lifecycle: {}, fallback: {} };
const browser = await chromium.launch({ headless: true });

async function openPage(pagePath, viewport, reducedMotion = "reduce", setup) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: Boolean(setup?.touch) });
  if (setup?.route) await context.route(setup.route, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(server + pagePath, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function selectCity(page, id, prediction) {
  await page.locator(`[data-city="${id}"]`).click();
  await page.locator(`.zone-choice[data-zone="${prediction}"]`).click();
}

async function setFixedState(page, stateName) {
  if (stateName === "initial") return;
  if (stateName === "selection") return selectCity(page, 0, "Temperate");
  if (stateName === "comparison") {
    await selectCity(page, 0, "Temperate");
    return page.locator("[data-confirm]").click();
  }
  if (stateName === "boundary") {
    await selectCity(page, 69, "Temperate");
    return page.locator("[data-confirm]").click();
  }
  if (stateName === "reset") {
    await selectCity(page, 0, "Temperate");
    await page.locator("[data-confirm]").click();
    return page.locator("#reset").click();
  }
  throw new Error(`Unknown state: ${stateName}`);
}

async function fixedScreenshot(pagePath, viewport, stateName, label) {
  const { context, page, errors } = await openPage(pagePath, viewport);
  await page.waitForSelector(".city");
  await setFixedState(page, stateName);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(80);
  const file = path.join(shots, `${viewport.width}x${viewport.height}-${stateName}-${label}.png`);
  const image = await page.screenshot({ path: file });
  assert.deepEqual(errors, []);
  await context.close();
  return image;
}

await fs.mkdir(shots, { recursive: true });
for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
  for (const stateName of ["initial", "selection", "comparison", "boundary", "reset"]) {
    const formal = await fixedScreenshot(formalPath, viewport, stateName, "baseline");
    const candidate = await fixedScreenshot(candidatePath, viewport, stateName, "candidate");
    assert(formal.equals(candidate), `${viewport.width}x${viewport.height} ${stateName} pixels changed`);
    results.pixels.push(`${viewport.width}x${viewport.height}:${stateName}:AE0`);
  }
}

// Exhaustively verify the live filter/sort rule against an independent implementation.
{
  const { context, page, errors } = await openPage(candidatePath, { width: 1600, height: 900 });
  await page.waitForSelector(".city");
  const expected = await page.evaluate(() => window.CITIES.map(city => {
    const candidates = window.CITIES.filter(candidate => candidate.type_2023 === city.type_2070);
    candidates.sort((a, b) => Math.abs(city.temp_2070 - a.temp_2023)
      - Math.abs(city.temp_2070 - b.temp_2023) || a.id - b.id || a.name.localeCompare(b.name));
    return { cityId: city.id, analogueId: candidates[0].id };
  }));
  for (const record of expected) {
    const zone = await page.evaluate(id => window.CITIES[id].type_2070.split(",")[0], record.cityId);
    await selectCity(page, record.cityId, zone);
    await page.locator("[data-confirm]").click();
    const inspected = await page.evaluate(() => window.__CLIMATE_SAMPLE__);
    assert.equal(inspected.analogue.id, record.analogueId);
    assert.equal(inspected.state.phase, "revealed");
    assert.equal(inspected.state.attempts.length, 1);
    await page.locator("#reset").click();
  }
  assert.deepEqual(errors, []);
  results.model = { records: expected.length, independentRule: "pass", resetEachRecord: "pass" };
  await context.close();
}

// Normal motion, rapid interruption, route/ghost evidence, and reset ownership.
{
  const { context, page, errors } = await openPage(candidatePath, { width: 1600, height: 900 }, "no-preference");
  await page.waitForSelector(".city");
  await selectCity(page, 0, "Temperate");
  await page.locator("[data-confirm]").click();
  await page.waitForTimeout(80);
  const moving = await page.evaluate(() => ({
    phase: window.__CLIMATE_SAMPLE__.state.phase,
    disabled: [...document.querySelectorAll(".city:not(.ghost)")].filter(node => node.disabled).length,
    ghost: Boolean(document.querySelector(".ghost")),
    routeVisible: getComputedStyle(document.querySelector(".route-dash")).visibility,
    duration: getComputedStyle(document.querySelector('[data-city="0"]')).transitionDuration
  }));
  assert.deepEqual(moving, {
    phase: "moving", disabled: 70, ghost: true, routeVisible: "visible", duration: "2s"
  });
  await page.locator("#reset").click();
  await page.waitForTimeout(2100);
  assert.equal((await page.evaluate(() => window.__CLIMATE_SAMPLE__.state)).phase, "ready");
  assert.equal(await page.locator(".ghost").count(), 0);
  assert.equal(await page.locator(".route-dash").evaluate(node => getComputedStyle(node).visibility), "hidden");

  await selectCity(page, 0, "Temperate");
  await page.locator("[data-confirm]").click();
  await page.waitForTimeout(2100);
  await page.locator('[data-city="2"]').click();
  await page.locator('[data-city="3"]').click();
  assert.equal((await page.evaluate(() => window.__CLIMATE_SAMPLE__.state)).selectedId, 3);
  results.motion = { flip: "2s cubic-bezier", routeAndGhost: "pass", resetInterrupt: "pass", rapidFinalId: 3 };
  assert.deepEqual(errors, []);
  await context.close();
}

// Native button semantics cover keyboard, mouse, touch, and the unit conversion.
{
  const keyboard = await openPage(candidatePath, { width: 1280, height: 720 });
  await keyboard.page.waitForSelector(".city");
  await keyboard.page.locator('[data-city="0"]').focus();
  await keyboard.page.keyboard.press("Enter");
  await keyboard.page.waitForTimeout(30);
  assert.equal(await keyboard.page.locator(".zone-choice").first().evaluate(node => node === document.activeElement), true);
  await keyboard.page.locator('.zone-choice[data-zone="Temperate"]').focus();
  await keyboard.page.keyboard.press("Space");
  await keyboard.page.waitForTimeout(30);
  assert.equal(await keyboard.page.locator("[data-confirm]").evaluate(node => node === document.activeElement), true);
  await keyboard.page.keyboard.press("Enter");
  assert.equal((await keyboard.page.evaluate(() => window.__CLIMATE_SAMPLE__.state)).phase, "revealed");
  await keyboard.page.locator("#unit").click();
  assert.match(await keyboard.page.locator(".evidence").innerText(), /°F/);
  assert.deepEqual(keyboard.errors, []);
  await keyboard.context.close();

  const touch = await openPage(candidatePath, { width: 1280, height: 720 }, "reduce", { touch: true });
  await touch.page.waitForSelector(".city");
  await touch.page.locator('[data-city="1"]').tap();
  assert.equal((await touch.page.evaluate(() => window.__CLIMATE_SAMPLE__.state)).selectedId, 1);
  assert.deepEqual(touch.errors, []);
  await touch.context.close();
  results.inputs = { mouse: "pass", keyboard: "pass", touch: "pass", fahrenheit: "pass" };
}

// Logical SVG coordinates and the fixed stage remain stable after resize.
{
  const { context, page, errors } = await openPage(candidatePath, { width: 1600, height: 900 });
  await page.waitForSelector(".city");
  await selectCity(page, 0, "Temperate");
  await page.locator("[data-confirm]").click();
  const before = await page.locator(".route-dash").evaluate(line => ["x1", "y1", "x2", "y2"].map(k => +line.getAttribute(k)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(80);
  const after = await page.locator(".route-dash").evaluate(line => ["x1", "y1", "x2", "y2"].map(k => +line.getAttribute(k)));
  before.forEach((value, index) => assert(Math.abs(value - after[index]) < .02));
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight
  }));
  assert.deepEqual(overflow, { width: 0, height: 0 });
  assert.deepEqual(errors, []);
  results.lifecycle.resize = "logical route stable; no overflow";
  await context.close();
}

// Missing data or chassis produces a truthful rule-preserving fallback.
for (const [label, routePattern] of [["cities", "**/cities.js"], ["base", "**/base.js"]]) {
  const opened = await openPage(candidatePath, { width: 1600, height: 900 }, "reduce", { route: routePattern });
  await opened.page.waitForSelector(".model-fallback");
  const fallback = await opened.page.evaluate(() => ({
    text: document.querySelector(".model-fallback").innerText,
    cityCount: window.__CLIMATE_SAMPLE__.cityCount,
    unitDisabled: document.querySelector("#unit").disabled,
    resetDisabled: document.querySelector("#reset").disabled
  }));
  assert.match(fallback.text, /70 cities/);
  assert.match(fallback.text, /same projected climate subtype/);
  assert.match(fallback.text, /smallest temperature gap/);
  assert.equal(fallback.unitDisabled, true);
  assert.equal(fallback.resetDisabled, true);
  assert.deepEqual(opened.errors, []);
  results.fallback[label] = fallback.cityCount;
  await opened.context.close();
}

// pagehide cancels owned RAF/timer work, unregisters handlers, and supports a clean reload.
{
  const { context, page, errors } = await openPage(candidatePath, { width: 1600, height: 900 }, "no-preference");
  await page.waitForSelector(".city");
  await selectCity(page, 0, "Temperate");
  const beforeDispose = await page.evaluate(async () => {
    const cachedCity = document.querySelector('[data-city="1"]');
    document.querySelector('[data-city="0"]').click();
    const cachedChoice = document.querySelector(".zone-choice");
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    cachedCity.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return {
      state: window.__CLIMATE_SAMPLE__.state,
      focusedStaleChoice: document.activeElement === cachedChoice,
      route: getComputedStyle(document.querySelector(".route-dash")).visibility,
      transformed: [...document.querySelectorAll(".city")].some(node => node.style.transform),
      animated: [...document.querySelectorAll(".city")].some(node => node.getAnimations().length)
    };
  });
  assert.equal(beforeDispose.state.selectedId, 0);
  assert.equal(beforeDispose.focusedStaleChoice, false);
  assert.equal(beforeDispose.route, "hidden");
  assert.equal(beforeDispose.transformed, false);
  assert.equal(beforeDispose.animated, false);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".city").count(), 70);
  assert.deepEqual(errors, []);
  results.lifecycle.pagehide = "RAF/timer/listeners inert; clean reload";
  await context.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
