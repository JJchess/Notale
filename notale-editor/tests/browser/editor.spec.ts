import { test, expect, type Page } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Snapshot } from '../../src/domain/model.js';
import { Pool } from 'pg';
import { unzipSync } from 'fflate';
import { createServer } from 'node:http';
import { lookup } from 'mime-types';
import { template } from '../../src/browser/templates.js';

async function refreshNativeState(page: Page) {
  const channel = await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).__NOTALE__.channel);
  await page.evaluate(
    (channel) =>
      new Promise<void>((resolve) => {
        const target = (document.querySelector('#canvas') as HTMLIFrameElement).contentWindow!;
        const received = (event: MessageEvent) => {
          if (
            event.source === target &&
            event.data?.channel === channel &&
            event.data.type === 'ready'
          ) {
            window.removeEventListener('message', received);
            resolve();
          }
        };
        window.addEventListener('message', received);
        target.postMessage({ source: 'notale-host', channel, type: 'state', data: {} }, '*');
      }),
    channel,
  );
}

async function teachingFixture(page: Page) {
  const doc = await clone(page),
    slide = doc.slides.find((item) => item.sourcePath === 'page-20.html')!;
  await showSlide(page, slide.id);
  const run = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const rate = 8000,
    length = rate * 2,
    wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(length * 2, 40);
  await run([
    { type: 'slide.move', slideId: slide.id, index: 0 },
    {
      type: 'slide.update',
      slideId: slide.id,
      patch: { notes: '页面讲稿：先观察，再解释。', advanceAfter: 0 },
    },
    {
      type: 'element.insert',
      slideId: slide.id,
      html: `<section id="timeline-card" style="position:absolute;left:70px;top:90px;width:460px;padding:24px;background:#fff8e8;color:#173b32;z-index:80"><h2 id="timeline-title" style="font-size:30px;margin:0 0 18px">逐步推导</h2><button id="timeline-button">查看解释</button><p id="timeline-answer" style="font-size:22px">每一步都保留相应的互动状态。</p><audio id="timeline-audio" controls muted src="data:audio/wav;base64,${wav.toString('base64')}"></audio></section>`,
    },
  ]);
  const ids = await frameOf(page)
    .locator('#timeline-card')
    .evaluate((root) =>
      Object.fromEntries(
        [root, ...root.querySelectorAll('[data-notale-id]')].map((el) => [
          el.id,
          el.getAttribute('data-notale-id')!,
        ]),
      ),
    );
  await run([
    {
      type: 'component.set',
      slideId: slide.id,
      component: {
        id: 'step-component',
        root: ids['timeline-card'],
        name: '逐步推导',
        initial: 'base',
        states: [
          { id: 'base', name: '问题', patches: { [ids['timeline-answer']]: { visible: false } } },
          { id: 'answer', name: '解释', patches: { [ids['timeline-answer']]: { visible: true } } },
        ],
        events: [{ id: 'reveal', target: ids['timeline-button'], event: 'click', to: 'answer' }],
        steps: [{ step: 2, state: 'answer' }],
      },
    },
    {
      type: 'animation.set',
      slideId: slide.id,
      animation: {
        id: 'step-entrance',
        target: ids['timeline-title'],
        step: 2,
        trigger: 'click',
        effect: 'fade-in',
        duration: 600,
      },
    },
    {
      type: 'media.update',
      slideId: slide.id,
      target: ids['timeline-audio'],
      patch: { settings: { startStep: 2, startAt: 0.2, endAt: 1.8, muted: true } },
    },
  ]);
  const current = async () =>
    (
      (await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot())) as Snapshot
    ).document.slides.find((item) => item.id === slide.id)!;
  return { doc, slide, ids, run, current };
}

test('teaching sequence editing remaps real native steps, replayed animation, component states and media through recovery and portability', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const { doc, slide, ids, run, current } = await teachingFixture(page);
  const ready = async () => {
    await expect(page.locator('#save-status')).toContainText('已保存');
    await expect(page.locator('#teaching-steps')).not.toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await page.locator('[data-tab="animation"]').click();
  await page.locator('#teaching-initialize').click();
  await ready();
  const plan = (await current()).steps!,
    original = plan[2].id;
  await page.locator('#teaching-step').selectOption(original);
  await page.locator('#teaching-name').fill('解释与演示');
  await page.locator('#teaching-notes').fill('本步骤讲稿：先指出变化，再播放示例。');
  await page.locator('#teaching-advance').fill('0');
  await page.locator('#teaching-save').click();
  await ready();
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#teaching-duplicate').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await ready();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  const duplicate = payloads[0].commands[0].newId;
  await showSlide(page, slide.id);
  await page.locator('[data-tab="animation"]').click();
  await page.locator('#teaching-step').selectOption(duplicate);
  await page.locator('#teaching-up').click();
  await ready();
  await page.locator('#teaching-up').click();
  await ready();
  expect((await current()).steps![1].id).toBe(duplicate);
  expect((await current()).stepMap.slice(0, 4)).toEqual([0, 2, 1, 2]);
  const title = frameOf(page).locator('#timeline-title'),
    audio = frameOf(page).locator('#timeline-audio'),
    answer = frameOf(page).locator('#timeline-answer');
  await page.locator('#teaching-preview').click();
  await expect(frameOf(page).locator('html')).toHaveAttribute('data-notale-mode', 'play');
  await expect(page.locator('#step')).toHaveValue('1');
  const seek = async (step: number, animate = true) =>
    frameOf(page)
      .locator('html')
      .evaluate((_, { step, animate }) => (window as any).NotaleBridge.seek(step, animate), {
        step,
        animate,
      });
  await expect(answer).toBeVisible();
  await expect
    .poll(() =>
      frameOf(page)
        .locator('[data-step="2"]')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
  expect(Number(await title.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.95);
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0.3);
  await audio.evaluate((el) => {
    (el as HTMLAudioElement).currentTime = 1.4;
  });
  await seek(3);
  expect(Number(await title.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.95);
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).currentTime)).toBeLessThan(0.6);
  await expect.poll(() => title.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await seek(2, false);
  await expect(answer).toBeHidden();
  await expect
    .poll(() =>
      frameOf(page)
        .locator('[data-step="2"]')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('0');
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(true);
  await page.locator('#interact').click();
  await page.locator('#teaching-step').selectOption(original);
  await page.locator('#teaching-remove').click();
  await ready();
  expect(
    (await current()).animations.filter((cue) => cue.target === ids['timeline-title']),
  ).toHaveLength(1);
  await page.locator('#undo').click();
  await ready();
  expect(
    (await current()).animations.filter((cue) => cue.target === ids['timeline-title']),
  ).toHaveLength(2);
  await page.locator('#redo').click();
  await ready();
  await page.locator('#teaching-step').selectOption(duplicate);
  await page.screenshot({ path: '.local/teaching-step-editor.png' });
  await run([
    { type: 'step.update', slideId: slide.id, id: plan[0].id, patch: { advanceAfter: 500 } },
    { type: 'step.update', slideId: slide.id, id: duplicate, patch: { advanceAfter: 0 } },
  ]);
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/index.html`);
    await expect(page.locator('#step-select')).toHaveValue('1');
    await expect(page.frameLocator('#slide').locator('#timeline-answer')).toBeVisible();
    await page.locator('#notes-toggle').click();
    await expect(page.locator('#notes')).toHaveText(
      '页面讲稿：先观察，再解释。\n\n本步骤讲稿：先指出变化，再播放示例。',
    );
    await page.locator('#auto').click();
    await page.locator('#step-select').selectOption('2');
    await expect(page.frameLocator('#slide').locator('#timeline-answer')).toBeHidden();
    await page.locator('#step-select').selectOption('1');
    await expect(page.frameLocator('#slide').locator('#timeline-answer')).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, slide.id);
  expect((await current()).steps![1].id).toBe(duplicate);
  await page.locator('[data-tab="animation"]').click();
  await page.locator('#teaching-step').selectOption(duplicate);
  await expect(page.locator('#teaching-notes')).toHaveValue('本步骤讲稿：先指出变化，再播放示例。');
});

test('speaker teaching notes and per-step pacing synchronize with the audience and survive reopening', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const { doc, slide, run, current } = await teachingFixture(page);
  await run([{ type: 'step.initialize', slideId: slide.id }]);
  const steps = (await current()).steps!;
  await run([
    { type: 'slide.update', slideId: slide.id, patch: { advanceAfter: 250 } },
    {
      type: 'step.update',
      slideId: slide.id,
      id: steps[0].id,
      patch: { name: '观察问题', notes: '先让学生观察。', advanceAfter: 0 },
    },
    {
      type: 'step.update',
      slideId: slide.id,
      id: steps[1].id,
      patch: { name: '等待解释', notes: '这一段自动过渡到演示。', advanceAfter: 800 },
    },
    {
      type: 'step.update',
      slideId: slide.id,
      id: steps[2].id,
      patch: { name: '演示与讨论', notes: '停在这里讨论，不自动翻页。', advanceAfter: 0 },
    },
  ]);
  await page.goto(`/show.html?document=${doc.id}&slide=${slide.id}&speaker=1`);
  await expect(page.locator('#control-status')).toContainText('控制');
  await expect(page.locator('#notes')).toContainText('先让学生观察。');
  const opened = context.waitForEvent('page');
  await page.locator('#audience').click();
  const audience = await opened;
  await expect(audience.locator('#counter')).toContainText('step 0');
  await page.locator('#show-step').selectOption('1');
  await expect(page.locator('#notes')).toContainText('这一段自动过渡到演示。');
  await expect(page.locator('#show-step')).toHaveValue('2');
  await expect(audience.locator('#show-step')).toHaveValue('2');
  await expect(page.locator('#notes')).toHaveText(
    '页面讲稿：先观察，再解释。\n\n停在这里讨论，不自动翻页。',
  );
  const speakerFrame = page.frameLocator('.slides section.present iframe'),
    audienceFrame = audience.frameLocator('.slides section.present iframe');
  await expect(audienceFrame.locator('#timeline-answer')).toBeVisible();
  expect(
    await speakerFrame.locator('#timeline-audio').evaluate((el) => (el as HTMLAudioElement).paused),
  ).toBe(true);
  await expect
    .poll(() =>
      audienceFrame
        .locator('#timeline-audio')
        .evaluate((el) => (el as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(0.3);
  await page.waitForTimeout(600);
  await expect(page.locator('#show-step')).toHaveValue('2');
  await page.screenshot({ path: '.local/teaching-speaker-notes.png' });
  await page.reload();
  await expect(page.locator('#show-step')).toHaveValue('2');
  await expect(page.locator('#notes')).toContainText('停在这里讨论');
  await page.locator('#show-step').selectOption('0');
  await expect(audience.locator('#show-step')).toHaveValue('0');
  await expect(audienceFrame.locator('#timeline-answer')).toBeHidden();
  await audience.close();
});

test('shared teaching component instances retain overrides, stable references, history and portable interaction', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    source = doc.slides[0],
    dest = doc.slides[1];
  const command = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const ready = async () => {
    await expect(page.locator('#save-status')).toContainText('已保存');
    await expect(page.locator('#author-components')).not.toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const select = async (id: string) => {
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
    await page.locator('[data-tab="format"]').click();
  };
  const state = async () =>
    (await (await request.get(`/api/documents/${doc.id}`)).json()) as Snapshot;
  await command([
    {
      type: 'element.insert',
      slideId: source.id,
      html: '<section data-notale-id="shared-card" style="position:absolute;left:100px;top:100px;width:460px;padding:24px;background:#fff8e8;color:#173b32;z-index:70;display:flex;flex-direction:column;gap:18px"><h2 data-notale-id="shared-title" style="font-size:32px;margin:0">共享问题</h2><button data-notale-id="shared-button" style="font-size:22px">查看解释</button><p data-notale-id="shared-answer" style="font-size:24px;margin:0">模型的误差可以相互抵消。</p></section>',
    },
  ]);
  // Insertion assigns source IDs; use the actual persistent objects returned by the backend.
  const ids = await frameOf(page)
    .locator('h2')
    .filter({ hasText: '共享问题' })
    .evaluate((el) => ({
      root: el.parentElement!.getAttribute('data-notale-id')!,
      title: el.getAttribute('data-notale-id')!,
      button: el.parentElement!.querySelector('button')!.getAttribute('data-notale-id')!,
      answer: el.parentElement!.querySelector('p')!.getAttribute('data-notale-id')!,
    }));
  await command([
    {
      type: 'component.set',
      slideId: source.id,
      component: {
        id: 'shared-teaching',
        root: ids.root,
        name: '可复用讲授卡片',
        initial: 'base',
        states: [
          { id: 'base', name: '问题', patches: { [ids.answer]: { visible: false } } },
          { id: 'answer', name: '解释', patches: { [ids.answer]: { visible: true } } },
        ],
        events: [{ id: 'reveal', target: ids.button, event: 'click', to: 'answer' }],
        steps: [{ step: 2, state: 'answer' }],
      },
    },
  ]);
  await select(ids.root);
  await page.locator('#author-library-publish').click();
  await ready();
  const definition = (await state()).document.componentLibrary![0];
  expect(definition.name).toBe('可复用讲授卡片');
  await showSlide(page, dest.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#author-library').selectOption(definition.id);
  await page.locator('#author-library-insert').click();
  await ready();
  await command([
    {
      type: 'component.instantiate',
      slideId: dest.id,
      definitionId: definition.id,
      offset: { x: 600, y: 30 },
    },
  ]);
  const [first, second] = (await state()).document.slides[1].components!;
  const title = first.instance!.objects[ids.title],
    answer = first.instance!.objects[ids.answer],
    button = first.instance!.objects[ids.button];
  await select(first.root);
  await page.locator('#author-target').selectOption(title);
  await page.locator('#author-override-text-enabled').check();
  await page.locator('#author-override-text').fill('这一页的独立问题');
  await page.locator('#author-override-style').fill('{"color":"#8c351f"}');
  await page.locator('#author-override-save').click();
  await ready();

  await page.locator('#author-state').selectOption('answer');
  await page.locator('#author-state-preview').click();
  await expect(frameOf(page).locator(`[data-notale-id="${answer}"]`)).toBeVisible();
  await select(first.root);
  await page.evaluate(async () => {
    const editor = (window as any).NotaleWorkbench;
    await editor.copySelection('copy');
    await editor.pasteSelection();
    await editor.whenReady();
  });
  const copied = (await state()).document.slides[1].components!.find(
    (item) => item.id !== first.id && item.id !== second.id,
  )!;
  expect(copied.initial).toBe('answer');
  expect(copied.instance!.initial).toBe('answer');
  await command([
    {
      type: 'element.transform',
      slideId: dest.id,
      target: copied.root,
      transform: { x: 0, y: 350 },
    },
  ]);
  await showSlide(page, source.id);
  await command([
    {
      type: 'element.patch',
      slideId: source.id,
      target: ids.title,
      patch: { text: '统一更新的问题' },
    },
    {
      type: 'element.patch',
      slideId: source.id,
      target: ids.button,
      patch: { text: '显示共同解释' },
    },
  ]);
  await select(ids.root);
  let lost = false;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.locator('#author-library-publish').click();
  await expect(page.locator('#save-status')).toContainText('未保存');
  const committed = await state();
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await ready();
  expect((await state()).version).toBe(committed.version);
  await showSlide(page, dest.id);
  const object = (id: string) => frameOf(page).locator(`[data-notale-id="${id}"]`);
  await expect(object(title)).toHaveText('这一页的独立问题');
  await expect(object(second.instance!.objects[ids.title])).toHaveText('统一更新的问题');
  await expect(object(button)).toHaveText('显示共同解释');
  expect(
    (await state()).document.slides[1].components!.find((item) => item.id === copied.id)!.initial,
  ).toBe('answer');
  await expect(object(copied.instance!.objects[ids.answer])).toBeVisible();

  await page.locator('#undo').click();
  await ready();
  await expect(object(button)).toHaveText('查看解释');
  await page.locator('#redo').click();
  await ready();
  await expect(object(button)).toHaveText('显示共同解释');
  await page.locator('#interact').click();
  await object(button).click();
  await expect(object(answer)).toBeVisible();
  await expect(object(second.instance!.objects[ids.answer])).toBeHidden();
  await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).NotaleBridge.seek(0, false));
  await expect(object(answer)).toBeHidden();
  await page.screenshot({ path: '.local/shared-component-library.png' });
  await page.locator('#interact').click();
  await command([{ type: 'slide.delete', slideId: source.id }]);
  await select(first.root);
  await page.locator('#author-library').selectOption(definition.id);
  await page.locator('#author-library-edit').click();
  await ready();
  const checkout = (await state()).document.slides.find((item) =>
    item.sourcePath.startsWith('components/'),
  )!;
  expect(checkout.hidden).toBe(true);
  await command([
    {
      type: 'element.patch',
      slideId: checkout.id,
      target: ids.button,
      patch: { text: '从组件库继续编辑' },
    },
  ]);
  await select(ids.root);
  await page.locator('#author-library-publish').click();
  await ready();
  await showSlide(page, dest.id);
  await expect(object(button)).toHaveText('从组件库继续编辑');
  await expect(object(title)).toHaveText('这一页的独立问题');
  await page.locator('#undo').click();
  await ready();
  await expect(object(button)).toHaveText('显示共同解释');
  await page.locator('#redo').click();
  await ready();
  await expect(object(button)).toHaveText('从组件库继续编辑');
  const exported = await request.get(`/api/documents/${doc.id}/export`);
  expect(exported.status()).toBe(200);
  const bytes = await exported.body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${dest.sourcePath}`,
    );
    await expect(page.locator(`[data-notale-id="${title}"]`)).toHaveText('这一页的独立问题');
    await page.locator(`[data-notale-id="${button}"]`).click();
    await expect(page.locator(`[data-notale-id="${answer}"]`)).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const restored = await imported.json();
  created.push(restored.document.id);
  await page.goto(`/workbench.html?document=${restored.document.id}`);
  await showSlide(page, dest.id);
  await command([{ type: 'component.instantiate', slideId: dest.id, definitionId: definition.id }]);
  expect(
    (await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot())).document.slides[0]
      .components.length,
  ).toBe(4);
});

test('component hierarchy selection and constrained layouts preserve actual reflow through resize, updates and reopening', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    slide = doc.slides[0];
  const command = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await command([
    {
      type: 'element.insert',
      slideId: slide.id,
      html: '<section style="position:absolute;left:120px;top:130px;width:600px;padding:20px;background:#fff8e8;z-index:80"><h2 style="font-size:28px;margin:0">布局约束</h2><p style="font-size:22px;margin:0">这是一段会随着容器宽度重新排版的解释文字，文字字号保持不变。</p><button style="font-size:20px">继续</button></section>',
    },
  ]);
  const ids = await frameOf(page)
    .locator('h2')
    .filter({ hasText: '布局约束' })
    .evaluate((el) => ({
      root: el.parentElement!.getAttribute('data-notale-id')!,
      title: el.getAttribute('data-notale-id')!,
      text: el.parentElement!.querySelector('p')!.getAttribute('data-notale-id')!,
    }));
  await command([
    {
      type: 'component.set',
      slideId: slide.id,
      component: {
        id: 'layout-card',
        root: ids.root,
        name: '布局组件',
        initial: 'base',
        states: [{ id: 'base', name: '初始', patches: {} }],
      },
    },
  ]);
  await page.locator('[data-tab="format"]').click();
  const title = frameOf(page).locator(`[data-notale-id="${ids.title}"]`),
    root = frameOf(page).locator(`[data-notale-id="${ids.root}"]`);
  await title.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual([ids.root]);
  await title.dblclick();
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual([ids.title]);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual([ids.root]);
  await page.locator('#author-layout').selectOption('column');
  await page.locator('#author-width-value').fill('500');
  await page.locator('#author-padding').fill('24');
  await page.locator('#author-gap').fill('18');
  await page.locator('#author-layout-save').click();
  await expect.poll(() => root.evaluate((el) => getComputedStyle(el).width)).toBe('500px');
  await page.locator('#author-target').selectOption(ids.text);
  await page.locator('#author-child-width').selectOption('fill');
  await page.locator('#author-child-layout-save').click();
  await expect(page.locator('#author-components')).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect.poll(() => root.evaluate((el) => getComputedStyle(el).gap)).toBe('18px');
  const before = await root.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    width: el.getBoundingClientRect().width,
    text: getComputedStyle(el.querySelector('p')!).fontSize,
  }));
  await command([
    {
      type: 'container.layout',
      slideId: slide.id,
      target: ids.root,
      layout: {
        mode: 'column',
        gap: 18,
        padding: 24,
        width: 'fixed',
        widthValue: 300,
        height: 'hug',
        children: { [ids.text]: { width: 'fill', height: 'hug' } },
      },
    },
  ]);
  const after = await root.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    width: el.getBoundingClientRect().width,
    text: getComputedStyle(el.querySelector('p')!).fontSize,
  }));
  expect(after.width).toBeLessThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
  expect(after.text).toBe(before.text);
  await page.reload();
  await showSlide(page, slide.id);
  await expect.poll(() => root.evaluate((el) => getComputedStyle(el).width)).toBe('300px');
  await page.screenshot({ path: '.local/component-layout-constraints.png' });
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.document.slides[0].constraints[ids.root].children[ids.text].width).toBe('fill');
});
let source: Snapshot;
const created: string[] = [];
test.beforeAll(async ({ request }) => {
  const documents = await (await request.get('/api/documents')).json();
  expect(documents.length).toBeGreaterThan(0);
  const fixture =
    documents.find((d: { title: string }) => d.title === '集成学习 · 完整资源讲义') ??
    documents.find(
      (d: { slides: number; title: string }) =>
        d.slides === 32 && !d.title.startsWith('Browser acceptance'),
    );
  expect(fixture).toBeTruthy();
  source = await (await request.get(`/api/documents/${fixture.id}`)).json();
});
test.afterAll(async () => {
  const pool = new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor',
  });
  try {
    for (const table of ['editor_mutations', 'editor_revision_assets', 'editor_revisions'])
      await pool.query(`DELETE FROM ${table} WHERE document_id=ANY($1::text[])`, [created]);
    await pool.query('DELETE FROM editor_documents WHERE id=ANY($1::text[])', [created]);
  } finally {
    await pool.end();
  }
});
async function clone(page: Page) {
  const document = structuredClone(source.document);
  document.id = randomUUID();
  document.title = 'Browser acceptance ' + document.id;
  const response = await page.request.post('/api/documents', { data: document });
  expect(response.status(), await response.text()).toBe(201);
  created.push(document.id);
  await page.goto(`/workbench.html?document=${document.id}`);
  await expect(page.locator('#save-status')).toContainText('已保存');
  return (await response.json()).document as typeof document;
}
async function showSlide(page: Page, id: string) {
  await page.evaluate(async (id) => {
    await (window as any).NotaleWorkbench.showSlide(id);
  }, id);
  expect(
    await page
      .frameLocator('#canvas')
      .locator('html')
      .evaluate(() => (window as any).__NOTALE__.slide.id),
  ).toBe(id);
}
const frameOf = (page: Page) => page.frameLocator('#canvas');
async function expectNativeStep(page: Page, expected: number) {
  await expect(async () => {
    const step = await page
      .frameLocator('.slides section.present iframe')
      .locator('body')
      .evaluate(() => (window as any).NotaleBridge?.state().step ?? -1);
    expect(step).toBe(expected);
  }).toPass({ timeout: 10000 });
}

test('HTML layer organization preserves geometry, names, visibility, locks and history through reopening', async ({
  page,
}) => {
  const doc = await clone(page),
    slide = doc.slides[0];
  await page.evaluate(
    async ({ slideId }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<section id="html-layers" style="position:absolute;left:80px;top:100px;width:400px;height:300px;z-index:90;isolation:isolate"><div id="layer-a" style="position:absolute;left:0;top:0;width:260px;height:200px;background:red;z-index:900">A</div><div id="layer-b" style="position:absolute;left:0;top:0;width:260px;height:200px;background:blue;z-index:900">B</div><div id="layer-c" style="position:absolute;left:0;top:0;width:260px;height:200px;background:green;z-index:5000">C</div></section>',
        },
      ]),
    { slideId: slide.id },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const ids = await frameOf(page)
    .locator('#html-layers')
    .evaluate((root) =>
      Object.fromEntries(
        [...root.children].map((el) => [el.id, el.getAttribute('data-notale-id')]),
      ),
    );
  const selected = async (id: string) => {
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
    await page.locator('[data-tab="format"]').click();
  };
  const change = async (selector: string) => {
    const beforeVersion = await page.evaluate(
      () => (window as any).NotaleWorkbench.getSnapshot().version,
    );
    await page.locator(selector).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version))
      .toBeGreaterThan(beforeVersion);
    await expect(page.locator('#save-status')).toContainText('已保存');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const top = () =>
    frameOf(page)
      .locator('#html-layers')
      .evaluate((root) => {
        const r = root.getBoundingClientRect();
        return document
          .elementsFromPoint(r.x + 40, r.y + 40)
          .find((el) => el.id.startsWith('layer-'))?.id;
      });
  const boxes = () =>
    frameOf(page)
      .locator('#html-layers')
      .evaluate((root) =>
        [...root.children].map((el) => {
          const r = el.getBoundingClientRect();
          return [el.id, r.x, r.y, r.width, r.height];
        }),
      );
  const before = await boxes();
  await selected(ids['layer-a']!);
  await change('#layer-forward');
  expect(await top()).toBe('layer-c');
  const z = await frameOf(page)
    .locator('#layer-a')
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  expect(z).toBeGreaterThan(
    await frameOf(page)
      .locator('#layer-b')
      .evaluate((el) => Number(getComputedStyle(el).zIndex)),
  );
  await change('#front');
  expect(await top()).toBe('layer-a');
  expect(await boxes()).toEqual(before);
  await page.locator('#object-name').fill('演示重点');
  await change('#save-object-name');
  await page.locator('[data-tab="objects"]').click();
  await page.locator('#object-search').fill('演示重点');
  await expect(page.locator('#objects .object-row')).toHaveCount(1);
  await expect(page.locator('#objects .object-row')).toContainText('演示重点');
  await page.locator('[data-tab="format"]').click();
  await change('#hide-objects');
  await expect(frameOf(page).locator('#layer-a')).toBeHidden();
  expect(await top()).toBe('layer-c');
  await change('#show-objects');
  expect(await top()).toBe('layer-a');
  await change('#lock');
  const version = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version);
  await page.locator('#back').click();
  await expect(page.locator('#toast')).toBeVisible();
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version)).toBe(
    version,
  );
  await change('#lock');
  await change('#back');
  expect(await top()).toBe('layer-c');
  await change('#undo');
  expect(await top()).toBe('layer-a');
  await change('#redo');
  expect(await top()).toBe('layer-c');
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await boxes()).toEqual(before);
  expect(await top()).toBe('layer-c');
  await page.locator('[data-tab="objects"]').click();
  await page.locator('#object-search').fill('演示重点');
  await expect(page.locator('#objects .object-row')).toHaveCount(1);
});

test('page-specific master images upload, reset, inherit styles and survive history and independent export', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    first = doc.slides[0],
    second = doc.slides[1];
  const png = async (color: string) =>
    Buffer.from(
      await page.evaluate((color) => {
        const c = document.createElement('canvas');
        c.width = c.height = 20;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 20, 20);
        return c.toDataURL('image/png').split(',')[1];
      }, color),
      'base64',
    );
  const red = await png('#ff0000'),
    blue = await png('#0000ff');
  const master = {
    id: 'image-master',
    name: '配图版式',
    html: `<img id="master-photo" src="data:image/png;base64,${red.toString('base64')}" style="position:absolute;left:80px;top:80px;width:240px;height:160px;object-fit:cover">`,
  };
  const run = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await run([
    { type: 'layout.set', layout: master },
    { type: 'layout.checkout', id: master.id, newId: 'image-editor' },
    { type: 'slide.update', slideId: first.id, patch: { layoutId: master.id } },
    { type: 'slide.update', slideId: second.id, patch: { layoutId: master.id } },
  ]);
  await showSlide(page, 'image-editor');
  const target = await frameOf(page).locator('img').getAttribute('data-notale-id');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#placeholder-key').fill('photo');
  await page.locator('#placeholder-label').fill('本页配图');
  await page.locator('#set-layout-placeholder').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.locator('#publish-layout-canvas').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await showSlide(page, first.id);
  await page.locator('[data-tab="document"]').click();
  await page
    .locator('input[data-image-key="photo"]')
    .setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: blue });
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const photo = () => frameOf(page).locator('img[data-notale-image-placeholder="photo"]');
  const pixel = async () =>
    photo().evaluate(async (el) => {
      const img = el as HTMLImageElement;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    });
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  await expect(photo()).toHaveCSS('width', '240px');
  await page.locator('[data-reset-image="photo"]').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixel()).toEqual([255, 0, 0, 255]);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  await run([
    {
      type: 'element.patch',
      slideId: 'image-editor',
      target,
      patch: { style: { width: '320px' } },
    },
    { type: 'layout.publish', slideId: 'image-editor' },
  ]);
  await showSlide(page, first.id);
  await expect(photo()).toHaveCSS('width', '320px');
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  await showSlide(page, second.id);
  expect(await pixel()).toEqual([255, 0, 0, 255]);
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${first.sourcePath}`,
    );
    const img = page.locator('img[data-notale-image-placeholder="photo"]');
    await expect(img).toHaveCSS('width', '320px');
    await expect(img).toHaveAttribute('alt', 'blue.png');
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(20);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const restored = await imported.json();
  created.push(restored.document.id);
  await page.goto(`/workbench.html?document=${restored.document.id}`);
  await showSlide(page, first.id);
  expect(await pixel()).toEqual([0, 0, 255, 255]);
});

test('shared layout changes propagate, while a detached page preserves its independent footer', async ({
  page,
}) => {
  const doc = await clone(page),
    first = doc.slides[0],
    second = doc.slides[1];
  await page.locator('[data-tab="document"]').click();
  await page.locator('#layout-name').fill('统一页脚');
  await page
    .locator('#layout-html')
    .fill(
      '<footer style="position:absolute;left:60px;bottom:20px;font-size:24px">统一页脚 <span data-notale-field="slide-number"></span></footer>',
    );
  await page.locator('#new-layout').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  const snapshot = await (await page.request.get(`/api/documents/${doc.id}`)).json(),
    layoutId = snapshot.document.layouts[0].id;
  await page.locator('#shared-layout').selectOption(layoutId);
  await page.locator('#apply-layout-all').click();
  await expect(frameOf(page).locator('footer')).toHaveText('统一页脚 1');
  await page.locator('#detach-layout').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '统一页脚' })).toHaveText(
    '统一页脚 2',
  );
  await page
    .locator('#layout-html')
    .fill(
      '<footer style="position:absolute;left:60px;bottom:20px;font-size:24px">更新页脚</footer>',
    );
  await page.locator('#save-layout').click();
  await expect(frameOf(page).locator('footer').filter({ hasText: '更新页脚' })).toHaveText(
    '更新页脚',
  );
  await page.locator('#edit-layout-canvas').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const draft = (
    await (await page.request.get(`/api/documents/${doc.id}`)).json()
  ).document.slides.find((item: any) => item.layoutSourceId === layoutId);
  expect(draft.hidden).toBe(true);
  await showSlide(page, draft.id);
  const footerId = await frameOf(page).locator('footer').getAttribute('data-notale-id');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), footerId);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#object-text').fill('画布编辑的母版');
  await page.locator('#apply-text').click();
  await expect(frameOf(page).locator('footer')).toHaveText('画布编辑的母版');
  await page.locator('[data-tab="document"]').click();
  await page.locator('#placeholder-key').fill('footer');
  await page.locator('#placeholder-label').fill('本页说明');
  await page.locator('#set-layout-placeholder').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await page.locator('#publish-layout-canvas').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v9');
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '画布编辑的母版' })).toHaveText(
    '画布编辑的母版',
  );
  await page.locator('#undo').click();
  await expect(frameOf(page).locator('footer').filter({ hasText: '更新页脚' })).toHaveText(
    '更新页脚',
  );
  await page.locator('#redo').click();
  await expect(frameOf(page).locator('footer').filter({ hasText: '画布编辑的母版' })).toHaveText(
    '画布编辑的母版',
  );
  await page.reload();
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '画布编辑的母版' })).toHaveText(
    '画布编辑的母版',
  );
  await page.locator('[data-tab="document"]').click();
  await page.locator('#layout-value-fields textarea[data-key="footer"]').fill('本页独立说明');
  let lostValue = false;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!lostValue) {
      lostValue = true;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#save-layout-values').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v12');
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '本页独立说明' })).toHaveText(
    '本页独立说明',
  );
  await page.evaluate(
    async ({ source, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.patch',
          slideId: source,
          target,
          patch: { style: { color: 'rgb(130, 20, 80)' } },
        },
        { type: 'layout.publish', slideId: source },
      ]),
    { source: draft.id, target: footerId },
  );
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '本页独立说明' })).toHaveCSS(
    'color',
    'rgb(130, 20, 80)',
  );
  await page.locator('[data-tab="document"]').click();
  await page.locator('#reset-layout-values').click();
  await expect(frameOf(page).locator('footer').filter({ hasText: '画布编辑的母版' })).toHaveText(
    '画布编辑的母版',
  );
  await page.locator('#undo').click();
  await expect(frameOf(page).locator('footer').filter({ hasText: '本页独立说明' })).toHaveText(
    '本页独立说明',
  );
  await showSlide(page, first.id);
  await expect(frameOf(page).locator('footer')).toHaveText('统一页脚 1');
  const bytes = await (await page.request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  expect(Buffer.from(files['index.html']).toString()).not.toContain(draft.sourcePath);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${second.sourcePath}`,
    );
    await expect(page.locator('footer').filter({ hasText: '本页独立说明' })).toHaveText(
      '本页独立说明',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await page.request.post('/api/import', {
    data: { data: bytes.toString('base64') },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const restored = await imported.json();
  created.push(restored.document.id);
  await page.goto(`/workbench.html?document=${restored.document.id}`);
  await showSlide(page, second.id);
  await expect(frameOf(page).locator('footer').filter({ hasText: '本页独立说明' })).toHaveText(
    '本页独立说明',
  );
  await page.locator('[data-tab="document"]').click();
  await page.locator('#edit-layout-canvas').click();
  await showSlide(page, draft.id);
  await expect(frameOf(page).locator('footer')).toHaveText('画布编辑的母版');
});

test('cross-page clipboard freezes author content, preserves typography and transformed geometry, and remaps animations', async ({
  page,
}) => {
  const doc = await clone(page),
    first = doc.slides[0],
    second = doc.slides[1];
  let objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${first.id}/objects`)
  ).json();
  const title = objects.find((o: any) => o.tag === 'h1');
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.patch',
          slideId,
          target,
          patch: { text: '复制时的标题', style: { 'font-size': '43px', color: 'rgb(23, 45, 67)' } },
        },
        {
          type: 'element.transform',
          slideId,
          target,
          transform: { x: 30, y: 20, rotate: 15, scaleX: 1.2, scaleY: 1.2 },
        },
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: crypto.randomUUID(),
            target,
            step: 1,
            trigger: 'click',
            effect: 'fade-in',
          },
        },
      ]),
    { slideId: first.id, target: title.id },
  );
  await expect(frameOf(page).locator('h1')).toHaveText('复制时的标题');
  const captured = await frameOf(page)
    .locator('h1')
    .evaluate((el) => {
      const b = el.getBoundingClientRect(),
        stage = document.getElementById('stage')!.getBoundingClientRect(),
        scale = stage.width / 1600;
      return {
        width: b.width / scale,
        height: b.height / scale,
        x: (b.x - stage.x) / scale,
        y: (b.y - stage.y) / scale,
      };
    });
  await page.evaluate(async (id) => {
    (window as any).NotaleWorkbench.select(id);
    await (window as any).NotaleWorkbench.copySelection('copy');
  }, title.id);
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.patch', slideId, target, patch: { text: '复制之后修改原文' } },
      ]),
    { slideId: first.id, target: title.id },
  );
  await showSlide(page, second.id);
  await page.evaluate(async () => (window as any).NotaleWorkbench.pasteSelection());
  const copied = frameOf(page).locator('h1').filter({ hasText: '复制时的标题' });
  await expect(copied).toHaveCount(1);
  await expect(copied).toHaveCSS('font-size', '43px');
  await expect(copied).toHaveCSS('color', 'rgb(23, 45, 67)');
  const after = await copied.evaluate((el) => {
    const b = el.getBoundingClientRect(),
      stage = document.getElementById('stage')!.getBoundingClientRect(),
      scale = stage.width / 1600;
    return {
      width: b.width / scale,
      height: b.height / scale,
      x: (b.x - stage.x) / scale,
      y: (b.y - stage.y) / scale,
    };
  });
  expect(after.width).toBeCloseTo(captured.width, 0);
  expect(after.height).toBeCloseTo(captured.height, 0);
  expect(after.x).toBeCloseTo(captured.x + 20, 0);
  expect(after.y).toBeCloseTo(captured.y + 20, 0);
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json(),
    destination = saved.document.slides.find((s: any) => s.id === second.id);
  expect(destination.animations).toHaveLength(1);
  expect(destination.animations[0].target).not.toBe(title.id);
});

test('real Canvas slide: edit title, persist author defaults, reload, interact, animate and reverse', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides.find((s) => s.sourcePath === 'page-07.html')!;
  await showSlide(page, s.id);
  const content = frameOf(page);
  await expect(content.locator('#m-val')).toHaveText('21');
  const objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
  ).json();
  const title = objects.find((o: any) => o.tag === 'h1'),
    control = objects.find((o: any) => o.attributes.id === 'm-slider');
  await page.evaluate(
    async ({ slideId, titleId, controlId }) => {
      await (window as any).NotaleWorkbench.commands([
        {
          type: 'element.patch',
          slideId,
          target: titleId,
          patch: { text: '手动编辑后的实验标题' },
        },
        {
          type: 'binding.set',
          slideId,
          binding: {
            id: crypto.randomUUID(),
            target: controlId,
            label: '模型数量',
            value: 31,
            event: 'input',
          },
        },
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: crypto.randomUUID(),
            target: titleId,
            step: 1,
            trigger: 'click',
            effect: 'fade-in',
            duration: 150,
            delay: 0,
          },
        },
      ]);
    },
    { slideId: s.id, titleId: title.id, controlId: control.id },
  );
  await expect(content.locator('h1')).toHaveText('手动编辑后的实验标题');
  await expect(content.locator('#m-val')).toHaveText('31');
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存');
  await showSlide(page, s.id);
  await expect(content.locator('#m-val')).toHaveText('31');
  await page.getByRole('button', { name: '体验互动', exact: true }).click();
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  await page.getByRole('button', { name: '下一步 →' }).click();
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  const before = await content
    .locator('#matrix-canvas')
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await content.locator('#rho-slider').evaluate((el) => {
    (el as HTMLInputElement).value = '0.75';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const after = await content
    .locator('#matrix-canvas')
    .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  expect(after).not.toEqual(before);
  await expect(content.locator('#rho-val')).toContainText('0.75');
  await page.getByRole('button', { name: '← 上一步' }).click();
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  await page.screenshot({ path: '.local/canvas-edit.png', fullPage: true });
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.document.slides.find((x: any) => x.id === s.id).html).toBeTruthy();
  expect(saved.document.slides.find((x: any) => x.id === s.id).html).toContain(
    'state.rho = parseFloat(e.target.value)',
  );
});

test('native steps and real SVG survive edits and backward seek', async ({ page }) => {
  const doc = await clone(page),
    s = doc.slides.find((s) => s.sourcePath === 'page-20.html')!;
  await showSlide(page, s.id);
  await page.getByRole('button', { name: '体验互动', exact: true }).click();
  const content = frameOf(page),
    target = content.locator('[data-step="2"]').first();
  await expect.poll(() => target.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await page.getByRole('button', { name: '下一步 →' }).click();
  await page.getByRole('button', { name: '下一步 →' }).click();
  await expect.poll(() => target.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await page.getByRole('button', { name: '← 上一步' }).click();
  await expect.poll(() => target.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
});

test('presentation overview, speaker notes, and linked audience navigate real slides', async ({
  page,
  context,
}) => {
  const doc = await clone(page),
    s = doc.slides.find((s) => s.sourcePath === 'page-20.html')!;
  await page.goto(`/show.html?document=${doc.id}&version=1&slide=${s.id}&speaker=1`);
  await expect(page.locator('#counter')).toContainText('20 / 32');
  await expect(page.locator('#notes')).not.toBeEmpty();
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleShow?.state().max))
    .toBeGreaterThanOrEqual(2);
  await page.locator('#next').click();
  await expect(page.locator('#counter')).toContainText('step 1');
  await page.locator('#overview').click();
  await expect(page.locator('.reveal')).toHaveClass(/overview/);
  await page.locator('#overview').click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('#audience').click();
  const audience = await popupPromise;
  await audience.waitForLoadState();
  await expect(audience.locator('#counter')).toContainText('20 / 32');
  await page.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('step 2');
  await page.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('21 / 32');
  await page.screenshot({ path: '.local/speaker-view.png', fullPage: true });
  await audience.close();
});

test('a lost successful save response survives reload and replays the same mutation once', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides[0];
  const objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
  ).json();
  const title = objects.find((o: any) => o.tag === 'h1');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), title.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#object-text').fill('保存响应丢失后的标题');
  let dropped = false,
    persistedStatus = 0;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      persistedStatus = response.status();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#apply-text').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await expect.poll(() => persistedStatus).toBe(200);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(2);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  const history = await (await page.request.get(`/api/documents/${doc.id}/history`)).json();
  expect(history).toHaveLength(2);
  await expect(frameOf(page).locator('h1')).toHaveText('保存响应丢失后的标题');
});

test('full real project export plays independently and imports with the same author model', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    response = await request.get(`/api/documents/${doc.id}/export?version=1`);
  expect(response.status()).toBe(200);
  const bytes = await response.body(),
    files = unzipSync(bytes);
  expect(Object.keys(files).length).toBeGreaterThan(400);
  const server = createServer((req, res) => {
    const path =
        decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1) || 'index.html',
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    await page.goto(`http://127.0.0.1:${address.port}/page-07.html`);
    await expect(page.locator('#m-val')).toHaveText('21');
    await page.locator('#m-slider').evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#m-val')).toHaveText('31');
    const imported = await request.post('/api/import', {
      data: { data: bytes.toString('base64') },
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const result = await imported.json();
    created.push(result.document.id);
    expect(result.document.slides).toEqual(doc.slides);
    expect(result.document.assets).toEqual(doc.assets);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('editable tables, chart data, rich text, transforms and history survive reopening', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides[0];
  await page.evaluate(
    async ({ slideId, table, chart }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.insert', slideId, html: table },
        { type: 'element.insert', slideId, html: chart },
      ]),
    { slideId: s.id, table: template('table'), chart: template('chart') },
  );
  let objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
  ).json();
  const cell = objects.find((o: any) => o.tag === 'td'),
    chart = objects.find((o: any) => o.attributes['data-notale-chart']),
    title = objects.find((o: any) => o.tag === 'h1');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), chart.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  await page.locator('#chart-data').fill('{"labels":["Before","After"],"values":[20,90]}');
  await page.locator('#apply-chart').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.evaluate(
    async ({ slideId, cellId, titleId }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.patch', slideId, target: cellId, patch: { text: '手动修改单元格' } },
        {
          type: 'element.patch',
          slideId,
          target: titleId,
          patch: { richText: '可编辑 <strong>强调</strong>' },
        },
        {
          type: 'element.transform',
          slideId,
          target: titleId,
          transform: { x: 35, y: 20, rotate: 12, scaleX: 1.1, scaleY: 1.1 },
        },
      ]),
    { slideId: s.id, cellId: cell.id, titleId: title.id },
  );
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await expect(frameOf(page).locator('td').first()).toHaveText('手动修改单元格');
  await expect(frameOf(page).locator('h1 strong')).toHaveText('强调');
  await expect(frameOf(page).locator('h1')).toHaveCSS('rotate', '12deg');
  await expect(
    frameOf(page).locator('[data-notale-chart] text').filter({ hasText: 'After' }),
  ).toHaveCount(1);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#history').selectOption('1');
  await page.locator('#restore').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await expect(frameOf(page).locator('table')).toHaveCount(0);
  await expect(frameOf(page).locator('h1 strong')).toHaveCount(0);
});

test('native pointer coordinates remain correct under authored rotation, scale and translation', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides[0];
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<div id="pointer-area" style="position:absolute;left:500px;top:350px;width:400px;height:200px;transform:rotate(15deg)"><span id="pointer-marker" style="position:absolute;left:100px;top:50px;width:2px;height:2px"></span></div>',
        },
      ]),
    s.id,
  );
  const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
    ).json(),
    target = objects.find((o: any) => o.attributes.id === 'pointer-area').id;
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.transform',
          slideId,
          target,
          transform: { x: 50, y: -20, rotate: 40, scaleX: 1.3, scaleY: 0.8 },
        },
      ]),
    { slideId: s.id, target },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const local = await frameOf(page)
    .locator('#pointer-area')
    .evaluate((el) => {
      const marker = document.getElementById('pointer-marker')!.getBoundingClientRect();
      return (window as any).Deck.pt(el, {
        clientX: marker.x + marker.width / 2,
        clientY: marker.y + marker.height / 2,
      });
    });
  expect(local.x).toBeCloseTo(101, 1);
  expect(local.y).toBeCloseTo(51, 1);
});

test('object-triggered animation sequences preserve the original CSS transform and reset on seek', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides.find((s) => s.sourcePath === 'page-07.html')!;
  await showSlide(page, s.id);
  const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
    ).json(),
    target = objects.find((o: any) => o.tag === 'h1').id,
    trigger = objects.find((o: any) => o.attributes.id === 'resample').id;
  await page.evaluate(
    async ({ slideId, target, trigger }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.patch',
          slideId,
          target,
          patch: { style: { transform: 'translateX(17px)' } },
        },
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: crypto.randomUUID(),
            target,
            triggerTarget: trigger,
            step: 0,
            trigger: 'object',
            effect: 'fade-in',
            duration: 80,
          },
        },
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: crypto.randomUUID(),
            target,
            step: 0,
            trigger: 'after-previous',
            effect: 'pulse',
            duration: 80,
          },
        },
      ]),
    { slideId: s.id, target, trigger },
  );
  await page.locator('#interact').click();
  const content = frameOf(page);
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  await content.locator('#resample').click();
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect
    .poll(() =>
      content.locator('h1').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBeCloseTo(1, 4);
  expect(
    await content.locator('h1').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).e),
  ).toBeCloseTo(17, 2);
  await content.locator('h1').evaluate(() => {
    (window as any).NotaleBridge.seek(0, false);
  });
  await expect
    .poll(() => content.locator('h1').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
});

test('automatic advancement traverses native steps and then changes slide', async ({
  page,
  request,
}) => {
  const doc = await clone(page),
    s = doc.slides.find((s) => s.sourcePath === 'page-20.html')!;
  const response = await request.post(`/api/documents/${doc.id}/commits`, {
    data: {
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [{ type: 'slide.update', slideId: s.id, patch: { advanceAfter: 250 } }],
    },
  });
  expect(response.status()).toBe(200);
  await page.goto(`/show.html?document=${doc.id}&version=2&slide=${s.id}`);
  await expect(page.locator('#counter')).toContainText('21 / 32', { timeout: 10000 });
});

test('table structural controls and data chart types survive save, reopen and version restore', async ({
  page,
}) => {
  const doc = await clone(page),
    s = doc.slides[0];
  await page.evaluate(
    async ({ slideId, table, chart }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.insert', slideId, html: table },
        { type: 'element.insert', slideId, html: chart },
      ]),
    { slideId: s.id, table: template('table'), chart: template('chart') },
  );
  const objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
  ).json();
  const table = objects.find((o: any) => o.tag === 'table'),
    chart = objects.find((o: any) => o.attributes['data-notale-chart']);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), table.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  await page.locator('#table-row').fill('2');
  await page.locator('#table-column').fill('1');
  await page.locator('#table-rows').fill('2');
  await page.locator('#table-columns').fill('2');
  await page.locator('#table-merge').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await expect(frameOf(page).locator('td[rowspan="2"][colspan="2"]')).toHaveCount(1);
  await page.locator('#table-row').fill('3');
  await page.locator('#table-insert-row').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await expect(frameOf(page).locator('td[rowspan="3"]')).toHaveCount(1);
  await page.reload();
  await expect(frameOf(page).locator('td[rowspan="3"]')).toHaveCount(1);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), chart.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  await page.locator('#chart-kind').selectOption('line');
  await page.locator('#chart-data').fill(
    JSON.stringify({
      labels: ['Jan', 'Feb', 'Mar'],
      series: [
        { name: 'Train', values: [-5, 20, 60] },
        { name: 'Test', values: [15, 30, 40] },
      ],
    }),
  );
  await page.locator('#apply-chart').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await expect(frameOf(page).locator('[data-notale-chart] polyline')).toHaveCount(2);
  await page.locator('#chart-kind').selectOption('doughnut');
  await refreshNativeState(page);
  await expect(page.locator('#chart-kind')).toHaveValue('doughnut');
  await page
    .locator('#chart-data')
    .fill(JSON.stringify({ labels: ['A', 'B', 'C'], values: [10, 20, 70] }));
  await page.locator('#apply-chart').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.reload();
  await expect(frameOf(page).locator('[data-notale-chart] [data-chart-slice]')).toHaveCount(3);
  const ring = await frameOf(page)
    .locator('[data-notale-chart]')
    .evaluate((svg) => {
      const paths = Array.from(svg.querySelectorAll<SVGGeometryElement>('[data-chart-slice]'));
      return {
        center: paths.some((path) => path.isPointInFill(new DOMPoint(260, 205))),
        ring: paths.some((path) => path.isPointInFill(new DOMPoint(330, 125))),
      };
    });
  expect(ring).toEqual({ center: false, ring: true });
  await page.locator('[data-tab="document"]').click();
  await page.locator('#history').selectOption('2');
  await page.locator('#restore').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await expect(frameOf(page).locator('td[rowspan]')).toHaveCount(0);
  const restored = await frameOf(page)
    .locator('[data-notale-chart]')
    .getAttribute('data-notale-chart');
  expect(JSON.parse(restored!).kind).toBe('bar');
});

test('page-space arrange preserves exact geometry inside rotated and nonuniformly scaled parents', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<div style="position:absolute;left:250px;top:220px;width:650px;height:400px;transform:rotate(23deg) scale(1.4,.7)"><div id="arrange-a" style="position:absolute;left:30px;top:40px;width:120px;height:80px;background:#466ddb;transform-origin:20px 10px;transform:rotate(17deg) translate(15px,9px)"><i class="test-corner" style="position:absolute;left:0;top:0;width:0;height:0"></i></div><div id="arrange-b" style="position:absolute;left:360px;top:230px;width:150px;height:100px;background:#28a69b;transform:skewX(12deg)"><i class="test-corner" style="position:absolute;left:0;top:0;width:0;height:0"></i></div></div>',
        },
      ]),
    slideId,
  );
  await expect(frameOf(page).locator('#arrange-a')).toHaveCount(1);
  const ids = await frameOf(page)
    .locator('[id^="arrange-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-notale-id')!));
  async function points() {
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    return frameOf(page)
      .locator('[id^="arrange-"]')
      .evaluateAll((els) => {
        const stage = document.getElementById('stage')!.getBoundingClientRect(),
          scale = stage.width / 1600;
        return els.map((el) => {
          const b = el.getBoundingClientRect(),
            corner = el.querySelector('i')!.getBoundingClientRect();
          return {
            x: (b.x - stage.x) / scale,
            y: (b.y - stage.y) / scale,
            width: b.width / scale,
            height: b.height / scale,
            corner: { x: (corner.x - stage.x) / scale, y: (corner.y - stage.y) / scale },
          };
        });
      });
  }
  async function arrange(action: string, extras: Record<string, unknown> = {}) {
    await page.evaluate(
      async ({ ids, slideId, action, extras }) => {
        const app = (window as any).NotaleWorkbench;
        app.selectMany(ids);
        const capture = await app.captureSelection();
        await app.commands([
          { type: 'elements.arrange', slideId, action, rectangles: capture.rectangles, ...extras },
        ]);
      },
      { ids, slideId, action, extras },
    );
    await expect(frameOf(page).locator('#arrange-a')).toHaveCount(1);
  }
  let before = await points();
  await arrange('translate', { dx: 70, dy: -35 });
  let after = await points();
  for (let i = 0; i < 2; i++) {
    expect(after[i].corner.x).toBeCloseTo(before[i].corner.x + 70, 1);
    expect(after[i].corner.y).toBeCloseTo(before[i].corner.y - 35, 1);
    expect(after[i].width).toBeCloseTo(before[i].width, 1);
  }
  await arrange('left');
  after = await points();
  expect(after[0].x).toBeCloseTo(after[1].x, 1);
  for (const action of ['rotate', 'scale']) {
    before = await points();
    const cx =
        (Math.min(...before.map((b) => b.x)) + Math.max(...before.map((b) => b.x + b.width))) / 2,
      cy =
        (Math.min(...before.map((b) => b.y)) + Math.max(...before.map((b) => b.y + b.height))) / 2;
    await arrange(action, { angle: 35, factor: 1.2 });
    after = await points();
    const a = action === 'rotate' ? (35 * Math.PI) / 180 : 0,
      k = action === 'scale' ? 1.2 : 1;
    for (let i = 0; i < 2; i++) {
      const x = before[i].corner.x - cx,
        y = before[i].corner.y - cy;
      expect(after[i].corner.x).toBeCloseTo(cx + k * (x * Math.cos(a) - y * Math.sin(a)), 1);
      expect(after[i].corner.y).toBeCloseTo(cy + k * (x * Math.sin(a) + y * Math.cos(a)), 1);
    }
  }
  await page.reload();
  await expect(frameOf(page).locator('#arrange-a')).toHaveCount(1);
  const reopened = await points();
  for (let i = 0; i < 2; i++) {
    expect(reopened[i].corner.x).toBeCloseTo(after[i].corner.x, 1);
    expect(reopened[i].corner.y).toBeCloseTo(after[i].corner.y, 1);
  }
  await page.evaluate(
    async ({ slideId, ids }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'group.set', slideId, id: 'geometry-group', name: 'Geometry', members: ids },
      ]),
    { slideId, ids },
  );
  before = await points();
  const box = await frameOf(page).locator('#arrange-a').boundingBox(),
    stageScale = await frameOf(page)
      .locator('#stage')
      .evaluate((el) => el.getBoundingClientRect().width / 1600);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 35, box!.y + box!.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  after = await points();
  for (let i = 0; i < 2; i++) {
    expect(after[i].corner.x).toBeCloseTo(before[i].corner.x + 35 / stageScale, 1);
    expect(after[i].corner.y).toBeCloseTo(before[i].corner.y + 20 / stageScale, 1);
  }
});

test('image upload, crop, replacement and restoration retain object identity and rendered resources', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  async function png(color: string) {
    return Buffer.from(
      await page.evaluate((color) => {
        const c = document.createElement('canvas');
        c.width = 200;
        c.height = 100;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 200, 100);
        return c.toDataURL('image/png').split(',')[1];
      }, color),
      'base64',
    );
  }
  async function choose(button: string, buffer: Buffer, name: string) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator(button).click();
    await (await chooser).setFiles({ name, mimeType: 'image/png', buffer });
  }
  await page.locator('#insert-kind').selectOption('image');
  await choose('#insert', await png('#ff0000'), 'red.png');
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${slideId}/objects`)
    ).json(),
    target = objects.find((o: any) => o.tag === 'img' && o.attributes.alt === '插入图片').id;
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#media-fit').selectOption('cover');
  await page.locator('#media-x').fill('85');
  await page.locator('#crop-left').fill('10');
  await page.locator('#media-alt').fill('裁切示例');
  await refreshNativeState(page);
  await expect(page.locator('#media-fit')).toHaveValue('cover');
  await expect(page.locator('#crop-left')).toHaveValue('10');
  await page.locator('#save-media').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const image = () => frameOf(page).locator(`[data-notale-id="${target}"]`);
  await expect(page.locator('#replace-poster')).toBeHidden();
  await expect(page.locator('#retry-save')).toBeHidden();
  await expect(image()).toHaveCSS('object-fit', 'cover');
  await expect(image()).toHaveCSS('object-position', '85% 50%');
  await expect(image()).toHaveCSS('clip-path', 'inset(0% 0% 0% 10%)');
  await page.screenshot({ path: '.local/media-editor.png' });
  await choose('#replace-media', await png('#0000ff'), 'blue.png');
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  async function pixel() {
    return image().evaluate(async (el) => {
      const img = el as HTMLImageElement;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    });
  }
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  await expect(image()).toHaveCSS('width', '500px');
  await expect(image()).toHaveCSS('clip-path', 'inset(0% 0% 0% 10%)');
  await page.locator('[data-tab="document"]').click();
  await page.locator('#history').selectOption('3');
  await page.locator('#restore').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixel()).toEqual([255, 0, 0, 255]);
});

test('native video and audio honor persisted trim, rate, looping and step playback after reopen', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.locator('#insert-kind').selectOption('video');
  let chooser = page.waitForEvent('filechooser');
  await page.locator('#insert').click();
  await (await chooser).setFiles('tests/fixtures/clip.webm');
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  let objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${slideId}/objects`)
  ).json();
  const video = objects.find((o: any) => o.tag === 'video'),
    target = video.id;
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#media-start').fill('.5');
  await page.locator('#media-end').fill('1.3');
  await page.locator('#media-rate').fill('1.5');
  await page.locator('#media-volume').fill('.3');
  await page.locator('#media-muted').check();
  await page.locator('#media-step').fill('1');
  await page.locator('#save-media').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const clip = frameOf(page).locator('video');
  await expect
    .poll(() =>
      clip.evaluate((el) => ({
        ready: (el as HTMLVideoElement).readyState >= 1,
        time: (el as HTMLVideoElement).currentTime,
        rate: (el as HTMLVideoElement).playbackRate,
        volume: (el as HTMLVideoElement).volume,
      })),
    )
    .toEqual({ ready: true, time: 0.5, rate: 1.5, volume: 0.3 });
  await page.locator('#interact').click();
  await page.locator('#step-next').click();
  await expect
    .poll(() => clip.evaluate((el) => (el as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.6);
  await expect.poll(() => clip.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  expect(await clip.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(1.3, 1);
  await page.locator('#step-prev').click();
  expect(await clip.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(0.5, 2);
  await page.locator('#interact').click();
  await page.locator('#insert-kind').selectOption('audio');
  const rate = 8000,
    length = rate * 2,
    wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++)
    wav.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 440 * 2) * 2000), 44 + i * 2);
  chooser = page.waitForEvent('filechooser');
  await page.locator('#insert').click();
  await (await chooser).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  objects = await (
    await page.request.get(`/api/documents/${doc.id}/slides/${slideId}/objects`)
  ).json();
  const audio = objects.find((o: any) => o.tag === 'audio');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), audio.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#media-start').fill('.2');
  await page.locator('#media-end').fill('.7');
  await page.locator('#media-muted').check();
  await page.locator('#media-loop').check();
  await page.locator('#media-step').fill('');
  await page.locator('#save-media').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.locator('#interact').click();
  const sound = frameOf(page).locator('audio');
  await sound.evaluate((el) => {
    (el as HTMLAudioElement).currentTime = 0.65;
    return (el as HTMLAudioElement).play();
  });
  await expect
    .poll(() => sound.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeLessThan(0.5);
  expect(await sound.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(false);
  await page.locator('#interact').click();
  await expect.poll(() => sound.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(true);
  expect(await sound.evaluate((el) => (el as HTMLAudioElement).currentTime)).toBeCloseTo(0.2, 2);
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: crypto.randomUUID(),
            target,
            step: 1,
            trigger: 'click',
            effect: 'fade-in',
            duration: 1000,
          },
        },
      ]),
    { slideId, target },
  );
  await page.goto(`/show.html?document=${doc.id}&version=6&slide=${slideId}&speaker=1`);
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleShow?.state().max))
    .toBeGreaterThanOrEqual(1);
  const popup = page.waitForEvent('popup');
  await page.locator('#audience').click();
  const audience = await popup;
  await audience.waitForLoadState();
  const audienceVideo = audience.frameLocator('.slides section.present iframe').locator('video'),
    speakerVideo = page.frameLocator('.slides section.present iframe').locator('video');
  await expect
    .poll(() => audienceVideo.evaluate((el) => (el as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await page.locator('#next').click();
  await expect
    .poll(() =>
      audienceVideo.evaluate((el) => {
        const opacity = Number(getComputedStyle(el).opacity);
        return opacity > 0 && opacity < 1;
      }),
    )
    .toBe(true);
  await expect
    .poll(() => audienceVideo.evaluate((el) => (el as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.6);
  expect(await speakerVideo.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  expect(await speakerVideo.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeCloseTo(
    0.5,
    2,
  );
  await audience.close();
});

test('animation editing, duplication, ordering and custom keyframes survive native-step remapping', async ({
  page,
}) => {
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-20.html')!;
  await showSlide(page, slide.id);
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'slide.update', slideId, patch: { notes: 'Keep these notes' } },
      ]),
    slide.id,
  );
  const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${slide.id}/objects`)
    ).json(),
    title = objects.find((o: any) => o.tag === 'h1');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), title.id);
  await page.locator('[data-tab="animation"]').click();
  await page.locator('#effect').selectOption('motion');
  await page.locator('#duration').fill('140');
  await page.locator('#dx').fill('20');
  await page.locator('#dy').fill('30');
  await page.locator('#add-animation').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const first = (
    await (await page.request.get(`/api/documents/${doc.id}`)).json()
  ).document.slides.find((s: any) => s.id === slide.id).animations[0].id;
  await page.locator(`[data-edit-animation="${first}"]`).click();
  await page.locator('#easing').selectOption('linear');
  await page.locator('#delay').fill('20');
  await page.locator('#save-animation').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.locator(`[data-copy-animation="${first}"]`).click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.locator(`[data-down-animation="${first}"]`).click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.locator(`[data-edit-animation="${first}"]`).click();
  await page.locator('#effect').selectOption('custom');
  await page.locator('#keyframes').fill('[{"opacity":0.2,"offset":0},{"opacity":0.7,"offset":1}]');
  await page.locator('#save-animation').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await page.locator('#step-map').fill('[0,0,1,2]');
  await page.locator('#save-step-map').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'slide.update', slideId, patch: { name: '重新编排的步骤' } },
      ]),
    slide.id,
  );
  await page.reload();
  await showSlide(page, slide.id);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const saved = (
    await (await page.request.get(`/api/documents/${doc.id}`)).json()
  ).document.slides.find((s: any) => s.id === slide.id);
  expect(saved.notes).toBe('Keep these notes');
  expect(saved.stepMap).toEqual([0, 0, 1, 2]);
  expect(saved.animations).toHaveLength(2);
  expect(saved.animations[1].id).toBe(first);
  expect(saved.animations[1].easing).toBe('linear');
  expect(saved.animations[0].dy).toBe(30);
  await page.locator('#interact').click();
  const content = frameOf(page);
  await page.locator('#step-next').click();
  await expect.poll(() => content.locator('h1').evaluate(() => window.Deck!.step)).toBe(0);
  await expect
    .poll(() => content.locator('h1').evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeCloseTo(0.7, 2);
  await page.locator('#step-next').click();
  await expect.poll(() => content.locator('h1').evaluate(() => window.Deck!.step)).toBe(1);
  await page.locator('#step-next').click();
  await expect.poll(() => content.locator('h1').evaluate(() => window.Deck!.step)).toBe(2);
  await page.locator('#step-prev').click();
  await expect.poll(() => content.locator('h1').evaluate(() => window.Deck!.step)).toBe(1);
});

test('shared CSS imports and theme assets stay scoped and detach independently across page directories', async ({
  page,
}) => {
  const doc = await clone(page),
    first = doc.slides[0],
    nested = crypto.randomUUID();
  async function upload(data: string, mime: string) {
    const response = await page.request.post('/api/assets', {
      data: { data: Buffer.from(data).toString('base64'), mime },
    });
    expect(response.status()).toBe(200);
    return response.json();
  }
  const image = await upload(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',
    'image/svg+xml',
  );
  const css = await upload(
      '@import "nested.css" layer(master) supports(display:grid) screen; .layout-probe{color:rgb(230,30,40)!important;background-image:var(--layout-image);animation:pulse 100s} @keyframes pulse{from{opacity:.3}to{opacity:.8}}',
      'text/css',
    ),
    nestedCss = await upload('.layout-probe{font-size:29px}', 'text/css');
  await page.evaluate(
    async ({ first, nested, image, css, nestedCss }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'asset.put', path: 'design/doc(1).svg', asset: image },
        { type: 'asset.put', path: 'design/master.svg', asset: image },
        { type: 'asset.put', path: 'design/base.css', asset: css },
        { type: 'asset.put', path: 'design/nested.css', asset: nestedCss },
        {
          type: 'slide.insert',
          after: first.id,
          slide: {
            id: nested,
            sourcePath: 'pages/nested.html',
            name: 'Nested layout validation',
            html: '<main id="stage"><div id="page-probe" class="layout-probe" style="color:rgb(20,40,60);position:absolute;left:80px;top:100px">Original page</div><div id="theme-probe" style="width:100px;height:100px;background-image:var(--doc-image)"></div></main>',
          },
        },
        {
          type: 'layout.set',
          layout: {
            id: 'scoped-master',
            name: 'Scoped master',
            sourcePath: 'layouts/master.html',
            html: '<html><head><link rel="stylesheet" href="../design/base.css"><style>:root{--local-ink:#abc} #abc{border-color:#abc}</style></head><body><footer id="abc" class="layout-probe" style="position:absolute;left:50px;bottom:20px">Master footer</footer></body></html>',
            theme: { '--layout-image': 'url(../design/master.svg)' },
          },
        },
        { type: 'slide.update', slideId: first.id, patch: { layoutId: 'scoped-master' } },
        { type: 'slide.update', slideId: nested, patch: { layoutId: 'scoped-master' } },
        { type: 'deck.update', theme: { '--doc-image': 'url("design/doc(1).svg")' } },
      ]),
    { first, nested, image, css, nestedCss },
  );
  await showSlide(page, nested);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const content = frameOf(page),
    master = () => content.locator('[data-notale-layout-scope] .layout-probe');
  await expect(content.locator('#page-probe')).toHaveCSS('color', 'rgb(20, 40, 60)');
  await expect(master()).toHaveCSS('color', 'rgb(230, 30, 40)');
  await expect(master()).toHaveCSS('font-size', '29px');
  await expect(master()).toHaveCSS('border-color', 'rgb(170, 187, 204)');
  expect(await master().evaluate((el) => getComputedStyle(el).animationName)).toMatch(
    /^master-scoped-master-/,
  );
  expect(await master().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
    '/design/master.svg',
  );
  expect(
    await content.locator('#theme-probe').evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain('/design/doc(1).svg');
  const imageUrl = await content
    .locator('#theme-probe')
    .evaluate((el) => getComputedStyle(el).backgroundImage.slice(5, -2));
  expect((await page.request.get(imageUrl)).status()).toBe(200);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#detach-layout').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const replacement = await upload(
    '.layout-probe{color:rgb(30,60,220)!important;font-size:35px;background-image:var(--layout-image)}',
    'text/css',
  );
  await page.evaluate(
    async (asset) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'asset.put', path: 'design/base.css', asset },
      ]),
    replacement,
  );
  await page.reload();
  await showSlide(page, nested);
  await expect(master()).toHaveCSS('color', 'rgb(230, 30, 40)');
  await expect(master()).toHaveCSS('font-size', '29px');
  await showSlide(page, first.id);
  await expect(master()).toHaveCSS('color', 'rgb(30, 60, 220)');
  await expect(master()).toHaveCSS('font-size', '35px');
  const exported = await page.request.get(`/api/documents/${doc.id}/export`);
  expect(exported.status()).toBe(200);
  const files = unzipSync(await exported.body());
  expect(Buffer.from(files['pages/nested.html']).toString()).toContain('rgb(230,30,40)');
  expect(Buffer.from(files[first.sourcePath]).toString()).toContain('rgb(30,60,220)');
});

test('page copy, ordering, insertion, deletion, undo and links preserve independent native interactions', async ({
  page,
}) => {
  const doc = await clone(page),
    original = doc.slides.find((s) => s.sourcePath === 'page-07.html')!,
    first = doc.slides[0];
  await showSlide(page, original.id);
  await page.locator('#copy-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  const copyId = (await page.locator('.slide-card.active').getAttribute('data-slide'))!;
  expect(copyId).not.toBe(original.id);
  await expect(page.locator('#slide-count')).toHaveText('33');
  await expect(frameOf(page).locator('#m-val')).toHaveText('21');
  const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${copyId}/objects`)
    ).json(),
    title = objects.find((o: any) => o.tag === 'h1'),
    input = objects.find((o: any) => o.attributes.id === 'm-slider');
  await page.evaluate(
    async ({ slideId, target, input }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.patch', slideId, target, patch: { text: '独立的实验副本' } },
        {
          type: 'binding.set',
          slideId,
          binding: {
            id: crypto.randomUUID(),
            target: input,
            label: '模型数量',
            value: 31,
            event: 'input',
          },
        },
      ]),
    { slideId: copyId, target: title.id, input: input.id },
  );
  await page.locator('#up-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  expect(await page.locator('.slide-card').nth(6).getAttribute('data-slide')).toBe(copyId);
  await page.locator('#down-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  expect(await page.locator('.slide-card').nth(7).getAttribute('data-slide')).toBe(copyId);
  await page.locator('#add-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  const blank = (await page.locator('.slide-card.active').getAttribute('data-slide'))!;
  expect(blank).not.toBe(copyId);
  await expect(frameOf(page).locator('p')).toHaveText('新页面');
  await page.locator('#delete-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await expect(page.locator(`[data-slide="${blank}"]`)).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await expect(page.locator(`[data-slide="${blank}"]`)).toHaveCount(1);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v9');
  await expect(page.locator(`[data-slide="${blank}"]`)).toHaveCount(0);
  await showSlide(page, copyId);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#hidden-slide').check();
  await page.locator('#save-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v10');
  await page.locator('#delete-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v11');
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v12');
  await page.reload();
  await showSlide(page, copyId);
  await expect(frameOf(page).locator('h1')).toHaveText('独立的实验副本');
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
  await page.locator('#interact').click();
  await frameOf(page).locator('#resample').click();
  expect(
    await frameOf(page)
      .locator('canvas')
      .first()
      .evaluate((el) => (el as HTMLCanvasElement).toDataURL().length),
  ).toBeGreaterThan(1000);
  await showSlide(page, first.id);
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<a id="jump-page" href="page-07.html" style="position:absolute;left:60px;top:20px;z-index:9999;font-size:24px">跳到实验</a>',
        },
      ]),
    first.id,
  );
  await expect(page.locator('#save-status')).toContainText('已保存 · v13');
  await frameOf(page).locator('#jump-page').click();
  await expect(page.locator('.slide-card.active')).toHaveAttribute('data-slide', original.id);
  await expect(frameOf(page).locator('#m-val')).toHaveText('21');
  await page.goto(`/show.html?document=${doc.id}&version=13&slide=${first.id}`);
  await expect(page.locator('#counter')).toContainText('1 / 32');
  await page.frameLocator('.slides section.present iframe').locator('#jump-page').click();
  await expect(page.locator('#counter')).toContainText('7 / 32');
});

test('smart guides snap an affine group, survive history and reopen, and never leak drag previews into saved HTML', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = randomUUID();
  await page.evaluate(
    async ({ slideId }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([
        {
          type: 'slide.insert',
          after: wb.getSnapshot().document.slides[0].id,
          slide: {
            id: slideId,
            name: '精确排版',
            sourcePath: 'guide-check.html',
            html: '<html><head><style>svg,line,text{display:none!important}</style></head><body><main id="stage" style="width:1600px;height:900px;background:white"><div id="affine-parent" style="position:absolute;left:180px;top:180px;width:600px;height:400px;transform:rotate(12deg) scale(1.2,.8)"><div id="snap-a" style="position:absolute;left:80px;top:60px;width:100px;height:60px;background:#466ddb"></div><div id="snap-b" style="position:absolute;left:260px;top:150px;width:80px;height:50px;background:#28a69b"></div></div><div id="snap-reference" style="position:absolute;left:1250px;top:650px;width:100px;height:40px;background:#f5c87f"></div></main></body></html>',
          },
        },
      ]);
      await wb.showSlide(slideId);
      await wb.whenReady();
      const ids = wb
        .getObjects()
        .filter((o: any) => ['snap-a', 'snap-b'].includes(o.attributes.id))
        .map((o: any) => o.id);
      await wb.commands([
        { type: 'group.set', slideId, id: 'snap-group', name: 'Aligned pair', members: ids },
      ]);
    },
    { slideId },
  );
  await page.locator('[data-tab="document"]').click();
  await page.locator('#guide-settings summary').click();
  await page.locator('#guide-position').fill('1000.25');
  await page.locator('#add-guide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  const objects = () =>
    frameOf(page)
      .locator('[id^="snap-"]')
      .evaluateAll((els) => {
        const stage = document.getElementById('stage')!.getBoundingClientRect(),
          scale = stage.width / 1600;
        return els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: (r.x - stage.x) / scale,
            y: (r.y - stage.y) / scale,
            width: r.width / scale,
            height: r.height / scale,
            style: el.getAttribute('style'),
          };
        });
      });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  let before = await objects();
  const beforeRight = Math.max(...before.slice(0, 2).map((r) => r.x + r.width));
  const scale = await frameOf(page)
    .locator('#stage')
    .evaluate((el) => el.getBoundingClientRect().width / 1600);
  let box = (await frameOf(page).locator('#snap-a').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + (1000.25 - beforeRight) * scale - 3,
    box.y + box.height / 2 + 4,
    { steps: 4 },
  );
  const line = frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"][data-axis="x"]');
  await expect(line).toHaveAttribute('data-position', '1000.25');
  await expect(frameOf(page).locator('[data-notale-guides] svg')).toBeVisible();
  await expect(line).toHaveCSS('display', 'inline'); // Author CSS cannot hide shadow SVG lines.
  const preview = await objects();
  expect(Math.max(...preview.slice(0, 2).map((r) => r.x + r.width))).toBeCloseTo(1000.25, 2);
  await page.screenshot({ path: '.local/smart-guides.png' });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  let after = await objects();
  for (let i = 0; i < 2; i++) {
    expect(after[i].x).toBeCloseTo(preview[i].x, 2);
    expect(after[i].y).toBeCloseTo(before[i].y, 2);
  }
  await page.reload();
  await showSlide(page, slideId);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  after = await objects();
  expect(Math.max(...after.slice(0, 2).map((r) => r.x + r.width))).toBeCloseTo(1000.25, 2);
  // Alt deliberately permits a small offset that would otherwise snap back.
  before = after;
  box = (await frameOf(page).locator('#snap-a').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4, { steps: 2 });
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  after = await objects();
  for (let i = 0; i < 2; i++) {
    expect(after[i].x - before[i].x).toBeCloseTo(4 / scale, 2);
    expect(after[i].y - before[i].y).toBeCloseTo(4 / scale, 2);
  }
  // A cancelled drag must restore the exact inline author transform and not add a revision.
  before = after;
  box = (await frameOf(page).locator('#snap-a').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await objects()).toEqual(before);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(6);
  // Align the same group to another object's edge, with no guide at that coordinate.
  box = (await frameOf(page).locator('#snap-a').boundingBox())!;
  const right = Math.max(...before.slice(0, 2).map((r) => r.x + r.width));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + (1250 - right) * scale - 3,
    box.y + box.height / 2,
    { steps: 4 },
  );
  await expect(
    frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"][data-axis="x"]'),
  ).toHaveAttribute('data-position', '1250');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(Math.max(...(await objects()).slice(0, 2).map((r) => r.x + r.width))).toBeCloseTo(1250, 2);

  await page.locator('[data-tab="document"]').click();
  await page.locator('#guide-settings summary').click();
  await expect(page.locator('[data-guide-position]')).toHaveValue('1000.25');
  await page.locator('[data-guide-position]').fill('1020.5');
  await page.locator('[data-save-guide]').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await page.locator('[data-remove-guide]').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v9');
  await page.locator('#undo').click();
  await expect(page.locator('[data-guide-position]')).toHaveValue('1020.5');
  await page.locator('#interact').click();
  await expect(frameOf(page).locator('[data-notale-guides]')).toBeHidden();
  const exported = await page.request.get(`/api/documents/${doc.id}/export`);
  expect(exported.ok()).toBe(true);
  const archive = unzipSync(new Uint8Array(await exported.body()));
  const manifest = JSON.parse(Buffer.from(archive['notale-project.json']).toString());
  expect(manifest.document.slides.find((s: any) => s.id === slideId).guides[0].position).toBe(
    1020.5,
  );
  expect(Buffer.from(archive['guide-check.html']).toString()).not.toContain('data-notale-guides=');
  await showSlide(page, doc.slides.find((s: any) => s.sourcePath === 'page-07.html')!.id);
  await expect(frameOf(page).locator('#m-slider')).toHaveValue('21');
  await frameOf(page).locator('#resample').click();
  await expect(frameOf(page).locator('canvas').first()).toBeVisible();
});

test('canvas and list share multiple selection, marquee avoids the stage, and locked objects stay fixed', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(async (slideId) => {
    await (window as any).NotaleWorkbench.commands([
      {
        type: 'element.insert',
        slideId,
        html: '<div id="selection-a" style="position:absolute;left:80px;top:100px;width:100px;height:60px;z-index:200;background:#466ddb"></div><div id="selection-b" style="position:absolute;left:280px;top:100px;width:100px;height:60px;z-index:200;background:#28a69b"></div><div id="selection-lock" style="position:absolute;left:480px;top:100px;width:100px;height:60px;z-index:200;background:#c6cbcf"></div>',
      },
    ]);
    const wb = (window as any).NotaleWorkbench,
      locked = wb.getObjects().find((o: any) => o.attributes.id === 'selection-lock').id;
    await wb.commands([{ type: 'element.lock', slideId, target: locked, locked: true }]);
  }, slideId);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const ids = await page.evaluate(() =>
    (window as any).NotaleWorkbench.getObjects()
      .filter((o: any) => /^selection-/.test(o.attributes.id))
      .map((o: any) => o.id),
  );
  const selection = () => page.evaluate(() => (window as any).NotaleWorkbench.getSelection());
  await frameOf(page).locator('#selection-a').click();
  await frameOf(page)
    .locator('#selection-b')
    .click({ modifiers: ['Shift'] });
  await expect.poll(selection).toEqual(ids.slice(0, 2));
  await expect(frameOf(page).locator('[data-notale-selected]')).toHaveCount(2);
  await expect(page.locator('.object-row.selected')).toHaveCount(2);
  const scale = await frameOf(page)
    .locator('#stage')
    .evaluate((el) => el.getBoundingClientRect().width / 1600);
  const points = () =>
    frameOf(page)
      .locator('[id^="selection-"]')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, style: el.getAttribute('style') };
        }),
      );
  const before = await points();
  let box = (await frameOf(page).locator('#selection-a').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 15, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const after = await points();
  for (let i = 0; i < 2; i++) {
    expect(after[i].x - before[i].x).toBeCloseTo(30, 2);
    expect(after[i].y - before[i].y).toBeCloseTo(15, 2);
  }
  expect(after[2]).toEqual(before[2]);
  await expect.poll(selection).toEqual(ids.slice(0, 2));
  // Toggle in the list must update both canvas outlines, including an empty selection.
  await page.locator(`[data-object="${ids[1]}"]`).click({ modifiers: ['Shift'] });
  await expect.poll(selection).toEqual([ids[0]]);
  await expect(frameOf(page).locator('[data-notale-selected]')).toHaveCount(1);
  await page.locator(`[data-object="${ids[0]}"]`).click({ modifiers: ['Shift'] });
  await expect.poll(selection).toEqual([]);
  await expect(frameOf(page).locator('[data-notale-selected]')).toHaveCount(0);
  // A viewport-sized synthetic page isolates blank-space and containment selection semantics.
  const blankId = randomUUID();
  await page.evaluate(
    async ({ blankId, slideId }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([
        {
          type: 'slide.insert',
          after: slideId,
          slide: {
            id: blankId,
            name: 'Selection canvas',
            sourcePath: 'selection.html',
            html: '<main id="stage" style="width:1600px;height:900px;background:white"><div id="marquee-parent" style="position:absolute;left:100px;top:100px;width:120px;height:100px;background:#466ddb"><span id="marquee-child" style="position:absolute;left:20px;top:20px;width:40px;height:20px;background:#a3baff"></span></div><div id="marquee-b" style="position:absolute;left:300px;top:100px;width:100px;height:60px;background:#28a69b"></div></main>',
          },
        },
      ]);
      await wb.showSlide(blankId);
      await wb.whenReady();
    },
    { blankId, slideId },
  );
  const stage = (await frameOf(page).locator('#stage').boundingBox())!;
  const stageStyle = await frameOf(page).locator('#stage').getAttribute('style');
  await page.mouse.move(stage.x + 70 * scale, stage.y + 70 * scale);
  await page.mouse.down();
  await page.mouse.move(stage.x + 430 * scale, stage.y + 240 * scale, { steps: 5 });
  await expect(frameOf(page).locator('[data-marquee]')).toHaveCount(1);
  await page.mouse.up();
  await expect(frameOf(page).locator('[data-marquee]')).toHaveCount(0);
  await expect.poll(async () => (await selection()).length).toBe(2);
  await expect(frameOf(page).locator('#marquee-parent')).toHaveAttribute(
    'data-notale-selected',
    '',
  );
  await expect(frameOf(page).locator('#marquee-child')).not.toHaveAttribute('data-notale-selected');
  expect(await frameOf(page).locator('#stage').getAttribute('style')).toBe(stageStyle);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
  // Cancelling a replacing marquee restores the previous selection without a revision.
  const selectedBefore = await selection();
  await page.mouse.move(stage.x + 900 * scale, stage.y + 500 * scale);
  await page.mouse.down();
  await page.mouse.move(stage.x + 1100 * scale, stage.y + 700 * scale, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(selection).toEqual(selectedBefore);
  await frameOf(page)
    .locator('#stage')
    .click({ position: { x: 900 * scale, y: 500 * scale } });
  await expect.poll(selection).toEqual([]);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
  await showSlide(page, slideId);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  box = (await frameOf(page).locator('#selection-lock').boundingBox())!;
  const lockedBefore = await frameOf(page).locator('#selection-lock').getAttribute('style');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 3 });
  await page.mouse.up();
  expect(await frameOf(page).locator('#selection-lock').getAttribute('style')).toBe(lockedBefore);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
});

test('SVG internal objects retain exact page geometry through viewBox, fill-box origins, mixed selection and reopening', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<svg id="geometry-svg" width="650" height="360" viewBox="10 -30 300 200" preserveAspectRatio="none" style="position:absolute;left:130px;top:200px;z-index:200;overflow:visible;transform:rotate(9deg)"><g transform="translate(12,8) rotate(13) skewX(7)"><rect id="svg-rect" x="60" y="20" width="50" height="35" fill="#466ddb" style="transform-box:fill-box;transform-origin:25% 75%;transform:rotate(17deg);translate:10% 20%"/><path id="svg-path" d="M170 40 L210 55 L180 100 Z" fill="#28a69b" transform="rotate(-9 180 60)"/></g></svg><div id="svg-peer" style="position:absolute;left:1050px;top:450px;width:100px;height:80px;z-index:200;background:#e8a34b;transform:rotate(-12deg)"></div>',
        },
      ]),
    slideId,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const ids = await page.evaluate(() =>
    (window as any).NotaleWorkbench.getObjects()
      .filter((o: any) => ['svg-rect', 'svg-path', 'svg-peer'].includes(o.attributes.id))
      .map((o: any) => o.id),
  );
  const points = () =>
    frameOf(page)
      .locator('#geometry-svg')
      .evaluate(() => {
        const stage = document.getElementById('stage')!.getBoundingClientRect(),
          scale = stage.width / 1600;
        return ['svg-rect', 'svg-path'].map((id) => {
          const el = document.getElementById(id) as unknown as SVGGraphicsElement,
            m = el.getScreenCTM()!;
          const p = new DOMPoint(
            id === 'svg-rect' ? 60 : 170,
            id === 'svg-rect' ? 20 : 40,
          ).matrixTransform(m);
          const r = el.getBoundingClientRect();
          return {
            x: (p.x - stage.x) / scale,
            y: (p.y - stage.y) / scale,
            cx: (r.x + r.width / 2 - stage.x) / scale,
            cy: (r.y + r.height / 2 - stage.y) / scale,
          };
        });
      });
  const before = await points();
  await frameOf(page).locator('#svg-rect').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual([ids[0]]);
  // Extend the selection through the host API: the exact same set must be dragged from SVG.
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  await expect(frameOf(page).locator('[data-notale-selected]')).toHaveCount(3);
  const scale = await frameOf(page)
    .locator('#stage')
    .evaluate((el) => el.getBoundingClientRect().width / 1600);
  const box = (await frameOf(page).locator('#svg-rect').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 18, { steps: 5 });
  const preview = await points();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  let after = await points();
  for (let i = 0; i < 2; i++) {
    expect(preview[i].x - before[i].x).toBeCloseTo(35 / scale, 2);
    expect(preview[i].y - before[i].y).toBeCloseTo(18 / scale, 2);
    expect(after[i].x).toBeCloseTo(preview[i].x, 2);
    expect(after[i].y).toBeCloseTo(preview[i].y, 2);
  }
  // Rotation about the measured selection center includes irregular SVG path geometry.
  const capture = await page.evaluate(async () =>
    (window as any).NotaleWorkbench.captureSelection(),
  );
  const left = Math.min(...capture.rectangles.map((r: any) => r.x)),
    right = Math.max(...capture.rectangles.map((r: any) => r.x + r.width)),
    top = Math.min(...capture.rectangles.map((r: any) => r.y)),
    bottom = Math.max(...capture.rectangles.map((r: any) => r.y + r.height)),
    cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const old = after;
  await page.evaluate(
    async ({ slideId, rectangles }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'elements.arrange', slideId, rectangles, action: 'rotate', angle: 23 },
      ]),
    { slideId, rectangles: capture.rectangles },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  after = await points();
  const angle = (23 * Math.PI) / 180;
  for (let i = 0; i < 2; i++) {
    const x = old[i].x - cx,
      y = old[i].y - cy;
    expect(after[i].x).toBeCloseTo(cx + x * Math.cos(angle) - y * Math.sin(angle), 2);
    expect(after[i].y).toBeCloseTo(cy + x * Math.sin(angle) + y * Math.cos(angle), 2);
  }
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const reopened = await points();
  for (let i = 0; i < 2; i++) {
    expect(reopened[i].x).toBeCloseTo(after[i].x, 2);
    expect(reopened[i].y).toBeCloseTo(after[i].y, 2);
  }
  await page.locator('#interact').click();
  await expect(frameOf(page).locator('#svg-rect')).toHaveCSS('outline-style', 'none');
});

test('focused canvas keyboard edits batch nudges, keep paste selected, and restore through undo without taking over text fields', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<div style="position:absolute;left:150px;top:180px;width:600px;height:250px;z-index:200;transform:rotate(17deg) scale(1.3,.8)"><div id="keyboard-a" style="position:absolute;left:50px;top:50px;width:120px;height:70px;background:#466ddb">移动对象</div><div id="keyboard-b" style="position:absolute;left:280px;top:50px;width:120px;height:70px;background:#28a69b">另一个对象</div></div>',
        },
      ]),
    slideId,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await frameOf(page).locator('#keyboard-a').click();
  await frameOf(page)
    .locator('#keyboard-b')
    .click({ modifiers: ['Shift'] });
  const ids = await page.evaluate(() => (window as any).NotaleWorkbench.getSelection());
  const positions = () =>
    frameOf(page)
      .locator('[id^="keyboard-"]')
      .evaluateAll((els) => {
        const stage = document.getElementById('stage')!.getBoundingClientRect(),
          scale = stage.width / 1600;
        return els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: (r.x - stage.x) / scale, y: (r.y - stage.y) / scale };
        });
      });
  const before = await positions();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  const after = await positions();
  for (let i = 0; i < 2; i++) {
    expect(after[i].x - before[i].x).toBeCloseTo(8, 2);
    expect(after[i].y - before[i].y).toBeCloseTo(10, 2);
  }
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(3);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  const copies = await page.evaluate(() => (window as any).NotaleWorkbench.getSelection());
  expect(copies).toHaveLength(2);
  expect(copies.some((id: string) => ids.includes(id))).toBe(false);
  await page.keyboard.press('Delete');
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await expect(frameOf(page).locator('#keyboard-a')).toHaveCount(1);
  for (const id of copies)
    await expect(frameOf(page).locator(`[data-notale-id="${id}"]`)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  for (const id of copies)
    await expect(frameOf(page).locator(`[data-notale-id="${id}"]`)).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await frameOf(page).locator('#keyboard-a').click();
  await page.locator('[data-tab="format"]').click();
  await page.locator('#object-text').fill('正在编辑输入框');
  await page.locator('#object-text').press('Control+a');
  await page.locator('#object-text').press('Backspace');
  await expect(page.locator('#object-text')).toHaveValue('');
  await expect(frameOf(page).locator('#keyboard-a')).toHaveCount(1);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(7);
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const reopened = await positions();
  expect(reopened).toEqual(after);
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page).locator('#m-slider').focus();
  const prior = Number(await frameOf(page).locator('#m-slider').inputValue());
  await page.keyboard.press('ArrowRight');
  expect(Number(await frameOf(page).locator('#m-slider').inputValue())).toBeGreaterThan(prior);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(7);
});

test('a batched keyboard nudge survives a lost save response and replays once after reopening', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  const target = await page.evaluate(() => {
    const wb = (window as any).NotaleWorkbench,
      id = wb.getObjects().find((o: any) => o.tag === 'h1').id;
    wb.select(id);
    return id;
  });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator(`[data-notale-id="${target}"]`)).toHaveAttribute(
    'data-notale-selected',
    '',
  );
  const before = await page.evaluate(
    async () => (await (window as any).NotaleWorkbench.captureSelection()).rectangles[0],
  );
  let dropped = false,
    status = 0;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      status = response.status();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#canvas').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#retry-save')).toBeVisible();
  await expect.poll(() => status).toBe(200);
  const committed = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(committed.version).toBe(2);
  const saved = await page.evaluate(() => (window as any).NotaleWorkbench.getPending());
  expect(saved.request.commands[0].dx).toBe(5);
  page.on('dialog', (d) => void d.accept());
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.evaluate(async (id) => {
    const wb = (window as any).NotaleWorkbench;
    await wb.whenReady();
    wb.select(id);
  }, target);
  const after = await page.evaluate(
    async () => (await (window as any).NotaleWorkbench.captureSelection()).rectangles[0],
  );
  expect(after.x - before.x).toBeCloseTo(5, 2);
  expect(after.y).toBeCloseTo(before.y, 2);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(2);
  expect(
    await page.evaluate(() => (window as any).NotaleWorkbench.getPending() ?? null),
  ).toBeNull();
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.lock', slideId, target, locked: true },
      ]),
    { slideId, target },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.locator('#canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#toast')).toContainText('锁定');
  expect(
    await page.evaluate(() => (window as any).NotaleWorkbench.getPending() ?? null),
  ).toBeNull();
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(3);
});

test('keyboard nudges queued during another save use the acknowledged revision and latest geometry', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  const target = await page.evaluate(() => {
    const wb = (window as any).NotaleWorkbench,
      id = wb.getObjects().find((o: any) => o.tag === 'h1').id;
    wb.select(id);
    return id;
  });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const before = await page.evaluate(
    async () => (await (window as any).NotaleWorkbench.captureSelection()).rectangles[0],
  );
  let release!: () => void,
    stored = false,
    requests = 0;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests++;
    if (requests === 1) {
      const response = await route.fetch();
      stored = true;
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await page.evaluate(
      ({ slideId, target }) => {
        (window as any).activeKeyboardSave = (window as any).NotaleWorkbench.commands([
          { type: 'element.patch', slideId, target, patch: { style: { translate: '25px 0px' } } },
        ]);
      },
      { slideId, target },
    );
    await expect.poll(() => stored).toBe(true);
    await page.locator('#canvas').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+s');
    // Keep the response pending beyond the coalescing interval to exercise the busy-save wait.
    await page.waitForTimeout(150);
    expect(requests).toBe(1);
    release();
    await expect(page.locator('#save-status')).toContainText('已保存 · v3');
    await page.evaluate(async () => {
      await (window as any).activeKeyboardSave;
      await (window as any).NotaleWorkbench.whenEditsIdle();
    });
    const after = await page.evaluate(
      async () => (await (window as any).NotaleWorkbench.captureSelection()).rectangles[0],
    );
    expect(after.x - before.x).toBeCloseTo(28, 2);
    expect(after.y).toBeCloseTo(before.y, 2);
    expect(requests).toBe(2);
    expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(
      3,
    );
  } finally {
    release();
  }
});

for (const action of ['undo', 'redo', 'history'] as const)
  test(`${action} restore survives a lost successful response and preserves its history plan across reopening`, async ({
    page,
  }) => {
    const doc = await clone(page),
      slideId = doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id;
    await showSlide(page, slideId);
    await page.evaluate(async (slideId) => {
      const wb = (window as any).NotaleWorkbench,
        target = wb.getObjects().find((o: any) => o.tag === 'h1').id;
      for (const text of ['Restore A', 'Restore B'])
        await wb.commands([{ type: 'element.patch', slideId, target, patch: { text } }]);
    }, slideId);
    if (action === 'redo') {
      await page.locator('#undo').click();
      await expect(page.locator('#save-status')).toContainText('已保存 · v4');
    }
    const base = action === 'redo' ? 4 : 3,
      expected = action === 'redo' ? 'Restore B' : action === 'undo' ? 'Restore A' : undefined;
    let dropped = false,
      status = 0;
    const requests: any[] = [];
    await page.route(`**/api/documents/${doc.id}/restore`, async (route) => {
      requests.push(route.request().postDataJSON());
      if (!dropped) {
        dropped = true;
        const response = await route.fetch();
        status = response.status();
        await route.abort('failed');
      } else await route.continue();
    });
    if (action === 'history') {
      await page.locator('[data-tab="document"]').click();
      await page.locator('#history').selectOption('1');
      await page.locator('#restore').click();
    } else await page.locator(`#${action}`).click();
    await expect(page.locator('#retry-save')).toBeVisible();
    await expect.poll(() => status).toBe(200);
    const journal = await page.evaluate(() => (window as any).NotaleWorkbench.getPending());
    expect(journal.kind).toBe('restore');
    expect(journal.slideId).toBe(slideId);
    expect(journal.after).toBeTruthy();
    const version = base + 1;
    expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(
      version,
    );
    page.on('dialog', (d) => void d.accept());
    await page.reload();
    await expect(page.locator('#retry-save')).toBeVisible();
    await page.locator('#retry-save').click();
    await expect(page.locator('#save-status')).toContainText(`已保存 · v${version}`);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(
      version,
    );
    await expect(page.locator('.slide-card.active')).toHaveAttribute('data-slide', slideId);
    if (expected) await expect(frameOf(page).locator('h1')).toHaveText(expected);
    else await expect(frameOf(page).locator('h1')).not.toHaveText('Restore B');
    await page.locator('#interact').click();
    await frameOf(page)
      .locator('#m-slider')
      .evaluate((el) => {
        (el as HTMLInputElement).value = '31';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect(frameOf(page).locator('#m-val')).toHaveText('31');
    // No pending request remains: ordinary reload must retain the acknowledged undo/redo plan.
    await page.reload();
    await showSlide(page, slideId);
    const follow = action === 'undo' ? 'redo' : 'undo';
    await expect(page.locator(`#${follow}`)).toBeEnabled();
    await page.locator(`#${follow}`).click();
    await expect(page.locator('#save-status')).toContainText(`已保存 · v${version + 1}`);
    await expect(frameOf(page).locator('h1')).toHaveText(
      action === 'redo' ? 'Restore A' : 'Restore B',
    );
    expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(
      version + 1,
    );
    if (action === 'history') {
      const remote = await page.request.post(`/api/documents/${doc.id}/commits`, {
        data: {
          baseVersion: version + 1,
          mutationId: randomUUID(),
          commands: [{ type: 'deck.update', title: 'Another session' }],
        },
      });
      expect(remote.ok()).toBe(true);
      await page.reload();
      await expect(page.locator('#save-status')).toContainText(`已保存 · v${version + 2}`);
      await expect(page.locator('#undo')).toBeDisabled();
      await expect(page.locator('#redo')).toBeDisabled();
    }
  });

test('speaker and audience reopen the pinned slide and step with timer, blackout and overview recovery', async ({
  page,
  context,
}) => {
  const doc = await clone(page),
    slideId = doc.slides.find((s) => s.sourcePath === 'page-20.html')!.id;
  await page.goto(`/show.html?document=${doc.id}&slide=${slideId}&speaker=1`);
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleShow?.state().max ?? 0))
    .toBeGreaterThan(0);
  const state = await page.evaluate(() => (window as any).NotaleShow.state());
  const initialUrl = page.url();
  expect(new URL(initialUrl).searchParams.get('version')).toBe('1');
  await page.locator('#next').click();
  await expect(page.locator('#counter')).toContainText('step 1 /');
  const started = await page.evaluate(() => (window as any).NotaleShow.state().started);
  await page.locator('#blank').click();
  await page.locator('#overview').click();
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#audience').click(),
  ]);
  await audience.waitForLoadState();
  await expect(audience.locator('#counter')).toContainText('step 1 /');
  await expect(audience.locator('body')).toHaveClass(/blank/);
  // A later document edit must not silently replace the presentation's pinned revision.
  const update = await page.request.post(`/api/documents/${doc.id}/commits`, {
    data: {
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        { type: 'slide.update', slideId, patch: { name: 'Edited after presentation began' } },
      ],
    },
  });
  expect(update.ok()).toBe(true);
  await page.reload();
  await expect(page.locator('#counter')).toContainText(`${state.index + 1} / 32 · step 1 /`);
  await expect(page.locator('body')).toHaveClass(/speaker/);
  await expect(page.locator('body')).toHaveClass(/blank/);
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleShow.reveal.isOverview()))
    .toBe(true);
  const restored = await page.evaluate(() => (window as any).NotaleShow.state());
  expect(restored.started).toBe(started);
  expect(restored.version).toBe(1);
  await page.locator('#overview').click();
  await page.locator('#blank').click();
  await expect(audience.locator('body')).not.toHaveClass(/blank/);
  await audience.reload();
  await expect(audience.locator('#counter')).toContainText('step 1 /');
  expect((await audience.evaluate(() => (window as any).NotaleShow.state())).started).toBe(started);
  const currentFrame = () => audience.frameLocator('.slides section.present iframe');
  await expectNativeStep(audience, 1);
  await page.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('step 2 /');
  await expectNativeStep(audience, 2);
  await page.locator('#reset-timer').click();
  await expect
    .poll(() => audience.evaluate(() => (window as any).NotaleShow.state().started))
    .toBeGreaterThan(started);
  await expect(currentFrame().locator('[data-step="2"]').first()).toHaveCSS('opacity', '1');
  await page.locator('#next').click();
  await expect(page.locator('#counter')).toContainText(`${state.index + 2} / 32 · step 0 /`);
  await page.locator('#prev').click();
  await expect(page.locator('#counter')).toContainText(`${state.index + 1} / 32 · step 2 /`);
  await expect(currentFrame().locator('[data-step="2"]').first()).toHaveCSS('opacity', '1');
  await page.locator('#prev').click();
  await page.locator('#prev').click();
  await expect(page.locator('#counter')).toContainText(`${state.index + 1} / 32 · step 0 /`);
  await expect(currentFrame().locator('[data-step="2"]').first()).toHaveCSS('opacity', '0');
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('step 2 /');
  await page.close();
  await audience.reload();
  await expect(audience.locator('#counter')).toContainText('step 2 /');
  await expect(currentFrame().locator('[data-step="2"]').first()).toHaveCSS('opacity', '1');
  await audience.close();
});

test('canvas handles resize and rotate mixed affine HTML/SVG with stable anchors, cancellation and source recovery', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<div style="position:absolute;left:250px;top:300px;width:400px;height:160px;z-index:200;transform:rotate(13deg) scale(1.2,.8)"><div id="handle-html" style="position:absolute;left:20px;top:10px;width:140px;height:90px;background:#466ddb;transform-origin:20% 70%;transform:rotate(-18deg)"><i id="handle-corner" style="position:absolute;left:0;top:0;width:0;height:0"></i>缩放与旋转</div></div><svg width="400" height="240" viewBox="10 -30 300 200" preserveAspectRatio="none" style="position:absolute;left:760px;top:300px;z-index:200;overflow:visible;transform:rotate(9deg)"><g transform="translate(12,8) rotate(13) skewX(7)"><path id="handle-svg" d="M70 20 L160 40 L100 100 Z" fill="#28a69b" style="transform-box:fill-box;transform-origin:25% 75%;transform:rotate(17deg);translate:10% 20%"/></g></svg>',
        },
      ]),
    slideId,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const ids = await page.evaluate(() =>
    (window as any).NotaleWorkbench.getObjects()
      .filter((o: any) => ['handle-html', 'handle-svg'].includes(o.attributes.id))
      .map((o: any) => o.id),
  );
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  const handle = (name: string) =>
    frameOf(page).locator(`[data-notale-handles] [data-handle="${name}"]`);
  await expect(handle('se')).toBeVisible();
  const points = () =>
    frameOf(page)
      .locator('#handle-html')
      .evaluate(() => {
        const stage = document.getElementById('stage')!.getBoundingClientRect(),
          scale = stage.width / 1600;
        const corner = document.getElementById('handle-corner')!.getBoundingClientRect();
        const svg = document.getElementById('handle-svg') as unknown as SVGGraphicsElement;
        const p = new DOMPoint(70, 20).matrixTransform(svg.getScreenCTM()!);
        return [
          { x: (corner.x - stage.x) / scale, y: (corner.y - stage.y) / scale },
          { x: (p.x - stage.x) / scale, y: (p.y - stage.y) / scale },
        ];
      });
  const captureBounds = async () => {
    const capture = await page.evaluate(async () =>
      (window as any).NotaleWorkbench.captureSelection(),
    );
    const rs = capture.rectangles;
    const x = Math.min(...rs.map((r: any) => r.x)),
      y = Math.min(...rs.map((r: any) => r.y));
    return {
      x,
      y,
      width: Math.max(...rs.map((r: any) => r.x + r.width)) - x,
      height: Math.max(...rs.map((r: any) => r.y + r.height)) - y,
    };
  };
  const same = (actual: { x: number; y: number }[], expected: { x: number; y: number }[]) => {
    actual.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 2);
      expect(p.y).toBeCloseTo(expected[i].y, 2);
    });
  };
  await page.keyboard.down('Control');
  let before = await points(),
    b = await captureBounds();
  const scale = await frameOf(page)
    .locator('#stage')
    .evaluate((el) => el.getBoundingClientRect().width / 1600);
  let box = (await handle('se').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80 * scale, box.y + box.height / 2 + 35 * scale, {
    steps: 5,
  });
  let preview = await points();
  same(
    preview,
    before.map((p) => ({
      x: b.x + (p.x - b.x) * (1 + 80 / b.width),
      y: b.y + (p.y - b.y) * (1 + 35 / b.height),
    })),
  );
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  same(await points(), preview);
  // Alt + Shift scales uniformly about the selection center, even from an edge.
  before = await points();
  b = await captureBounds();
  box = (await handle('e').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30 * scale, box.y + box.height / 2, { steps: 4 });
  preview = await points();
  const cx = b.x + b.width / 2,
    cy = b.y + b.height / 2,
    factor = 1 + 60 / b.width;
  same(
    preview,
    before.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor })),
  );
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  same(await points(), preview);
  // Real pointer rotation snaps a 37-degree gesture to 30 degrees.
  before = await points();
  b = await captureBounds();
  box = (await handle('rotate').boundingBox())!;
  const stageBox = (await frameOf(page).locator('#stage').boundingBox())!;
  const centerX = stageBox.x + (b.x + b.width / 2) * scale,
    centerY = stageBox.y + (b.y + b.height / 2) * scale;
  const px = box.x + box.width / 2,
    py = box.y + box.height / 2,
    a = (37 * Math.PI) / 180;
  await page.keyboard.down('Shift');
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(
    centerX + (px - centerX) * Math.cos(a) - (py - centerY) * Math.sin(a),
    centerY + (px - centerX) * Math.sin(a) + (py - centerY) * Math.cos(a),
    { steps: 8 },
  );
  preview = await points();
  const angle = Math.PI / 6,
    ax = b.x + b.width / 2,
    ay = b.y + b.height / 2;
  same(
    preview,
    before.map((p) => ({
      x: ax + (p.x - ax) * Math.cos(angle) - (p.y - ay) * Math.sin(angle),
      y: ay + (p.x - ax) * Math.sin(angle) + (p.y - ay) * Math.cos(angle),
    })),
  );
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  same(await points(), preview);
  // Escape restores source style and keeps both selected, with no revision created.
  b = await captureBounds();
  box = (await handle('nw').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 20, { steps: 3 });
  const growing = await points();
  const cancelledBounds = await captureBounds();
  expect(cancelledBounds.width).toBeCloseTo(b.width + 40 / scale, 2);
  expect(cancelledBounds.height).toBeCloseTo(b.height + 20 / scale, 2);
  same(
    growing,
    preview.map((p) => ({
      x: b.x + b.width + (p.x - b.x - b.width) * (1 + 40 / scale / b.width),
      y: b.y + b.height + (p.y - b.y - b.height) * (1 + 20 / scale / b.height),
    })),
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();
  same(await points(), preview);
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSelection())).toEqual(ids);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
  await page.keyboard.up('Control');
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  same(await points(), preview);
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  await expect(handle('se')).toBeVisible();
  await page.evaluate(
    async ({ slideId, ids }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'group.set', slideId, id: 'handle-group', name: 'HTML and SVG', members: ids },
      ]),
    { slideId, ids },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), ids[0]);
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual(ids);
  await expect(handle('se')).toBeVisible();
  await page.screenshot({ path: '.local/transform-handles.png' });
  // Any locked member disables the group's handles without changing its geometry.
  await page.evaluate(
    async ({ slideId, id }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.lock', slideId, target: id, locked: true },
      ]),
    { slideId, id: ids[1] },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(handle('se')).toBeHidden();
  same(await points(), preview);
  await page.locator('#interact').click();
  await expect(handle('se')).toBeHidden();
});

test('independent pending journals survive multiple lost responses, a third tab save and closed-window recovery', async ({
  page,
  context,
}) => {
  const a = page,
    b = await context.newPage(),
    docA = await clone(a),
    docB = await clone(b);
  const slideA = docA.slides.find((s) => s.sourcePath === 'page-07.html')!.id,
    slideB = docB.slides.find((s) => s.sourcePath === 'page-07.html')!.id;
  const sentA: any[] = [],
    sentB: any[] = [];
  const lose = async (tab: Page, id: string, sent: any[]) => {
    await tab.route(`**/api/documents/${id}/commits`, async (route) => {
      sent.push(route.request().postDataJSON());
      if (sent.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
  };
  await lose(a, docA.id, sentA);
  await lose(b, docB.id, sentB);
  await showSlide(a, slideA);
  await showSlide(b, slideB);
  const change = (tab: Page, slideId: string, text: string) =>
    tab.evaluate(
      async ({ slideId, text }) => {
        const wb = (window as any).NotaleWorkbench;
        await wb.whenReady();
        const target = wb.getObjects().find((o: any) => o.tag === 'h1').id;
        await wb
          .commands([{ type: 'element.patch', slideId, target, patch: { text } }])
          .catch(() => {});
        return wb.getPending();
      },
      { slideId, text },
    );
  const [pendingA, pendingB] = await Promise.all([
    change(a, slideA, 'Journal A'),
    change(b, slideB, 'Journal B'),
  ]);
  expect(pendingA.request).toEqual(sentA[0]);
  expect(pendingB.request).toEqual(sentB[0]);
  const records = (tab: Page) =>
    tab.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('notale-editor-pending-v2:'))
        .map((k) => JSON.parse(localStorage.getItem(k)!)),
    );
  expect(await records(a)).toHaveLength(2);
  a.on('dialog', (dialog) => void dialog.accept());
  await a.reload();
  // A tab keeps a separate pointer for each document; switching never adopts B's work.
  await a.locator('#documents').selectOption(docB.id);
  await expect(a.locator('#save-status')).toContainText('已保存 · v2');
  expect(await a.evaluate(() => (window as any).NotaleWorkbench.getPending())).toBeUndefined();
  await a.locator('#documents').selectOption(docA.id);
  await expect(a.locator('#retry-save')).toBeVisible();
  expect(await a.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pendingA);
  const c = await context.newPage();
  await c.goto(`/workbench.html?document=${docA.id}`);
  await c.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await c.evaluate(() => (window as any).NotaleWorkbench.getPending())).toBeUndefined();
  await c.evaluate(() =>
    (window as any).NotaleWorkbench.commands([
      { type: 'deck.update', title: 'Another window edited the deck title' },
    ]),
  );
  expect(await records(c)).toHaveLength(2);
  expect(await a.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pendingA);
  expect(await b.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pendingB);
  await b.close();
  await a.reload();
  await expect(a.locator('#retry-save')).toBeVisible();
  await a.locator('#retry-save').click();
  // Retrying an older acknowledgment must show the newer head, without undoing C.
  await expect(a.locator('#save-status')).toContainText('已保存 · v3');
  await expect(a.locator('#undo')).toBeDisabled();
  expect(sentA).toHaveLength(2);
  expect(sentA[1]).toEqual(sentA[0]);
  await expect(frameOf(a).locator('h1')).toHaveText('Journal A');
  expect((await (await a.request.get(`/api/documents/${docA.id}`)).json()).document.title).toBe(
    'Another window edited the deck title',
  );
  const remaining = await records(a);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].task).toEqual(pendingB);
  // C adopts the closed window's complete request and can export it before retrying.
  await expect(c.locator('#recovery-panel summary')).toContainText('1');
  await c.locator('#recovery-panel summary').click();
  await c.screenshot({ path: '.local/pending-recovery.png' });
  const downloadPromise = c.waitForEvent('download');
  await c.locator('[data-export-recovery]').click();
  const download = await downloadPromise;
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')).task).toEqual(pendingB);
  await c.locator('[data-recover]').click();
  await expect(c.locator('#retry-save')).toBeVisible();
  expect(await c.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pendingB);
  await c.route(`**/api/documents/${docB.id}/commits`, async (route) => {
    sentB.push(route.request().postDataJSON());
    await route.continue();
  });
  await c.locator('#retry-save').click();
  await expect(c.locator('#save-status')).toContainText('已保存 · v2');
  expect(sentB).toHaveLength(2);
  expect(sentB[1]).toEqual(sentB[0]);
  await expect(frameOf(c).locator('h1')).toHaveText('Journal B');
  await expect(a.locator('#recovery-panel')).toBeHidden();
  expect(await records(c)).toHaveLength(0);
  for (const [tab, id, version] of [
    [a, docA.id, 3],
    [c, docB.id, 2],
  ] as const) {
    expect(await (await tab.request.get(`/api/documents/${id}/history`)).json()).toHaveLength(
      version,
    );
    await tab.locator('#interact').click();
    await frameOf(tab)
      .locator('#m-slider')
      .evaluate((el) => {
        (el as HTMLInputElement).value = '31';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect(frameOf(tab).locator('#m-val')).toHaveText('31');
  }
  await c.close();
});

test('same-document conflicts keep both journals and discarding one never clears the other request', async ({
  page,
  context,
}) => {
  const a = page,
    doc = await clone(a),
    b = await context.newPage();
  await b.goto(`/workbench.html?document=${doc.id}`);
  await b.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  let savedStatus = 0;
  await a.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    const response = await route.fetch();
    savedStatus = response.status();
    await route.abort('failed');
  });
  await a.evaluate(async () =>
    (window as any).NotaleWorkbench.commands([{ type: 'deck.update', title: 'Winning tab' }]).catch(
      () => {},
    ),
  );
  expect(savedStatus).toBe(200);
  await b.evaluate(async () =>
    (window as any).NotaleWorkbench.commands([
      { type: 'deck.update', title: 'Conflicting tab' },
    ]).catch(() => {}),
  );
  const first = await a.evaluate(() => (window as any).NotaleWorkbench.getPending());
  const conflict = await b.evaluate(() => (window as any).NotaleWorkbench.getPending());
  expect(first.request.baseVersion).toBe(1);
  expect(conflict.request.baseVersion).toBe(1);
  expect(first.request.mutationId).not.toBe(conflict.request.mutationId);
  b.on('dialog', (dialog) => void dialog.accept());
  await b.reload();
  await expect(b.locator('#retry-save')).toBeVisible();
  await b.locator('#retry-save').click();
  await expect(b.locator('#toast')).toContainText('VERSION_CONFLICT');
  expect(await b.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(conflict);
  await b.locator('#reload-head').click();
  await expect(b.locator('#save-status')).toContainText('已保存 · v2');
  expect(await a.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(first);
  const records = await a.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('notale-editor-pending-v2:'))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  );
  expect(records).toHaveLength(1);
  expect(records[0].task).toEqual(first);
  await a.unroute(`**/api/documents/${doc.id}/commits`);
  await a.locator('#retry-save').click();
  await expect(a.locator('#save-status')).toContainText('已保存 · v2');
  expect((await (await a.request.get(`/api/documents/${doc.id}`)).json()).document.title).toBe(
    'Winning tab',
  );
  expect(await (await a.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(2);
  await b.close();
});

test('duplicated editor windows can retry the same pending request concurrently without an extra revision', async ({
  page,
}) => {
  const doc = await clone(page),
    sent: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.evaluate(async () =>
    (window as any).NotaleWorkbench.commands([
      { type: 'deck.update', title: 'Duplicate-window recovery' },
    ]).catch(() => {}),
  );
  const pending = await page.evaluate(() => (window as any).NotaleWorkbench.getPending());
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => {
    window.open(location.href, '_blank');
  });
  const popup = await popupPromise;
  await expect(popup.locator('#retry-save')).toBeVisible();
  expect(await popup.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pending);
  await popup.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.continue();
  });
  await Promise.all([page.locator('#retry-save').click(), popup.locator('#retry-save').click()]);
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await expect(popup.locator('#save-status')).toContainText('已保存 · v2');
  expect(sent).toHaveLength(3);
  for (const request of sent) expect(request).toEqual(pending.request);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(2);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('notale-editor-pending-v2:')),
    ),
  ).toHaveLength(0);
  await popup.close();
});

test('legacy pending saves migrate and retry once without resurrecting after another reload', async ({
  page,
}) => {
  const doc = await clone(page);
  let sent = 0;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    sent++;
    if (sent === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.evaluate(async () =>
    (window as any).NotaleWorkbench.commands([
      { type: 'deck.update', title: 'Legacy recovery' },
    ]).catch(() => {}),
  );
  const pending = await page.evaluate(() => {
    const task = (window as any).NotaleWorkbench.getPending();
    delete task.kind;
    localStorage.setItem('notale-editor-pending-v1', JSON.stringify(task));
    for (const key of Object.keys(localStorage))
      if (key.startsWith('notale-editor-pending-v2:')) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('notale-editor-own-pending-v2:')) sessionStorage.removeItem(key);
    return task;
  });
  page.on('dialog', (d) => void d.accept());
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(pending);
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await expect(page.locator('#retry-save')).toBeHidden();
  await expect(page.locator('#recovery-panel')).toBeHidden();
  expect(sent).toBe(2);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(2);
});

test('exported pending changes can be imported after local recovery records are lost and retried exactly once', async ({
  page,
}) => {
  const doc = await clone(page),
    sent: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.evaluate(async () =>
    (window as any).NotaleWorkbench.commands([
      { type: 'deck.update', title: 'Imported recovery file' },
    ]).catch(() => {}),
  );
  const original = await page.evaluate(() => (window as any).NotaleWorkbench.getPending());
  await page.locator('#recovery-panel summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-export-recovery]').click();
  const download = await downloadPromise,
    path = (await download.path())!;
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  page.on('dialog', (d) => void d.accept());
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await expect(page.locator('#recovery-panel')).toBeHidden();
  await page.locator('#import-recovery').setInputFiles(path);
  await expect(page.locator('[data-recover]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getPending())).toBeUndefined();
  await page.locator('[data-recover]').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getPending())).toEqual(original);
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(2);
  await expect(page.locator('#recovery-panel')).toBeHidden();
});

async function resizeFixture(page: Page) {
  const doc = await clone(page),
    slideId = `resize-${randomUUID()}`;
  const ids = await page.evaluate(async (slideId) => {
    const wb = (window as any).NotaleWorkbench;
    await wb.commands([
      {
        type: 'slide.insert',
        after: wb.getSnapshot().document.slides[0].id,
        slide: {
          id: slideId,
          name: 'Resize alignment',
          sourcePath: 'resize.html',
          html: '<html><body><main id="stage" style="width:1600px;height:900px;background:white"><div style="position:absolute;left:170px;top:250px;width:300px;height:200px;transform:rotate(13deg) scale(1.2,.8)"><div id="resize-a" style="position:absolute;left:20px;top:20px;width:120px;height:60px;background:#466ddb">Resize</div></div><svg width="240" height="200" viewBox="10 -10 180 120" preserveAspectRatio="none" style="position:absolute;left:600px;top:220px;overflow:visible"><g transform="skewX(9) rotate(13)"><path id="resize-path" d="M20 20 L100 30 L40 70 Z" fill="#28a69b" style="transform-box:fill-box;transform-origin:30% 70%;transform:rotate(-12deg)"/></g></svg><div id="resize-reference" style="position:absolute;left:1200px;top:700px;width:100px;height:70px;background:#e8a34b"></div></main></body></html>',
        },
      },
    ]);
    await wb.showSlide(slideId);
    await wb.whenReady();
    const ids = wb
      .getObjects()
      .filter((o: any) => ['resize-a', 'resize-path'].includes(o.attributes.id))
      .map((o: any) => o.id);
    await wb.commands([
      { type: 'group.set', slideId, id: 'resize-group', name: 'Mixed geometry', members: ids },
    ]);
    await wb.whenReady();
    wb.selectMany(ids);
    return ids;
  }, slideId);
  await expect(frameOf(page).locator('[data-handle="e"]')).toBeVisible();
  return { doc, slideId, ids };
}
async function resizeBounds(page: Page) {
  return frameOf(page)
    .locator('[data-notale-selected]')
    .evaluateAll((els) => {
      const stage = document.getElementById('stage')!.getBoundingClientRect(),
        scale = stage.width / 1600;
      const rs = els.map((el) => el.getBoundingClientRect());
      const x = (Math.min(...rs.map((r) => r.x)) - stage.x) / scale,
        y = (Math.min(...rs.map((r) => r.y)) - stage.y) / scale;
      return {
        x,
        y,
        width: (Math.max(...rs.map((r) => r.right)) - stage.x) / scale - x,
        height: (Math.max(...rs.map((r) => r.bottom)) - stage.y) / scale - y,
        scale,
      };
    });
}
async function startHandle(page: Page, name: string, dx: number, dy: number) {
  await expect(frameOf(page).locator(`[data-handle="${name}"]`)).toBeVisible();
  const box = (await frameOf(page).locator(`[data-handle="${name}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
}

test('resize snapping preserves mixed-group anchors, proportional center scaling and exact save/reopen geometry', async ({
  page,
}) => {
  const { doc, slideId, ids } = await resizeFixture(page);
  let b = await resizeBounds(page),
    target = 1000.25;
  const guide = async (position: number) => {
    await page.evaluate(
      async ({ slideId, position }) =>
        (window as any).NotaleWorkbench.commands([
          {
            type: 'slide.update',
            slideId,
            patch: { guides: [{ id: 'resize-guide', axis: 'x', position }] },
          },
        ]),
      { slideId, position },
    );
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await guide(target);
  await startHandle(page, 'e', (target - b.x - b.width) * b.scale - 4, 0);
  let preview = await resizeBounds(page);
  expect(preview.x).toBeCloseTo(b.x, 2);
  expect(preview.x + preview.width).toBeCloseTo(target, 2);
  expect(preview.height).toBeCloseTo(b.height, 2);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect((await resizeBounds(page)).width).toBeCloseTo(preview.width, 2);
  b = await resizeBounds(page);
  target = b.x + b.width + 40.25;
  await guide(target);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await startHandle(page, 'e', 40.25 * b.scale - 3, 0);
  preview = await resizeBounds(page);
  expect(preview.x + preview.width).toBeCloseTo(target, 2);
  expect(preview.x + preview.width / 2).toBeCloseTo(b.x + b.width / 2, 2);
  expect(preview.y + preview.height / 2).toBeCloseTo(b.y + b.height / 2, 2);
  expect(preview.height / b.height).toBeCloseTo(preview.width / b.width, 5);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect((await resizeBounds(page)).width).toBeCloseTo(preview.width, 2);
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await showSlide(page, slideId);
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  expect((await resizeBounds(page)).width).toBeCloseTo(preview.width, 2);
  // Ctrl bypasses magnets while preserving the same resize semantics.
  b = await resizeBounds(page);
  target = b.x + b.width + 25;
  await guide(target);
  await page.keyboard.down('Control');
  await startHandle(page, 'e', 25 * b.scale - 2, 0);
  const bypass = await resizeBounds(page);
  expect(bypass.x + bypass.width).toBeCloseTo(target - 2 / b.scale, 2);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect((await resizeBounds(page)).width).toBeCloseTo(b.width, 2);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(8);
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('keyboard, viewport, pointer cancellation and selection changes restore gesture previews before subsequent edits', async ({
  page,
}) => {
  // Gate notifications before the bridge registers its Window listeners.
  await page.addInitScript(() => {
    if (window === window.top) return;
    const add = window.addEventListener.bind(window),
      remove = window.removeEventListener.bind(window);
    const wrappers = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
    (window as any).addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (!listener) return;
      if (type !== 'resize') return add(type, listener, options);
      let wrapped = wrappers.get(listener);
      if (!wrapped) {
        wrapped = (event) => {
          if ((window as any).__holdResize) return;
          if (typeof listener === 'function') listener.call(window, event);
          else listener.handleEvent(event);
        };
        wrappers.set(listener, wrapped);
      }
      add(type, wrapped, options);
    };
    (window as any).removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) => {
      if (!listener) return;
      remove(type, type === 'resize' ? (wrappers.get(listener) ?? listener) : listener, options);
    };
  });
  const { doc, slideId, ids } = await resizeFixture(page);
  const original = await resizeBounds(page);
  const styles = () =>
    frameOf(page)
      .locator('[data-notale-selected]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('style')));
  const sourceStyles = await styles();
  await startHandle(page, 'se', 40, 25);
  expect(await styles()).not.toEqual(sourceStyles);
  await page.keyboard.press('ArrowRight');
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  let b = await resizeBounds(page);
  expect(b.x - original.x).toBeCloseTo(1, 2);
  expect(b.y).toBeCloseTo(original.y, 2);
  expect(b.width).toBeCloseTo(original.width, 2);
  expect(b.height).toBeCloseTo(original.height, 2);
  const savedStyles = await styles();
  // A native drag must also be cancelled before a queued keyboard nudge captures geometry.
  const box = (await frameOf(page).locator('#resize-a').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 4 });
  await page.keyboard.press('ArrowDown');
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  b = await resizeBounds(page);
  expect(b.x - original.x).toBeCloseTo(1, 2);
  expect(b.y - original.y).toBeCloseTo(1, 2);
  const beforeResize = await styles();
  await startHandle(page, 'e', 40, 0);
  expect(await styles(), 'preview must exist before viewport change').not.toEqual(beforeResize);
  // Delay the iframe's resize notification: pointerup must independently detect
  // the changed viewport and refuse to commit geometry measured before it.
  const oldViewport = await frameOf(page)
    .locator('#stage')
    .evaluate(() => {
      (window as any).__delayResize = (event: Event) => event.stopImmediatePropagation();
      (window as any).__holdResize = true;
      // Chromium may synthesize a pointer move while resizing. Delay it too,
      // so this case exercises pointerup's independent viewport guard.
      window.addEventListener('pointermove', (window as any).__delayResize, true);
      return innerWidth;
    });
  await page.setViewportSize({ width: 1450, height: 960 });
  await expect
    .poll(() =>
      frameOf(page)
        .locator('#stage')
        .evaluate(() => innerWidth),
    )
    .not.toBe(oldViewport);
  expect(await styles()).not.toEqual(beforeResize);
  await page.mouse.up();
  await expect.poll(styles).toEqual(beforeResize);
  await frameOf(page)
    .locator('#stage')
    .evaluate(() => {
      (window as any).__holdResize = false;
      window.removeEventListener('pointermove', (window as any).__delayResize, true);
    });
  await page.setViewportSize({ width: 1600, height: 1050 });
  await frameOf(page)
    .locator('#stage')
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await startHandle(page, 'rotate', 30, 10);
  await frameOf(page)
    .locator('[data-notale-handles]')
    .dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  expect(await styles()).toEqual(beforeResize);
  await startHandle(page, 'e', 30, 0);
  await page.locator('#documents').focus();
  await page.mouse.up();
  expect(await styles()).toEqual(beforeResize);
  await startHandle(page, 'e', 30, 0);
  await frameOf(page)
    .locator('[data-notale-handles]')
    .evaluate((el) => el.releasePointerCapture(1));
  await page.mouse.move(900, 500);
  await expect.poll(styles).toEqual(beforeResize);
  await page.mouse.up();
  await startHandle(page, 'e', 30, 0);
  await frameOf(page)
    .locator('#stage')
    .evaluate(() => (window as any).NotaleBridge.mode('play'));
  await page.mouse.up();
  expect(await styles()).toEqual(beforeResize);
  await frameOf(page)
    .locator('#stage')
    .evaluate(() => (window as any).NotaleBridge.mode('edit'));
  await startHandle(page, 'e', 30, 0);
  await page.evaluate(() => (window as any).NotaleWorkbench.selectMany([]));
  await page.mouse.up();
  expect(await frameOf(page).locator('#resize-a').getAttribute('style')).toBe(beforeResize[0]);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
  await page.reload();
  await showSlide(page, slideId);
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  expect((await resizeBounds(page)).width).toBeCloseTo(original.width, 2);
  expect(savedStyles).not.toEqual(sourceStyles);
});

test('overlapping page renders keep the latest objects and wait for the target native frame', async ({
  page,
}) => {
  const doc = await clone(page),
    older = doc.slides[1].id,
    latest = doc.slides[2].id;
  let release!: () => void,
    held = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/documents/${doc.id}/slides/${older}/objects?*`, async (route) => {
    const response = await route.fetch();
    held = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.evaluate((id) => {
      (window as any).__olderRender = 'waiting';
      void (window as any).NotaleWorkbench.showSlide(id)
        .then(() => {
          (window as any).__olderRender = 'resolved';
        })
        .catch((e: Error) => {
          (window as any).__olderRender = e.message;
        });
    }, older);
    await expect.poll(() => held).toBe(true);
    await page.evaluate((id) => (window as any).NotaleWorkbench.showSlide(id), latest);
    expect(
      await frameOf(page)
        .locator('html')
        .evaluate(() => (window as any).__NOTALE__.slide.id),
    ).toBe(latest);
    const objects = await page.evaluate(() =>
      (window as any).NotaleWorkbench.getObjects().map((o: any) => o.id),
    );
    release();
    await expect
      .poll(() => page.evaluate(() => (window as any).__olderRender))
      .toContain('后续请求替代');
    expect(
      await page.evaluate(() => (window as any).NotaleWorkbench.getObjects().map((o: any) => o.id)),
    ).toEqual(objects);
    await expect(page.locator('.slide-card.active')).toHaveAttribute('data-slide', latest);
    expect(
      await frameOf(page)
        .locator('html')
        .evaluate(() => (window as any).__NOTALE__.slide.id),
    ).toBe(latest);
    await showSlide(page, doc.slides[0].id);
  } finally {
    release();
  }
});

async function textBoxState(page: Page) {
  await page.evaluate(async () => {
    await (window as any).NotaleWorkbench.whenReady();
  });
  return frameOf(page)
    .locator('#reflow-text')
    .evaluate((node) => {
      const el = node as HTMLElement,
        c = getComputedStyle(el);
      const n = (s: string) => parseFloat(c.getPropertyValue(s)) || 0;
      const w =
        n('width') +
        (c.boxSizing === 'border-box'
          ? 0
          : n('padding-left') +
            n('padding-right') +
            n('border-left-width') +
            n('border-right-width'));
      const h =
        n('height') +
        (c.boxSizing === 'border-box'
          ? 0
          : n('padding-top') +
            n('padding-bottom') +
            n('border-top-width') +
            n('border-bottom-width'));
      // Independent browser probes, removed before the next gesture so source and
      // text-flow classification never contain positioned children.
      const corners = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ].map(([x, y]) => {
        const probe = document.createElement('i');
        probe.style.cssText = `position:absolute;left:${x - n('border-left-width')}px;top:${y - n('border-top-width')}px;width:0;height:0;margin:0;padding:0;border:0;transform:none;`;
        el.append(probe);
        const r = probe.getBoundingClientRect();
        probe.remove();
        return { x: r.x, y: r.y };
      });
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        w,
        h,
        corners,
        stage: (() => {
          const r = document.getElementById('stage')!.getBoundingClientRect();
          return { x: r.x, y: r.y, scale: r.width / 1600 };
        })(),
        font: c.fontSize,
        lines: range.getClientRects().length,
        style: el.getAttribute('style'),
        rich: el.innerHTML,
      };
    });
}

async function textFixture(page: Page) {
  const doc = await clone(page),
    slideId = `text-${randomUUID()}`;
  const id = await page.evaluate(async (slideId) => {
    const wb = (window as any).NotaleWorkbench;
    await wb.commands([
      {
        type: 'slide.insert',
        after: wb.getSnapshot().document.slides[0].id,
        slide: {
          id: slideId,
          name: 'Text reflow',
          sourcePath: 'reflow.html',
          html: '<html><body><main id="stage" style="width:1600px;height:900px;background:white"><div style="position:absolute;left:270px;top:180px;width:800px;height:550px;transform:rotate(11deg) skewX(7deg) scale(1.15,.8)"><p id="reflow-text" style="position:absolute;left:40px;top:40px;width:480px;height:160px;inline-size:480px;block-size:160px;box-sizing:content-box;padding:13px 19px;border:3px solid #466ddb;margin:0;font:24px/1.4 sans-serif;transform-origin:23% 71%;transform:rotate(-17deg);translate:8% -6%"><strong>HTML slides preserve rich text.</strong> A paragraph can wrap into additional lines while its font size and rotation remain unchanged. <em>Manual editing should retain emphasis and native content.</em> Reliable saving must keep the exact shape after reopening.</p></div></main></body></html>',
        },
      },
    ]);
    await wb.showSlide(slideId);
    const id = wb.getObjects().find((o: any) => o.attributes.id === 'reflow-text').id;
    wb.selectMany([id]);
    return id;
  }, slideId);
  return { doc, slideId, id };
}

test('text box reflow keeps font and oriented anchors through preview, history and reopening', async ({
  page,
}) => {
  const { doc, slideId, id } = await textFixture(page);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#guide-settings summary').click();
  await page.locator('#snap-enabled').uncheck();
  await expect(frameOf(page).locator('[data-text-box]')).toBeVisible();
  const before = await textBoxState(page);
  const dx = ((before.corners[1].x - before.corners[0].x) / before.w) * -210;
  const dy = ((before.corners[1].y - before.corners[0].y) / before.w) * -210;
  await startHandle(page, 'e', dx, dy);
  const preview = await textBoxState(page);
  expect(preview.w).toBeCloseTo(before.w - 210, 0);
  expect(preview.h).toBeGreaterThan(before.h);
  expect(preview.lines).toBeGreaterThan(before.lines);
  expect(preview.font).toBe(before.font);
  expect(preview.rich).toBe(before.rich);
  expect(preview.corners[0].x).toBeCloseTo(before.corners[0].x, 2);
  expect(preview.corners[0].y).toBeCloseTo(before.corners[0].y, 2);
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const saved = await textBoxState(page);
  expect(saved.w).toBeCloseTo(preview.w, 2);
  expect(saved.h).toBeCloseTo(preview.h, 2);
  for (let i = 0; i < 4; i++) {
    expect(saved.corners[i].x).toBeCloseTo(preview.corners[i].x, 2);
    expect(saved.corners[i].y).toBeCloseTo(preview.corners[i].y, 2);
  }
  const snapshot = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(
    snapshot.document.slides.find((s: any) => s.id === slideId).transforms[id].height,
  ).toBeNull();
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  expect((await textBoxState(page)).style).toBe(before.style);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  expect((await textBoxState(page)).h).toBeCloseTo(saved.h, 2);
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存');
  await showSlide(page, slideId);
  expect((await textBoxState(page)).rich).toBe(before.rich);
  expect((await textBoxState(page)).w).toBeCloseTo(saved.w, 2);
  await page.evaluate((id) => (window as any).NotaleWorkbench.selectMany([id]), id);
  await startHandle(page, 'w', -dx / 2, -dy / 2);
  const west = await textBoxState(page);
  expect(west.corners[1].x).toBeCloseTo(saved.corners[1].x, 1);
  expect(west.corners[1].y).toBeCloseTo(saved.corners[1].y, 1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await textBoxState(page)).style).toBe(saved.style);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  expect((await textBoxState(page)).h).toBeCloseTo(saved.h, 2);
  const moved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(moved.document.slides.find((s: any) => s.id === slideId).transforms[id].height).toBeNull();
  const nudged = await textBoxState(page);
  const center = (b: typeof nudged) => ({
    x: (b.corners[0].x + b.corners[2].x) / 2,
    y: (b.corners[0].y + b.corners[2].y) / 2,
  });
  await page.keyboard.down('Alt');
  await startHandle(page, 'e', dx / 5, dy / 5);
  const centered = await textBoxState(page);
  expect(center(centered).x).toBeCloseTo(center(nudged).x, 1);
  expect(center(centered).y).toBeCloseTo(center(nudged).y, 1);
  expect(centered.font).toBe(before.font);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  expect((await textBoxState(page)).h).toBeCloseTo(centered.h, 2);
  const sx = ((centered.corners[2].x - centered.corners[1].x) / centered.h) * 70;
  const sy = ((centered.corners[2].y - centered.corners[1].y) / centered.h) * 70;
  await startHandle(page, 's', sx, sy);
  const fixed = await textBoxState(page);
  expect(fixed.h).toBeCloseTo(centered.h + 70, 0);
  expect(fixed.w).toBeCloseTo(centered.w, 2);
  expect(fixed.corners[0].x).toBeCloseTo(centered.corners[0].x, 1);
  expect(fixed.corners[0].y).toBeCloseTo(centered.corners[0].y, 1);
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  expect((await textBoxState(page)).h).toBeCloseTo(fixed.h, 2);
  // A subsequent size edit must override the original logical CSS dimensions.
  await page.evaluate(
    async ({ id, slideId }) => {
      const wb = (window as any).NotaleWorkbench;
      const previous = wb.getSnapshot().document.slides.find((s: any) => s.id === slideId)
        .transforms[id];
      await wb.commands([
        {
          type: 'element.transform',
          slideId,
          target: id,
          transform: { ...previous, width: 350, height: null },
        },
      ]);
    },
    { id, slideId },
  );
  expect((await textBoxState(page)).w).toBeCloseTo(350, 2);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#text-reflow').uncheck();
  await expect(frameOf(page).locator('[data-text-box]')).toHaveCount(0);
  await startHandle(page, 'e', 40, 0);
  const scaled = await textBoxState(page);
  expect(scaled.w).toBeCloseTo(350, 2);
  expect(scaled.corners[1].x - scaled.corners[0].x).not.toBeCloseTo(
    fixed.corners[1].x - fixed.corners[0].x,
    0,
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await showSlide(page, doc.slides.find((s) => s.sourcePath.endsWith('page-07.html'))!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

const textHandle = (s: Awaited<ReturnType<typeof textBoxState>>, name: 'e' | 'se') =>
  name === 'e'
    ? { x: (s.corners[1].x + s.corners[2].x) / 2, y: (s.corners[1].y + s.corners[2].y) / 2 }
    : s.corners[2];
async function textGuides(
  page: Page,
  slideId: string,
  guides: { id: string; axis: 'x' | 'y'; position: number }[],
) {
  await page.evaluate(
    async ({ slideId, guides }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([{ type: 'slide.update', slideId, patch: { guides } }]);
      await wb.whenReady();
    },
    { slideId, guides },
  );
}

test('rotated text reflow snaps actual handles to guides with fixed anchors and identical save/reopen', async ({
  page,
}) => {
  const { doc, slideId, id } = await textFixture(page);
  const original = await textBoxState(page);
  const dx = ((original.corners[1].x - original.corners[0].x) / original.w) * -110;
  const dy = ((original.corners[1].y - original.corners[0].y) / original.w) * -110;
  await page.keyboard.down('Control');
  await startHandle(page, 'e', dx, dy);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const before = await textBoxState(page);
  await page.keyboard.down('Control');
  await startHandle(page, 'e', dx / 3, dy / 3);
  const raw = await textBoxState(page),
    handle = textHandle(raw, 'e');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  const position = (handle.x + 3 - raw.stage.x) / raw.stage.scale;
  await textGuides(page, slideId, [{ id: 'text-edge', axis: 'x', position }]);
  await startHandle(page, 'e', dx / 3, dy / 3);
  const snapped = await textBoxState(page),
    point = textHandle(snapped, 'e');
  expect(point.x).toBeCloseTo(handle.x + 3, 1);
  expect(Math.hypot(point.x - handle.x, point.y - handle.y)).toBeLessThanOrEqual(6.04);
  expect(snapped.corners[0].x).toBeCloseTo(before.corners[0].x, 1);
  expect(snapped.corners[0].y).toBeCloseTo(before.corners[0].y, 1);
  expect(snapped.font).toBe(before.font);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(1);
  await page.screenshot({ path: '.local/text-snapping.png' });
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  expect((await textBoxState(page)).w).toBeCloseTo(snapped.w, 2);
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存');
  await showSlide(page, slideId);
  const reopened = await textBoxState(page);
  expect(textHandle(reopened, 'e').x).toBeCloseTo(point.x, 1);
  expect(reopened.rich).toBe(original.rich);
  await page.evaluate((id) => (window as any).NotaleWorkbench.selectMany([id]), id);
  // Bypass restores the calibrated unsnapped width, then cancellation is exact.
  await page.keyboard.down('Control');
  await startHandle(page, 'e', 3, 1);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect((await textBoxState(page)).style).toBe(reopened.style);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
});

test('centered proportional text resizing snaps without changing box ratio or center', async ({
  page,
}) => {
  const { slideId } = await textFixture(page);
  const before = await textBoxState(page);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Control');
  await startHandle(page, 'se', 36, 20);
  const raw = await textBoxState(page),
    corner = textHandle(raw, 'se');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await textGuides(page, slideId, [
    { id: 'center-edge', axis: 'x', position: (corner.x + 2 - raw.stage.x) / raw.stage.scale },
  ]);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await startHandle(page, 'se', 36, 20);
  const snapped = await textBoxState(page);
  expect(textHandle(snapped, 'se').x).toBeCloseTo(corner.x + 2, 1);
  expect(snapped.w / snapped.h).toBeCloseTo(before.w / before.h, 3);
  for (const axis of ['x', 'y'] as const)
    expect((snapped.corners[0][axis] + snapped.corners[2][axis]) / 2).toBeCloseTo(
      (before.corners[0][axis] + before.corners[2][axis]) / 2,
      1,
    );
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(1);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  expect((await textBoxState(page)).w).toBeCloseTo(snapped.w, 2);
  expect((await textBoxState(page)).h).toBeCloseTo(snapped.h, 2);
  await page.keyboard.down('Control');
  await startHandle(page, 'se', 25, 15);
  const rawCorner = await textBoxState(page);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  const targetX = rawCorner.corners[2].x + 2,
    targetY = rawCorner.corners[2].y + 2;
  await textGuides(page, slideId, [
    { id: 'corner-x', axis: 'x', position: (targetX - rawCorner.stage.x) / rawCorner.stage.scale },
    { id: 'corner-y', axis: 'y', position: (targetY - rawCorner.stage.y) / rawCorner.stage.scale },
  ]);
  await startHandle(page, 'se', 25, 15);
  const cornerPreview = await textBoxState(page);
  expect(cornerPreview.corners[2].x).toBeCloseTo(targetX, 1);
  expect(cornerPreview.corners[2].y).toBeCloseTo(targetY, 1);
  expect(cornerPreview.corners[0].x).toBeCloseTo(snapped.corners[0].x, 1);
  expect(cornerPreview.corners[0].y).toBeCloseTo(snapped.corners[0].y, 1);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(2);
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  expect((await textBoxState(page)).w).toBeCloseTo(cornerPreview.w, 2);
});

test('text snapping rejects a line-break jump and keeps the unsnapped source geometry', async ({
  page,
}) => {
  const { slideId, id, doc } = await textFixture(page);
  await page.evaluate(
    async ({ slideId, id }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([
        {
          type: 'element.patch',
          slideId,
          target: id,
          patch: {
            text: 'W'.repeat(100),
            style: {
              width: '400px',
              height: 'auto',
              'inline-size': 'unset',
              'block-size': 'unset',
              'box-sizing': 'border-box',
              padding: '0',
              border: '0',
              'font-family': 'monospace',
              'line-height': '30px',
              'overflow-wrap': 'anywhere',
            },
          },
        },
      ]);
      await wb.whenReady();
    },
    { slideId, id },
  );
  const before = await textBoxState(page);
  const boundary = await frameOf(page)
    .locator('#reflow-text')
    .evaluate((node) => {
      const el = node as HTMLElement,
        style = el.getAttribute('style')!;
      let previous = 0;
      try {
        for (let width = 400; width >= 240; width -= 0.5) {
          el.style.width = `${width}px`;
          const height = parseFloat(getComputedStyle(el).height);
          if (previous && height > previous + 15) return { wide: width + 0.5, narrow: width };
          previous = height;
        }
        throw new Error('No measured line-wrap boundary');
      } finally {
        el.setAttribute('style', style);
      }
    });
  const vx = (before.corners[1].x - before.corners[0].x) / before.w;
  const vy = (before.corners[1].y - before.corners[0].y) / before.w;
  const dx = vx * (boundary.wide - before.w),
    dy = vy * (boundary.wide - before.w);
  await page.keyboard.down('Control');
  await startHandle(page, 'e', dx, dy);
  const raw = await textBoxState(page),
    p = textHandle(raw, 'e');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  await page.keyboard.down('Control');
  await startHandle(
    page,
    'e',
    vx * (boundary.narrow - before.w),
    vy * (boundary.narrow - before.w),
  );
  const jumped = await textBoxState(page),
    jumpPoint = textHandle(jumped, 'e');
  expect(jumped.h).toBeGreaterThan(raw.h + 15);
  expect(Math.hypot(jumpPoint.x - p.x, jumpPoint.y - p.y)).toBeGreaterThan(6);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  await textGuides(page, slideId, [
    {
      id: 'wrap-boundary',
      axis: 'x',
      position: (p.x + vx * (boundary.narrow - boundary.wide) - raw.stage.x) / raw.stage.scale,
    },
  ]);
  await startHandle(page, 'e', dx, dy);
  const preview = await textBoxState(page);
  expect(preview.w).toBeCloseTo(raw.w, 2);
  expect(preview.h).toBeCloseTo(raw.h, 2);
  await expect(frameOf(page).locator('[data-notale-guides] line[stroke="#d83183"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  expect((await textBoxState(page)).w).toBeCloseTo(raw.w, 2);
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(5);
});

for (const flow of ['paragraphs', 'columns', 'grid', 'flex'] as const) {
  test(`structured text ${flow} reflows with paragraph/list styles and source identities intact`, async ({
    page,
  }) => {
    const { doc, slideId, id: oldId } = await textFixture(page);
    const id = await page.evaluate(
      async ({ slideId, oldId, flow }) => {
        const wb = (window as any).NotaleWorkbench;
        const parent = wb.getObjects().find((o: any) => o.id === oldId).parent;
        const layout =
          flow === 'columns'
            ? 'column-count:2;column-gap:24px;'
            : flow === 'grid'
              ? 'display:grid;grid-template-columns:1fr 1.2fr;gap:18px;'
              : flow === 'flex'
                ? 'display:flex;flex-direction:column;gap:13px;'
                : '';
        const html = `<section id="reflow-text" style="position:${flow === 'grid' ? 'relative' : 'absolute'};left:40px;top:40px;bottom:80px;width:560px;height:170px;box-sizing:border-box;padding:12px;border:2px solid #466ddb;transform:rotate(-8deg);transform-origin:30% 60%;font:20px/1.35 sans-serif;${layout}">
      <h3 style="font-size:25px;line-height:1.2;margin:0 0 13px">Editable structured text</h3>
      <p style="font-size:21px;margin:7px 0 19px">The first paragraph keeps <strong>bold emphasis</strong> and a separate line-height while the containing text box becomes narrower.</p>
      <ol start="3" style="padding-left:28px;margin:8px 0;list-style-type:upper-roman"><li>Preserve list numbering and source identity.</li><li>Retain nested content.<ul style="list-style-type:square;padding-left:22px"><li>Nested detail with <em>independent emphasis</em>.</li></ul></li></ol>
      <blockquote style="font-size:18px;border-left:3px solid #28a69b;padding-left:12px;margin:14px 0">The browser lays out the original paragraphs and lists; saving must retain their structure.</blockquote>
      </section>`;
        await wb.commands([
          ...(flow === 'grid'
            ? [
                {
                  type: 'element.patch',
                  slideId,
                  target: parent,
                  patch: {
                    style: {
                      display: 'grid',
                      'grid-template-rows': '700px',
                      'align-items': 'stretch',
                    },
                  },
                },
              ]
            : []),
          { type: 'element.delete', slideId, target: oldId },
          { type: 'element.insert', slideId, parent, html },
        ]);
        await wb.whenReady();
        const id = wb.getObjects().find((o: any) => o.attributes.id === 'reflow-text').id;
        wb.selectMany([id]);
        return id;
      },
      { slideId, oldId, flow },
    );
    await expect(frameOf(page).locator('[data-text-box]')).toBeVisible();
    const styles = () =>
      frameOf(page)
        .locator(
          '#reflow-text h3, #reflow-text p, #reflow-text ol, #reflow-text ul, #reflow-text li, #reflow-text blockquote',
        )
        .evaluateAll((els) =>
          els.map((el) => {
            const c = getComputedStyle(el);
            return {
              id: el.getAttribute('data-notale-id'),
              tag: el.tagName,
              font: c.fontSize,
              line: c.lineHeight,
              margin: c.margin,
              padding: c.padding,
              list: c.listStyleType,
            };
          }),
        );
    const before = await textBoxState(page),
      originalStyles = await styles();
    const dx = ((before.corners[1].x - before.corners[0].x) / before.w) * -180;
    const dy = ((before.corners[1].y - before.corners[0].y) / before.w) * -180;
    await page.keyboard.down('Control');
    await startHandle(page, 'e', dx, dy);
    const preview = await textBoxState(page);
    expect(preview.w).toBeCloseTo(380, 1);
    expect(preview.h).toBeGreaterThan(before.h);
    expect(preview.rich).toBe(before.rich);
    expect(await styles()).toEqual(originalStyles);
    expect(preview.corners[0].x).toBeCloseTo(before.corners[0].x, 1);
    expect(preview.corners[0].y).toBeCloseTo(before.corners[0].y, 1);
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('#save-status')).toContainText('已保存 · v4');
    const saved = await textBoxState(page);
    expect(saved.w).toBeCloseTo(preview.w, 2);
    expect(saved.h).toBeCloseTo(preview.h, 2);
    if (flow === 'grid') expect(saved.h).toBeLessThan(700);
    if (flow === 'columns') await page.screenshot({ path: '.local/structured-text-columns.png' });
    expect(await styles()).toEqual(originalStyles);
    const snapshot = await (await page.request.get(`/api/documents/${doc.id}`)).json();
    expect(
      snapshot.document.slides.find((s: any) => s.id === slideId).transforms[id].height,
    ).toBeNull();
    await page.locator('#undo').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v5');
    expect((await textBoxState(page)).style).toBe(before.style);
    await page.locator('#redo').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v6');
    await page.reload();
    await expect(page.locator('#save-status')).toContainText('已保存');
    await showSlide(page, slideId);
    const reopened = await textBoxState(page);
    expect(reopened.rich).toBe(before.rich);
    expect(reopened.h).toBeCloseTo(saved.h, 2);
    expect(await styles()).toEqual(originalStyles);
    await expect(frameOf(page).locator('#reflow-text ol')).toHaveAttribute('start', '3');
    if (flow === 'columns')
      await expect(frameOf(page).locator('#reflow-text')).toHaveCSS('column-count', '2');
    if (flow === 'grid' || flow === 'flex')
      await expect(frameOf(page).locator('#reflow-text')).toHaveCSS('display', flow);
    // A member remains independently editable after container-level reflow.
    const paragraph = await frameOf(page).locator('#reflow-text p').getAttribute('data-notale-id');
    await page.evaluate(
      async ({ slideId, paragraph }) => {
        const wb = (window as any).NotaleWorkbench;
        await wb.commands([
          {
            type: 'element.patch',
            slideId,
            target: paragraph,
            patch: { richText: 'Edited paragraph with <strong>preserved emphasis</strong>.' },
          },
        ]);
        await wb.whenReady();
      },
      { slideId, paragraph },
    );
    await expect(frameOf(page).locator('#reflow-text p strong')).toHaveText('preserved emphasis');
    await expect(frameOf(page).locator('#reflow-text ol')).toHaveAttribute('start', '3');
  });
}

test('locked text descendants reject direct ancestor HTTP edits without creating a revision', async ({
  page,
}) => {
  const { doc, slideId, id } = await textFixture(page);
  const child = await frameOf(page).locator('#reflow-text strong').getAttribute('data-notale-id');
  await page.evaluate(
    async ({ slideId, child }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([{ type: 'element.lock', slideId, target: child, locked: true }]);
      await wb.whenReady();
    },
    { slideId, child },
  );
  await expect(frameOf(page).locator('[data-handle="e"]')).toBeHidden();
  const before = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  for (const command of [
    { type: 'element.transform', slideId, target: id, transform: { width: 350, height: null } },
    { type: 'element.patch', slideId, target: id, patch: { style: { 'font-size': '48px' } } },
    { type: 'element.patch', slideId, target: id, patch: { attributes: { class: 'new-layout' } } },
  ]) {
    const response = await page.request.post(`/api/documents/${doc.id}/commits`, {
      data: { baseVersion: before.version, mutationId: randomUUID(), commands: [command] },
    });
    expect(response.ok()).toBe(false);
    expect((await response.json()).error).toBe('LOCKED');
  }
  const after = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(after.version).toBe(before.version);
  expect(after.document).toEqual(before.document);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(
    before.version,
  );
  await page.evaluate(
    async ({ slideId, child, id }) => {
      const wb = (window as any).NotaleWorkbench;
      await wb.commands([
        { type: 'element.lock', slideId, target: child, locked: false },
        { type: 'element.transform', slideId, target: id, transform: { width: 350, height: null } },
      ]);
      await wb.whenReady();
    },
    { slideId, child, id },
  );
  await expect(frameOf(page).locator('[data-handle="e"]')).toBeVisible();
  await expect(frameOf(page).locator('#reflow-text')).toHaveCSS('width', '350px');
  expect((await textBoxState(page)).w).toBeCloseTo(394, 2); // Content width plus author padding/border.
});

test('rulers create, move, nudge and delete durable guides without changing native HTML', async ({
  page,
}) => {
  const { doc, slideId } = await resizeFixture(page);
  const snapshot = () =>
    page.evaluate(
      ({ slideId }) => {
        const wb = (window as any).NotaleWorkbench;
        return wb.getSnapshot().document.slides.find((s: any) => s.id === slideId);
      },
      { slideId },
    );
  const original = await snapshot();
  await page.locator('[data-tab="document"]').click();
  await page.locator('#guide-settings summary').click();
  await page.locator('#rulers-visible').check();
  await expect(frameOf(page).locator('[data-ruler="vertical"]')).toBeVisible();
  const bounds = (await frameOf(page).locator('#stage').boundingBox())!,
    scale = bounds.width / 1600;
  async function fromRuler(name: string, x: number, y: number) {
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    const box = (await frameOf(page).locator(`[data-ruler="${name}"]`).boundingBox())!;
    const sx = name === 'vertical' ? box.x + 10 : box.x + 100;
    const sy = name === 'vertical' ? box.y + 100 : box.y + 10;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x * scale, bounds.y + y * scale, { steps: 5 });
    await page.mouse.up();
    await page.evaluate(async () => {
      await (window as any).NotaleWorkbench.whenReady();
    });
  }
  let releaseCreation!: () => void,
    creating = false;
  const creationGate = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!creating) {
      creating = true;
      const response = await route.fetch();
      await creationGate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await frameOf(page)
    .locator('html')
    .evaluate(() => {
      (window as any).__guideContinuity = 'preserved';
    });
  await fromRuler('vertical', 400, 200);
  await expect.poll(() => creating).toBe(true);
  await page.keyboard.press('ArrowRight');
  releaseCreation();
  await expect.poll(async () => (await snapshot()).guides[0]?.position).toBeCloseTo(401, 0);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot()).guides[0]?.position).toBeCloseTo(400, 0);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await expect.poll(async () => (await snapshot()).guides.length).toBe(1);
  const xId = (await snapshot()).guides[0].id;
  expect((await snapshot()).guides[0].position).toBeCloseTo(400, 0);
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await snapshot()).guides[0].position).toBeCloseTo(401, 0);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeFocused();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await snapshot()).guides[0].position).toBeCloseTo(411, 0);
  expect(
    await frameOf(page)
      .locator('html')
      .evaluate(() => (window as any).__guideContinuity),
  ).toBe('preserved');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeFocused();
  let release!: () => void,
    held = false,
    persisted = false;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!held) {
      held = true;
      const response = await route.fetch();
      persisted = response.ok();
      await responseGate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => persisted).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  release();
  await expect.poll(async () => (await snapshot()).guides[0].position).toBeCloseTo(414, 0);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await fromRuler('horizontal', 500, 330);
  await expect.poll(async () => (await snapshot()).guides.length).toBe(2);
  const yId = (await snapshot()).guides.find((g: any) => g.axis === 'y').id;
  async function move(id: string, x: number, y: number, escape = false) {
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    const marker = frameOf(page).locator(`path[data-guide-handle="${id}"]`);
    const box = (await marker.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x * scale, bounds.y + y * scale, { steps: 5 });
    if (escape) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await move(xId, 620, 200);
  await expect
    .poll(async () => (await snapshot()).guides.find((g: any) => g.id === xId).position)
    .toBeCloseTo(620, 0);
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeFocused();
  const beforeCancel = structuredClone((await snapshot()).guides);
  await move(xId, 750, 250, true);
  expect((await snapshot()).guides).toEqual(beforeCancel);
  await move(yId, 500, 5);
  await expect.poll(async () => (await snapshot()).guides.length).toBe(1);
  await expect(frameOf(page).locator(`path[data-guide-handle="${yId}"]`)).toHaveCount(0);
  await page.locator('#undo').click();
  await expect.poll(async () => (await snapshot()).guides.length).toBe(2);
  await page.locator('#redo').click();
  await expect.poll(async () => (await snapshot()).guides.length).toBe(1);
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('已保存');
  await showSlide(page, slideId);
  await expect(frameOf(page).locator('[data-ruler="horizontal"]')).toBeVisible();
  expect((await snapshot()).guides[0].position).toBeCloseTo(620, 0);
  expect((await snapshot()).html).toBe(original.html);
  await page.screenshot({ path: '.local/ruler-guides.png' });
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await expect(frameOf(page).locator('[data-notale-rulers]')).toBeHidden();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('ruler cancellation leaves no revision and lost guide saves replay once after reopening', async ({
  page,
}) => {
  const { doc, slideId } = await resizeFixture(page);
  await page.locator('[data-tab="document"]').click();
  await page.locator('#guide-settings summary').click();
  await page.locator('#rulers-visible').check();
  const stage = (await frameOf(page).locator('#stage').boundingBox())!,
    scale = stage.width / 1600;
  async function begin(x: number) {
    const r = (await frameOf(page).locator('[data-ruler="vertical"]').boundingBox())!;
    await page.mouse.move(r.x + 10, r.y + 100);
    await page.mouse.down();
    await page.mouse.move(stage.x + x * scale, stage.y + 200 * scale, { steps: 4 });
  }
  await begin(300);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(3);
  await begin(330);
  await frameOf(page)
    .locator('[data-notale-rulers]')
    .dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(3);
  let dropped = false,
    persisted = 0;
  const requests: unknown[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests.push(route.request().postDataJSON());
    if (!dropped) {
      dropped = true;
      const response = await route.fetch();
      persisted = response.status();
      await route.abort('failed');
    } else await route.continue();
  });
  await begin(450);
  await page.mouse.up();
  await expect(page.locator('#retry-save')).toBeVisible();
  await expect.poll(() => persisted).toBe(200);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await showSlide(page, slideId);
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  const guides = saved.document.slides.find((s: any) => s.id === slideId).guides;
  expect(guides).toHaveLength(1);
  expect(guides[0].position).toBeCloseTo(450, 0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(await (await page.request.get(`/api/documents/${doc.id}/history`)).json()).toHaveLength(4);
  await expect(frameOf(page).locator(`path[data-guide-handle="${guides[0].id}"]`)).toBeVisible();
});

test('show controllers hand off exclusively without resetting the audience or overwriting recovery', async ({
  page,
  context,
}) => {
  const doc = await clone(page);
  const slideId = doc.slides.find((s) => s.sourcePath === 'page-20.html')!.id;
  const controlState = (window: Page) =>
    window.evaluate(() => (globalThis as any).NotaleShow?.state());
  await page.goto(`/show.html?document=${doc.id}&slide=${slideId}&speaker=1`);
  await expect.poll(async () => (await controlState(page))?.control).toBe('controlling');
  await expect.poll(async () => (await controlState(page))?.max).toBe(2);
  await page.locator('#next').click();
  await page.locator('#blank').click();
  await page.locator('#overview').click();
  const initial = await controlState(page);
  const url = page.url();
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#audience').click(),
  ]);
  await expect(audience.locator('#counter')).toContainText('step 1 / 2');
  const follower = await context.newPage();
  await follower.goto(url);
  await expect.poll(async () => (await controlState(follower))?.control).toBe('following');
  await expect(follower.locator('#counter')).toContainText('step 1 / 2');
  await expect(follower.locator('#next')).toBeDisabled();
  await expect(follower.locator('.reveal')).toHaveJSProperty('inert', true);
  await follower.evaluate(() => {
    (window as any).NotaleShow.next();
    (window as any).NotaleShow.seek(0);
  });
  await follower.keyboard.press('ArrowRight');
  expect((await controlState(follower)).step).toBe(1);
  await follower.locator('#take-control').click();
  await expect.poll(async () => (await controlState(follower)).control).toBe('controlling');
  await expect.poll(async () => (await controlState(page)).control).toBe('following');
  expect((await controlState(follower)).started).toBe(initial.started);
  expect((await controlState(follower)).version).toBe(1);
  await expect(follower.locator('body')).toHaveClass(/blank/);
  expect(await follower.evaluate(() => (window as any).NotaleShow.reveal.isOverview())).toBe(true);
  await follower.locator('#overview').click();
  await follower.locator('#blank').click();
  await follower.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('step 2 / 2');
  await expect(page.locator('#counter')).toContainText('step 2 / 2');
  await expect(audience.locator('body')).not.toHaveClass(/blank/);
  await expectNativeStep(audience, 2);
  // Closing the displaced controller cannot overwrite the current checkpoint.
  await page.close();
  await audience.reload();
  await expect(audience.locator('#counter')).toContainText('step 2 / 2');
  await expect(audience.locator('#next')).toBeDisabled();
  await follower.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect.poll(async () => (await controlState(reopened))?.control).toBe('controlling');
  await expect(reopened.locator('#counter')).toContainText('step 2 / 2');
  expect((await controlState(reopened)).started).toBe(initial.started);
  // Two explicit, concurrent takeover requests must drain to one controller.
  const contenders = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(contenders.map((window) => window.goto(url)));
  for (const window of contenders)
    await expect.poll(async () => (await controlState(window))?.control).toBe('following');
  await Promise.all(contenders.map((window) => window.locator('#take-control').click()));
  const windows = [reopened, ...contenders];
  await expect
    .poll(async () => (await Promise.all(windows.map(controlState))).map((s) => s.control).sort())
    .toEqual(['controlling', 'following', 'following']);
  const states = await Promise.all(windows.map(controlState));
  const owner = windows[states.findIndex((s) => s.control === 'controlling')];
  const locks = await owner.evaluate(() => navigator.locks.query());
  expect(
    locks.held?.filter((lock) => lock.name?.startsWith('notale-show-controller:')),
  ).toHaveLength(1);
  expect(locks.pending).toHaveLength(0);
  await owner.locator('#prev').click();
  await expect(audience.locator('#counter')).toContainText('step 1 / 2');
  for (const window of windows)
    await expect(window.locator('#counter')).toContainText('step 1 / 2');
  const following = windows.find((window) => window !== owner)!;
  await following.screenshot({ path: '.local/show-controller-following.png', fullPage: true });
  // A claimant that closes while its handoff request is delayed must not
  // leave behind a claim that displaces the live controller.
  await owner.evaluate(() => {
    const query = navigator.locks.query.bind(navigator.locks);
    const callbacks: Array<() => void> = [];
    (window as any).__pendingLockQueries = callbacks;
    navigator.locks.query = () =>
      new Promise((resolve) =>
        callbacks.push(() => {
          void query().then(resolve);
        }),
      );
    (window as any).__resumeLockQueries = () => {
      navigator.locks.query = query;
      for (const callback of callbacks) callback();
    };
  });
  await following.locator('#take-control').click();
  await expect(following.locator('#control-status')).toHaveText('等待交接…');
  await expect
    .poll(() => owner.evaluate(() => (window as any).__pendingLockQueries.length))
    .toBeGreaterThan(0);
  await following.close();
  await owner.evaluate(() => (window as any).__resumeLockQueries());
  await expect
    .poll(async () => (await owner.evaluate(() => navigator.locks.query())).pending?.length)
    .toBe(0);
  expect((await controlState(owner)).control).toBe('controlling');
  await owner.locator('#next').click();
  await expect(audience.locator('#counter')).toContainText('step 2 / 2');
  for (const window of [...windows, audience]) if (!window.isClosed()) await window.close();
});

for (const surface of ['show', 'workbench'] as const) {
  test(`${surface} renews expired resource URLs after network failure without resetting native state`, async ({
    page,
  }) => {
    const doc = await clone(page),
      slideId = doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id;
    let grant: {
      channel: string;
      version: number;
      expiresAt: number;
      slides: Array<{ id: string; url: string }>;
    };
    await page.route(`**/api/documents/${doc.id}/preview?*`, async (route) => {
      const response = await route.fetch();
      grant = await response.json();
      await route.fulfill({ response, json: { ...grant, renewAfterMs: 1000 } });
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let renewalStarted = false,
      calls = 0;
    await page.route(`**/api/documents/${doc.id}/preview/renew`, async (route) => {
      calls++;
      if (calls === 1) {
        renewalStarted = true;
        await held;
        await route.abort();
      } else await route.continue();
    });
    if (surface === 'show') await page.goto(`/show.html?document=${doc.id}&slide=${slideId}`);
    else await showSlide(page, slideId);
    const frame =
      surface === 'show' ? page.frameLocator('.slides section.present iframe') : frameOf(page);
    if (surface === 'workbench') await page.locator('#interact').click();
    const slider = frame.locator('#m-slider');
    await slider.evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(frame.locator('#m-val')).toHaveText('31');
    const runtime = await frame.locator('body').evaluate(() => (window as any).__NOTALE__);
    const url = await frame.locator('html').evaluate(() => location.href);
    const runtimeId = await frame.locator('body').evaluate(() => {
      (window as any).__leaseProbe = crypto.randomUUID();
      return (window as any).__leaseProbe;
    });
    await expect.poll(() => renewalStarted).toBe(true);
    const pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor',
    });
    try {
      await pool.query(
        "UPDATE editor_preview_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",
        [grant!.channel],
      );
      const asset = Object.keys(doc.assets)[0];
      const prefix =
        grant!.slides.find((s) => s.id === slideId)!.url.split(`/${doc.id}/1/`)[0] +
        `/${doc.id}/1/`;
      const resource = prefix + asset.split('/').map(encodeURIComponent).join('/');
      expect((await page.request.get(resource)).status()).toBe(403);
      const edit = await page.request.post(`/api/documents/${doc.id}/commits`, {
        data: {
          baseVersion: 1,
          mutationId: randomUUID(),
          commands: [{ type: 'deck.update', title: 'Changed during presentation' }],
        },
      });
      expect(edit.ok()).toBe(true);
      release();
      const banner = page.locator('[data-notale-preview-access]');
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: '重试资源连接' }).click();
      await expect(banner).toHaveCount(0);
      expect((await page.request.get(resource)).status()).toBe(200);
      expect(await frame.locator('html').evaluate(() => location.href)).toBe(url);
      expect(await frame.locator('body').evaluate(() => (window as any).__leaseProbe)).toBe(
        runtimeId,
      );
      await expect(frame.locator('#m-val')).toHaveText('31');
      expect(await slider.inputValue()).toBe('31');
      expect(
        (await frame.locator('body').evaluate(() => (window as any).__NOTALE__)).slide.id,
      ).toBe(runtime.slide.id);
      expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(2);
      expect(grant!.version).toBe(1);
    } finally {
      release();
      await pool.end();
    }
  });
}

for (const kind of ['bar', 'line', 'area'] as const) {
  test(`dense ${kind} chart styles keep labels bounded and survive history and reopening`, async ({
    page,
  }) => {
    const doc = await clone(page),
      s = doc.slides[0];
    await page.evaluate(
      async ({ slideId, html }) =>
        (window as any).NotaleWorkbench.commands([{ type: 'element.insert', slideId, html }]),
      { slideId: s.id, html: template('chart') },
    );
    const objects = await (
      await page.request.get(`/api/documents/${doc.id}/slides/${s.id}/objects`)
    ).json();
    const target = objects.find((o: any) => o.attributes['data-notale-chart']).id;
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
    await page.locator('[data-tab="format"]').click();
    await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
    const positioned = frameOf(page).locator(`[data-notale-id="${target}"]`);
    const layerGeometry = () =>
      page.evaluate(
        async (id) =>
          (await (window as any).NotaleWorkbench.captureSelection([id])).rectangles.find(
            (r: any) => r.id === id,
          ),
        target,
      );
    const beforeLayer = await layerGeometry();
    await page.locator('#front').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v3');
    const afterLayer = await layerGeometry();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(afterLayer![key]).toBeCloseTo(beforeLayer![key], 2);
    await expect(positioned).toHaveCSS('position', 'absolute');
    await expect(positioned).toHaveCSS('z-index', '100');
    const labels = Array.from({ length: 32 }, (_, i) => `训练阶段 ${i + 1} — 完整的长分类名称`);
    const series = Array.from({ length: 8 }, (_, j) => ({
      name: `比较系列 ${j + 1} 的完整长名称`,
      values: labels.map((_, i) => ((i % 9) - 4) * 11 + j * 0.1),
    }));
    await page.locator('#chart-kind').selectOption(kind);
    await page.locator('#chart-data').fill(JSON.stringify({ labels, series }));
    await page.locator('#chart-title').fill('完整图表标题：多个训练阶段与多组比较系列');
    await page.locator('#chart-fontSize').fill('24');
    await page.locator('#chart-labelAngle').selectOption('-45');
    await page.locator('#chart-valueDecimals').fill('2');
    await page.locator('#chart-lineWidth').fill('7');
    await page.locator('#chart-pointRadius').fill('3');
    await page.locator('#chart-colors').fill('#315aa7, #008477, #9d5612, #8b487d');
    await page.locator('#chart-background').fill('#fff7e8');
    await page.locator('#chart-textColor').fill('#352f26');
    await page.locator('#apply-chart-style').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v4');
    const chart = () => frameOf(page).locator(`[data-notale-id="${target}"]`);
    const measure = async () =>
      chart().evaluate((el) => {
        const svg = el as SVGSVGElement,
          box = svg.getBoundingClientRect();
        const collect = (selector: string) =>
          Array.from(svg.querySelectorAll<SVGGraphicsElement>(selector)).map((node) => {
            const b = node.getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          });
        return {
          box: { x: box.x, y: box.y, w: box.width, h: box.height },
          categories: collect('[data-chart-category]'),
          values: collect('[data-chart-value]'),
          legends: collect('[data-chart-legend]'),
          texts: collect('text'),
        };
      });
    const assertLayout = async () => {
      const m = await measure();
      for (const b of m.texts) {
        expect(b.x).toBeGreaterThanOrEqual(m.box.x - 0.5);
        expect(b.y).toBeGreaterThanOrEqual(m.box.y - 0.5);
        expect(b.x + b.w).toBeLessThanOrEqual(m.box.x + m.box.w + 0.5);
        expect(b.y + b.h).toBeLessThanOrEqual(m.box.y + m.box.h + 0.5);
      }
      for (const group of [m.categories, m.values, m.legends])
        for (let i = 0; i < group.length; i++)
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i],
              b = group[j];
            const overlap =
              Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
              Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
            expect(overlap, `overlapping chart labels ${JSON.stringify({ a, b })}`).toBe(false);
          }
      expect(m.categories.length).toBeGreaterThan(0);
      expect(m.categories.length).toBeLessThan(32);
      expect(m.legends).toHaveLength(8);
    };
    await expect(chart().locator('[data-chart-point]')).toHaveCount(256);
    await assertLayout();
    await expect(chart().locator('[data-chart-value]')).not.toHaveCount(0);
    await expect(chart().locator('[data-chart-category] text').first()).toHaveCSS(
      'font-size',
      '24px',
    );
    await expect(chart().locator('[data-chart-background]')).toHaveCSS(
      'fill',
      'rgb(255, 247, 232)',
    );
    if (kind === 'line') {
      await expect(chart().locator('polyline').first()).toHaveAttribute('stroke-width', '7');
      await expect(chart().locator('polyline').first()).toHaveCSS('stroke-width', '7px');
      await chart().screenshot({ path: '.local/dense-chart.png' });
    }
    const source = await chart().getAttribute('data-notale-chart');
    expect(JSON.parse(source!).series).toEqual(series);
    await page.reload();
    await expect(chart()).toHaveAttribute('data-notale-chart', source!);
    await assertLayout();
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
    await page.locator('[data-tab="format"]').click();
    await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
    await expect(page.locator('#chart-fontSize')).toHaveValue('24');
    await page.locator('#chart-labelAngle').selectOption('-90');
    await page.locator('#chart-showGrid').uncheck();
    await page.locator('#chart-showValues').uncheck();
    await page.locator('#apply-chart-style').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v5');
    await expect(chart().locator('[data-chart-grid], [data-chart-value]')).toHaveCount(0);
    await assertLayout();
    await page.locator('#undo').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v6');
    await expect(chart()).toHaveAttribute('data-notale-chart', source!);
    await page.locator('#redo').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v7');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    expect(JSON.parse((await chart().getAttribute('data-notale-chart'))!).labelAngle).toBe(-90);
    await assertLayout();
    await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
    await page.locator('#interact').click();
    await frameOf(page)
      .locator('#m-slider')
      .evaluate((el) => {
        (el as HTMLInputElement).value = '31';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await expect(frameOf(page).locator('#m-val')).toHaveText('31');
  });
}

test('SVG child clipboard keeps affine geometry, percent coordinates and transitive paint/use/clip resources across pages', async ({
  page,
}) => {
  const doc = await clone(page),
    from = doc.slides[0].id,
    to = doc.slides[1].id;
  const html = `<section style="position:absolute;left:250px;top:210px;width:500px;height:300px;transform:rotate(8deg) skewX(11deg) scale(1.1,.8);z-index:30">
    <style>#svg-stop{stop-color:rgb(20,180,150)}</style>
    <svg width="420" height="200" viewBox="20 10 300 180" preserveAspectRatio="none"><defs>
      <linearGradient id="svg-base"><stop id="svg-stop" offset="0"/><stop offset="1" stop-color="#253e9d"/></linearGradient>
      <linearGradient id="svg-paint" href="#svg-base"/>
      <rect id="svg-clip-rect" x="0" y="0" width="180" height="150"/>
      <clipPath id="svg-clip"><use href="#svg-clip-rect"/></clipPath>
      <path id="svg-glyph" d="M15 25 C35 0 100 20 120 65 L20 90 Z" fill="url('#svg-paint')"/>
    </defs><g id="svg-piece" transform="rotate(17 90 60)" clip-path="url('#svg-clip')">
      <use href="#svg-glyph" x="10%" y="5%"/>
      <rect x="25%" y="35%" width="20%" height="12%" fill="url('#svg-paint')" stroke="#142b52" stroke-width="2"/>
    </g></svg></section>`;
  await page.evaluate(
    async ({ slideId, html }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.insert', slideId, html }]),
    { slideId: from, html },
  );
  const objects = await page.evaluate(() => (window as any).NotaleWorkbench.getObjects());
  const target = objects.find((o: any) => o.attributes.id === 'svg-piece').id;
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  const original = frameOf(page).locator('#svg-piece');
  const geometry = async (selector: string) =>
    frameOf(page)
      .locator(selector)
      .evaluate((el) => {
        const stage = document.querySelector('#stage')!.getBoundingClientRect(),
          scale = stage.width / (window as any).__NOTALE__.width;
        return Array.from(el.children)
          .filter((node) => node instanceof SVGGraphicsElement)
          .map((node) => {
            const svg = node as SVGGraphicsElement,
              b = svg.getBBox(),
              m = svg.getScreenCTM()!;
            return [
              [b.x, b.y],
              [b.x + b.width, b.y],
              [b.x + b.width, b.y + b.height],
              [b.x, b.y + b.height],
            ].map(([x, y]) => {
              const p = new DOMPoint(x, y).matrixTransform(m);
              return { x: (p.x - stage.x) / scale, y: (p.y - stage.y) / scale };
            });
          });
      });
  // Ensure capture/measurement happens after the actual source runtime is ready.
  await page.evaluate(async (id) => (window as any).NotaleWorkbench.captureSelection([id]), target);
  const before = await geometry('#svg-piece');
  await page.evaluate(() => (window as any).NotaleWorkbench.copySelection('copy'));
  await showSlide(page, to);
  await page.evaluate(() => (window as any).NotaleWorkbench.pasteSelection());
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const copied = '[data-notale-clipboard-svg] > g';
  await expect(frameOf(page).locator(copied)).toHaveCount(1);
  const after = await geometry(copied);
  for (let i = 0; i < before.length; i++)
    for (let j = 0; j < 4; j++) {
      expect(after[i][j].x).toBeCloseTo(before[i][j].x + 20, 1);
      expect(after[i][j].y).toBeCloseTo(before[i][j].y + 20, 1);
    }
  const resourceState = async () => {
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    return frameOf(page)
      .locator('body')
      .evaluate(() => {
        const defs = document.querySelector('[data-notale-clipboard-defs]')!;
        return {
          gradients: defs.querySelectorAll('linearGradient').length,
          clips: defs.querySelectorAll('clipPath').length,
          stopColors: Array.from(defs.querySelectorAll('stop')).map(
            (s) => getComputedStyle(s).stopColor,
          ),
          hrefs: Array.from(
            document.querySelectorAll(
              '[data-notale-clipboard-svg] [href], [data-notale-clipboard-defs] [href]',
            ),
          ).map((node) => ({
            href: node.getAttribute('href'),
            resolved: !!document.getElementById(node.getAttribute('href')!.slice(1)),
          })),
        };
      });
  };
  const resources = await resourceState();
  expect(resources.gradients).toBe(2);
  expect(resources.clips).toBe(1);
  expect(resources.stopColors).toContain('rgb(20, 180, 150)');
  expect(resources.hrefs.every((r) => r.resolved)).toBe(true);
  const selected = await page.evaluate(() => (window as any).NotaleWorkbench.getSelection());
  expect(selected).toHaveLength(1);
  const pastedSnapshot = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(pastedSnapshot.document.slides.find((s: any) => s.id === from).html).toContain(
    'id="svg-piece"',
  );
  await page.locator('[data-tab="format"]').click();
  await page.locator('#front').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await frameOf(page)
    .locator('[data-notale-clipboard-svg]')
    .screenshot({ path: '.local/svg-child-paste.png' });
  await page.reload();
  await showSlide(page, to);
  expect(await resourceState()).toEqual(resources);
  const reopened = await geometry(copied);
  for (let i = 0; i < after.length; i++)
    for (let j = 0; j < 4; j++) {
      expect(reopened[i][j].x).toBeCloseTo(after[i][j].x, 1);
      expect(reopened[i][j].y).toBeCloseTo(after[i][j].y, 1);
    }
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await expect(frameOf(page).locator('[data-notale-clipboard-svg]')).toHaveCount(0);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  expect(await resourceState()).toEqual(resources);
  // A cut whose successful response is lost must move the original only once.
  await showSlide(page, from);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.evaluate(() => (window as any).NotaleWorkbench.copySelection('cut'));
  await showSlide(page, to);
  const requests: string[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    if (requests.length === 1) {
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page.evaluate(async () => {
    try {
      await (window as any).NotaleWorkbench.pasteSelection();
    } catch {}
  });
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  const moved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(moved.version).toBe(8);
  expect(moved.document.slides.find((s: any) => s.id === from).html).not.toContain(
    'id="svg-piece"',
  );
  await showSlide(page, to);
  await expect(frameOf(page).locator('[data-notale-clipboard-svg]')).toHaveCount(2);
  await expect(frameOf(page).locator('[data-notale-clipboard-defs] linearGradient')).toHaveCount(4);
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('SVG layer controls change actual overlap while preserving affine placement, IDs, history and retry', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async ({ slideId, html }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.insert', slideId, html }]),
    {
      slideId,
      html: `<svg id="order-drawing" width="430" height="260" viewBox="0 0 430 260" style="position:absolute;left:270px;top:230px;z-index:40;transform:rotate(7deg) skewX(10deg)">
    <title>SVG layer editing</title><defs><linearGradient id="order-paint"><stop offset="0" stop-color="#25bca0"/><stop offset="1" stop-color="#2575b4"/></linearGradient></defs>
    <g id="order-container" transform="translate(30 20) rotate(-9 100 100)">
      <rect id="order-a" x="0" y="0" width="180" height="170" fill="url(#order-paint)"/>
      <g id="order-b"><rect id="order-b-fill" x="20" y="20" width="180" height="170" fill="#f2b84b"/></g>
      <rect id="order-c" x="40" y="40" width="180" height="170" fill="#e26b82"/>
      <svg id="order-d" x="60" y="60" width="180" height="170" viewBox="0 0 180 170"><rect id="order-d-fill" width="180" height="170" fill="#455cc0"/></svg>
    </g></svg>`,
    },
  );
  const ids: Record<string, string> = await page.evaluate(() =>
    Object.fromEntries(
      (window as any).NotaleWorkbench.getObjects()
        .filter((o: any) => o.attributes.id?.startsWith('order-'))
        .map((o: any) => [o.attributes.id, o.id]),
    ),
  );
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: 'order-cue',
            target,
            step: 1,
            trigger: 'click',
            effect: 'pulse',
            duration: 400,
          },
        },
      ]),
    { slideId, target: ids['order-a'] },
  );
  const geometry = () =>
    frameOf(page)
      .locator('#order-container')
      .evaluate((el) =>
        Array.from(el.querySelectorAll('rect'))
          .map((node) => {
            const rect = node as SVGGraphicsElement,
              bbox = rect.getBBox(),
              matrix = rect.getScreenCTM()!;
            return {
              id: node.id,
              points: [
                [bbox.x, bbox.y],
                [bbox.x + bbox.width, bbox.y + bbox.height],
              ].map(([x, y]) => {
                const p = new DOMPoint(x, y).matrixTransform(matrix);
                return [p.x, p.y];
              }),
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
  const ready = () =>
    page.evaluate((id) => (window as any).NotaleWorkbench.captureSelection([id]), ids['order-a']);
  await ready();
  const initial = await geometry();
  const state = () =>
    frameOf(page)
      .locator('#order-container')
      .evaluate((el) => {
        const m = (el as SVGGraphicsElement).getScreenCTM()!,
          p = new DOMPoint(100, 100).matrixTransform(m);
        const painted = document
          .elementsFromPoint(p.x, p.y)
          .find((node) => ['order-a', 'order-b-fill', 'order-c', 'order-d-fill'].includes(node.id));
        return { order: Array.from(el.children).map((node) => node.id), top: painted?.id };
      });
  expect(await state()).toEqual({
    order: ['order-a', 'order-b', 'order-c', 'order-d'],
    top: 'order-d-fill',
  });
  await page.evaluate(
    (ids) => (window as any).NotaleWorkbench.selectMany(ids),
    [ids['order-c'], ids['order-a']],
  );
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  const action = async (button: string, version: number, order: string[], top: string) => {
    await page.locator('#' + button).click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v' + version);
    await ready();
    await expect
      .poll(state)
      .toEqual({ order: order.map((id) => 'order-' + id), top: 'order-' + top });
    const after = await geometry();
    for (let i = 0; i < initial.length; i++)
      for (let j = 0; j < 2; j++)
        for (let k = 0; k < 2; k++)
          expect(after[i].points[j][k]).toBeCloseTo(initial[i].points[j][k], 2);
  };
  await action('front', 4, ['b', 'd', 'a', 'c'], 'c');
  await action('back', 5, ['a', 'c', 'b', 'd'], 'd-fill');
  await action('layer-forward', 6, ['b', 'a', 'c', 'd'], 'd-fill');
  await action('layer-forward', 7, ['b', 'd', 'a', 'c'], 'c');
  await action('layer-backward', 8, ['b', 'a', 'c', 'd'], 'd-fill');
  await action('undo', 9, ['b', 'd', 'a', 'c'], 'c');
  await action('redo', 10, ['b', 'a', 'c', 'd'], 'd-fill');
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  const savedSlide = saved.document.slides.find((s: any) => s.id === slideId);
  expect(savedSlide.animations.find((a: any) => a.id === 'order-cue').target).toBe(ids['order-a']);
  expect(savedSlide.html).toContain('fill="url(#order-paint)"');
  expect(savedSlide.html).not.toContain('z-index: 100');
  await page.screenshot({ path: '.local/svg-layer-order.png' });
  const requests: string[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    if (requests.length === 1) {
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page.evaluate(
    (ids) => (window as any).NotaleWorkbench.selectMany(ids),
    [ids['order-a'], ids['order-c']],
  );
  await page.locator('#layer-backward').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v11');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, slideId);
  expect(await state()).toEqual({
    order: ['order-a', 'order-c', 'order-b', 'order-d'],
    top: 'order-d-fill',
  });
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(11);
  const reloaded = await geometry();
  for (let i = 0; i < initial.length; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++)
        expect(reloaded[i].points[j][k]).toBeCloseTo(initial[i].points[j][k], 2);
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('connector endpoints drag between objects and free points with cancellation, history, transfer and portable rendering', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id,
    destination = doc.slides[1].id;
  const run = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const version = () => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version);
  const connection = () =>
    page.evaluate(
      () => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].connectors[0],
    );
  const select = async () => {
    await page.evaluate(() => (window as any).NotaleWorkbench.select('drag-edge'));
  };
  const handle = (side: string) => frameOf(page).locator(`[data-connector-handle="${side}"]`);
  const savedAfter = async (before: number) => {
    await expect.poll(version).toBeGreaterThan(before);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await run([
    {
      type: 'element.insert',
      slideId,
      html: '<div id="endpoint-card" data-notale-id="endpoint-card" style="position:absolute;left:350px;top:250px;width:220px;height:160px;z-index:80;background:#bde5fa;transform:rotate(12deg) skewX(8deg)">过程节点</div>',
    },
    {
      type: 'connector.set',
      slideId,
      connector: {
        id: 'drag-edge',
        start: { point: { x: 300, y: 600 } },
        end: { point: { x: 950, y: 650 } },
        kind: 'curve',
      },
    },
  ]);
  await expect
    .poll(() =>
      frameOf(page)
        .locator('[data-connector-line]')
        .evaluate((element) => {
          const path = element as SVGPathElement,
            length = path.getTotalLength();
          const start = path.getPointAtLength(0),
            end = path.getPointAtLength(length),
            sample = path.getPointAtLength(length * 0.25);
          return (
            Math.abs(
              (end.x - start.x) * (sample.y - start.y) - (end.y - start.y) * (sample.x - start.x),
            ) / Math.hypot(end.x - start.x, end.y - start.y)
          );
        }),
    )
    .toBeGreaterThan(1);
  await select();
  await expect(handle('start')).toBeVisible();
  const dragTo = async (side: string, x: number, y: number, alt = false, escape = false) => {
    const box = await handle(side).boundingBox();
    expect(box).toBeTruthy();
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 5 });
    if (escape) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };
  const card = await frameOf(page).locator('#endpoint-card').boundingBox();
  const cardId = (await frameOf(page).locator('#endpoint-card').getAttribute('data-notale-id'))!;
  let before = await version();
  await dragTo('start', card!.x + card!.width / 2, card!.y + card!.height / 2);
  await savedAfter(before);
  expect((await connection()).start.target).toBe(cardId);
  expect((await connection()).end.point).toEqual({ x: 950, y: 650 });
  await select();
  const endpoint = await handle('end').boundingBox();
  before = await version();
  const unchanged = await connection();
  await dragTo('end', endpoint!.x - 70, endpoint!.y - 40, true, true);
  expect(await version()).toBe(before);
  expect(await connection()).toEqual(unchanged);
  await dragTo('end', endpoint!.x - 70, endpoint!.y - 40, true);
  await savedAfter(before);
  expect((await connection()).end.point.x).toBeLessThan(950);
  const modified = await connection();
  before = await version();
  await page.locator('#undo').click();
  await savedAfter(before);
  expect((await connection()).end.point).toEqual(unchanged.end.point);
  before = await version();
  await page.locator('#redo').click();
  await savedAfter(before);
  expect(await connection()).toEqual(modified);
  await run([{ type: 'element.lock', slideId, target: 'drag-edge', locked: true }]);
  await select();
  await expect(handle('start')).toBeHidden();
  await run([{ type: 'element.lock', slideId, target: 'drag-edge', locked: false }]);
  await select();
  const start = await handle('start').boundingBox();
  before = await version();
  await dragTo('start', start!.x - 35, start!.y + 130, true);
  await savedAfter(before);
  expect((await connection()).start.target).toBeUndefined();
  await run([{ type: 'element.delete', slideId, target: cardId }]);
  const final = await connection();
  expect(final.id).toBe('drag-edge');
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await connection()).toEqual(final);
  await select();
  const positions = () =>
    frameOf(page)
      .locator('[data-connector-line]')
      .evaluate((element) => {
        const path = element as SVGPathElement,
          m = path.getScreenCTM()!;
        return [0, path.getTotalLength()].map((length) => {
          const p = path.getPointAtLength(length).matrixTransform(m);
          return { x: p.x, y: p.y };
        });
      });
  const sourcePoints = await positions();
  await page.evaluate(async () => {
    const wb = (window as any).NotaleWorkbench;
    await wb.copySelection('copy');
  });
  await showSlide(page, destination);
  await page.evaluate(async () => {
    const wb = (window as any).NotaleWorkbench;
    await wb.pasteSelection();
    await wb.whenReady();
  });
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveAttribute('d', /^M.+C/);
  const copied = await page.evaluate(
    (id) =>
      (window as any).NotaleWorkbench.getSnapshot().document.slides.find((s: any) => s.id === id)
        .connectors[0],
    destination,
  );
  expect(copied.start.point).toEqual(final.start.point);
  expect(copied.end.point).toEqual(final.end.point);
  const copiedPoints = await positions();
  const deltaA = {
    x: copiedPoints[0].x - sourcePoints[0].x,
    y: copiedPoints[0].y - sourcePoints[0].y,
  };
  const deltaB = {
    x: copiedPoints[1].x - sourcePoints[1].x,
    y: copiedPoints[1].y - sourcePoints[1].y,
  };
  expect(deltaA.x).toBeCloseTo(deltaB.x, 1);
  expect(deltaA.y).toBeCloseTo(deltaB.y, 1);
  await page.locator('#interact').click();
  await expect(handle('start')).toBeHidden();
  const archive = await page.request.get(`/api/documents/${doc.id}/export`);
  expect(archive.status()).toBe(200);
  const files = unzipSync(await archive.body());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const exported = await page.context().newPage();
  try {
    await exported.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${doc.slides[1].sourcePath}`,
    );
    const line = exported.locator('[data-connector-line]');
    await expect(line).toHaveAttribute('d', /^M.+C/);
    const ends = await line.evaluate((element) => {
      const p = element as SVGPathElement;
      return [p.getPointAtLength(0), p.getPointAtLength(p.getTotalLength())].map(({ x, y }) => ({
        x,
        y,
      }));
    });
    expect(ends[0].x).toBeCloseTo(copied.start.point.x, 2);
    expect(ends[0].y).toBeCloseTo(copied.start.point.y, 2);
    expect(ends[1].x).toBeCloseTo(copied.end.point.x, 2);
    expect(ends[1].y).toBeCloseTo(copied.end.point.y, 2);
    await expect(exported.locator('[data-connector-handle="start"]')).toBeHidden();
  } finally {
    await exported.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('bound connectors follow real affine dragging and retain editable ports, history and cut recovery', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id,
    to = doc.slides[1].id;
  await page.evaluate(
    async ({ slideId, html }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.insert', slideId, html }]),
    {
      slideId,
      html: `
    <div id="connect-start" style="position:absolute;left:200px;top:250px;width:180px;height:120px;background:#e9b953;transform:rotate(12deg) skewX(8deg);z-index:40">输入数据<i id="connect-port" style="position:absolute;left:100%;top:50%;width:0;height:0"></i></div>
    <svg width="300" height="220" viewBox="0 0 300 220" style="position:absolute;left:750px;top:300px;transform:rotate(-8deg) scale(1.1,.9);z-index:40"><rect id="connect-end" x="40" y="40" width="200" height="140" rx="18" fill="#4e86c9"/></svg>`,
    },
  );
  const ids: Record<string, string> = await page.evaluate(() =>
    Object.fromEntries(
      (window as any).NotaleWorkbench.getObjects()
        .filter((o: any) => o.attributes.id?.startsWith('connect-'))
        .map((o: any) => [o.attributes.id, o.id]),
    ),
  );
  await page.evaluate(
    (ids) => (window as any).NotaleWorkbench.selectMany(ids),
    [ids['connect-start'], ids['connect-end']],
  );
  await page.locator('#insert-kind').selectOption('connector');
  await page.locator('#insert').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const connector = await page.evaluate(
    () => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].connectors[0],
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSelection()))
    .toEqual([connector.id]);
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  await page.locator('#connector-start-anchor').selectOption('right');
  await page.locator('#connector-end-anchor').selectOption('left');
  await page.locator('#connector-kind').selectOption('curve');
  await page.locator('#connector-width').fill('5');
  await page.locator('#connector-dash').selectOption('dashed');
  await page.locator('#connector-start-arrow').check();
  await page.locator('#save-connector').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  const ready = () =>
    page.evaluate(
      (id) => (window as any).NotaleWorkbench.captureSelection([id]),
      ids['connect-start'],
    );
  await ready();
  const errors = () =>
    frameOf(page)
      .locator('[data-connector-line]')
      .evaluate((line) => {
        const path = line as SVGPathElement,
          m = path.getScreenCTM()!;
        if (!path.getAttribute('d')) return [Infinity, Infinity];
        const a = path.getPointAtLength(0).matrixTransform(m),
          b = path.getPointAtLength(path.getTotalLength()).matrixTransform(m);
        const port = document.querySelector('#connect-port')!.getBoundingClientRect(),
          target = document.querySelector('#connect-end') as SVGGraphicsElement;
        const box = target.getBBox(),
          end = new DOMPoint(box.x, box.y + box.height / 2).matrixTransform(target.getScreenCTM()!);
        return [Math.hypot(a.x - port.x, a.y - port.y), Math.hypot(b.x - end.x, b.y - end.y)];
      });
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveAttribute('d', / C/);
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveAttribute(
    'stroke-dasharray',
    '20 15',
  );
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), ids['connect-start']);
  const start = await frameOf(page).locator('#connect-start').boundingBox();
  expect(start).toBeTruthy();
  await page.keyboard.down('Alt');
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x + start!.width / 2 + 90, start!.y + start!.height / 2 + 50, {
    steps: 8,
  });
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await ready();
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await page.reload();
  await ready();
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await ready();
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await ready();
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), connector.id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#connector-kind').selectOption('elbow');
  await page.locator('#save-connector').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await ready();
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveAttribute(
    'd',
    /L.*L.*L.*L.*L/,
  );
  await expect.poll(async () => Math.max(...(await errors()))).toBeLessThan(0.1);
  const panel = await page.locator('#connector-panel').boundingBox();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(1600);
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveCSS(
    'stroke',
    'rgb(70, 109, 219)',
  );
  await page.screenshot({ path: '.local/bound-connectors.png' });
  // Move a connected graph in one journaled cut; SVG child context travels with its endpoint.
  await page.evaluate(
    (ids) => (window as any).NotaleWorkbench.selectMany(ids),
    [ids['connect-start'], ids['connect-end'], connector.id],
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.copySelection('cut'));
  await showSlide(page, to);
  const requests: string[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    if (requests.length === 1) {
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page.evaluate(async () => {
    try {
      await (window as any).NotaleWorkbench.pasteSelection();
    } catch {}
  });
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v9');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, to);
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.version).toBe(9);
  expect(saved.document.slides.find((s: any) => s.id === slideId).connectors).toEqual([]);
  const moved = saved.document.slides.find((s: any) => s.id === to).connectors[0];
  expect(moved.start.target).not.toBe(ids['connect-start']);
  expect(moved.end.target).not.toBe(ids['connect-end']);
  await expect(frameOf(page).locator('[data-connector-line]')).toHaveAttribute('d', /^M.+L/);
  const movedError = () =>
    frameOf(page)
      .locator('[data-connector-line]')
      .evaluate((node, c) => {
        const line = node as SVGPathElement,
          p = line.getPointAtLength(line.getTotalLength()).matrixTransform(line.getScreenCTM()!);
        const target = document.querySelector(
            `[data-notale-id="${c.end.target}"]`,
          ) as SVGGraphicsElement,
          b = target.getBBox();
        const end = new DOMPoint(b.x, b.y + b.height / 2).matrixTransform(target.getScreenCTM()!);
        return Math.hypot(p.x - end.x, p.y - end.y);
      }, moved);
  await expect.poll(movedError).toBeLessThan(0.1);
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.delete', slideId, target }]),
    { slideId: to, target: moved.start.target },
  );
  await expect(page.locator('#save-status')).toContainText('已保存 · v10');
  await expect(frameOf(page).locator('[data-notale-connector]')).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v11');
  await showSlide(page, to);
  await expect.poll(movedError).toBeLessThan(0.1);
  // The exported native runtime must keep connections during an animated endpoint move.
  await page.evaluate(
    async ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'animation.set',
          slideId,
          animation: {
            id: 'connector-motion',
            target,
            step: 1,
            trigger: 'click',
            effect: 'motion',
            dx: 140,
            dy: 60,
            duration: 1500,
            easing: 'linear',
          },
        },
      ]),
    { slideId: to, target: moved.end.target },
  );
  await expect(page.locator('#save-status')).toContainText('已保存 · v12');
  const archive = await page.request.get(`/api/documents/${doc.id}/export?version=12`);
  expect(archive.status()).toBe(200);
  const files = unzipSync(await archive.body());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const exported = await page.context().newPage();
  try {
    const port = (server.address() as { port: number }).port;
    await exported.goto(`http://127.0.0.1:${port}/${doc.slides[1].sourcePath}`);
    await expect(exported.locator('[data-connector-line]')).toHaveAttribute('d', /^M.+L/);
    const samples = await exported.evaluate(async (c) => {
      const line = document.querySelector('[data-connector-line]') as SVGPathElement;
      const target = document.querySelector(
        `[data-notale-id="${c.end.target}"]`,
      ) as SVGGraphicsElement;
      const sample = () => {
        const b = target.getBBox(),
          end = new DOMPoint(b.x, b.y + b.height / 2).matrixTransform(target.getScreenCTM()!);
        const actual = line
          .getPointAtLength(line.getTotalLength())
          .matrixTransform(line.getScreenCTM()!);
        return { x: end.x, y: end.y, error: Math.hypot(end.x - actual.x, end.y - actual.y) };
      };
      const result = [sample()];
      (window as any).NotaleBridge.seek(1, true);
      for (let i = 0; i < 25; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        result.push(sample());
      }
      return result;
    }, moved);
    expect(Math.max(...samples.map((s) => s.error))).toBeLessThan(0.2);
    expect(
      Math.hypot(samples.at(-1)!.x - samples[0].x, samples.at(-1)!.y - samples[0].y),
    ).toBeGreaterThan(10);
  } finally {
    await exported.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('connector-only edits avoid empty saves and combined endpoint deletion cascades once', async ({
  page,
}) => {
  const doc = await clone(page),
    slideId = doc.slides[0].id;
  await page.evaluate(
    async (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<p id="edge-start" style="position:absolute;left:150px;top:180px">Start</p><p id="edge-end" style="position:absolute;left:700px;top:300px">End</p>',
        },
      ]),
    slideId,
  );
  const ids: string[] = await page.evaluate(() =>
    (window as any).NotaleWorkbench.getObjects()
      .filter((o: any) => ['edge-start', 'edge-end'].includes(o.attributes.id))
      .map((o: any) => o.id),
  );
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), ids);
  await page.locator('#insert-kind').selectOption('connector');
  await page.locator('#insert').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  const edge = await page.evaluate(
    () => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].connectors[0].id,
  );
  await page.evaluate((id) => (window as any).NotaleWorkbench.captureSelection([id]), ids[0]);
  const line = frameOf(page).locator(`[data-notale-id="${edge}"] [data-connector-line]`);
  await expect(line).not.toHaveCSS('filter', 'none');
  await page.locator('#interact').click();
  await expect(line).toHaveCSS('filter', 'none');
  await expect(frameOf(page).locator(`[data-notale-id="${edge}"]`)).toHaveAttribute(
    'data-notale-selected',
    '',
  );
  await page.locator('#interact').click();
  await expect(line).not.toHaveCSS('filter', 'none');
  await frameOf(page).locator('body').press('ArrowRight');
  await expect(page.locator('#toast')).toContainText('请移动或调整端点对象');
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getPending())).toBeFalsy();
  expect((await (await page.request.get(`/api/documents/${doc.id}`)).json()).version).toBe(3);
  await page.locator('#duplicate-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  const connections = await page.evaluate(
    () => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].connectors,
  );
  expect(connections).toHaveLength(2);
  expect(connections[1].id).not.toBe(edge);
  expect(connections[1].start.target).toBe(connections[0].start.target);
  await page.evaluate(
    (ids) => (window as any).NotaleWorkbench.selectMany(ids),
    [ids[0], edge, connections[1].id],
  );
  await page.locator('#delete-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await expect(frameOf(page).locator('[data-notale-connector]')).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await expect(frameOf(page).locator('[data-notale-connector]')).toHaveCount(2);
  await expect(frameOf(page).locator('#edge-start')).toHaveText('Start');
  const before = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  const copiedPage = randomUUID(),
    insertedPage = randomUUID();
  const original = before.document.slides.find((s: any) => s.id === slideId);
  const commands = [
    { type: 'slide.duplicate', slideId, newId: copiedPage },
    { type: 'element.delete', slideId: copiedPage, target: ids[0] },
    ...connections.map((c: any) => ({ type: 'element.delete', slideId: copiedPage, target: c.id })),
    {
      type: 'slide.insert',
      after: copiedPage,
      slide: { ...original, id: insertedPage, sourcePath: insertedPage + '.html' },
    },
    { type: 'element.delete', slideId: insertedPage, target: ids[0] },
    ...connections.map((c: any) => ({
      type: 'element.delete',
      slideId: insertedPage,
      target: c.id,
    })),
  ];
  const requests: string[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    if (requests.length === 1) {
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page.evaluate(async (commands) => {
    try {
      await (window as any).NotaleWorkbench.commands(commands);
    } catch {}
  }, commands);
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  const saved = await (await page.request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.version).toBe(7);
  expect(saved.document.slides).toHaveLength(doc.slides.length + 2);
  expect(saved.document.slides.find((s: any) => s.id === slideId)).toEqual(original);
  for (const id of [copiedPage, insertedPage]) {
    expect(saved.document.slides.find((s: any) => s.id === id).connectors).toEqual([]);
    await showSlide(page, id);
    await expect(frameOf(page).locator('[data-notale-connector]')).toHaveCount(0);
    await expect(frameOf(page).locator('#edge-start')).toHaveCount(0);
    await expect(frameOf(page).locator('#edge-end')).toHaveText('End');
  }
  for (const change of [
    { type: 'element.insert', slideId, parent: edge, html: '<path d="M0 0L5 5"/>' },
    { type: 'element.move', slideId, target: ids[1], parent: edge, index: 0 },
  ]) {
    const rejected = await page.request.post(`/api/documents/${doc.id}/commits`, {
      data: {
        baseVersion: 7,
        mutationId: randomUUID(),
        commands: [
          { type: 'element.patch', slideId, target: ids[1], patch: { text: 'Must roll back' } },
          change,
        ],
      },
    });
    expect(rejected.status()).toBe(422);
    expect((await rejected.json()).error).toBe('DERIVED_GEOMETRY');
    expect(await (await page.request.get(`/api/documents/${doc.id}`)).json()).toEqual(saved);
  }
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v8');
  await showSlide(page, slideId);
  await expect(frameOf(page).locator('[data-notale-connector]')).toHaveCount(2);
  expect(
    (await (await page.request.get(`/api/documents/${doc.id}`)).json()).document.slides,
  ).toHaveLength(doc.slides.length);
  await showSlide(page, doc.slides.find((s) => s.sourcePath === 'page-07.html')!.id);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
});

test('native ECharts series edits persist through original redraw, data changes, retry, history and portable export', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!;
  await showSlide(page, slide.id);
  const target = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find((o: any) => o.attributes.id === 'chart').id,
  );
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await expect(page.locator('#native-chart-panel')).toBeVisible();
  await page.locator('#inspect-native-chart').click();
  await expect(page.locator('#native-chart-status')).toContainText('2 个序列');
  await page.locator('#native-chart-width').fill('9');
  await page.locator('#native-chart-color').fill('#8b239d');
  await page.locator('#save-native-chart-series').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const state = async () => {
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    return frameOf(page)
      .locator('#chart')
      .evaluate((el) => {
        const chart = (window as any).echarts.getInstanceByDom(el),
          o = chart.getOption();
        return {
          width: o.series[0].lineStyle.width,
          color: o.series[0].lineStyle.color,
          data: o.series[0].data,
          second: o.series[1].data,
          paths: el.querySelectorAll('path').length,
        };
      });
  };
  const styled = await state();
  expect(styled.width).toBe(9);
  expect(styled.color).toBe('#8b239d');
  expect(styled.paths).toBeGreaterThan(5);
  await expect(frameOf(page).locator('#chart path[stroke="#8b239d"]').first()).toHaveAttribute(
    'stroke-width',
    '9',
  );
  await page.locator('#native-chart-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/native-chart-panel.png' });
  await page.locator('#interact').click();
  await frameOf(page).locator('[data-lr="1.0"]').click();
  const changed = await state();
  expect(changed.width).toBe(9);
  expect(changed.color).toBe('#8b239d');
  expect(changed.data).not.toEqual(styled.data);
  await page.locator('#interact').click();
  await page.locator('#inspect-native-chart').click();
  await expect(page.locator('#save-native-chart-series')).toBeEnabled();
  await page.locator('#native-chart-data').fill('[[1,0.7],[2,0.45],[3,0.2]]');
  await page.locator('#native-chart-save-data').check();
  const payloads: unknown[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#save-native-chart-series').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, slide.id);
  expect((await state()).data).toEqual([
    [1, 0.7],
    [2, 0.45],
    [3, 0.2],
  ]);
  await page.locator('#interact').click();
  await frameOf(page).locator('[data-lr="0.02"]').click();
  const fixed = await state();
  expect(fixed.data).toEqual([
    [1, 0.7],
    [2, 0.45],
    [3, 0.2],
  ]);
  expect(fixed.second).not.toEqual(styled.second);
  expect(fixed.width).toBe(9);
  await page.locator('#interact').click();
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  expect((await state()).data).toHaveLength(150);
  expect((await state()).width).toBe(9);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  expect((await state()).data).toHaveLength(3);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(snapshot.document.slides.find((s: any) => s.id === slide.id).html).toBe(slide.html);
  const files = unzipSync(await (await request.get(`/api/documents/${doc.id}/export`)).body());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/page-24.html`);
    await page.waitForFunction(() => (window as any).NotaleBridge);
    await page.locator('[data-lr="1.0"]').click();
    const output = await page.locator('#chart').evaluate((el) => {
      const o = (window as any).echarts.getInstanceByDom(el).getOption();
      return { width: o.series[0].lineStyle.width, data: o.series[0].data };
    });
    expect(output).toEqual({
      width: 9,
      data: [
        [1, 0.7],
        [2, 0.45],
        [3, 0.2],
      ],
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('native ECharts callbacks and independent instances survive style edits, reset and reinitialization', async ({
  page,
}) => {
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-17.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const target = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find(
        (o: any) => o.attributes.id === 'chart-features',
      ).id,
  );
  const callbackState = () =>
    frameOf(page)
      .locator('#chart-features')
      .evaluate((el) => {
        const o = (window as any).echarts.getInstanceByDom(el).getOption();
        const functions: string[] = [];
        const seen = new Set();
        const walk = (v: any) => {
          if (typeof v === 'function') functions.push(v.toString());
          else if (v && typeof v === 'object' && !seen.has(v)) {
            seen.add(v);
            Object.values(v).forEach(walk);
          }
        };
        walk(o);
        return {
          functions,
          labels: [o.xAxis[0].axisLabel.formatter('4'), o.yAxis[0].axisLabel.formatter(0.25)],
          width: o.series[0].lineStyle.width,
          other: (window as any).echarts
            .getInstanceByDom(document.getElementById('chart-trees'))
            .getOption().series[0].lineStyle.width,
        };
      });
  const original = await callbackState();
  expect(original.functions).toHaveLength(2);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'native-chart.set',
          slideId,
          target,
          option: {
            series: [{ lineStyle: { width: 8, color: '#279146' } }],
            yAxis: { axisLabel: { fontSize: 18 } },
          },
        },
      ]),
    { slideId: slide.id, target },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const edited = await callbackState();
  expect(edited.functions).toEqual(original.functions);
  expect(edited.labels).toEqual(['m=4(√p)', '25%']);
  expect(edited.width).toBe(8);
  expect(edited.other).toBe(original.other);
  await frameOf(page)
    .locator('#chart-features')
    .evaluate((el) => {
      const lib = (window as any).echarts,
        instance = lib.getInstanceByDom(el),
        option = instance.getOption();
      option.series[0].lineStyle.width = 2;
      instance.dispose();
      lib.init(el, null, { renderer: 'svg' }).setOption(option);
    });
  await expect.poll(async () => (await callbackState()).width).toBe(8);
  expect((await callbackState()).functions).toEqual(original.functions);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#reset-native-chart').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await callbackState()).toEqual(original);
  const errorPage = doc.slides.find((s) => s.sourcePath === 'page-11.html')!;
  await showSlide(page, errorPage.id);
  const errorTarget = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find((o: any) => o.attributes.id === 'chart').id,
  );
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'native-chart.set',
          slideId,
          target,
          option: {
            series: [
              {},
              {
                lineStyle: { width: 7, color: '#279146' },
                data: [
                  [1, 0.6],
                  [2, 0.3],
                  [3, 0.1],
                ],
              },
            ],
            xAxis: { axisLabel: { fontSize: 19 } },
          },
        },
      ]),
    { slideId: errorPage.id, target: errorTarget },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const errorState = await frameOf(page)
    .locator('#chart')
    .evaluate((el) => {
      const o = (window as any).echarts.getInstanceByDom(el).getOption();
      return {
        count: o.series.length,
        first: o.series[0].data.length,
        second: o.series[1].data,
        width: o.series[1].lineStyle.width,
        font: o.xAxis[0].axisLabel.fontSize,
      };
    });
  expect(errorState).toEqual({
    count: 3,
    first: 12,
    second: [
      [1, 0.6],
      [2, 0.3],
      [3, 0.1],
    ],
    width: 7,
    font: 19,
  });
  await page.locator('#copy-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const copiedId = await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).__NOTALE__.slide.id);
  expect(copiedId).not.toBe(errorPage.id);
  expect(
    await frameOf(page)
      .locator('#chart')
      .evaluate((el) => (window as any).echarts.getInstanceByDom(el).getOption().series[1].data),
  ).toEqual(errorState.second);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'native-chart.remove', slideId, target }]),
    { slideId: copiedId, target: errorTarget },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(
    await frameOf(page)
      .locator('#chart')
      .evaluate(
        (el) => (window as any).echarts.getInstanceByDom(el).getOption().series[1].data.length,
      ),
  ).toBe(12);
  await showSlide(page, errorPage.id);
  expect(
    await frameOf(page)
      .locator('#chart')
      .evaluate((el) => (window as any).echarts.getInstanceByDom(el).getOption().series[1].data),
  ).toEqual(errorState.second);
  expect(errors).toEqual([]);
});

test('complete Canvas regions copy independent live state, cut across pages, edit defaults and play after source removal and export', async ({
  page,
}) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(10000);
  const doc = await clone(page),
    sourcePage = doc.slides.find((s) => s.sourcePath === 'page-07.html')!,
    destination = { id: 'canvas-destination', sourcePath: 'canvas-destination.html' };
  await showSlide(page, sourcePage.id);
  const run = async (commands: unknown[]) => {
    await page.evaluate((commands) => (window as any).NotaleWorkbench.commands(commands), commands);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  await run([
    {
      type: 'slide.insert',
      after: sourcePage.id,
      slide: {
        ...destination,
        name: '独立相关性模拟',
        html: '<html><head><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"></head><body><main id="stage"></main></body></html>',
      },
    },
  ]);
  await showSlide(page, sourcePage.id);
  const matrix = await frameOf(page).locator('#matrix-canvas').getAttribute('data-notale-id');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), matrix);
  await page.locator('[data-tab="format"]').click();
  await page.locator('[data-panel="format"] summary').filter({ hasText: 'CSS 与属性' }).click();
  await expect(page.locator('#select-scene-root')).toBeVisible();
  await page.locator('#select-scene-root').click();
  const originalRoot = await page.evaluate(() => (window as any).NotaleWorkbench.getSelection()[0]);
  const originalScene = await frameOf(page)
    .locator('html')
    .evaluate(
      (_, root) => (window as any).__NOTALE__.scenes.find((scene: any) => scene.root === root).id,
      originalRoot,
    );
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#m-slider')
    .evaluate((el) => {
      (el as HTMLInputElement).value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await frameOf(page).locator('#resample').click();
  const original = await frameOf(page)
    .locator('html')
    .evaluate(
      (_, id) => ({
        state: (window as any).__NOTALE_SCENES__[id](),
        pixels: (document.querySelector('#matrix-canvas') as HTMLCanvasElement).toDataURL(),
      }),
      originalScene,
    );
  await run([
    { type: 'scene.set', slideId: sourcePage.id, sceneId: originalScene, values: original.state },
  ]);
  const beforeCopy = await page.evaluate(
    () => (window as any).NotaleWorkbench.getSnapshot().version,
  );
  await page.locator('#duplicate-object').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version))
    .toBeGreaterThan(beforeCopy);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const first = (await page.evaluate((id) => {
    const s = (window as any).NotaleWorkbench.getSnapshot().document.slides.find(
      (s: any) => s.id === id,
    );
    return Object.entries(s.canvasInstances)[0];
  }, sourcePage.id)) as [string, any];
  const get = (id: string) => frameOf(page).locator(`[data-notale-id="${id}"]`);
  const read = async (root: string) =>
    frameOf(page)
      .locator('html')
      .evaluate((_, root) => (window as any).__NOTALE_SCENES__[root](), root);
  expect(await read(first[0])).toEqual(original.state);
  await expect
    .poll(() =>
      get(first[1].members['matrix-canvas']).evaluate((el) =>
        (el as HTMLCanvasElement).toDataURL(),
      ),
    )
    .toBe(original.pixels);
  await get(first[1].members['m-slider']).evaluate((el) => {
    (el as HTMLInputElement).value = '9';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await get(first[1].members['preset-2']).evaluate((el) => (el as HTMLButtonElement).click());
  expect((await read(first[0])).M).toBe(9);
  expect((await read(first[0])).rho).toBe(0.75);
  expect(
    await frameOf(page)
      .locator('html')
      .evaluate((_, id) => (window as any).__NOTALE_SCENES__[id](), originalScene),
  ).toEqual(original.state);
  expect(
    await frameOf(page)
      .locator('#matrix-canvas')
      .evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
  ).toBe(original.pixels);
  const captured = await read(first[0]);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), first[0]);
  await page.evaluate(async () => {
    await (window as any).NotaleWorkbench.copySelection('cut');
  });
  await showSlide(page, destination.id);
  let dropped = false;
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.evaluate(async () => {
    try {
      await (window as any).NotaleWorkbench.pasteSelection();
    } catch {}
  });
  await expect(page.locator('#retry-save')).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(page.locator('#save-status')).toContainText('已保存');
  const moved = (await page.evaluate((id) => {
    const s = (window as any).NotaleWorkbench.getSnapshot().document.slides.find(
      (s: any) => s.id === id,
    );
    return Object.entries(s.canvasInstances)[0];
  }, destination.id)) as [string, any];
  expect(await read(moved[0])).toEqual(captured);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await run([
    {
      type: 'scene.set',
      slideId: destination.id,
      sceneId: moved[0],
      values: { ...captured, M: 15, seed: 321 },
    },
  ]);
  expect((await read(moved[0])).M).toBe(15);
  const pixels = await get(moved[1].members['matrix-canvas']).evaluate((el) =>
    (el as HTMLCanvasElement).toDataURL(),
  );
  await run([{ type: 'slide.delete', slideId: sourcePage.id }]);
  await page.reload();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await showSlide(page, destination.id);
  expect(
    await get(moved[1].members['matrix-canvas']).evaluate((el) =>
      (el as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(pixels);
  const archive = await page.request.get(`/api/documents/${doc.id}/export`);
  expect(archive.status()).toBe(200);
  const zipBytes = await archive.body();
  writeFileSync('.local/canvas-instance-export.zip', zipBytes);
  writeFileSync(
    '.local/canvas-instance-reference.png',
    Buffer.from(pixels.split(',')[1], 'base64'),
  );
  const files = unzipSync(zipBytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const exported = await page.context().newPage();
  try {
    await exported.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${destination.sourcePath}`,
    );
    const canvas = exported.locator(`[data-notale-id="${moved[1].members['matrix-canvas']}"]`);
    expect(await exported.evaluate(() => document.characterSet)).toBe('UTF-8');
    await expect
      .poll(async () =>
        createHash('sha256')
          .update(await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
          .digest('hex'),
      )
      .toBe(createHash('sha256').update(pixels).digest('hex'));
    await exported.locator(`[data-notale-id="${moved[1].members['preset-1']}"]`).click();
    expect(
      await exported.evaluate((id) => (window as any).__NOTALE_SCENES__[id]().rho, moved[0]),
    ).toBe(0.3);
    expect(await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL())).not.toBe(pixels);
    await exported.screenshot({ path: '.local/canvas-instance-export.png' });
  } finally {
    await exported.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await page.request.post('/api/import', {
    data: { data: (await archive.body()).toString('base64') },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, destination.id);
  await expect
    .poll(() =>
      get(moved[1].members['matrix-canvas']).evaluate((el) =>
        (el as HTMLCanvasElement).toDataURL(),
      ),
    )
    .toBe(pixels);
  await run([{ type: 'scene.remove', slideId: destination.id, sceneId: moved[0] }]);
  expect((await read(moved[0])).M).toBe(21);
  expect((await read(moved[0])).seed).toBe(42);
});

test('private Canvas scene parameters and captured resampling survive save, retry, history, copy and export', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-07.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const scenes = await (
    await request.get(`/api/documents/${doc.id}/slides/${slide.id}/scenes`)
  ).json();
  expect(scenes).toHaveLength(1);
  const sceneId = scenes[0].id,
    target = await page.evaluate(
      () =>
        (window as any).NotaleWorkbench.getObjects().find(
          (o: any) => o.attributes.id === 'matrix-canvas',
        ).id,
    );
  const state = () =>
    frameOf(page)
      .locator('html')
      .evaluate((_el, sceneId) => (window as any).__NOTALE_SCENES__[sceneId](), sceneId);
  const pixels = () =>
    frameOf(page)
      .locator('#matrix-canvas')
      .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const originalPixels = await pixels();
  expect((await state()).seed).toBe(42);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await expect(page.locator('#scene-panel')).toBeVisible();
  await page.locator('#read-scene').click();
  await expect(page.locator('#save-scene')).toBeEnabled();
  await page.locator('[data-scene-key="rho"]').fill('0.3');
  await page.locator('[data-scene-key="M"]').fill('31');
  await page.locator('[data-scene-key="eps"]').fill('0.25');
  await page.locator('[data-scene-key="seed"]').fill('777');
  await page.locator('#save-scene').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await state()).toEqual({ rho: 0.3, M: 31, eps: 0.25, seed: 777 });
  await expect(frameOf(page).locator('#m-slider')).toHaveValue('31');
  await expect(frameOf(page).locator('#m-val')).toHaveText('31');
  await expect(frameOf(page).locator('.preset-btn.active')).toHaveAttribute('data-rho', '0.3');
  const savedPixels = await pixels();
  expect(savedPixels).not.toBe(originalPixels);
  await page.reload();
  await showSlide(page, slide.id);
  expect(await pixels()).toBe(savedPixels);
  await page.locator('#interact').click();
  await frameOf(page)
    .locator('#resample')
    .evaluate((el) => {
      const random = Math.random;
      Math.random = () => 0.1234;
      try {
        (el as HTMLElement).click();
      } finally {
        Math.random = random;
      }
    });
  expect((await state()).seed).toBe(1234);
  const resampledPixels = await pixels();
  expect(resampledPixels).not.toBe(savedPixels);
  await page.locator('#interact').click();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#read-scene').click();
  await expect(page.locator('[data-scene-key="seed"]')).toHaveValue('1234');
  await page.locator('#scene-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/source-scene-panel.png' });
  const payloads: unknown[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#save-scene').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, slide.id);
  expect(await pixels()).toBe(resampledPixels);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixels()).toBe(savedPixels);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixels()).toBe(resampledPixels);
  await page.locator('#copy-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixels()).toBe(resampledPixels);
  const copyId = await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).__NOTALE__.slide.id);
  expect(copyId).not.toBe(slide.id);
  await page.evaluate(
    ({ slideId, sceneId }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'scene.remove', slideId, sceneId }]),
    { slideId: copyId, sceneId },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  expect(await pixels()).toBe(originalPixels);
  await showSlide(page, slide.id);
  expect(await pixels()).toBe(resampledPixels);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(snapshot.document.slides.find((s: any) => s.id === slide.id).html).toBe(slide.html);
  const files = unzipSync(await (await request.get(`/api/documents/${doc.id}/export`)).body());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/page-07.html`);
    await page.waitForFunction(() => (window as any).NotaleBridge);
    expect(
      await page
        .locator('html')
        .evaluate((_el, sceneId) => (window as any).__NOTALE_SCENES__[sceneId](), sceneId),
    ).toEqual({ rho: 0.3, M: 31, eps: 0.25, seed: 1234 });
    await expect(page.locator('#m-val')).toHaveText('31');
    await page.locator('#m-slider').evaluate((el) => {
      (el as HTMLInputElement).value = '35';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#m-val')).toHaveText('35');
    await page.locator('#resample').click();
    expect(
      await page
        .locator('html')
        .evaluate((_el, sceneId) => (window as any).__NOTALE_SCENES__[sceneId]().seed, sceneId),
    ).not.toBe(1234);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect(errors).toEqual([]);
});

test('native Canvas lookup choices edit and capture task comparisons through reopen, history and export', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-31.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const [scene] = await (
    await request.get(`/api/documents/${doc.id}/slides/${slide.id}/scenes`)
  ).json();
  expect(scene.parameters.find((p: any) => p.key === 'taskIdx').choices).toHaveLength(3);
  const target = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find(
        (o: any) => o.attributes.id === 'chartCanvas',
      ).id,
  );
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const pixels = () =>
    frameOf(page)
      .locator('#chartCanvas')
      .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const state = () =>
    frameOf(page)
      .locator('html')
      .evaluate((_el, id) => (window as any).__NOTALE_SCENES__[id](), scene.id);
  const originalPixels = await pixels();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#read-scene').click();
  await expect(page.locator('#save-scene')).toBeEnabled();
  await expect(page.locator('[data-scene-key="taskIdx"] option')).toHaveText([
    '深度决策树拟合复杂高噪声数据',
    '弱分类器拟合非线性流形数据',
    '多源混合特征预测（树+线性+近邻）',
  ]);
  await page.locator('[data-scene-key="taskIdx"]').selectOption('2');
  await page.locator('[data-scene-key="selectedMethod"]').selectOption('stacking');
  await page.locator('#save-scene').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await ready();
  expect(await state()).toEqual({ taskIdx: 2, selectedMethod: 'stacking' });
  await expect(frameOf(page).locator('#btn-task-2')).toHaveAttribute('aria-selected', 'true');
  await expect(frameOf(page).locator('.method-card.selected')).toHaveAttribute(
    'data-method',
    'stacking',
  );
  await expect(frameOf(page).locator('#mErr')).toHaveText('0.21');
  const editedPixels = await pixels();
  expect(editedPixels).not.toBe(originalPixels);
  await page.reload();
  await showSlide(page, slide.id);
  expect(await pixels()).toBe(editedPixels);
  const before = await (await request.get(`/api/documents/${doc.id}`)).json();
  for (const values of [{ taskIdx: 3 }, { selectedMethod: 'invalid' }]) {
    const invalid = await request.post(`/api/documents/${doc.id}/commits`, {
      data: {
        baseVersion: 2,
        mutationId: randomUUID(),
        commands: [
          { type: 'scene.set', slideId: slide.id, sceneId: scene.id, values: { taskIdx: 1 } },
          { type: 'scene.set', slideId: slide.id, sceneId: scene.id, values },
        ],
      },
    });
    expect(invalid.ok()).toBe(false);
    expect(await invalid.text()).toContain('INVALID_SCENE_VALUE');
    expect(await (await request.get(`/api/documents/${doc.id}`)).json()).toEqual(before);
  }
  await page.locator('#interact').click();
  await frameOf(page).locator('#btn-task-1').click();
  await frameOf(page).locator('.method-card[data-method="boosting"]').click();
  await expect(frameOf(page).locator('#mErr')).toHaveText('0.22');
  const capturedPixels = await pixels();
  await page.locator('#interact').click();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#read-scene').click();
  await expect(page.locator('[data-scene-key="taskIdx"]')).toHaveValue('1');
  await expect(page.locator('[data-scene-key="selectedMethod"]')).toHaveValue('boosting');
  await page.locator('#scene-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/scene-choices-panel.png' });
  await page.locator('#save-scene').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await ready();
  expect(await pixels()).toBe(capturedPixels);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await ready();
  expect(await pixels()).toBe(editedPixels);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await ready();
  expect(await pixels()).toBe(capturedPixels);
  await page.locator('#copy-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await ready();
  expect(await pixels()).toBe(capturedPixels);
  const copyId = await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).__NOTALE__.slide.id);
  await page.evaluate(
    ({ slideId, sceneId }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'scene.remove', slideId, sceneId }]),
    { slideId: copyId, sceneId: scene.id },
  );
  await ready();
  expect(await pixels()).toBe(originalPixels);
  await showSlide(page, slide.id);
  expect(await pixels()).toBe(capturedPixels);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(snapshot.document.slides.find((s: any) => s.id === slide.id).html).toBe(slide.html);
  const files = unzipSync(await (await request.get(`/api/documents/${doc.id}/export`)).body());
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/page-31.html`);
    await page.waitForFunction(() => (window as any).NotaleBridge);
    await expect(page.locator('#btn-task-1')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.method-card.selected')).toHaveAttribute('data-method', 'boosting');
    await expect(page.locator('#mErr')).toHaveText('0.22');
    await page.locator('#btn-task-0').click();
    await page.locator('.method-card[data-method="bagging"]').click();
    await expect(page.locator('#mErr')).toHaveText('0.24');
    await expect(page.locator('#verdictTag')).toHaveText('最佳匹配');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  expect(errors).toEqual([]);
});

test('bootstrap Canvas checkpoints preserve both plots, comparison history and the next sample through recovery and export', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-12.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const [scene] = await (
    await request.get(`/api/documents/${doc.id}/slides/${slide.id}/scenes`)
  ).json();
  expect(scene.checkpoint).toBe('bootstrap-forest-v1');
  const target = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find((o: any) => o.attributes.id === 'cv-single')
        .id,
  );
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const capture = () =>
    frameOf(page)
      .locator('html')
      .evaluate((_el, id) => (window as any).__NOTALE_CHECKPOINTS__[id].capture(), scene.id);
  const pixels = () =>
    frameOf(page)
      .locator('#cv-single, #cv-bagging')
      .evaluateAll((els) => els.map((el) => (el as HTMLCanvasElement).toDataURL()));
  const initialPixels = await pixels(),
    initial = await capture();
  await page.locator('#interact').click();
  await frameOf(page).locator('#tree-options [data-m="25"]').click();
  await frameOf(page).locator('#resample-btn').click();
  await frameOf(page).locator('#resample-btn').click();
  const sampled = await capture(),
    sampledPixels = await pixels();
  expect(sampled.state.m).toBe(25);
  expect(sampled.state.trees).toHaveLength(25);
  expect(sampled.state.runCount).toBe(3);
  expect(sampled.state.lastSingleGrid).toHaveLength(2000);
  expect(typeof sampled.state.diffSingle).toBe('string');
  expect(sampledPixels[0]).not.toBe(initialPixels[0]);
  expect(sampledPixels[1]).not.toBe(initialPixels[1]);
  await page.locator('#interact').click();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await expect(page.locator('#scene-parameters [data-scene-key]')).toHaveCount(0);
  await page.locator('#read-scene').click();
  await expect(page.locator('#scene-status')).toContainText('第 3 次抽样、25 棵树');
  await page.locator('#scene-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/checkpoint-panel.png' });
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#save-scene').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[0].commands[0].type).toBe('scene.checkpoint');
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, slide.id);
  expect(await capture()).toEqual(sampled);
  expect(await pixels()).toEqual(sampledPixels);
  await expect(frameOf(page).locator('#tree-options .active')).toHaveAttribute('data-m', '25');
  await expect(frameOf(page).locator('#diff-single')).toHaveText(`${sampled.state.diffSingle}%`);
  await page.locator('#interact').click();
  await frameOf(page).locator('#resample-btn').click();
  const next = await capture(),
    nextPixels = await pixels();
  expect(next.state.runCount).toBe(4);
  expect(next.locals.seedCounter).not.toBe(sampled.locals.seedCounter);
  await page.reload();
  await showSlide(page, slide.id);
  expect(await capture()).toEqual(sampled);
  await page.locator('#interact').click();
  await frameOf(page).locator('#resample-btn').click();
  expect(await capture()).toEqual(next);
  expect(await pixels()).toEqual(nextPixels);
  await page.locator('#interact').click();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#read-scene').click();
  await expect(page.locator('#save-scene')).toBeEnabled();
  await page.locator('#save-scene').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await ready();
  expect(await capture()).toEqual(next);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await ready();
  expect(await pixels()).toEqual(sampledPixels);
  expect(await capture()).toEqual(sampled);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await ready();
  expect(await pixels()).toEqual(nextPixels);
  await page.locator('#copy-slide').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await ready();
  expect(await capture()).toEqual(next);
  expect(await pixels()).toEqual(nextPixels);
  const copyId = await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).__NOTALE__.slide.id);
  await page.evaluate(
    ({ slideId, sceneId }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'scene.remove', slideId, sceneId }]),
    { slideId: copyId, sceneId: scene.id },
  );
  await ready();
  expect(await capture()).toEqual(initial);
  expect(await pixels()).toEqual(initialPixels);
  await showSlide(page, slide.id);
  expect(await capture()).toEqual(next);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(snapshot.document.slides.find((s: any) => s.id === slide.id).html).toBe(slide.html);
  const malformed = structuredClone(next);
  malformed.state.trees = [];
  const rejected = await request.post(`/api/documents/${doc.id}/commits`, {
    data: {
      baseVersion: snapshot.version,
      mutationId: randomUUID(),
      commands: [
        { type: 'scene.checkpoint', slideId: slide.id, sceneId: scene.id, checkpoint: malformed },
      ],
    },
  });
  expect(rejected.ok()).toBe(false);
  expect(await (await request.get(`/api/documents/${doc.id}`)).json()).toEqual(snapshot);
  await page.locator('#interact').click();
  await frameOf(page).locator('#resample-btn').click();
  const continued = await capture();
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body();
  const files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/page-12.html`);
    await page.waitForFunction(() => (window as any).NotaleBridge);
    const exported = () =>
      page
        .locator('html')
        .evaluate((_el, id) => (window as any).__NOTALE_CHECKPOINTS__[id].capture(), scene.id);
    expect(await exported()).toEqual(next);
    await expect(page.locator('#single-tree-id')).toHaveText('抽样树 #4');
    await expect(page.locator('#diff-bagging')).toHaveText(`${next.state.diffBagging}%`);
    await page.locator('#resample-btn').click();
    expect(await exported()).toEqual(continued);
    await page.locator('#tree-options [data-m="5"]').click();
    await expect(page.locator('#ensemble-badge')).toHaveText('已聚合 5 棵树');
    expect((await exported()).state.trees).toHaveLength(5);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const restored = await imported.json();
  created.push(restored.document.id);
  expect(restored.document.slides.find((s: any) => s.id === slide.id).scenes[0].checkpoint).toEqual(
    next,
  );
  await page.goto(`/workbench.html?document=${restored.document.id}`);
  await showSlide(page, slide.id);
  expect(await capture()).toEqual(next);
  expect(await pixels()).toEqual(nextPixels);
  await page.locator('#interact').click();
  await frameOf(page).locator('#resample-btn').click();
  expect(await capture()).toEqual(continued);
  expect(errors).toEqual([]);
});

test('native chart copies keep independent callbacks and editable data through cut recovery, source removal and portable import', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    const delayed = new Set<string>();
    window.addEventListener('message', (event) => {
      if (
        event.data?.source === 'notale-host' &&
        event.data.type === 'capture' &&
        !delayed.has(event.data.data.requestId)
      ) {
        delayed.add(event.data.data.requestId);
        event.stopImmediatePropagation();
        setTimeout(
          () =>
            window.dispatchEvent(
              new MessageEvent('message', {
                data: event.data,
                source: event.source,
                origin: event.origin,
              }),
            ),
          250,
        );
      }
    });
  });
  const doc = await clone(page),
    sourceSlide = doc.slides.find((s) => s.sourcePath === 'page-17.html')!,
    dest = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const getOwned = async (slideId: string) => {
    const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
    return Object.entries(snapshot.document.slides.find((s: any) => s.id === slideId).nativeCharts)
      .filter(([, c]: any) => c.source)
      .map(([id]) => id);
  };
  const chart = (id: string) => frameOf(page).locator(`[data-notale-id="${id}"]`);
  const state = (id: string) =>
    chart(id).evaluate((el) => {
      const c = (window as any).echarts.getInstanceByDom(el),
        o = c.getOption();
      return {
        data: o.series[0].data,
        width: o.series[0].lineStyle.width,
        labels: [o.xAxis[0].axisLabel.formatter('4'), o.yAxis[0].axisLabel.formatter(0.25)],
        text: el.textContent,
        svg: !!el.querySelector('svg'),
      };
    });
  await showSlide(page, sourceSlide.id);
  const target = await page.evaluate(
    () =>
      (window as any).NotaleWorkbench.getObjects().find(
        (o: any) => o.attributes.id === 'chart-features',
      ).id,
  );
  const original = await state(target);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('#duplicate-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await ready();
  const [copy] = await getOwned(sourceSlide.id);
  expect(copy).toBeTruthy();
  expect((await state(copy)).labels).toEqual(original.labels);
  expect((await state(copy)).data).toEqual(original.data);
  expect((await state(copy)).svg).toBe(true);
  expect(
    await chart(copy).evaluate((el, id) => {
      const api = (window as any).echarts;
      return (
        api.getInstanceByDom(el) !==
        api.getInstanceByDom(document.querySelector(`[data-notale-id="${id}"]`))
      );
    }, target),
  ).toBe(true);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'native-chart.set',
          slideId,
          target,
          option: {
            series: [
              {
                data: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
                lineStyle: { width: 9, color: '#873e98' },
              },
            ],
          },
        },
      ]),
    { slideId: sourceSlide.id, target: copy },
  );
  await ready();
  const changed = await state(copy);
  expect(changed.width).toBe(9);
  expect(changed.data).not.toEqual(original.data);
  expect((await state(target)).data).toEqual(original.data);
  await page.reload();
  await showSlide(page, sourceSlide.id);
  expect((await state(copy)).data).toEqual(changed.data);
  expect((await state(copy)).labels).toEqual(original.labels);
  await chart(copy).evaluate((el) => (window as any).echarts.getInstanceByDom(el).dispose());
  await expect(async () => expect((await state(copy)).width).toBe(9)).toPass();
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), copy);
  await page.locator('#cut-objects').click();
  await showSlide(page, dest.id);
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      const r = await route.fetch();
      expect(r.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#paste-objects').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, dest.id);
  const [moved] = await getOwned(dest.id);
  expect((await state(moved)).data).toEqual(changed.data);
  expect((await state(moved)).labels).toEqual(original.labels);
  expect(await getOwned(sourceSlide.id)).toEqual([]);
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await ready();
  expect(await getOwned(sourceSlide.id)).toEqual([copy]);
  expect(await getOwned(dest.id)).toEqual([]);
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await showSlide(page, dest.id);
  expect((await state(moved)).width).toBe(9);
  await page.evaluate(
    (slideId) => (window as any).NotaleWorkbench.commands([{ type: 'slide.delete', slideId }]),
    sourceSlide.id,
  );
  await ready();
  expect((await state(moved)).data).toEqual(changed.data);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), moved);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#inspect-native-chart').click();
  await expect(page.locator('#save-native-chart-series')).toBeEnabled();
  await page.screenshot({ path: '.local/native-chart-copy.png' });
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', lookup(path) || 'application/octet-stream');
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${dest.sourcePath}`,
    );
    await page.waitForFunction(() => (window as any).NotaleBridge);
    expect(
      await page.locator(`[data-notale-id="${moved}"]`).evaluate((el) => {
        const c = (window as any).echarts.getInstanceByDom(el),
          o = c.getOption();
        return {
          width: o.series[0].lineStyle.width,
          label: o.xAxis[0].axisLabel.formatter('4'),
          svg: !!el.querySelector('svg'),
        };
      }),
    ).toEqual({ width: 9, label: 'm=4(√p)', svg: true });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const restored = await imported.json();
  created.push(restored.document.id);
  await page.goto(`/workbench.html?document=${restored.document.id}`);
  await showSlide(page, dest.id);
  expect((await state(moved)).data).toEqual(changed.data);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'native-chart.remove', slideId, target }]),
    { slideId: dest.id, target: moved },
  );
  await ready();
  expect((await state(moved)).data).toEqual(original.data);
  expect((await state(moved)).labels).toEqual(original.labels);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.delete', slideId, target }]),
    { slideId: dest.id, target: moved },
  );
  await ready();
  await expect(chart(moved)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const sourcePath of ['page-11.html', 'page-24.html'])
  test(`native ${sourcePath} data factory remains editable on a page without its source scripts`, async ({
    page,
    request,
  }) => {
    const doc = await clone(page),
      slide = doc.slides.find((s) => s.sourcePath === sourcePath)!,
      dest = doc.slides[1];
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await showSlide(page, slide.id);
    const target = await page.evaluate(
      () =>
        (window as any).NotaleWorkbench.getObjects().find((o: any) => o.attributes.id === 'chart')
          .id,
    );
    const original = await frameOf(page)
      .locator('#chart')
      .evaluate((el) =>
        (window as any).echarts
          .getInstanceByDom(el)
          .getOption()
          .series.map((s: any) => s.data),
      );
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
    await page.locator('#copy-objects').click();
    await showSlide(page, dest.id);
    await page.locator('#paste-objects').click();
    await expect(page.locator('#save-status')).toContainText('已保存 · v2');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json(),
      copy = Object.keys(
        snapshot.document.slides.find((s: any) => s.id === dest.id).nativeCharts,
      )[0];
    const read = () =>
      frameOf(page)
        .locator(`[data-notale-id="${copy}"]`)
        .evaluate((el) => {
          const o = (window as any).echarts.getInstanceByDom(el).getOption();
          return {
            data: o.series.map((s: any) => s.data),
            width: o.series[0].lineStyle.width,
            svg: !!el.querySelector('svg'),
          };
        });
    expect((await read()).data).toEqual(original);
    expect((await read()).svg).toBe(true);
    await page.evaluate(
      ({ slideId, target }) =>
        (window as any).NotaleWorkbench.commands([
          {
            type: 'native-chart.set',
            slideId,
            target,
            option: { series: [{ lineStyle: { width: 7 } }] },
          },
        ]),
      { slideId: dest.id, target: copy },
    );
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
    expect((await read()).width).toBe(7);
    await page.reload();
    await showSlide(page, dest.id);
    expect((await read()).data).toEqual(original);
    expect((await read()).width).toBe(7);
    expect(errors).toEqual([]);
  });

for (const selection of ['host', 'container'] as const)
  test(`unreviewed native chart ${selection} copying preserves runtime hints and never saves an empty host`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(() => {
      const delayed = new Set<string>();
      window.addEventListener('message', (event) => {
        if (event.data?.source !== 'notale-host' || event.data.type !== 'capture') return;
        const id = event.data.data.requestId;
        if (delayed.has(id)) return;
        delayed.add(id);
        event.stopImmediatePropagation();
        setTimeout(
          () =>
            window.dispatchEvent(
              new MessageEvent('message', {
                data: event.data,
                origin: event.origin,
                source: event.source,
              }),
            ),
          250,
        );
      });
    });
    const doc = structuredClone(source.document);
    doc.id = randomUUID();
    doc.title = 'Browser acceptance ' + doc.id;
    const slide = doc.slides.find((s) => s.sourcePath === 'page-11.html')!;
    expect(slide.html).toContain('var T_values =');
    slide.html = slide.html.replace(
      'var T_values =',
      '/* Unreviewed source variant */ var T_values =',
    );
    const createdResponse = await request.post('/api/documents', { data: doc });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    created.push(doc.id);
    await page.goto(`/workbench.html?document=${doc.id}`);
    await expect(page.locator('#save-status')).toContainText('已保存');
    await showSlide(page, slide.id);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(frameOf(page).locator('#chart svg')).toBeVisible();
    const ids = await frameOf(page)
      .locator('#chart')
      .evaluate((el) => ({
        host: el.getAttribute('data-notale-id')!,
        container: el.parentElement!.getAttribute('data-notale-id')!,
      }));
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), ids[selection]);
    const attempted = page.waitForResponse((r) =>
      r.url().endsWith(`/api/documents/${doc.id}/commits`),
    );
    if (selection === 'host') {
      const result = await page.evaluate(async () => {
        const editor = (window as any).NotaleWorkbench;
        const outcomes = await Promise.allSettled([
          editor.copySelection('copy'),
          editor.pasteSelection(),
        ]);
        return outcomes.map((o) => (o.status === 'rejected' ? String(o.reason) : 'ok'));
      });
      expect(result[0]).toBe('ok');
      expect(result[1]).toContain('INTERACTION_CLONE');
    } else {
      await page.locator('#duplicate-object').click();
      await expect(page.locator('#toast')).toContainText('INTERACTION_CLONE');
    }
    const response = await attempted;
    expect(response.status()).toBe(422);
    const payload = response.request().postDataJSON();
    expect(payload.commands[0].nativeChartTargets).toEqual([ids.host]);
    expect(payload.commands[0].targets).toEqual([ids[selection]]);
    const head = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(head.version).toBe(1);
    expect(head.document).toEqual((await createdResponse.json()).document);
    await expect(frameOf(page).locator('#chart svg')).toBeVisible();
    expect(errors).toEqual([]);
  });

test('cutting an original native chart preserves its sibling through retry, history and portable playback', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-17.html')!,
    dest = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await showSlide(page, slide.id);
  const target = await frameOf(page).locator('#chart-features').getAttribute('data-notale-id');
  const sibling = await frameOf(page).locator('#chart-trees').getAttribute('data-notale-id');
  const read = (id: string) =>
    frameOf(page)
      .locator(`[data-notale-id="${id}"]`)
      .evaluate((el) => {
        const option = (window as any).echarts.getInstanceByDom(el).getOption();
        window.dispatchEvent(new Event('resize'));
        return {
          data: option.series.map((s: any) => s.data),
          label: option.xAxis[0].axisLabel.formatter?.('4'),
          svg: !!el.querySelector('svg'),
        };
      });
  const original = await read(target!),
    siblingState = await read(sibling!);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('#cut-objects').click();
  await showSlide(page, dest.id);
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#paste-objects').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
  const moved = Object.keys(
    snapshot.document.slides.find((s: any) => s.id === dest.id).nativeCharts,
  )[0];
  await showSlide(page, dest.id);
  expect(await read(moved)).toEqual(original);
  await showSlide(page, slide.id);
  await expect(frameOf(page).locator('#chart-features')).toHaveCount(0);
  expect(await read(sibling!)).toEqual(siblingState);
  await page.locator('#undo').click();
  await ready();
  await showSlide(page, slide.id);
  expect(await read(target!)).toEqual(original);
  // Deleting the other original host must leave the formatter-bearing sibling alive.
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.delete', slideId, target }]),
    { slideId: slide.id, target: sibling },
  );
  await ready();
  expect(await read(target!)).toEqual(original);
  await page.locator('#undo').click();
  await ready();
  expect(await read(sibling!)).toEqual(siblingState);
  // Restore the acknowledged cut revision to test standalone source and destination together.
  const head = await (await request.get(`/api/documents/${doc.id}`)).json();
  const restored = await request.post(`/api/documents/${doc.id}/restore`, {
    data: { baseVersion: head.version, mutationId: randomUUID(), version: 2 },
  });
  expect(restored.status(), await restored.text()).toBe(200);
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await page.goto(`${origin}/${slide.sourcePath}`);
    await expect(page.locator('#chart-trees svg')).toBeVisible();
    await expect(page.locator('#chart-features')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.goto(`${origin}/${dest.sourcePath}`);
    await expect(page.locator(`[data-notale-id="${moved}"] svg`)).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, slide.id);
  expect(await read(sibling!)).toEqual(siblingState);
  await showSlide(page, dest.id);
  expect(await read(moved)).toEqual(original);
  expect(errors).toEqual([]);
});

test('deleting the original learning-rate chart keeps native metrics usable without an error fallback', async ({
  page,
  request,
}) => {
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const target = await frameOf(page).locator('#chart').getAttribute('data-notale-id');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), target);
  await page.locator('#delete-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.reload();
  await showSlide(page, slide.id);
  await expect(frameOf(page).locator('#chart')).toHaveCount(0);
  await expect(frameOf(page).locator('#fallback')).toBeHidden();
  await page.locator('#interact').click();
  await frameOf(page).locator('[data-lr="1.0"]').click();
  await expect(frameOf(page).locator('#val-opt-m')).toHaveText('14 轮');
  await frameOf(page).locator('[data-lr="0.02"]').click();
  await expect(frameOf(page).locator('#val-opt-m')).toHaveText('135 轮');
  await page.screenshot({ path: '.local/native-chart-deleted.png' });
  await page.locator('#undo').click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator('#chart svg')).toBeVisible();
  await expect(frameOf(page).locator('#fallback')).toBeHidden();
  await page.locator('#redo').click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(frameOf(page).locator('#chart')).toHaveCount(0);
  await expect(frameOf(page).locator('#fallback')).toBeHidden();
  const head = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(head.document.slides.find((s: any) => s.id === slide.id).html).toContain(
    'chart = echarts.init(chartHost',
  );
  expect(errors).toEqual([]);
});

test('interactive chart components keep independent controls, captured choices and styles through copy, cut recovery and portability', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!,
    dest = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const play = async (on: boolean) => {
    if ((await page.locator('#interact').innerText()).includes('返回编辑') !== on)
      await page.locator('#interact').click();
  };
  const bindings = async () => {
    const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json();
    return snapshot.document.slides as any[];
  };
  const owned = async (slideId: string) =>
    Object.entries((await bindings()).find((s) => s.id === slideId).nativeCharts).filter(
      ([, c]: any) => c.interaction,
    ) as Array<[string, any]>;
  const node = (id: string) => frameOf(page).locator(`[data-notale-id="${id}"]`);
  const click = async (id: string) => {
    await play(true);
    await node(id).evaluate((el) => (el as HTMLElement).click());
    await node(id).evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
    });
  };
  const read = async (id: string, interaction: any) => {
    const lines = await node(interaction.metrics.optM).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    });
    expect(lines).toBe(1);
    return {
      value: await node(interaction.metrics.optM).textContent(),
      data: await node(id).evaluate((el) =>
        (window as any).echarts
          .getInstanceByDom(el)
          .getOption()
          .series.map((s: any) => s.data),
      ),
      selected: await node(interaction.root).locator('button.active').getAttribute('data-lr'),
      background: await node(interaction.root)
        .locator('button.active')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    };
  };
  await showSlide(page, slide.id);
  const [originalId, originalBinding] = (await frameOf(page)
    .locator('html')
    .evaluate(() => Object.entries((window as any).__NOTALE__.chartComponents)[0])) as [
    string,
    any,
  ];
  await click(originalBinding.controls['1.0']);
  const original = await read(originalId, originalBinding);
  expect(original.value).toBe('14 轮');
  await play(false);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), originalBinding.root);
  await page.locator('#duplicate-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await ready();
  const [copyId, copy] = (await owned(slide.id))[0],
    component = copy.interaction;
  expect(await read(copyId, component)).toEqual(original);
  await click(component.controls['0.02']);
  expect((await read(copyId, component)).value).toBe('135 轮');
  expect((await read(originalId, originalBinding)).value).toBe('42 轮');
  await click(originalBinding.controls['1.0']);
  expect((await read(copyId, component)).value).toBe('135 轮');
  expect((await read(copyId, component)).background).toBe(original.background);
  await play(false);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), copyId);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#inspect-native-chart').click();
  await expect(page.locator('#native-chart-value')).toHaveValue('0.02');
  await page.locator('#save-native-chart-state').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  await page.reload();
  await showSlide(page, slide.id);
  expect((await read(copyId, component)).value).toBe('135 轮');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), component.root);
  await page.locator('#duplicate-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await ready();
  const [secondId, second] = (await owned(slide.id)).find(([id]) => id !== copyId)!;
  await click(second.interaction.controls['1.0']);
  expect((await read(secondId, second.interaction)).value).toBe('14 轮');
  expect((await read(copyId, component)).value).toBe('135 轮');
  expect((await read(originalId, originalBinding)).value).toBe('42 轮');
  const rejected = await request.post(`/api/documents/${doc.id}/commits`, {
    data: {
      baseVersion: 4,
      mutationId: randomUUID(),
      commands: [{ type: 'element.delete', slideId: slide.id, target: component.metrics.optM }],
    },
  });
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).error).toBe('COMPONENT_BOUNDARY');
  await play(false);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'element.patch', slideId, target, patch: { text: '快速学习' } },
      ]),
    { slideId: slide.id, target: component.controls['1.0'] },
  );
  await ready();
  await expect(node(component.controls['1.0'])).toHaveText('快速学习');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), component.root);
  await page.locator('#cut-objects').click();
  await showSlide(page, dest.id);
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#paste-objects').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, dest.id);
  const [movedId, moved] = (await owned(dest.id))[0];
  const movedState = await read(movedId, moved.interaction);
  expect(movedState.value).toBe('135 轮');
  await expect(node(moved.interaction.controls['1.0'])).toHaveText('快速学习');
  await page.locator('#undo').click();
  await ready();
  await showSlide(page, slide.id);
  expect((await read(copyId, component)).value).toBe('135 轮');
  await page.locator('#redo').click();
  await ready();
  await showSlide(page, dest.id);
  expect(await read(movedId, moved.interaction)).toEqual(movedState);
  await page.screenshot({ path: '.local/interactive-chart-component.png' });
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${dest.sourcePath}`,
    );
    const metric = page.locator(`[data-notale-id="${moved.interaction.metrics.optM}"]`);
    await expect(metric).toHaveText('135 轮');
    await page.locator(`[data-notale-id="${moved.interaction.controls['1.0']}"]`).click();
    await expect(metric).toHaveText('14 轮');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, dest.id);
  expect(await read(movedId, moved.interaction)).toEqual(movedState);
  await click(moved.interaction.controls['1.0']);
  expect((await read(movedId, moved.interaction)).value).toBe('14 轮');
  await play(false);
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.delete', slideId, target }]),
    { slideId: dest.id, target: moved.interaction.root },
  );
  await ready();
  await expect(node(movedId)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an original chart and its native controls can move together without leaving source-page handlers behind', async ({
  page,
  request,
}) => {
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!,
    dest = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await showSlide(page, slide.id);
  const [, component] = (await frameOf(page)
    .locator('html')
    .evaluate(() => Object.entries((window as any).__NOTALE__.chartComponents)[0])) as [
    string,
    any,
  ];
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), component.root);
  await page.locator('#cut-objects').click();
  await showSlide(page, dest.id);
  await page.locator('#paste-objects').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const head = await (await request.get(`/api/documents/${doc.id}`)).json(),
    [id, chart] = Object.entries(
      head.document.slides.find((s: any) => s.id === dest.id).nativeCharts,
    )[0] as [string, any];
  await page.locator('#interact').click();
  await frameOf(page).locator(`[data-notale-id="${chart.interaction.controls['0.02']}"]`).click();
  await expect(
    frameOf(page).locator(`[data-notale-id="${chart.interaction.metrics.optM}"]`),
  ).toHaveText('135 轮');
  await showSlide(page, slide.id);
  await expect(frameOf(page).locator('.main-grid')).toHaveCount(0);
  await page.evaluate(
    (slideId) => (window as any).NotaleWorkbench.commands([{ type: 'slide.delete', slideId }]),
    slide.id,
  );
  await showSlide(page, dest.id);
  await expect(frameOf(page).locator(`[data-notale-id="${id}"] svg`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('original component state appearances edit in place, navigate internal objects and survive retry, history and portability', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = () => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const frame = () => frameOf(page);
  const node = (id: string) => frame().locator(`[data-notale-id="${id}"]`);
  const play = async (on: boolean) => {
    if ((await page.locator('#interact').innerText()).includes('返回编辑') !== on)
      await page.locator('#interact').click();
  };
  await showSlide(page, slide.id);
  const [id, binding] = (await frame()
    .locator('html')
    .evaluate(() => Object.entries((window as any).__NOTALE__.chartComponents)[0])) as [
    string,
    any,
  ];
  await play(true);
  await node(binding.controls['0.02']).click();
  await expect(node(binding.metrics.optM)).toHaveText('135 轮');
  await play(false);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#inspect-native-chart').click();
  await expect(page.locator('#native-chart-value')).toHaveValue('0.02');
  await page.locator('#native-chart-backgroundColor').fill('#6a2488');
  await page.locator('#native-chart-color-state').fill('#ffffff');
  await page.locator('#native-chart-borderColor').fill('#241130');
  await page.locator('#native-chart-fontWeight').fill('900');
  await page.locator('#save-native-chart-appearance').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v2');
  await ready();
  const adopted = await (await request.get(`/api/documents/${doc.id}`)).json();
  const adoptedSlide = adopted.document.slides.find((s: any) => s.id === slide.id);
  expect(adoptedSlide.html).toBe(slide.html);
  expect(adoptedSlide.nativeCharts[id].interaction.root).toBe(binding.root);
  expect(adoptedSlide.nativeCharts[id].interaction.value).toBe('0.02');
  const appearance = async (target: string) =>
    node(target).evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
      const css = getComputedStyle(el);
      return {
        background: css.backgroundColor,
        color: css.color,
        border: css.borderColor,
        weight: css.fontWeight,
      };
    });
  expect(await appearance(binding.controls['0.02'])).toEqual({
    background: 'rgb(106, 36, 136)',
    color: 'rgb(255, 255, 255)',
    border: 'rgb(36, 17, 48)',
    weight: '900',
  });
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#native-chart-appearance-state').selectOption('inactive');
  await page.locator('#native-chart-backgroundColor').fill('#e7edf5');
  await page.locator('#native-chart-color-state').fill('#273b55');
  await page.locator('#native-chart-borderColor').fill('#7890ab');
  await page.locator('#native-chart-fontWeight').fill('500');
  await page.locator('#save-native-chart-appearance').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, slide.id);
  const inactive = {
    background: 'rgb(231, 237, 245)',
    color: 'rgb(39, 59, 85)',
    border: 'rgb(120, 144, 171)',
    weight: '500',
  };
  expect(await appearance(binding.controls['1.0'])).toEqual(inactive);
  await play(true);
  await node(binding.controls['1.0']).click();
  await expect(node(binding.metrics.optM)).toHaveText('14 轮');
  await expect.poll(() => appearance(binding.controls['0.02'])).toEqual(inactive);
  await expect
    .poll(() => appearance(binding.controls['1.0']))
    .toMatchObject({ background: 'rgb(106, 36, 136)', weight: '900' });
  await play(false);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
  await page.locator('[data-tab="format"]').click();
  const choose = async (target: string) => {
    await page.locator('#component-member').selectOption(target);
    await page.locator('#select-component-member').click();
    expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSelection())).toEqual([
      target,
    ]);
  };
  await choose(binding.root);
  await choose(binding.controls['1.0']);
  await choose(binding.metrics.optM);
  await choose(id);
  await page.locator('#native-chart-appearance-state').selectOption('active');
  await page.locator('#native-chart-backgroundColor').fill('#146b43');
  await page.locator('#save-native-chart-appearance').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await ready();
  await expect(node(binding.metrics.optM)).toHaveText('135 轮');
  expect(await appearance(binding.controls['0.02'])).toMatchObject({
    background: 'rgb(20, 107, 67)',
  });
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await ready();
  expect(await appearance(binding.controls['0.02'])).toMatchObject({
    background: 'rgb(106, 36, 136)',
  });
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v6');
  await ready();
  await page.reload();
  await showSlide(page, slide.id);
  expect(await appearance(binding.controls['0.02'])).toMatchObject({
    background: 'rgb(20, 107, 67)',
  });
  await page.screenshot({ path: '.local/component-appearance.png' });
  await node(id).evaluate((el) => (window as any).echarts.getInstanceByDom(el).dispose());
  await expect
    .poll(() => node(id).evaluate((el) => !!(window as any).echarts.getInstanceByDom(el)))
    .toBe(true);
  await play(true);
  await node(binding.controls['1.0']).click();
  await expect(node(binding.metrics.optM)).toHaveText('14 轮');
  await play(false);
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
  await page.locator('[data-tab="format"]').click();
  await choose(binding.root);
  await page.locator('#duplicate-object').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v7');
  await ready();
  const copied = await (await request.get(`/api/documents/${doc.id}`)).json();
  const [copyId, copy] = Object.entries(
    copied.document.slides.find((s: any) => s.id === slide.id).nativeCharts,
  ).find(([target]) => target !== id) as [string, any];
  expect(copy.interaction.value).toBe('1.0');
  expect(await appearance(copy.interaction.controls['1.0'])).toMatchObject({
    background: 'rgb(20, 107, 67)',
    weight: '900',
  });
  await page.evaluate(
    ({ slideId, target }) =>
      (window as any).NotaleWorkbench.commands([{ type: 'element.delete', slideId, target }]),
    { slideId: slide.id, target: binding.root },
  );
  await ready();
  await expect(node(id)).toHaveCount(0);
  await expect(node(copyId).locator('svg')).toBeVisible();
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${slide.sourcePath}`,
    );
    const control = page.locator(`[data-notale-id="${copy.interaction.controls['0.02']}"]`);
    await control.click();
    await expect(page.locator(`[data-notale-id="${copy.interaction.metrics.optM}"]`)).toHaveText(
      '135 轮',
    );
    await expect
      .poll(() => control.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(20, 107, 67)');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, slide.id);
  expect(await appearance(copy.interaction.controls['1.0'])).toMatchObject({
    background: 'rgb(20, 107, 67)',
    weight: '900',
  });
  await play(true);
  await node(copy.interaction.controls['0.02']).click();
  await expect(node(copy.interaction.metrics.optM)).toHaveText('135 轮');
  expect(errors).toEqual([]);
});

test('authored HTML components edit layouts, states, click transitions and steps, then copy without baking a transient pose', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ready = async () => {
    await expect(page.locator('#save-status')).toContainText('已保存');
    await expect(page.locator('#author-components')).not.toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  };
  const head = async () => await (await request.get(`/api/documents/${doc.id}`)).json();
  const current = async () =>
    (await head()).document.slides.find((item: any) => item.id === slide.id);
  await page.evaluate(
    (slideId) =>
      (window as any).NotaleWorkbench.commands([
        {
          type: 'element.insert',
          slideId,
          html: '<section id="teaching-card" style="position:absolute;z-index:50;left:180px;top:140px;width:1000px;padding:30px;background:#fff8e8;border:2px solid #a48342;box-sizing:border-box"><h2 id="teaching-title" style="margin:0;font-size:36px">先思考，再揭示</h2><button id="teaching-button" style="font-size:24px;padding:12px">查看解释</button><p id="teaching-answer" style="margin:0;font-size:28px">多个模型共同降低方差。</p><svg id="teaching-shape" width="120" height="80"><rect id="teaching-rect" x="0" y="0" width="120" height="80" fill="#d6a646"/></svg></section>',
        },
      ]),
    slide.id,
  );
  await ready();
  const ids = await page.evaluate(() =>
    Object.fromEntries(
      (window as any).NotaleWorkbench.getObjects()
        .filter((object: any) => object.attributes.id?.startsWith('teaching-'))
        .map((object: any) => [object.attributes.id, object.id]),
    ),
  );
  const choose = async (id: string) => {
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), id);
    await page.locator('[data-tab="format"]').click();
  };
  await choose(ids['teaching-card']);
  await page.locator('#author-component-create').click();
  await ready();
  let component = (await current()).components[0];
  await page.locator('#author-component-name').fill('解释卡片');
  await page.locator('#author-state-name').fill('思考');
  await page.locator('#author-duration').fill('180');
  await page.locator('#author-easing').selectOption('ease-out');
  await page.locator('#author-behavior-save').click();
  await ready();
  expect((await current()).components[0]).toMatchObject({
    name: '解释卡片',
    duration: 180,
    easing: 'ease-out',
  });
  expect((await current()).components[0].states[0].name).toBe('思考');
  await page.locator('#author-layout').selectOption('column');
  await page.locator('#author-gap').fill('24');
  await page.locator('#author-layout-save').click();
  await ready();
  expect(
    await frameOf(page)
      .locator('#teaching-card')
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe('flex');
  await page.locator('#author-target').selectOption(ids['teaching-answer']);
  await page.locator('#author-visible').selectOption('false');
  await page.locator('#author-patch-save').click();
  await ready();
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await page.locator('#author-state-add').click();
  await ready();
  const answerState = await page.locator('#author-state').inputValue();
  await page.locator('#author-state-name').fill('解释');
  await page.locator('#author-visible').selectOption('true');
  await page.locator('#author-text-enabled').check();
  await page.locator('#author-text').fill('独立模型的误差相互抵消，集成预测因此更加稳定。');
  await page.locator('#author-style').fill('{"color":"#17613f"}');
  await page.locator('#author-patch-save').click();
  await ready();
  await page.locator('#author-target').selectOption(ids['teaching-card']);
  await page
    .locator('#author-style')
    .fill('{"transform":"translateX(80px)","background-color":"#eaf5ed"}');
  await page.locator('#author-patch-save').click();
  await ready();
  await page.locator('#author-target').selectOption(ids['teaching-rect']);
  await page.locator('#author-style').fill('{"fill":"#17613f"}');
  await page.locator('#author-patch-save').click();
  await ready();
  await page.locator('#author-target').selectOption(ids['teaching-button']);
  await page.locator('#author-from').selectOption('base');
  await page.locator('#author-event-add').click();
  await ready();
  await page.locator('#author-state').selectOption('base');
  await page.locator('#author-from').selectOption(answerState);
  await page.locator('#author-event-add').click();
  await ready();
  await page.locator('#author-state').selectOption(answerState);
  await page.locator('#author-step').fill('2');
  await page.locator('#author-step-save').click();
  await ready();
  await page.locator('#author-state-preview').click();
  await expect(frameOf(page).locator('#teaching-answer')).toHaveText(
    '独立模型的误差相互抵消，集成预测因此更加稳定。',
  );
  await expect
    .poll(() =>
      frameOf(page)
        .locator('#teaching-card')
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .toBe('matrix(1, 0, 0, 1, 80, 0)');
  await expect
    .poll(() =>
      frameOf(page)
        .locator('#teaching-rect')
        .evaluate((el) => getComputedStyle(el).fill),
    )
    .toBe('rgb(23, 97, 63)');
  await expect
    .poll(async () => {
      const root = (await frameOf(page).locator('#teaching-card').boundingBox())!;
      const handle = (await frameOf(page)
        .locator('[data-notale-handles] [data-handle="nw"]')
        .boundingBox())!;
      return (
        Math.abs(handle.x + handle.width / 2 - root.x) +
        Math.abs(handle.y + handle.height / 2 - root.y)
      );
    })
    .toBeLessThan(2);
  expect(
    await page.locator('.inspector').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: '.local/authored-component.png' });
  await page.locator('#author-state').selectOption('base');
  await page.locator('#author-state-preview').click();
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await page.locator('#interact').click();
  await frameOf(page).locator('#teaching-button').click();
  await expect(frameOf(page).locator('#teaching-answer')).toBeVisible();
  await frameOf(page).locator('#teaching-button').click();
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await frameOf(page).locator('#teaching-button').click();
  await expect(frameOf(page).locator('#teaching-answer')).toBeVisible();
  await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).NotaleBridge.seek(0, false));
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).NotaleBridge.seek(2, true));
  await expect(frameOf(page).locator('#teaching-answer')).toBeVisible();
  await page.locator('#interact').click();
  await choose(ids['teaching-card']);
  await page.locator('#author-state').selectOption(answerState);
  await page.locator('#author-state-preview').click();
  await expect
    .poll(() =>
      frameOf(page)
        .locator('#teaching-card')
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .toBe('matrix(1, 0, 0, 1, 80, 0)');
  const before = await frameOf(page).locator('#teaching-card').boundingBox();
  await page.locator('#duplicate-object').click();
  await expect.poll(async () => (await current()).components.length).toBe(2);
  await ready();
  const snapshot = await current();
  component = snapshot.components.find((c: any) => c.root === ids['teaching-card']);
  const copy = snapshot.components.find((c: any) => c.id !== component.id);
  expect(copy.initial).toBe(answerState);
  expect(copy.events[0].target).not.toBe(ids['teaching-button']);
  const copyRoot = frameOf(page).locator(`[data-notale-id="${copy.root}"]`),
    copyAnswer = Object.keys(
      copy.states.find((state: any) => state.id === answerState).patches,
    ).find(
      (target) => copy.states.find((state: any) => state.id === answerState).patches[target].text,
    )!;
  await expect(copyRoot).toBeVisible();
  const after = await copyRoot.boundingBox();
  const scale = (await frameOf(page).locator('#stage').boundingBox())!.width / 1600;
  expect(Math.abs(after!.x - before!.x - 20 * scale)).toBeLessThan(1.5);
  await frameOf(page)
    .locator('html')
    .evaluate(({ id }) => (window as any).NotaleBridge.seek(0, false), { id: component.id });
  // Copied initial state is answer, while the original initial state remains base.
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await expect(frameOf(page).locator(`[data-notale-id="${copyAnswer}"]`)).toBeVisible();
  await page.reload();
  await showSlide(page, slide.id);
  await expect(frameOf(page).locator('#teaching-answer')).toBeHidden();
  await expect(frameOf(page).locator(`[data-notale-id="${copyAnswer}"]`)).toBeVisible();
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
      data = files[path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': lookup(path) || 'application/octet-stream' });
    res.end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${slide.sourcePath}`,
    );
    await expect(page.locator('#teaching-answer')).toBeHidden();
    await page.locator('#teaching-button').evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('#teaching-answer')).toBeVisible();
    await page.evaluate(() => (window as any).NotaleBridge.seek(0, false));
    await expect(page.locator('#teaching-answer')).toBeHidden();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, slide.id);
  await expect(frameOf(page).locator(`[data-notale-id="${copyAnswer}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('component steps drive an adopted native chart and preserve authored defaults through cross-page cut recovery', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const doc = await clone(page),
    slide = doc.slides.find((s) => s.sourcePath === 'page-24.html')!,
    dest = doc.slides[0];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await showSlide(page, slide.id);
  const [chartId, binding] = (await frameOf(page)
    .locator('html')
    .evaluate(() => Object.entries((window as any).__NOTALE__.chartComponents)[0])) as [
    string,
    any,
  ];
  const definition = {
    id: 'teaching-profile',
    root: binding.root,
    name: '学习率讲授步骤',
    initial: 'steady',
    states: [
      { id: 'steady', name: '推荐', patches: {} },
      { id: 'fast', name: '过冲', patches: { [chartId]: { nativeChartValue: '1.0' } } },
      { id: 'slow', name: '保守', patches: { [chartId]: { nativeChartValue: '0.02' } } },
    ],
    events: Object.entries(binding.controls).map(([rate, target]) => ({
      id: 'event-' + rate.replaceAll('.', '_'),
      target,
      event: 'click',
      to: rate === '1.0' ? 'fast' : rate === '0.02' ? 'slow' : 'steady',
    })),
    steps: [{ step: 2, state: 'slow' }],
    duration: 100,
  };
  await page.evaluate(
    ({ slideId, target, component }) =>
      (window as any).NotaleWorkbench.commands([
        { type: 'native-chart.component', slideId, target },
        { type: 'component.set', slideId, component },
      ]),
    { slideId: slide.id, target: chartId, component: definition },
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const metric = (id: string) => frameOf(page).locator(`[data-notale-id="${id}"]`);
  await expect(metric(binding.metrics.optM)).toHaveText('42 轮');
  await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).NotaleBridge.seek(2, true));
  await expect(metric(binding.metrics.optM)).toHaveText('135 轮');
  await frameOf(page)
    .locator('html')
    .evaluate(() => (window as any).NotaleBridge.seek(0, false));
  await expect(metric(binding.metrics.optM)).toHaveText('42 轮');
  await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), binding.root);
  await page.locator('[data-tab="format"]').click();
  await page.locator('#author-state').selectOption('fast');
  await page.locator('#author-state-preview').click();
  await expect(metric(binding.metrics.optM)).toHaveText('14 轮');
  await metric(chartId).evaluate((el) => (window as any).echarts.getInstanceByDom(el).dispose());
  await expect
    .poll(() => metric(chartId).evaluate((el) => !!(window as any).echarts.getInstanceByDom(el)))
    .toBe(true);
  await expect(metric(binding.metrics.optM)).toHaveText('14 轮');
  await page.locator('#cut-objects').click();
  await showSlide(page, dest.id);
  const payloads: any[] = [];
  await page.route(`**/api/documents/${doc.id}/commits`, async (route) => {
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#paste-objects').click();
  await expect(page.locator('#retry-save')).toBeVisible();
  await page.reload();
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v3');
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  await page.unroute(`**/api/documents/${doc.id}/commits`);
  await showSlide(page, dest.id);
  const snapshot = await (await request.get(`/api/documents/${doc.id}`)).json(),
    destination = snapshot.document.slides.find((s: any) => s.id === dest.id),
    component = destination.components[0];
  const [ownedId, owned] = Object.entries(destination.nativeCharts)[0] as [string, any];
  expect(component.initial).toBe('fast');
  expect(owned.interaction.value).toBe('0.1');
  await expect(metric(owned.interaction.metrics.optM)).toHaveText('14 轮');
  const preview = async (state: string) => {
    await page.evaluate((id) => (window as any).NotaleWorkbench.select(id), component.root);
    await page.locator('[data-tab="format"]').click();
    await page.locator('#author-state').selectOption(state);
    await page.locator('#author-state-preview').click();
  };
  await preview('steady');
  await expect(metric(owned.interaction.metrics.optM)).toHaveText('42 轮');
  await preview('fast');
  await expect(metric(owned.interaction.metrics.optM)).toHaveText('14 轮');
  await page.locator('#undo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v4');
  await showSlide(page, slide.id);
  await expect(metric(binding.metrics.optM)).toHaveText('42 轮');
  await page.locator('#redo').click();
  await expect(page.locator('#save-status')).toContainText('已保存 · v5');
  await showSlide(page, dest.id);
  await expect(metric(owned.interaction.metrics.optM)).toHaveText('14 轮');
  await page.evaluate(
    (slideId) => (window as any).NotaleWorkbench.commands([{ type: 'slide.delete', slideId }]),
    slide.id,
  );
  await showSlide(page, dest.id);
  await expect(metric(ownedId).locator('svg')).toBeVisible();
  const bytes = await (await request.get(`/api/documents/${doc.id}/export`)).body(),
    files = unzipSync(bytes),
    server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname).slice(1),
        data = files[path];
      res.writeHead(data ? 200 : 404, {
        'Content-Type': lookup(path) || 'application/octet-stream',
      });
      res.end(data);
    });
  await (await import('node:fs/promises')).writeFile('.local/component-steps-export.zip', bytes);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/${dest.sourcePath}`,
    );
    const debug = await page.evaluate(() => ({
      state: (window as any).NotaleBridge?.state(),
      components: (window as any).__NOTALE__?.slide.components,
      ready: document.readyState,
    }));
    await (
      await import('node:fs/promises')
    ).writeFile('.local/component-steps-debug.json', JSON.stringify(debug, null, 2));
    await expect(page.locator(`[data-notale-id="${owned.interaction.metrics.optM}"]`)).toHaveText(
      '14 轮',
    );
    await page.locator(`[data-notale-id="${owned.interaction.controls['0.1']}"]`).click();
    await expect(page.locator(`[data-notale-id="${owned.interaction.metrics.optM}"]`)).toHaveText(
      '42 轮',
    );
    await page.evaluate(() => (window as any).NotaleBridge.seek(2, false));
    await expect(page.locator(`[data-notale-id="${owned.interaction.metrics.optM}"]`)).toHaveText(
      '135 轮',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const imported = await request.post('/api/import', { data: { data: bytes.toString('base64') } });
  expect(imported.status(), await imported.text()).toBe(201);
  const reopened = await imported.json();
  created.push(reopened.document.id);
  await page.goto(`/workbench.html?document=${reopened.document.id}`);
  await showSlide(page, dest.id);
  await expect(metric(owned.interaction.metrics.optM)).toHaveText('14 轮');
  expect(errors).toEqual([]);
});
