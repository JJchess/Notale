/* eslint-disable @typescript-eslint/no-explicit-any -- The editor exposes its integration API on window. */
import { expect, request, test, type Frame, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = '/api';
const source = (revision = 'original', label = '原始标题') => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<h1 data-notale-id="heading" style="position:absolute;left:180px;top:180px;width:240px;height:70px;margin:0;font-size:40px;color:#111111;text-align:left">${label}</h1>
<input id="interactive-state" data-notale-id="interactive-state" style="position:absolute;left:180px;top:320px" value="initial">
<script>
window.__fixtureRevision=${JSON.stringify(revision)};
window.__fixtureState={count:0};
// Deliberately add a live script absent from the authored source. Comparing the
// compiled source against live DOM used to misclassify ordinary undo as a reload.
const dynamic=document.createElement('script');
dynamic.textContent='window.__dynamicBoots=(window.__dynamicBoots||0)+1';
document.head.appendChild(dynamic);
</script></body></html>`;

async function createLecture() {
  const baseURL = process.env.NEXT_TEST_URL ?? 'http://127.0.0.1:4312';
  const fixture = await request.newContext({ baseURL });
  try {
    const id = randomUUID();
    const response = await fixture.post(`${api}/documents`, { data: {
      schemaVersion: 1, id, title: '撤销无闪屏集成验收', width: 1600, height: 900,
      slides: ['first', 'second'].map(slide => ({ id: slide, name: slide,
        sourcePath: `${slide}.html`, html: source('original', slide === 'first' ? '原始标题' : '第二页'),
      })),
    } });
    expect(response.status(), await response.text()).toBe(201);
    return id;
  } finally { await fixture.dispose(); }
}

async function ready(page: Page, id: string) {
  await page.waitForFunction(id => (window as any).NotaleWorkbench?.getSnapshot()?.document.id === id, id);
  await page.waitForFunction(async () => {
    await (window as any).NotaleWorkbench.whenReady();
    return true;
  }).then(handle => handle.dispose());
  await expect(page.locator('#canvas')).toBeVisible();
  await expect(page.locator('#canvas')).not.toHaveAttribute('inert', '');
  await expect(page.frameLocator('#canvas').locator('html')).toHaveAttribute('data-notale-mode', 'edit');
}

const synchronized = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
async function frameOf(page: Page) {
  const handle = await page.locator('#canvas').elementHandle();
  const frame = await handle!.contentFrame();
  expect(frame).not.toBeNull();
  return frame!;
}


async function installOrdinaryAudit(page: Page, frame: Frame) {
  const runtimeFetches: string[] = [];
  const previewFetches: string[] = [];
  page.on('request', req => {
    if (req.url().includes('/preview?')) previewFetches.push(req.url());
    if (req.frame() === frame && new URL(req.url()).hostname.startsWith('notale-content.') && !req.isNavigationRequest()) runtimeFetches.push(req.url());
  });
  await frame.evaluate(() => {
    const w = window as any;
    w.__fixtureState.count = 17;
    w.__stateIdentity = w.__fixtureState;
    (document.querySelector('#interactive-state') as HTMLInputElement).value = '用户输入保留';
    w.__runtimeRefreshes = [];
    w.__modeChanges = [];
    window.addEventListener('message', event => {
      if (event.data?.source === 'notale-host' && event.data.type === 'runtime-refresh') w.__runtimeRefreshes.push(event.data);
    });
    new MutationObserver(records => {
      for (const record of records) if (record.attributeName === 'data-notale-mode') {
        const value = document.documentElement.dataset.notaleMode;
        if (value !== 'edit' || (record.oldValue && record.oldValue !== 'edit')) w.__modeChanges.push([record.oldValue, value]);
      }
    }).observe(document.documentElement, { attributes: true, attributeOldValue: true, attributeFilter: ['data-notale-mode'] });
  });
  await page.evaluate(() => {
    const w = window as any;
    const original = document.querySelector('#canvas') as HTMLIFrameElement;
    w.__ordinaryCanvas = original;
    w.__ordinaryViolations = [];
    const check = () => {
      if (!original.isConnected || document.querySelector('#canvas') !== original) w.__ordinaryViolations.push('canvas replaced');
      if (getComputedStyle(original).display === 'none' || getComputedStyle(original).visibility === 'hidden') w.__ordinaryViolations.push('canvas hidden');
      const loading = document.querySelector('#canvas-loading') as HTMLElement | null;
      if (loading && !loading.hidden && getComputedStyle(loading).display !== 'none') w.__ordinaryViolations.push('loading shown');
    };
    new MutationObserver(records => {
      // oldValue catches even a show/hide pair completed in one event-loop turn.
      for (const record of records) {
        if ((record.target as HTMLElement).id === 'canvas-loading' && record.attributeName === 'hidden' && record.oldValue === null) w.__ordinaryViolations.push('loading briefly shown');
        if (record.target === original && record.attributeName === 'style' && /(?:display:\s*none|visibility:\s*hidden)/.test(record.oldValue ?? '')) w.__ordinaryViolations.push('canvas briefly hidden');
      }
      check();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'id', 'style', 'src'] });
  });
  return async () => {
    expect(await page.evaluate(() => (window as any).__ordinaryViolations)).toEqual([]);
    expect(runtimeFetches, 'ordinary edits must not fetch a compiled runtime into the active iframe').toEqual([]);
    expect(previewFetches, 'ordinary history must not request a compiled preview').toEqual([]);
    expect(await frame.evaluate(() => {
      const w = window as any;
      return {
        runtimeRefreshes: w.__runtimeRefreshes, modeChanges: w.__modeChanges,
        revision: w.__fixtureRevision, boots: w.__dynamicBoots,
        state: w.__fixtureState.count, identity: w.__stateIdentity === w.__fixtureState,
        input: (document.querySelector('#interactive-state') as HTMLInputElement).value,
        mode: document.documentElement.dataset.notaleMode,
      };
    })).toEqual({ runtimeRefreshes: [], modeChanges: [], revision: 'original', boots: 1, state: 17, identity: true, input: '用户输入保留', mode: 'edit' });
    const frameURL = new URL(await page.locator('#canvas').getAttribute('src') as string);
    expect(frameURL.hostname).toMatch(/^notale-content\./);
    expect(frameURL.searchParams.get('notaleMode')).toBe('edit');
  };
}

const edits = [
  { name: 'text', command: { type: 'element.patch', slideId: 'first', target: 'heading', patch: { text: '修改后的标题' } } },
  { name: 'position', command: { type: 'element.transform', slideId: 'first', target: 'heading', transform: { x: 60, y: 25, rotate: 0, scaleX: 1, scaleY: 1 } } },
  { name: 'resize', command: { type: 'element.transform', slideId: 'first', target: 'heading', transform: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, width: 360, height: 100 } } },
  { name: 'font', command: { type: 'element.patch', slideId: 'first', target: 'heading', patch: { style: { 'font-size': '56px' } } } },
  { name: 'color', command: { type: 'element.patch', slideId: 'first', target: 'heading', patch: { style: { color: '#dd2244' } } } },
];

async function headingState(page: Page) {
  return page.frameLocator('#canvas').locator('[data-notale-id="heading"]').evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { text: element.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.fontSize, color: style.color };
  });
}
async function history(page: Page, redo = false) {
  // Focus the real canvas so its keyboard bridge exercises the same path as editing.
  await page.locator('#canvas').focus();
  await page.keyboard.press(redo ? 'Control+Shift+z' : 'Control+z');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
}

for (const pending of [false, true]) {
  test(`${pending ? 'pending acknowledgement' : 'confirmed'} ordinary edits undo and redo without a canvas flash`, async ({ page }) => {
    const id = await createLecture();
    await page.goto(`/?document=${id}`);
    await ready(page, id);
    await synchronized(page);
    const audit = await installOrdinaryAudit(page, await frameOf(page));
    for (const edit of edits) await test.step(edit.name, async () => {
      const before = await headingState(page);
      let release = () => {};
      let held = false;
      const sent: Array<Record<string, any>> = [];
      const gate = new Promise<void>(resolve => { release = resolve; });
      const editURL = `**${api}/documents/${id}/edits`;
      if (pending) await page.route(editURL, async route => {
        sent.push(route.request().postDataJSON());
        if (held) return route.continue();
        const response = await route.fetch();
        expect(response.status(), await response.text()).toBe(200);
        held = true;
        await gate;
        await route.fulfill({ response });
      });
      try {
        await page.evaluate(command => {
          (window as any).__editPromise = (window as any).NotaleWorkbench.commands([command]);
        }, edit.command);
        if (pending) await expect.poll(() => held).toBe(true);
        else await synchronized(page);
        await expect.poll(() => headingState(page)).not.toEqual(before);
        const after = await headingState(page);
        await history(page);
        await expect.poll(() => headingState(page)).toEqual(before);
        await audit();
        await history(page, true);
        await expect.poll(() => headingState(page)).toEqual(after);
        release();
        await synchronized(page);
        if (pending) {
          expect(sent).toHaveLength(3);
          expect(sent[1]).toMatchObject({ baseVersion: sent[0].baseVersion, inverseMutationId: sent[0].mutationId, dependencies: [sent[0].mutationId] });
          expect(sent[2]).toMatchObject({ baseVersion: sent[0].baseVersion, inverseMutationId: sent[1].mutationId, dependencies: [sent[0].mutationId, sent[1].mutationId] });
        }
        await audit();
        await history(page);
        await synchronized(page);
        await expect.poll(() => headingState(page)).toEqual(before);
        if (pending) {
          expect(sent).toHaveLength(4);
          expect(sent[3]).toMatchObject({ baseVersion: sent[0].baseVersion + 3, inverseMutationId: sent[2].mutationId });
          expect(sent[3].dependencies ?? []).toEqual([]);
        }
        await audit();
      } finally {
        release();
        if (pending) await page.unroute(editURL);
      }
    });
  });
}

async function installHandoffGate(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as any;
    w.__initializationFailures = 0;
    window.addEventListener('notale-editor:initialization-failed', () => { w.__initializationFailures++; });
    const gate = w.__handoff = { armed: false, original: null as Window | null, target: null as Window | null, lastReady: null as MessageEvent | null, ready: [] as MessageEvent[], flush: [] as MessageEvent[], blockReady: true, blockFlush: true, bypass: false };
    window.addEventListener('message', event => {
      if (!gate.armed || gate.bypass || event.data?.source !== 'notale-slide' || event.source === gate.original) return;
      const current = document.querySelector('#canvas') as HTMLIFrameElement | null;
      if (event.source !== current?.contentWindow) return;
      if (event.data.type === 'ready' && event.data.data?.slideId === 'first' && gate.blockReady) {
        gate.target = event.source as Window;
        gate.lastReady = event;
        gate.ready.push(event);
        event.stopImmediatePropagation();
      } else if (event.data.type === 'author-flushed' && event.source === gate.target && gate.blockFlush) {
        gate.flush.push(event);
        event.stopImmediatePropagation();
      }
    }, true);
    w.__releaseHandoff = (kind: 'ready' | 'flush') => {
      if (kind === 'ready') gate.blockReady = false;
      else gate.blockFlush = false;
      gate.bypass = true;
      for (const event of gate[kind].splice(0)) window.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
      gate.bypass = false;
    };
  });
}

async function replaceSource(page: Page) {
  await page.evaluate(html => {
    const w = window as any;
    w.__handoff.armed = true;
    w.__handoff.original = (document.querySelector('#canvas') as HTMLIFrameElement).contentWindow;
    const slide = structuredClone(w.NotaleWorkbench.getSnapshot().document.slides.find((s: any) => s.id === 'first'));
    slide.html = html;
    w.__replacement = w.NotaleWorkbench.commands([{ type: 'slide.replace', slideId: 'first', slide }]);
  }, source('changed-script'));
}

test('a genuine script change retains the visible canvas until the replacement has flushed', async ({ page }, testInfo) => {
  await installHandoffGate(page);
  const id = await createLecture();
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  const original = await frameOf(page);
  await replaceSource(page);
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.ready.length)).toBeGreaterThan(0);
  const retained = page.locator('iframe[data-notale-retiring="true"]');
  await expect(retained).toBeVisible();
  await expect(retained).toHaveAttribute('inert', '');
  await expect(page.locator('#canvas')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('#canvas')).toHaveAttribute('inert', '');
  const hint = page.locator('#canvas-loading[data-mode="replacement"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('正在更新画布');
  const bounds = await hint.boundingBox();
  expect(bounds!.height).toBeLessThan(150);
  await page.screenshot({ path: testInfo.outputPath('retained-canvas-during-script-update.png') });
  await page.evaluate(() => (window as any).__releaseHandoff('ready'));
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.flush.length)).toBeGreaterThan(0);
  // Ready alone is insufficient: author state must paint and acknowledge first.
  await expect(retained).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCSS('visibility', 'hidden');
  await page.evaluate(() => {
    const gate = (window as any).__handoff;
    const event = gate.lastReady;
    window.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.flush.length)).toBeGreaterThan(1);
  await page.evaluate(() => {
    const gate = (window as any).__handoff;
    const event = gate.flush.shift();
    gate.bypass = true;
    window.dispatchEvent(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
    gate.bypass = false;
  });
  // A duplicate ready supersedes the first paint. Its older flush acknowledgement
  // cannot reveal the staging iframe before the latest paint is acknowledged.
  await expect(retained).toBeVisible();
  await expect(page.locator('#canvas')).toHaveCSS('visibility', 'hidden');
  await page.evaluate(() => (window as any).__releaseHandoff('flush'));
  await expect(retained).toHaveCount(0);
  await ready(page, id);
  await synchronized(page);
  await expect(page.locator('#canvas-loading')).toBeHidden();
  const replacement = await frameOf(page);
  expect(replacement).not.toBe(original);
  expect(await replacement.evaluate(() => (window as any).__fixtureRevision)).toBe('changed-script');
  expect(new URL(replacement.url()).searchParams.get('notaleMode')).toBe('edit');
  // A late message from the old display must not reinitialize the active canvas.
  await page.evaluate(() => {
    const w = window as any;
    w.__replacementIdentity = document.querySelector('#canvas');
    const authentic = w.__handoff.lastReady;
    window.dispatchEvent(new MessageEvent('message', { origin: authentic.origin, source: w.__handoff.original,
      data: { ...authentic.data, data: { ...authentic.data.data, runtimeId: 'stale-old-runtime', steps: 999 } },
    }));
  });
  await synchronized(page);
  expect(await page.evaluate(() => document.querySelector('#canvas') === (window as any).__replacementIdentity)).toBe(true);
  await expect(page.locator('#canvas-loading')).toBeHidden();
  await expect(page.frameLocator('#canvas').locator('html')).toHaveAttribute('data-notale-mode', 'edit');
});

for (const waitingFor of ['ready', 'flush']) test(`navigating away while replacement ${waitingFor} is pending discards stale canvas work`, async ({ page }) => {
  await installHandoffGate(page);
  const id = await createLecture();
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  await replaceSource(page);
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.ready.length)).toBeGreaterThan(0);
  if (waitingFor === 'flush') {
    await page.evaluate(() => (window as any).__releaseHandoff('ready'));
    await expect.poll(() => page.evaluate(() => (window as any).__handoff.flush.length)).toBeGreaterThan(0);
  }
  await expect(page.locator('iframe[data-notale-retiring="true"]')).toBeVisible();
  await page.evaluate(() => { void (window as any).NotaleWorkbench.showSlide('second'); });
  await expect(page.frameLocator('#canvas').locator('h1')).toHaveText('第二页');
  await ready(page, id);
  await expect(page.locator('iframe[data-notale-retiring="true"]')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__releaseHandoff('ready');
    (window as any).__releaseHandoff('flush');
  });
  await expect(page.frameLocator('#canvas').locator('h1')).toHaveText('第二页');
  await expect(page.locator('#canvas-loading')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__initializationFailures)).toBe(0);
  await page.evaluate(() => { void (window as any).NotaleWorkbench.showSlide('first'); });
  await ready(page, id);
  expect(await (await frameOf(page)).evaluate(() => (window as any).__fixtureRevision)).toBe('changed-script');
  await expect(page.locator('iframe[data-notale-retiring="true"]')).toHaveCount(0);
  await expect(page.locator('#canvas-loading')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__initializationFailures)).toBe(0);
});

test('retrying a slow replacement retains the original display and ignores the discarded staging frame', async ({ page }) => {
  await page.clock.install();
  await installHandoffGate(page);
  const id = await createLecture();
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  await replaceSource(page);
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.ready.length)).toBeGreaterThan(0);
  const retained = page.locator('iframe[data-notale-retiring="true"]');
  await expect(retained).toBeVisible();
  await page.evaluate(() => {
    (window as any).__retainedIdentity = document.querySelector('iframe[data-notale-retiring="true"]');
    (window as any).__firstStagingIdentity = document.querySelector('#canvas');
  });
  await page.clock.fastForward(8_000);
  await expect(page.locator('#canvas-loading')).toContainText('画布更新尚未完成');
  await page.locator('#retry-canvas').click();
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.ready.length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.querySelector('#canvas') === (window as any).__firstStagingIdentity)).toBe(false);
  expect(await page.evaluate(() => document.querySelector('iframe[data-notale-retiring="true"]') === (window as any).__retainedIdentity)).toBe(true);
  await expect(retained).toBeVisible();
  await page.evaluate(() => {
    const gate = (window as any).__handoff;
    const stale = gate.ready.shift();
    gate.bypass = true;
    window.dispatchEvent(new MessageEvent('message', { data: stale.data, origin: stale.origin, source: stale.source }));
    gate.bypass = false;
  });
  await expect(page.locator('#canvas')).toHaveCSS('visibility', 'hidden');
  await expect(retained).toBeVisible();
  await page.evaluate(() => (window as any).__releaseHandoff('ready'));
  await expect.poll(() => page.evaluate(() => (window as any).__handoff.flush.length)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__releaseHandoff('flush'));
  await ready(page, id);
  await expect(retained).toHaveCount(0);
  await expect(page.locator('#canvas-loading')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__initializationFailures)).toBe(0);
  expect(await (await frameOf(page)).evaluate(() => (window as any).__fixtureRevision)).toBe('changed-script');
});
