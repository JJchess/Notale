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
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((request, response) => {
  const relative = request.url === "/" ? "index.html" : request.url.slice(1);
  const target = path.join(pagesDir, relative);
  response.setHeader("Content-Type", `${mime[path.extname(target)]}; charset=utf-8`);
  response.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const expectState = (state, expected) => {
  for (const [name, value] of Object.entries(expected)) assert.deepEqual(state[name], value);
};
const snapshot = page => page.evaluate(() => window.LawnMini.snapshot());
const clickMoves = async (page, names) => {
  for (const name of names) await page.click(`[data-key=${name}]`);
};
const optimal = ["ArrowRight", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowRight"];
const suboptimal = [
  "ArrowRight", "ArrowLeft", "ArrowRight", "ArrowDown",
  "ArrowRight", "ArrowUp", "ArrowRight"
];

try {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.LawnMini);
    expectState(await snapshot(page), { moves: 43, remaining: 5, repeats: 0, player: [6, 1] });
    const layout = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      scrollHeight: document.scrollingElement.scrollHeight,
      width: innerWidth,
      height: innerHeight,
      canvasWidth: document.getElementById("board").width
    }));
    assert.ok(layout.scrollWidth <= layout.width && layout.scrollHeight <= layout.height);
    assert.ok(layout.canvasWidth >= 560);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.click("#board");
  for (const name of optimal) await page.keyboard.press(name);
  expectState(await snapshot(page), { moves: 48, remaining: 0, repeats: 0, player: [6, 4] });
  const beforeRock = await snapshot(page);
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await snapshot(page), beforeRock);
  assert.match(await page.textContent("#status"), /石块/);
  await page.click("#assess");
  expectState(await snapshot(page), { phase: "result", moves: 48, repeats: 0 });
  assert.match(await page.textContent("#result"), /100%.*48 步.*重复无向边 0/s);
  await page.screenshot({ path: path.join(testDir, "optimal-1600x900.png") });

  await page.click("[data-action=reset]");
  await page.click("[data-action=reset]");
  expectState(await snapshot(page), { phase: "repair", moves: 43, remaining: 5, repeats: 0 });
  await clickMoves(page, suboptimal);
  expectState(await snapshot(page), { moves: 50, remaining: 0, repeats: 2, player: [6, 4] });
  await page.click("#assess");
  assert.match(await page.textContent("#result"), /96%.*50 步.*重复无向边 2/s);

  await page.click("[data-action=reset]");
  const beforeDispose = await snapshot(page);
  await page.evaluate(() => window.LawnMini.dispose());
  await page.click("[data-key=ArrowRight]");
  assert.deepEqual(await snapshot(page), beforeDispose);
  await page.reload();
  expectState(await snapshot(page), { moves: 43, remaining: 5, fallback: false });
  await page.close();

  const reduced = await browser.newPage({
    viewport: { width: 1280, height: 720 }, reducedMotion: "reduce"
  });
  await reduced.goto(url);
  const duration = await reduced.$eval("#mower", element => getComputedStyle(element).transitionDuration);
  assert.ok(parseFloat(duration) <= 0.01);
  await clickMoves(reduced, optimal);
  expectState(await snapshot(reduced), { moves: 48, remaining: 0 });
  await reduced.close();

  const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await fallbackContext.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(url);
  expectState(await snapshot(fallbackPage), { fallback: true, moves: 43, remaining: 5 });
  assert.equal(await fallbackPage.isVisible("#fallback"), true);
  await clickMoves(fallbackPage, optimal);
  expectState(await snapshot(fallbackPage), { moves: 48, remaining: 0, repeats: 0 });
  assert.equal(await fallbackPage.locator(".cell.mowed").count(), 49);
  await fallbackPage.click("#assess");
  assert.match(await fallbackPage.textContent("#result"), /100%/);
  await fallbackPage.screenshot({ path: path.join(testDir, "fallback-1280x720.png") });
  await fallbackContext.close();

  const report = JSON.parse(fs.readFileSync(path.join(sampleDir, "report.json"), "utf8"));
  let total = 0;
  for (const file of report.author_files) {
    const content = fs.readFileSync(path.join(sampleDir, file.path), "utf8");
    const chars = [...content].length;
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(chars, file.chars);
    assert.equal(sha256, file.sha256);
    assert.ok(content.split("\n").every(line => line.length <= 120));
    total += chars;
  }
  for (const file of report.reused_files) {
    const content = fs.readFileSync(path.join(sampleDir, file.path));
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    assert.equal(sha256, file.sha256);
  }
  assert.equal(total, report.mini_chars);
  assert.ok(total <= 9800 && total < report.budget + 1);
  assert.deepEqual(errors, []);
  console.log("PASS author budget/checksums, 2 viewports, keyboard+dpad, invalid, optimal/suboptimal");
  console.log("PASS double reset, reduced motion, DOM fallback, resize, dispose/reload");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
