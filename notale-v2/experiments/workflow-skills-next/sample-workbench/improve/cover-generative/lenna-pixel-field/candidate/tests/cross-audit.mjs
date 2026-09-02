import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  formal:`${ROOT}/cover-generative/lenna-pixel-field/pages/index.html`,
  candidate:`${ROOT}/sample-workbench/improve/cover-generative/lenna-pixel-field/candidate/pages/index.html`
};
const browser = await chromium.launch({ headless:true });
const results = [];

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function load(url, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? 'reduce' : 'no-preference',
    hasTouch:!!options.touch
  });
  if (options.controlled) {
    await context.addInitScript(() => {
      let nextId = 1;
      const queue = new Map();
      window.requestAnimationFrame = callback => {
        const id = nextId++;
        queue.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = id => queue.delete(id);
      window.__stepFrame = now => {
        const callbacks = [...queue.values()];
        queue.clear();
        callbacks.forEach(callback => callback(now));
        return queue.size;
      };
      window.__queuedFrames = () => queue.size;
    });
  }
  if (options.noCanvas) {
    await context.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
  }
  if (options.noDeck) {
    await context.route('**/base.js', route => route.fulfill({
      status:200, contentType:'application/javascript', body:''
    }));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('requestfailed', request => errors.push(`request: ${request.url()}`));
  await page.goto(url, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(50);
  return { context, page, errors };
}

async function step(page, count, start = 100) {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(now => window.__stepFrame(now), start + index * (1000 / 60));
  }
}

async function snapshot(page) {
  return page.evaluate(() => {
    const box = element => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map(value => +value.toFixed(3));
    };
    const canvas = document.getElementById('field');
    return {
      state:window.__lennaCover?.state(),
      canvas:{ width:canvas.width, height:canvas.height, rect:box(canvas), pixels:canvas.toDataURL() },
      stage:box(document.getElementById('stage')),
      title:{ text:document.querySelector('h1').innerText, rect:box(document.querySelector('h1')) }
    };
  });
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  const formal = await load(URLS.formal, { viewport, controlled:true });
  const candidate = await load(URLS.candidate, { viewport, controlled:true });
  const compare = async label => {
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.equal(hash(await candidate.page.screenshot()), hash(await formal.page.screenshot()), label);
  };
  await compare('initial');
  await step(formal.page, 37);
  await step(candidate.page, 37);
  await compare('elapsed 600ms');
  await step(formal.page, 72, 100 + 37 * (1000 / 60));
  await step(candidate.page, 72, 100 + 37 * (1000 / 60));
  await compare('representative 1800ms');

  for (const page of [formal.page, candidate.page]) {
    const rect = await page.locator('#field').boundingBox();
    await page.mouse.move(rect.x + rect.width * 0.72, rect.y + rect.height * 0.62);
  }
  await step(formal.page, 30, 2000);
  await step(candidate.page, 30, 2000);
  await compare('pointer evolved');

  for (const page of [formal.page, candidate.page]) {
    await page.keyboard.press('KeyR');
    await page.keyboard.press('KeyR');
  }
  await compare('double reset');
  assert.equal((await formal.page.evaluate(() => window.__lennaCover.state())).generation, 3);
  assert.deepEqual(formal.errors, []);
  assert.deepEqual(candidate.errors, []);
  results.push({ name:`${viewport.width}x${viewport.height} deterministic states, pointer and reset`, status:'pass' });
  await formal.context.close();
  await candidate.context.close();
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  const formal = await load(URLS.formal, { viewport, reduced:true, touch:true });
  const candidate = await load(URLS.candidate, { viewport, reduced:true, touch:true });
  const beforeFormal = await snapshot(formal.page);
  const beforeCandidate = await snapshot(candidate.page);
  assert.deepEqual(beforeCandidate, beforeFormal);
  await formal.page.locator('#field').tap({ position:{ x:1200, y:600 } });
  await candidate.page.locator('#field').tap({ position:{ x:1200, y:600 } });
  assert.deepEqual(await snapshot(formal.page), beforeFormal);
  assert.deepEqual(await snapshot(candidate.page), beforeCandidate);
  assert.equal(hash(await candidate.page.screenshot()), hash(await formal.page.screenshot()));
  assert.deepEqual(formal.errors, []);
  assert.deepEqual(candidate.errors, []);
  results.push({ name:`${viewport.width}x${viewport.height} reduced still ignores touch`, status:'pass' });
  await formal.context.close();
  await candidate.context.close();
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { controlled:true });
  const { page } = run;
  await step(page, 20);
  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const canvas = document.getElementById('field');
    return [stage.width, stage.height, canvas.width, canvas.height, document.querySelectorAll('#field').length];
  }), [1280, 720, 1600, 900, 1]);

  const frozen = await page.locator('#field').evaluate(canvas => canvas.toDataURL());
  await page.evaluate(() => {
    window.__savedLennaApi = window.__lennaCover;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  assert.equal(await page.evaluate(() => window.__lennaCover), undefined);
  assert.equal(await page.evaluate(() => window.resetCover), undefined);
  assert.equal(await page.evaluate(() => window.__savedLennaApi.state().disposed), true);
  await page.keyboard.press('KeyR');
  await page.mouse.move(900, 500);
  await page.evaluate(() => { window.__savedLennaApi.dispose(); window.__savedLennaApi.reset(); });
  assert.equal(await page.locator('#field').evaluate(canvas => canvas.toDataURL()), frozen);

  await page.reload({ waitUntil:'networkidle' });
  assert.equal(await page.locator('#field').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__lennaCover.state()), {
    seed:1517349138, generation:1, ring:0, emission:0, count:75, disposed:false
  });
  assert.deepEqual(run.errors, []);
  results.push({ name:`${label} resize, pagehide disposal and reload`, status:'pass' });
  await run.context.close();
}

for (const [label, options] of [['missing Canvas 2D', { noCanvas:true }], ['missing chassis', { noDeck:true }]]) {
  const run = await load(URLS.candidate, options);
  assert.equal(await run.page.locator('h1').isVisible(), true);
  assert.equal(await run.page.locator('h1').innerText(), 'CAN\nDATA\nDIE?');
  assert.equal(await run.page.evaluate(() => window.__lennaCover), undefined);
  assert.deepEqual(run.errors, []);
  results.push({ name:`candidate ${label} static-title fallback`, status:'pass' });
  await run.context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
