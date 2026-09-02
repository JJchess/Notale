import assert from 'node:assert/strict';
import { chromium } from '/tmp/notale-playwright/node_modules/playwright/index.mjs';

const ROOT = 'http://127.0.0.1:43127';
const URLS = {
  formal:`${ROOT}/interaction-general/motif-match/pages/index.html?audio=off`,
  candidate:`${ROOT}/sample-workbench/improve/interaction-general/motif-match/candidate/pages/index.html?audio=off`
};
const browser = await chromium.launch({ headless:true });
const results = [];

async function load(url, options = {}) {
  const context = await browser.newContext({
    viewport:options.viewport || { width:1600, height:900 },
    reducedMotion:options.reduced ? 'reduce' : 'no-preference',
    hasTouch:!!options.touch
  });
  if (options.noAudio) {
    await context.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
    });
  }
  if (options.hostHandlers) {
    await context.addInitScript(() => {
      window.__hostKeys=0;
      window.__hostPagehide=0;
      window.onkeydown=()=>{ window.__hostKeys++; };
      window.onpagehide=()=>{ window.__hostPagehide++; };
    });
  }
  if (options.noMarkers) {
    await context.route('**/marker-*.svg', route => route.abort());
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
  await page.waitForTimeout(60);
  return { context, page, errors };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map(value => +value.toFixed(3));
    };
    return {
      layout:{ replica:box('#replica'), keybed:box('.keybed'), lesson:box('#lesson') },
      slots:[...document.querySelectorAll('.slot')].map(slot => ({
        text:slot.textContent, selected:slot.classList.contains('selected'), action:slot.dataset.a || '', index:slot.dataset.i || ''
      })),
      intervals:[...document.querySelectorAll('.interval')].map(interval => ({
        text:interval.textContent, bad:interval.classList.contains('bad')
      })),
      message:document.getElementById('message').textContent,
      check:{ text:document.getElementById('check').textContent, action:document.getElementById('check').dataset.a },
      audio:document.getElementById('audioState').textContent,
      clips:[...document.querySelectorAll('.clip')].map(clip => ({
        id:clip.dataset.clip, playing:clip.classList.contains('playing'), progress:clip.querySelector('.progress').style.width
      })),
      markers:[...document.querySelectorAll('.mark')].map(marker => marker.classList.contains('show')),
      down:[...document.querySelectorAll('.key.down')].map(key => Number(key.dataset.note)),
      keys:[...document.querySelectorAll('.key')].map(key => [key.dataset.note,key.style.left,key.style.width,key.className])
    };
  });
}

async function choose(page, notes) {
  for (const note of notes) await page.locator(`.key[data-note="${note}"]`).click({ force:true });
}

async function stopEvidence(page) {
  const clip = page.locator('.clip[data-clip="r"]');
  if (await clip.evaluate(element => element.classList.contains('playing'))) await clip.click();
}

async function reset(page) {
  await page.locator('[data-a="reset"]').click();
}

async function makeError(page) {
  await reset(page);
  await choose(page,[71,71,66]);
  await page.click('#check');
  await stopEvidence(page);
}

async function makeSuccess(page) {
  await reset(page);
  await choose(page,[72,71,67]);
  await page.click('#check');
  await stopEvidence(page);
}

async function makeTransferSuccess(page) {
  await makeSuccess(page);
  await page.click('#check');
  await choose(page,[74,73,69]);
  await page.click('#check');
  await stopEvidence(page);
}

for (const viewport of [{ width:1600, height:900 }, { width:1280, height:720 }]) {
  for (const reduced of [false, true]) {
    const formal = await load(URLS.formal, { viewport, reduced });
    const candidate = await load(URLS.candidate, { viewport, reduced });
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));

    await formal.page.click('#check');
    await candidate.page.click('#check');
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.match(await candidate.page.locator('#message').textContent(), /还缺第 2、3、4 音/);

    await makeError(formal.page);
    await makeError(candidate.page);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.match(await candidate.page.locator('#message').textContent(), /第1段：\+11.*偏 -1.*第2段：0.*偏 \+1.*第3段：-5.*偏 -1/);

    await makeSuccess(formal.page);
    await makeSuccess(candidate.page);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.equal(await candidate.page.locator('#message').textContent(), '偏差均为 0。换起点再构造。');

    await makeTransferSuccess(formal.page);
    await makeTransferSuccess(candidate.page);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.equal(await candidate.page.locator('#message').textContent(), '迁移完成：D4 起，+12、−1、−4 不变。');

    await reset(formal.page); await reset(formal.page);
    await reset(candidate.page); await reset(candidate.page);
    assert.deepEqual(await snapshot(candidate.page), await snapshot(formal.page));
    assert.deepEqual(formal.errors, []);
    assert.deepEqual(candidate.errors, []);
    results.push({ name:`${viewport.width}x${viewport.height} ${reduced?'reduced':'normal'} model states and double reset`, status:'pass' });
    await formal.context.close();
    await candidate.context.close();
  }
}

for (const [label, url] of Object.entries(URLS)) {
  const run = await load(url, { touch:true });
  const { page } = run;
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyB');
  assert.deepEqual(await page.locator('.slot').allTextContents(), ['C4','C5','B4','G4']);
  await page.click('#check');
  await stopEvidence(page);
  assert.match(await page.locator('#message').textContent(), /偏差均为 0/);

  await reset(page);
  await page.locator('.key[data-note="72"]').focus();
  await page.keyboard.press('Enter');
  assert.equal((await page.locator('.slot').allTextContents())[1], 'C5');
  await reset(page);
  await page.locator('.key[data-note="72"]').tap();
  assert.equal((await page.locator('.slot').allTextContents())[1], 'C5');

  await reset(page);
  const key=page.locator('.key[data-note="72"]');
  const rect=await key.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.evaluate(() => document.querySelector('.key[data-note="72"]').releasePointerCapture(1));
  await page.mouse.up();
  assert.equal(await page.locator('.key.down').count(), 0);
  await key.click({ force:true });
  assert.equal((await page.locator('.slot').allTextContents())[2], 'C5');

  await reset(page);
  await page.locator('.slot[data-i="1"]').focus();
  for (let index=0; index<30; index++) await page.keyboard.press('ArrowUp');
  assert.equal((await page.locator('.slot').allTextContents())[1], 'B5');
  for (let index=0; index<30; index++) await page.keyboard.press('ArrowDown');
  assert.equal((await page.locator('.slot').allTextContents())[1], 'C4');

  await page.setViewportSize({ width:1280, height:720 });
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth,document.documentElement.scrollHeight]), [1280,720]);
  assert.deepEqual(run.errors, []);
  results.push({ name:`${label} keyboard, Enter, touch, capture recovery, clamps and resize`, status:'pass' });
  await run.context.close();
}

const lifecycle = await load(URLS.candidate, { hostHandlers:true });
await lifecycle.page.keyboard.press('Escape');
assert.equal(await lifecycle.page.evaluate(() => window.__hostKeys), 1);
await lifecycle.page.evaluate(() => window.MotifMatch.dispose());
await lifecycle.page.keyboard.press('KeyQ');
assert.equal(await lifecycle.page.evaluate(() => window.__hostKeys), 2);
assert.deepEqual(await lifecycle.page.locator('.slot').allTextContents(), ['C4','?','?','?']);
await lifecycle.page.evaluate(() => { window.MotifMatch.init(); window.MotifMatch.init(); });
await lifecycle.page.keyboard.press('KeyQ');
assert.deepEqual(await lifecycle.page.locator('.slot').allTextContents(), ['C4','C5','?','?']);
await lifecycle.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
assert.equal(await lifecycle.page.evaluate(() => window.__hostPagehide), 1);
const before=await lifecycle.page.locator('.slot').allTextContents();
await lifecycle.page.keyboard.press('KeyM');
assert.deepEqual(await lifecycle.page.locator('.slot').allTextContents(), before);
await lifecycle.page.reload({ waitUntil:'networkidle' });
assert.equal(await lifecycle.page.locator('.key').count(), 24);
assert.deepEqual(await lifecycle.page.locator('.slot').allTextContents(), ['C4','?','?','?']);
assert.deepEqual(lifecycle.errors, []);
results.push({ name:'candidate preserves host handlers, disposes, idempotently reinitializes and reloads', status:'pass' });
await lifecycle.context.close();

const audioFallback = await load(URLS.candidate.split('?')[0], { noAudio:true });
await audioFallback.page.locator('.key[data-note="72"]').click({ force:true });
assert.match(await audioFallback.page.locator('#audioState').textContent(), /声音不可用/);
assert.equal((await audioFallback.page.locator('.slot').allTextContents())[1], 'C5');
assert.deepEqual(audioFallback.errors, []);
results.push({ name:'candidate Web Audio failure preserves note and interval evidence', status:'pass' });
await audioFallback.context.close();

const markerFallback = await load(URLS.candidate, { noMarkers:true });
await makeTransferSuccess(markerFallback.page);
assert.equal(await markerFallback.page.locator('#message').textContent(), '迁移完成：D4 起，+12、−1、−4 不变。');
assert.equal(markerFallback.errors.filter(error => error.startsWith('request:')).length, 4);
assert.equal(markerFallback.errors.filter(error => error.startsWith('console: Failed to load resource')).length, 4);
assert.equal(markerFallback.errors.filter(error => !error.startsWith('request:') && !error.startsWith('console: Failed to load resource')).length, 0);
results.push({ name:'candidate auxiliary SVG failure preserves complete matching loop', status:'pass' });
await markerFallback.context.close();

console.log(JSON.stringify(results, null, 2));
await browser.close();
