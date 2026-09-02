import assert from 'node:assert/strict';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  formal:`${ROOT}/interaction-general/lawn-path/pages/index.html`,
  candidate:`${ROOT}/sample-workbench/improve/interaction-general/lawn-path/candidate/pages/index.html`
};
const PATH = [
  [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,6],[1,5],[1,4],
  [2,4],[2,5],[2,6],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[7,6],
  [6,6],[5,6],[5,5],[4,5],[4,6],[3,6],[3,5],[3,4],[4,4],[4,3],
  [3,3],[2,3],[2,2],[3,2],[3,1],[3,0],[4,0],[4,1],[5,1],[5,0],
  [6,0],[7,0],[7,1],[6,1],[6,2],[7,2],[7,3],[6,3],[6,4]
];
const keys = new Map([["-1,0","ArrowUp"],["1,0","ArrowDown"],["0,-1","ArrowLeft"],["0,1","ArrowRight"]]);
const steps = PATH.slice(1).map((point,index) => keys.get(`${point[0]-PATH[index][0]},${point[1]-PATH[index][1]}`));
const browser = await chromium.launch({ headless:true });
const results = [];

async function load(url, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? 'reduce' : 'no-preference',
    hasTouch:!!options.touch
  });
  if (options.noCanvas) {
    await context.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
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
    const canvas = element => element && ({
      width:element.width, height:element.height,
      pixels:element.getContext('2d') ? element.toDataURL() : 'unavailable'
    });
    const visibleScene = [...document.querySelectorAll('#stage > section')]
      .find(section => !section.hidden)?.id;
    return {
      scene:document.getElementById('stage').dataset.scene,
      visibleScene,
      moves:document.getElementById('moveValue').textContent,
      coverage:document.getElementById('coverageValue').textContent.trim(),
      progress:document.getElementById('progressFill').style.width,
      status:document.getElementById('boardStatus').textContent,
      instruction:document.getElementById('instruction').textContent,
      result:document.getElementById('results-title').textContent,
      efficiency:document.getElementById('efficiencyValue').textContent,
      repeat:document.getElementById('repeatNote').textContent,
      canvases:['introCanvas','gameCanvas','playerResultCanvas','optimalResultCanvas']
        .map(id => canvas(document.getElementById(id)))
    };
  });
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  for (const reduced of [false, true]) {
    const formal = await load(URLS.formal, { viewport, reduced });
    const candidate = await load(URLS.candidate, { viewport, reduced });
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    for (const page of [formal.page, candidate.page]) await page.click('#startButton');
    await formal.page.waitForTimeout(reduced ? 80 : 900);
    await candidate.page.waitForTimeout(reduced ? 80 : 900);
    for (const page of [formal.page, candidate.page]) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
      await page.click('[data-direction="ArrowDown"]');
    }
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.equal(await candidate.page.locator('#moveValue').textContent(), '2');
    assert.match(await candidate.page.locator('#boardStatus').textContent(), /第 1 行第 3 列.*还剩 46 格.*2 步/);
    for (const page of [formal.page, candidate.page]) await page.click('#scenePlay [data-action="skip"]');
    await formal.page.waitForTimeout(reduced ? 80 : 1800);
    await candidate.page.waitForTimeout(reduced ? 80 : 1800);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.equal(await candidate.page.locator('#efficiencyValue').textContent(), '88.9%');
    assert.match(await candidate.page.locator('#repeatNote').textContent(), /共 6 次/);
    assert.deepEqual(formal.errors, []);
    assert.deepEqual(candidate.errors, []);
    results.push({ name:`${viewport.width}x${viewport.height} ${reduced?'reduced':'normal'} fixed flow`, status:'pass' });
    await formal.context.close();
    await candidate.context.close();
  }
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { reduced:true });
  const { page } = run;
  await page.click('#startButton');
  for (const key of steps) await page.keyboard.press(key);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#stage').getAttribute('data-scene'), 'result');
  assert.equal(await page.locator('#efficiencyValue').textContent(), '100%');
  assert.match(await page.locator('#results-title').textContent(), /48 步/);
  assert.match(await page.locator('#repeatNote').textContent(), /没有重复/);
  await page.evaluate(() => { replayButton.click(); replayButton.click(); });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#stage').getAttribute('data-scene'), 'play');
  assert.equal(await page.locator('#moveValue').textContent(), '0');
  assert.match(await page.locator('#coverageValue').textContent(), /48 格/);
  const progressDuration = await page.locator('#progressFill').evaluate(element => getComputedStyle(element).transitionDuration);
  assert.equal(progressDuration, '1e-05s');
  await page.keyboard.press('ArrowUp');
  const bumpMotion = await page.locator('#boardWrap').evaluate(element => {
    const style=getComputedStyle(element);
    return [style.animationName,style.animationDuration];
  });
  assert.deepEqual(bumpMotion, ['bump','1e-05s']);

  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    return [stage.width, stage.height, document.documentElement.scrollWidth, document.documentElement.scrollHeight];
  }), [1280, 720, 1280, 720]);
  const moves = await page.locator('#moveValue').textContent();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.keyboard.press('ArrowRight');
  await page.click('[data-direction="ArrowRight"]');
  assert.equal(await page.locator('#moveValue').textContent(), moves);
  await page.reload({ waitUntil:'networkidle' });
  assert.equal(await page.locator('#stage').getAttribute('data-scene'), 'intro');
  assert.equal(await page.locator('canvas').count(), 4);
  assert.deepEqual(run.errors, []);
  results.push({ name:`${label} optimal success, double reset, reduced, resize, dispose and reload`, status:'pass' });
  await run.context.close();
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { touch:true });
  const { page } = run;
  await page.click('#startButton');
  await page.waitForTimeout(900);
  const rect = await page.locator('#gameCanvas').boundingBox();
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.evaluate(() => gameCanvas.releasePointerCapture(1));
  await page.mouse.up();
  const client=await run.context.newCDPSession(page);
  const point=(left,top)=>({x:left,y:top,id:7,radiusX:2,radiusY:2,force:.5});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(x,y)]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(x+90,y)]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('#moveValue').textContent(), '1');
  assert.deepEqual(run.errors, []);
  results.push({ name:`${label} touch and lost capture recovery`, status:'pass' });
  await run.context.close();
}

const fallback = await load(URLS.candidate, { noCanvas:true, reduced:true });
await fallback.page.click('#startButton');
await fallback.page.keyboard.press('ArrowRight');
await fallback.page.keyboard.press('ArrowRight');
assert.equal(await fallback.page.locator('#moveValue').textContent(), '2');
assert.match(await fallback.page.locator('#boardStatus').textContent(), /还剩 46 格/);
for (const key of steps.slice(2)) await fallback.page.keyboard.press(key);
await fallback.page.waitForTimeout(100);
assert.equal(await fallback.page.locator('#efficiencyValue').textContent(), '100%');
assert.deepEqual(fallback.errors, []);
results.push({ name:'candidate Canvas 2D failure preserves complete textual/control loop', status:'pass' });
await fallback.context.close();

console.log(JSON.stringify(results, null, 2));
await browser.close();
