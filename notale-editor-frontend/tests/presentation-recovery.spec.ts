/* eslint-disable @typescript-eslint/no-explicit-any -- Tests the actual presentation window and its opaque iframe message boundary. */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Every API/content response in this suite is synthetic. No Notale backend or database is used.
test.use({ launchOptions: {
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--disable-features=LocalNetworkAccessChecks'],
} });

type FrameMode = 'ready' | 'silent' | 'handshake' | '502';
type ApiMode = 'ready' | '502' | 'hang';
const api = '/api';
const slideIds = ['first', 'middle', 'last'] as const;
type SlideId = typeof slideIds[number];
const names: Record<SlideId, string> = { first: '第一页', middle: '中间页', last: '最后一页' };
const maxSteps: Record<SlideId, number> = { first: 1, middle: 2, last: 0 };

function bridgeHtml(id: SlideId, channel: string, mode: FrameMode, load: number) {
  return `<!doctype html><html><body style="margin:0;background:#fff"><h1>${names[id]}</h1><output id="step">0</output><script>
  const id=${JSON.stringify(id)}, channel=${JSON.stringify(channel)}, mode=${JSON.stringify(mode)};
  const runtimeId=${JSON.stringify(`${id}-${load}`)}, max=${maxSteps[id]};
  const messages=[]; let enabled=mode!=='silent', step=0;
  const send=(type,data,override=channel)=>parent.postMessage({source:'notale-slide',channel:override,type,data},'*');
  const ready=(override=channel)=>send('ready',{runtimeId,max,step},override);
  window.__fixtureBridge={messages,ready,enable(){enabled=true;ready();},send};
  addEventListener('message',event=>{
    const m=event.data;if(m?.source!=='notale-host'||m.channel!==channel)return;
    messages.push(m);
    if(m.type==='state'&&enabled)ready();
    if(m.type==='seek'){step=m.data.step;document.querySelector('#step').textContent=String(step);}
    if(m.type==='presentation-flush')send('presentation-flushed',{requestId:m.data.requestId});
    if(m.type==='presentation-apply')send('presentation-apply-status',{failed:false});
  });
  if(mode==='ready')ready();
  </script></body></html>`;
}

async function fixture(context: BrowserContext) {
  const id = randomUUID(), session = randomUUID(), channel = `fixture-${randomUUID()}`;
  const modes: Record<SlideId, FrameMode> = { first: 'ready', middle: 'ready', last: 'ready' };
  const loads: Record<SlideId, number> = { first: 0, middle: 0, last: 0 };
  const requests = { document: 0, preview: 0 };
  const apiModes: { document: ApiMode; preview: ApiMode } = { document: 'ready', preview: 'ready' };
  const gates: Array<() => void> = [];
  const unexpected: string[] = [];
  const snapshot = { version: 3, document: {
    schemaVersion: 1, id, title: '放映故障恢复验收', width: 1600, height: 900,
    presentation: { loop: false },
    slides: slideIds.map(slideId => ({
      id: slideId, name: names[slideId], sourcePath: `${slideId}.html`, html: '', notes: '',
      transition: 'none', nativeStepCount: maxSteps[slideId], animations: [], components: [],
      steps: Array.from({ length: maxSteps[slideId] + 1 }, (_, step) => ({ name: `步骤 ${step}` })),
    })),
  } };
  // The catch-all is deliberately context-wide: auxiliary windows cannot escape to a live API.
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname;
    const resource = pathname === `${api}/documents/${id}` ? 'document'
      : pathname === `${api}/documents/${id}/preview` ? 'preview' : undefined;
    if (resource) {
      requests[resource]++;
      const mode = apiModes[resource];
      if (mode === 'hang') await new Promise<void>(resolve => gates.push(resolve));
      if (mode === '502') return route.fulfill({ status: 502, json: { error: 'FIXTURE_UPSTREAM_UNAVAILABLE' } });
      const value = resource === 'document' ? snapshot : {
        channel, version: 3, expiresAt: Date.now() + 3_600_000, renewAfterMs: 1_800_000,
        slides: slideIds.map(slideId => ({ id: slideId, url: `${url.origin}/notale-content/presentation-fixture/${id}/${slideId}.html` })),
      };
      return route.fulfill({ json: value }).catch(() => {}); // A timed-out fixture request can already be aborted.
    }
    if (pathname.includes('/poster')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#ddd"/></svg>' });
    if (pathname === `${api}/documents/${id}/preview/renew`) return route.fulfill({ json: { channel, version: 3, expiresAt: Date.now() + 3_600_000, renewAfterMs: 1_800_000 } });
    if (pathname.startsWith(`${api}/`)) {
      unexpected.push(`${route.request().method()} ${pathname}`);
      return route.fulfill({ status: 404, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
    }
    return route.fulfill({ json: [] });
  });
  await context.route(`**/notale-content/presentation-fixture/${id}/*.html*`, route => {
    const slideId = new URL(route.request().url()).pathname.split('/').at(-1)!.replace('.html', '') as SlideId;
    const load = ++loads[slideId], mode = modes[slideId];
    return route.fulfill(mode === '502'
      ? { status: 502, contentType: 'text/html; charset=utf-8', body: '<h1>Fixture upstream unavailable</h1>' }
      : { contentType: 'text/html; charset=utf-8', body: bridgeHtml(slideId, channel, mode, load) });
  });
  // Verify the exit URL without mounting an editor or issuing any document writes.
  await context.route(`**/?document=${id}`, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>已返回编辑器</h1>' }));
  return {
    id, session, channel, modes, loads, requests, apiModes, unexpected, document: snapshot.document,
    url: (extra = '') => `/present?document=${id}&version=3&session=${session}${extra}`,
    release: () => gates.splice(0).forEach(resolve => resolve()),
    async checkpoint(page: Page, slideId: SlideId, step: number) {
      const state = {
        protocol: 2, documentId: id, version: 3, session, term: 1, sequence: 4,
        slideId, step, max: maxSteps[slideId], ended: false, blank: false,
        timer: { elapsed: 1000, runningSince: null }, autoPaused: true,
        viewport: { scale: 1, x: 0, y: 0 },
        annotations: { middle: '<path d="M 10 10 L 100 100" stroke="red"/>' },
        runtime: { middle: { step: 2, controls: { answer: 'kept' }, components: {}, charts: {}, scenes: {}, media: {}, dom: {}, capabilities: [] } },
      };
      await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: `notale-show:${session}:${id}`, state });
      return state;
    },
  };
}

const state = (page: Page) => page.evaluate(() => (window as any).NotaleShow?.state());
async function expectPosition(page: Page, slideId: SlideId, ready = true, step?: number) {
  await expect.poll(() => state(page)).toMatchObject({ slideId, ready, ...(step === undefined ? {} : { step }) });
  await expect.poll(async () => (await state(page))?.control).toMatch(/^(controlling|audience|following)$/);
}
async function activeFrame(page: Page, slideId: SlideId) {
  const handle = await page.locator(`.reveal iframe[data-slide-id="${slideId}"]`).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error(`Missing fixture iframe for ${slideId}`);
  return frame;
}
const loading = (page: Page) => page.locator('.ps-load-status');
const retryPage = (page: Page) => page.getByRole('button', { name: '重试本页', exact: true });

// Regression: the show has already worked before a later page's content endpoint fails.
test('a broken middle page can be skipped in both directions, selected around, and exited', async ({ page, context }) => {
  const f = await fixture(context);
  f.modes.middle = '502';
  await page.goto(f.url());
  await expectPosition(page, 'first', true, 0);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'first', true, 1);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'middle', false, 0);
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#prev')).toBeEnabled();
  await page.locator('#next').click();
  await expectPosition(page, 'last', true, 0);
  await page.locator('#prev').click();
  await expectPosition(page, 'middle', false, 2);
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'first', true, 1);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'middle', false);
  await page.getByRole('button', { name: '选择页面', exact: true }).click();
  await page.locator('.ps-overview-card').filter({ hasText: '最后一页' }).click();
  await expectPosition(page, 'last', true);
  expect(f.loads).toEqual({ first: 1, middle: 1, last: 1 });
  await page.getByRole('button', { name: '结束放映', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已返回编辑器' })).toBeVisible();
  expect(f.unexpected).toEqual([]);
});

test('silent runtime shows recovery after 20 seconds and a late valid handshake restores the page', async ({ page, context }, testInfo) => {
  const f = await fixture(context);
  f.modes.middle = 'silent';
  await page.setViewportSize({ width: 390, height: 720 });
  await page.clock.install();
  await page.goto(f.url());
  await expectPosition(page, 'first');
  await page.evaluate(() => (window as any).NotaleShow.reveal.slide(1));
  await expectPosition(page, 'middle', false);
  await expect(loading(page)).toBeVisible();
  await expect(retryPage(page)).toHaveCount(0);
  await page.clock.fastForward(19_000);
  await expect(retryPage(page)).toHaveCount(0);
  await page.clock.fastForward(1_100);
  await expect(retryPage(page)).toBeVisible();
  await expect(page.getByRole('button', { name: '结束放映', exact: true })).toBeVisible();
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#next')).toHaveAttribute('aria-label', '下一页 · →');
  for (const button of [retryPage(page), page.locator('#prev'), page.locator('#next'), page.getByRole('button', { name: '结束放映', exact: true })]) {
    expect(await button.evaluate(node => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && !!hit && node.contains(hit);
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('presentation-waiting-narrow.png') });
  const frame = await activeFrame(page, 'middle');
  await frame.evaluate(() => (window as any).__fixtureBridge.ready('incorrect-channel'));
  await page.evaluate(channel => {
    const source = document.querySelector<HTMLIFrameElement>('.reveal iframe[data-slide-id="middle"]')!.contentWindow;
    window.dispatchEvent(new MessageEvent('message', { source, origin: 'https://wrong-origin.invalid', data: { source: 'notale-slide', channel, type: 'ready', data: { runtimeId: 'invalid', max: 99 } } }));
  }, f.channel);
  await expectPosition(page, 'middle', false, 0);
  await frame.evaluate(() => (window as any).__fixtureBridge.enable());
  await expectPosition(page, 'middle', true, 0);
  await expect(retryPage(page)).toHaveCount(0);
  await expect(loading(page)).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'middle', true, 1);
  expect(f.loads.middle).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('presentation-recovered-narrow.png') });
  expect(f.unexpected).toEqual([]);
});

test('rapid navigation crosses a pending page without stale readiness or redundant loads', async ({ page, context }) => {
  const f = await fixture(context);
  f.modes.middle = 'silent';
  await page.goto(f.url());
  await expectPosition(page, 'first', true, 0);
  // Exercise multiple real key handlers before the first frame flush acknowledges.
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  await expectPosition(page, 'last', true, 0);
  expect((await state(page)).ended).toBe(false);
  await page.evaluate(() => {
    for (let index = 0; index < 2; index++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  await expectPosition(page, 'first', true, 1);
  const pending = await activeFrame(page, 'middle');
  await pending.evaluate(() => (window as any).__fixtureBridge.enable());
  await expectPosition(page, 'first', true, 1);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'middle', true, 0);
  expect(f.loads).toEqual({ first: 1, middle: 1, last: 1 });
  expect(f.unexpected).toEqual([]);
});

test('retry replaces only the failed iframe and preserves steps, annotations, and synchronized runtime', async ({ page, context }) => {
  const f = await fixture(context);
  f.modes.middle = 'silent';
  const saved = await f.checkpoint(page, 'middle', 2);
  await page.clock.install();
  await page.goto(f.url());
  await expectPosition(page, 'middle', false, 2);
  await page.clock.fastForward(20_100);
  await expect(retryPage(page)).toBeVisible();
  await page.evaluate(() => {
    const current = document.querySelector<HTMLIFrameElement>('.reveal iframe[data-slide-id="middle"]')!;
    (window as any).__oldPresentationWindow = current.contentWindow;
    (window as any).__oldPresentationFrames = [...document.querySelectorAll('.reveal iframe')];
  });
  f.modes.middle = 'handshake';
  // Two user click events can arrive before React removes the recovery control.
  await retryPage(page).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expectPosition(page, 'middle', true, 2);
  const current = await state(page);
  expect(current.version).toBe(3);
  expect(current.annotations).toEqual(saved.annotations);
  expect(current.runtime).toEqual(saved.runtime);
  expect(f.loads).toEqual({ first: 1, middle: 2, last: 1 });
  expect(await page.evaluate(() => {
    const old = (window as any).__oldPresentationFrames as HTMLIFrameElement[];
    return [...document.querySelectorAll<HTMLIFrameElement>('.reveal iframe')].map((frame, index) => frame === old[index]);
  })).toEqual([true, false, true]);
  const restored = await activeFrame(page, 'middle');
  await expect(restored.locator('#step')).toHaveText('2');
  expect(await restored.evaluate(() => (window as any).__fixtureBridge.messages.some((message: any) => message.type === 'presentation-apply' && message.data.patch.controls.answer === 'kept'))).toBe(true);
  await expect(page.locator('.ps-ink path')).toHaveAttribute('d', 'M 10 10 L 100 100');
  await page.evaluate(channel => window.dispatchEvent(new MessageEvent('message', {
    source: (window as any).__oldPresentationWindow, origin: 'null',
    data: { source: 'notale-slide', channel, type: 'ready', data: { runtimeId: 'stale-removed-frame', max: 99 } },
  })), f.channel);
  expect((await state(page)).max).toBe(2);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'last', true);
  await page.keyboard.press('ArrowLeft');
  await expectPosition(page, 'middle', true, 2);
  expect(f.loads.middle).toBe(2);
  expect(f.unexpected).toEqual([]);
});

for (const resource of ['document', 'preview'] as const) {
  test(`an initial ${resource} 502 offers a reload that starts a clean presentation`, async ({ page, context }) => {
    const f = await fixture(context);
    f.apiModes[resource] = '502';
    await page.goto(f.url());
    await expect(page.getByText('无法加载放映内容（502）', { exact: true })).toBeVisible();
    f.apiModes[resource] = 'ready';
    await page.getByRole('button', { name: '重新加载放映', exact: true }).click();
    await expectPosition(page, 'first', true, 0);
    expect(f.requests[resource]).toBe(2);
    expect(f.unexpected).toEqual([]);
  });
}

test('initialization times out after 30 seconds and can exit without a snapshot', async ({ page, context }) => {
  const f = await fixture(context);
  f.apiModes.document = 'hang';
  await page.clock.install();
  try {
    await page.goto(f.url());
    await expect.poll(() => f.requests.document).toBe(1);
    await expect(page.getByRole('button', { name: '结束放映', exact: true })).toBeVisible();
    await page.clock.fastForward(30_100);
    await expect(page.getByRole('button', { name: '重新加载放映', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '结束放映', exact: true }).click();
    await expect(page.getByRole('heading', { name: '已返回编辑器' })).toBeVisible();
    expect(f.unexpected).toEqual([]);
  } finally {
    f.release();
  }
});

test('an audience follows the controller away from a silent page and back to a cached page', async ({ page, context }) => {
  const f = await fixture(context);
  f.modes.middle = 'silent';
  await page.goto(f.url());
  await expectPosition(page, 'first');
  const audience = await context.newPage();
  await audience.goto(f.url('&audience=1'));
  await expectPosition(audience, 'first');
  await page.keyboard.press('ArrowRight');
  await expectPosition(audience, 'first', true, 1);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'middle', false);
  await expectPosition(audience, 'middle', false);
  await page.keyboard.press('ArrowRight');
  await expectPosition(page, 'last');
  await expectPosition(audience, 'last');
  await page.keyboard.press('Home');
  await expectPosition(page, 'first', true, 0);
  await expectPosition(audience, 'first', true, 0);
  expect(f.loads).toEqual({ first: 2, middle: 2, last: 2 });
  await audience.close();
  expect(f.unexpected).toEqual([]);
});

for (const loop of [false, true]) {
  test(`a pending single-page show ${loop ? 'loops safely' : 'can end and return to its page'}`, async ({ page, context }) => {
    const f = await fixture(context);
    f.document.slides.splice(1);
    f.document.presentation.loop = loop;
    f.modes.first = 'silent';
    await page.goto(f.url());
    await expectPosition(page, 'first', false, 0);
    await expect(page.locator('#prev')).toBeDisabled();
    await page.locator('#next').click();
    if (loop) {
      await expect.poll(() => state(page)).toMatchObject({ slideId: 'first', ready: false, step: 0, ended: false });
    } else {
      await expect(page.getByRole('heading', { name: '本次放映已结束', exact: true })).toBeVisible();
      await expect(page.locator('#next')).toBeDisabled();
      await page.locator('#prev').click();
      await expect.poll(() => state(page)).toMatchObject({ slideId: 'first', ready: false, step: 0, ended: false });
    }
    expect(f.loads).toEqual({ first: 1, middle: 0, last: 0 });
    await page.getByRole('button', { name: '结束放映', exact: true }).click();
    await expect(page.getByRole('heading', { name: '已返回编辑器' })).toBeVisible();
    expect(f.unexpected).toEqual([]);
  });
}
