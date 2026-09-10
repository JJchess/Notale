#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/notale-playwright/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env.MINI_BASE_URL || "http://127.0.0.1:41031").replace(/\/$/, "");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json"), "utf8"));
const samples = manifest.samples.filter(sample => sample.decision === "already-under-10k");
const profiles = [
  { name:"1600-normal", viewport:{ width:1600, height:900 }, reducedMotion:"no-preference" },
  { name:"1280-reduced", viewport:{ width:1280, height:720 }, reducedMotion:"reduce" },
  {
    name:"1600-to-1280-resize",
    viewport:{ width:1600, height:900 },
    resizeTo:{ width:1280, height:720 },
    reducedMotion:"no-preference"
  }
];
const browser = await chromium.launch();
const results = [];

for (const sample of samples) {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      reducedMotion: profile.reducedMotion
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("request", request => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) {
        errors.push(`external: ${request.url()}`);
      }
    });
    page.on("requestfailed", request => errors.push(`requestfailed: ${request.url()}`));
    page.on("response", response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    const url = new URL(sample.full, `${base}/sample-workbench/mini/`).href;
    const response = await page.goto(url, {
      waitUntil:"networkidle",
      timeout:15000
    }).catch(error => {
      errors.push(`navigation: ${error.message}`);
      return null;
    });
    await page.waitForTimeout(profile.reducedMotion === "reduce" ? 180 : 1400);
    if (profile.resizeTo) {
      await page.setViewportSize(profile.resizeTo);
      await page.waitForTimeout(750);
    }
    const expected = profile.resizeTo || profile.viewport;
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector("#stage")?.getBoundingClientRect();
      return {
        document:[document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        stage:stage ? [stage.x, stage.y, stage.width, stage.height].map(Math.round) : null,
        title:document.title,
        text:document.body.innerText.trim().length
      };
    }).catch(() => null);
    if (!response || response.status() !== 200) errors.push(`entry HTTP ${response?.status() ?? "none"}`);
    if (!geometry?.title || !geometry.text) errors.push("empty title or body");
    if (geometry && (
      geometry.document[0] > expected.width + 1 || geometry.document[1] > expected.height + 1
    )) errors.push(`overflow ${geometry.document.join("x")}`);
    if (geometry?.stage && (
      Math.abs(geometry.stage[0]) > 1 || Math.abs(geometry.stage[1]) > 1 ||
      Math.abs(geometry.stage[2] - expected.width) > 1 ||
      Math.abs(geometry.stage[3] - expected.height) > 1
    )) errors.push(`stage geometry ${geometry.stage.join(",")}`);
    const shotDirectory = path.join(
      here,
      "exempt-shots",
      sample.key.replace("/", "-")
    );
    fs.mkdirSync(shotDirectory, { recursive:true });
    await page.screenshot({ path:path.join(shotDirectory, `${profile.name}.png`) });
    results.push({ sample:sample.key, profile:profile.name, status:errors.length ? "fail" : "pass", errors, geometry });
    await context.close();
  }
}

await browser.close();
for (const result of results) {
  console.log(`${result.status.toUpperCase().padEnd(5)} ${result.sample} ${result.profile}`);
  result.errors.forEach(error => console.log(`      - ${error}`));
}
const failures = results.filter(result => result.status === "fail");
console.log(`SUMMARY samples=3 checks=${results.length} failures=${failures.length}`);
process.exit(failures.length ? 1 : 0);
