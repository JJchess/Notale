import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  formal:`${ROOT}/cover-composition/climate-zones-title/pages/index.html`,
  candidate:`${ROOT}/sample-workbench/improve/cover-composition/climate-zones-title/candidate/pages/index.html`
};
const phases = [0, 700, 1050, 1400, 2800, 3500, 4200, 4900];
const browser = await chromium.launch({ headless:true });
const results = [];

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function load(url, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? 'reduce' : 'no-preference'
  });
  if (options.noData) {
    await context.route('**/map-data.js', route => route.fulfill({
      status:200, contentType:'application/javascript', body:''
    }));
  }
  if (options.noCanvas) {
    await context.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
  }
  if (options.noPath) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'Path2D', { configurable:true, value:undefined });
    });
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
  await page.waitForTimeout(80);
  return { context, page, errors };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height].map(value => +value.toFixed(3));
    };
    return {
      state:window.__climateCover?.getState(),
      stage:rect(document.getElementById('stage')),
      title:{
        rect:rect(document.querySelector('.title')),
        src:document.querySelector('.title').getAttribute('src'),
        natural:[document.querySelector('.title').naturalWidth, document.querySelector('.title').naturalHeight]
      },
      tape:{ rect:rect(document.querySelector('.tape')), text:document.querySelector('.tape').innerText.trim() },
      credit:document.querySelector('.credit').textContent,
      canvases:[...document.querySelectorAll('canvas')].map(canvas => ({
        id:canvas.id, className:canvas.className, width:canvas.width, height:canvas.height,
        opacity:getComputedStyle(canvas).opacity, pixels:canvas.toDataURL()
      }))
    };
  });
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  const formal = await load(URLS.formal, { viewport });
  const candidate = await load(URLS.candidate, { viewport });
  for (const phase of phases) {
    await formal.page.evaluate(value => window.__climateCover.renderAt(value), phase);
    await candidate.page.evaluate(value => window.__climateCover.renderAt(value), phase);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    const formalShot = await formal.page.screenshot();
    const candidateShot = await candidate.page.screenshot();
    assert.equal(hash(candidateShot), hash(formalShot), `${viewport.width} phase ${phase}`);
  }
  assert.deepEqual(formal.errors, []);
  assert.deepEqual(candidate.errors, []);
  results.push({ name:`${viewport.width}x${viewport.height} eight fixed phases`, status:'pass' });
  await formal.context.close();
  await candidate.context.close();

  const reducedFormal = await load(URLS.formal, { viewport, reduced:true });
  const reducedCandidate = await load(URLS.candidate, { viewport, reduced:true });
  await reducedFormal.page.evaluate(() => window.__climateCover.renderAt(2800));
  await reducedCandidate.page.evaluate(() => window.__climateCover.renderAt(2800));
  assert.deepEqual(await snapshot(reducedCandidate.page), await snapshot(reducedFormal.page));
  assert.equal(hash(await reducedCandidate.page.screenshot()), hash(await reducedFormal.page.screenshot()));
  assert.equal((await reducedCandidate.page.evaluate(() => window.__climateCover.getState())).opacity, '1.000,1.000,0.240');
  results.push({ name:`${viewport.width}x${viewport.height} reduced representative still`, status:'pass' });
  await reducedFormal.context.close();
  await reducedCandidate.context.close();
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url);
  const { page } = run;
  const initial = await page.evaluate(() => {
    window.__climateCover.renderAt(0);
    return [window.__climateCover.getState(), [...document.querySelectorAll('canvas')].map(canvas => canvas.toDataURL())];
  });
  await page.evaluate(() => window.__climateCover.renderAt(2800));
  await page.evaluate(() => window.__climateCover.renderAt(0));
  assert.deepEqual(await page.evaluate(() => [window.__climateCover.getState(), [...document.querySelectorAll('canvas')].map(canvas => canvas.toDataURL())]), initial);
  await page.evaluate(() => window.__climateCover.renderAt(0));
  assert.deepEqual(await page.evaluate(() => [window.__climateCover.getState(), [...document.querySelectorAll('canvas')].map(canvas => canvas.toDataURL())]), initial);

  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => {
    const box = document.getElementById('stage').getBoundingClientRect();
    return [box.width, box.height, document.querySelectorAll('canvas').length];
  }), [1280, 720, 5]);

  await page.evaluate(() => {
    window.__hiddenForAudit = false;
    Object.defineProperty(document, 'hidden', { configurable:true, get:() => window.__hiddenForAudit });
    window.__climateCover.play();
    window.__hiddenForAudit = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await page.evaluate(() => window.__climateCover.getState())).activeRaf, false);
  await page.evaluate(() => {
    window.__hiddenForAudit = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await page.evaluate(() => window.__climateCover.getState())).activeRaf, true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  const disposed = await page.evaluate(() => window.__climateCover.getState());
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.activeRaf, false);
  assert.equal(disposed.ownedListeners, 0);
  await page.evaluate(() => { window.__climateCover.dispose(); window.__climateCover.play(); });
  assert.equal((await page.evaluate(() => window.__climateCover.getState())).activeRaf, false);
  await page.reload({ waitUntil:'networkidle' });
  assert.equal(await page.locator('canvas').count(), 5);
  assert.equal(await page.evaluate(() => window.__climateCover.getState().disposed), false);
  assert.deepEqual(run.errors, []);
  results.push({ name:`${label} reset, resize, visibility, dispose and reload`, status:'pass' });
  await run.context.close();
}

for (const [label, options] of [['missing map data', { noData:true }], ['missing Path2D', { noPath:true }], ['missing Canvas 2D', { noCanvas:true }]]) {
  const run = await load(URLS.candidate, options);
  assert.equal(await run.page.locator('.title').isVisible(), true);
  assert.equal(await run.page.locator('.tape').isVisible(), true);
  assert.deepEqual(run.errors, []);
  results.push({ name:`candidate ${label} static-title fallback`, status:'pass' });
  await run.context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
