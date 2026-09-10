import assert from 'node:assert/strict';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:43127/page-chart/solar-storage/pages/index.html';
const CANDIDATE = 'http://127.0.0.1:43127/sample-workbench/improve/page-chart/solar-storage/candidate/pages/index.html';
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
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('requestfailed', request => errors.push(`request: ${request.url()}`));
  await page.goto(url, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(options.wait ?? 900);
  return { context, page, errors };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const chartHost = document.getElementById('chart');
    const chart = echarts.getInstanceByDom(chartHost);
    const option = chart.getOption();
    const attributes = element => Object.fromEntries([...element.attributes]
      .filter(attribute => !['id', 'clip-path', '_echarts_instance_'].includes(attribute.name))
      .map(attribute => [attribute.name, attribute.value.replace(/url\([^)]*\)/g, 'url(#normalized)')]));
    const chartShapes = [...chartHost.querySelectorAll('path,polyline,polygon,line,circle,rect,text')]
      .map(element => ({ tag:element.tagName, attributes:attributes(element), text:element.textContent }));
    const ids = [
      'stage', 'plotWrap', 'chart', 'surplusShape', 'gapShape', 'noonGuide',
      'eveningGuide', 'noonBracket', 'eveningBracket', 'transferBase',
      'transferFlow', 'noonTag', 'eveningTag', 'transferTag', 'replayBtn',
      'resetBtn', 'liveStatus'
    ];
    const elements = Object.fromEntries(ids.map(id => {
      const element = document.getElementById(id);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [id, {
        rect:[rect.x, rect.y, rect.width, rect.height].map(value => +value.toFixed(4)),
        attributes:attributes(element),
        text:element.textContent.trim(),
        style:['display', 'position', 'opacity', 'transform', 'filter', 'color',
          'backgroundColor', 'fontSize', 'lineHeight', 'stroke', 'strokeWidth', 'fill']
          .map(property => [property, style[property]])
      }];
    }));
    return {
      beat:document.getElementById('stage').dataset.beat,
      rows:[...document.querySelectorAll('#dataTableBody tr')]
        .map(row => [...row.cells].map(cell => cell.textContent)),
      option:{
        animation:option.animation,
        x:option.xAxis[0].data,
        y:[option.yAxis[0].min, option.yAxis[0].max, option.yAxis[0].interval],
        series:option.series.map(series => ({
          id:series.id, data:series.data, smooth:series.smooth,
          lineStyle:series.lineStyle, itemStyle:series.itemStyle
        }))
      },
      chartShapes,
      elements,
      svgCount:chartHost.querySelectorAll('svg').length,
      fallback:!document.getElementById('fallback').hidden
    };
  });
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  const baseline = await load(BASE, { viewport });
  const candidate = await load(CANDIDATE, { viewport });
  assert.deepEqual(await snapshot(candidate.page), await snapshot(baseline.page));
  assert.deepEqual(baseline.errors, []);
  assert.deepEqual(candidate.errors, []);
  pass(`${viewport.width}x${viewport.height} initial structure, geometry, data and styles`);
  await baseline.context.close();
  await candidate.context.close();
}

for (const [label, url] of [['baseline', BASE], ['candidate', CANDIDATE]]) {
  const run = await load(url);
  const { page } = run;
  const expected = [
    ['surplus', '14 点'], ['transfer', '储能先存入'],
    ['gap', '20 点'], ['settled', '结论']
  ];
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'overview');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'surplus');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1150);
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'overview');
  for (const [beat, status] of expected) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#stage').getAttribute('data-beat'), beat);
    assert.match(await page.locator('#liveStatus').textContent(), new RegExp(status));
  }
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'settled');
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'overview');
  assert.equal(await page.locator('#replayBtn').getAttribute('aria-pressed'), 'false');

  await page.click('#replayBtn');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'surplus');
  assert.equal(await page.locator('#replayBtn').getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(1150);
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'transfer');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'gap');
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'settled');
  assert.equal(await page.locator('#replayBtn').textContent(), '再次重演');

  await page.click('#replayBtn');
  await page.waitForTimeout(50);
  await page.click('#resetBtn');
  await page.click('#resetBtn');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), 'overview');
  assert.deepEqual(run.errors, []);
  pass(`${label} keyboard, replay timing and idempotent reset`);
  await run.context.close();
}

for (const [label, url] of [['baseline', BASE], ['candidate', CANDIDATE]]) {
  const run = await load(url, { reduced:true });
  const before = await snapshot(run.page);
  assert.equal(before.option.animation, false);
  await run.page.click('#replayBtn');
  assert.equal(await run.page.locator('#stage').getAttribute('data-beat'), 'settled');
  assert.equal(await run.page.locator('#replayBtn').textContent(), '结论已显示');
  assert.match(await run.page.locator('#liveStatus').textContent(), /减少动态模式/);
  assert.equal(await run.page.evaluate(() => getComputedStyle(document.getElementById('transferFlow')).animationName), 'none');
  assert.deepEqual(run.errors, []);
  pass(`${label} reduced-motion settled state`);
  await run.context.close();
}

for (const [label, url] of [['baseline', BASE], ['candidate', CANDIDATE]]) {
  const run = await load(url);
  const { page } = run;
  const point = await page.evaluate(() => {
    const host = document.getElementById('chart');
    const rect = host.getBoundingClientRect();
    const chart = echarts.getInstanceByDom(host);
    const local = chart.convertToPixel({ seriesIndex:0 }, ['14:00', 88]);
    return { x:rect.x + local[0], y:rect.y + local[1] };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(200);
  assert.match(await page.locator('#chart').textContent(), /14:00|用电需求|光伏供给/);
  pass(`${label} pointer evidence probe`);

  const overlayBeforeResize = await page.evaluate(() => [
    document.getElementById('surplusShape').getAttribute('points'),
    document.getElementById('gapShape').getAttribute('points'),
    document.getElementById('transferBase').getAttribute('d')
  ]);
  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => {
    const rect = document.getElementById('stage').getBoundingClientRect();
    return [rect.width, rect.height];
  }), [1280, 720]);
  assert.deepEqual(await page.evaluate(() => [
    document.getElementById('surplusShape').getAttribute('points'),
    document.getElementById('gapShape').getAttribute('points'),
    document.getElementById('transferBase').getAttribute('d')
  ]), overlayBeforeResize);
  pass(`${label} live 1600x900 to 1280x720 resize`);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('chart'))), undefined);
  const beat = await page.locator('#stage').getAttribute('data-beat');
  await page.click('#replayBtn');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#stage').getAttribute('data-beat'), beat);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#dataTableBody tr').count(), 13);
  assert.equal(await page.locator('#chart svg').count(), 1);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#dataTableBody tr').count(), 13);
  assert.equal(await page.locator('#chart svg').count(), 1);
  assert.deepEqual(run.errors, []);
  pass(`${label} pagehide disposal and repeated reload initialization`);
  await run.context.close();
}

for (const [label, url] of [['baseline', BASE], ['candidate', CANDIDATE]]) {
  const run = await load(url, { touch:true });
  const point = await run.page.evaluate(() => {
    const host = document.getElementById('chart');
    const rect = host.getBoundingClientRect();
    const local = echarts.getInstanceByDom(host).convertToPixel({ seriesIndex:0 }, ['14:00', 88]);
    return { x:rect.x + local[0], y:rect.y + local[1] };
  });
  await run.page.touchscreen.tap(point.x, point.y);
  await run.page.waitForTimeout(200);
  assert.match(await run.page.locator('#chart').textContent(), /14:00.*64 GW.*88 GW.*\+24 GW/s);
  assert.deepEqual(run.errors, []);
  pass(`${label} touch evidence probe`);
  await run.context.close();
}

for (const [label, url] of [['baseline', BASE], ['candidate', CANDIDATE]]) {
  const context = await browser.newContext({ viewport:{ width:1600, height:900 } });
  await context.route('**/echarts.min.js', route => route.abort());
  const page = await context.newPage();
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#fallback').isVisible(), true);
  assert.equal(await page.locator('#chart').isHidden(), true);
  for (const id of ['bandOverlay', 'routeOverlay', 'noonTag', 'eveningTag', 'transferTag']) {
    assert.equal(await page.locator(`#${id}`).evaluate(element => element.hidden), true);
  }
  assert.match(await page.locator('#fallback').textContent(), /14:00.*88 GW.*20:00.*78 GW/s);
  pass(`${label} ECharts resource fallback`);
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
