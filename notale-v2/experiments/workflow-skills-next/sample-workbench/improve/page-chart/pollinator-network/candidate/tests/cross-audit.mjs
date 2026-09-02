import assert from 'node:assert/strict';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  baseline: `${ROOT}/page-chart/pollinator-network/pages/index.html`,
  candidate: `${ROOT}/sample-workbench/improve/page-chart/pollinator-network/candidate/pages/index.html`
};
const browser = await chromium.launch({ headless:true });
const results = [];

function pass(name, details = true) {
  results.push({ name, status:'pass', details });
}

async function load(url, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? 'reduce' : 'no-preference',
    hasTouch:!!options.touch
  });
  if (options.fallback) {
    await context.route('**/d3.min.js', route => route.fulfill({
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
  await page.waitForTimeout(80);
  return { context, page, errors };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const value = (element, name) => element.getAttribute(name) || '';
    return {
      state:window.__POLLINATOR_PAGE__?.getState(),
      layout:window.__POLLINATOR_PAGE__?.getLayoutSignature(),
      status:document.getElementById('chartStatus').textContent,
      pressed:[...document.querySelectorAll('[aria-pressed]')]
        .map(element => [element.id || element.dataset.entity, value(element, 'aria-pressed')]),
      nodes:[...document.querySelectorAll('.node')].map(element => ({
        label:value(element, 'aria-label'),
        transform:value(element, 'transform'),
        opacity:getComputedStyle(element).opacity
      })),
      links:[...document.querySelectorAll('.link')].map(element => ({
        d:value(element, 'd'),
        width:value(element, 'stroke-width'),
        opacity:getComputedStyle(element).opacity,
        title:element.querySelector('title')?.textContent
      })),
      layers:document.querySelectorAll('[data-layer]').length,
      fallbackRows:[...document.querySelectorAll('#fallbackRows tr')]
        .map(row => [...row.cells].map(cell => cell.textContent)),
      fallbackHidden:document.getElementById('chartFallback').hidden
    };
  });
}

async function pair(viewport, reduced) {
  const baseline = await load(URLS.baseline, { viewport, reduced });
  const candidate = await load(URLS.candidate, { viewport, reduced });
  const settle = reduced ? 30 : 300;
  const equal = async label => {
    await baseline.page.waitForTimeout(settle);
    await candidate.page.waitForTimeout(settle);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(baseline.page), label);
  };
  await equal('initial');
  await baseline.page.click('#fullView');
  await candidate.page.click('#fullView');
  await equal('full');
  await baseline.page.click('[data-entity="bee-bumble"]');
  await candidate.page.click('[data-entity="bee-bumble"]');
  await equal('bridge selection');
  for (const page of [baseline.page, candidate.page]) {
    await page.locator('.node[aria-label^="红壁蜂"]').focus();
    await page.keyboard.press('Enter');
  }
  await equal('local keyboard selection');
  for (const page of [baseline.page, candidate.page]) {
    await page.locator('.node[aria-label^="红三叶"]').focus();
    await page.keyboard.press('Enter');
  }
  await equal('plant keyboard selection');
  for (const page of [baseline.page, candidate.page]) {
    await page.click('#resetView');
    await page.click('#resetView');
  }
  await equal('double reset');
  assert.deepEqual(baseline.errors, []);
  assert.deepEqual(candidate.errors, []);
  pass(`${viewport.width}x${viewport.height} ${reduced ? 'reduced' : 'normal'} fixed states`);
  await baseline.context.close();
  await candidate.context.close();
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  await pair(viewport, false);
  await pair(viewport, true);
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url);
  const { page } = run;
  assert.equal(await page.locator('.node').count(), 16);
  assert.equal(await page.locator('.link').count(), 28);
  assert.equal(await page.locator('.link').evaluateAll(links =>
    links.filter(link => link.querySelector('title')?.textContent.includes('白尾熊蜂') ||
      link.querySelector('title')?.textContent.includes('条纹食蚜蝇')).length), 16);
  const signature = await page.evaluate(() => window.__POLLINATOR_PAGE__.getLayoutSignature());
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit2');
  await page.locator('.node[aria-label^="红壁蜂"]').click();
  await page.locator('.node[aria-label^="红三叶"]').click();
  assert.deepEqual(await page.evaluate(() => window.__POLLINATOR_PAGE__.getState()),
    { view:'full', selected:'plant-clover' });
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => window.__POLLINATOR_PAGE__.getState()),
    { view:'full', selected:null });
  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__POLLINATOR_PAGE__.getLayoutSignature()), signature);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  const disposedState = await page.evaluate(() => window.__POLLINATOR_PAGE__.getState());
  await page.click('#bridgeView');
  await page.keyboard.press('Digit1');
  assert.deepEqual(await page.evaluate(() => window.__POLLINATOR_PAGE__.getState()), disposedState);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.node').count(), 16);
  assert.equal(await page.locator('.link').count(), 28);
  assert.deepEqual(run.errors, []);
  pass(`${label} topology, rapid input, resize, pagehide and reload`);
  await run.context.close();
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { touch:true });
  await run.page.locator('#fullView').tap();
  await run.page.locator('.node[aria-label^="白尾熊蜂"]').tap();
  assert.deepEqual(await run.page.evaluate(() => window.__POLLINATOR_PAGE__.getState()),
    { view:'full', selected:'bee-bumble' });
  assert.deepEqual(run.errors, []);
  pass(`${label} touch view and entity input`);
  await run.context.close();
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { fallback:true });
  assert.equal(await run.page.locator('#chartFallback').isVisible(), true);
  assert.equal(await run.page.locator('#networkSvg').evaluate(element => element.hidden), true);
  assert.equal(await run.page.locator('#fallbackRows tr').count(), 28);
  assert.match(await run.page.locator('#fallbackRows tr').first().textContent(), /白尾熊蜂.*红三叶.*林缘.*32 次/);
  assert.match(await run.page.locator('#fallbackRows tr').last().textContent(), /银纹夜蛾.*欧当归.*湿草甸.*26 次/);
  pass(`${label} complete D3 fallback evidence`);
  await run.context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
