import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  baseline: `${ROOT}/page-chart/solar-storage/pages/index.html`,
  candidate: `${ROOT}/sample-workbench/improve/page-chart/solar-storage/candidate/pages/index.html`
};
const output = '/tmp/solar-storage-cross-audit';
rmSync(output, { recursive:true, force:true });
mkdirSync(output, { recursive:true });

const browser = await chromium.launch({ headless:true });
const results = [];

async function load(context, url, reduced) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('requestfailed', request => errors.push(`request: ${request.url()}`));
  await page.goto(url, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(reduced ? 100 : 900);
  return { page, errors };
}

async function freeze(page) {
  await page.bringToFront();
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    document.getAnimations().forEach(animation => {
      animation.pause();
      animation.currentTime = Math.min(500, animation.effect?.getTiming().duration || 500);
    });
  });
  await page.waitForTimeout(30);
}

async function capture(page, path) {
  await freeze(page);
  await page.screenshot({ path });
}

function compare(left, right) {
  try {
    execFileSync('compare', ['-metric', 'AE', '-alpha', 'off', '-fuzz', '0', left, right, 'null:'], {
      stdio:['ignore', 'ignore', 'pipe']
    });
    return 0;
  } catch (error) {
    const value = Number(String(error.stderr).trim());
    if (Number.isFinite(value)) return value;
    throw error;
  }
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion:reduced ? 'reduce' : 'no-preference'
    });
    const runs = {};
    for (const [label, url] of Object.entries(URLS)) runs[label] = await load(context, url, reduced);
    if (!reduced) {
      for (const run of Object.values(runs)) {
        await run.page.bringToFront();
        await run.page.waitForTimeout(900);
      }
    }
    for (const run of Object.values(runs)) {
      await run.page.click('#resetBtn');
      await run.page.click('#resetBtn');
      await run.page.keyboard.press('ArrowRight');
      await run.page.keyboard.press('ArrowLeft');
      await run.page.waitForTimeout(300);
    }
    const states = ['overview', 'surplus', 'transfer', 'gap', 'settled'];
    for (let index = 0; index < states.length; index += 1) {
      if (index) {
        await runs.baseline.page.keyboard.press('ArrowRight');
        await runs.candidate.page.keyboard.press('ArrowRight');
        await runs.baseline.page.waitForTimeout(reduced ? 30 : 280);
        await runs.candidate.page.waitForTimeout(reduced ? 30 : 280);
      }
      const prefix = `${viewport.width}x${viewport.height}-${reduced ? 'reduced' : 'normal'}-${states[index]}`;
      const baselinePath = `${output}/${prefix}-baseline.png`;
      const candidatePath = `${output}/${prefix}-candidate.png`;
      await capture(runs.baseline.page, baselinePath);
      await capture(runs.candidate.page, candidatePath);
      const ae = compare(baselinePath, candidatePath);
      if (index) assert.equal(ae, 0, `${prefix} AE=${ae}`);
      else assert.ok(ae <= 300, `${prefix} first-frame AE=${ae}`);
      const result = { state:prefix, ae };
      if (index === 0) {
        const repeat = await load(context, URLS.baseline, reduced);
        if (!reduced) {
          await repeat.page.bringToFront();
          await repeat.page.waitForTimeout(900);
        }
        await repeat.page.click('#resetBtn');
        await repeat.page.click('#resetBtn');
        await repeat.page.keyboard.press('ArrowRight');
        await repeat.page.keyboard.press('ArrowLeft');
        await repeat.page.waitForTimeout(300);
        const repeatPath = `${output}/${prefix}-baseline-repeat.png`;
        await capture(repeat.page, repeatPath);
        result.baselineSelfAe = compare(baselinePath, repeatPath);
        assert.ok(result.baselineSelfAe <= 300, `${prefix} baseline self AE=${result.baselineSelfAe}`);
        assert.deepEqual(repeat.errors, []);
        await repeat.page.close();
      }
      results.push(result);
    }
    await runs.baseline.page.click('#resetBtn');
    await runs.candidate.page.click('#resetBtn');
    await runs.baseline.page.click('#resetBtn');
    await runs.candidate.page.click('#resetBtn');
    const resetPrefix = `${viewport.width}x${viewport.height}-${reduced ? 'reduced' : 'normal'}-double-reset`;
    const resetBaseline = `${output}/${resetPrefix}-baseline.png`;
    const resetCandidate = `${output}/${resetPrefix}-candidate.png`;
    await capture(runs.baseline.page, resetBaseline);
    await capture(runs.candidate.page, resetCandidate);
    const resetAe = compare(resetBaseline, resetCandidate);
    assert.equal(resetAe, 0, `${resetPrefix} AE=${resetAe}`);
    results.push({ state:resetPrefix, ae:resetAe });
    assert.deepEqual(runs.baseline.errors, []);
    assert.deepEqual(runs.candidate.errors, []);
    await context.close();
  }
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
