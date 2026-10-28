/* eslint-disable @typescript-eslint/no-explicit-any -- Exercises the editor's browser globals. */
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// History edge cases: menu focus, composition, removal of the active page, a delayed save acknowledgement.
const api = '/api';
const ready = async (page: Page, id: string) => {
  await page.waitForFunction(id => (window as any).NotaleWorkbench?.getSnapshot()?.document.id === id, id);
  // Keep a Playwright poller alive while the readiness promise is pending in CDP.
  await page.waitForFunction(async () => {
    await (window as any).NotaleWorkbench.whenReady();
    return true;
  }, undefined, { timeout: 0 }).then(handle => handle.dispose());
};
async function createLecture(page: Page, html = '<!doctype html><html><body style="margin:0"><h1 data-notale-id="heading" style="position:absolute;left:120px;top:120px;font-size:40px">原始标题</h1></body></html>') {
  const id = randomUUID();
  const response = await page.request.post(`${api}/documents`, { data: {
    schemaVersion: 1, id, title: '主站编辑集成验收', width: 1600, height: 900,
    slides: ['first', 'second'].map(slide => ({ id: slide, name: slide, sourcePath: `${slide}.html`,
      notes: '演讲者备注\n'.repeat(100),
      html,
    })),
  } });
  expect(response.status(), await response.text()).toBe(201);
  return id;
}
const undoLectureHtml = '<!doctype html><html><body style="margin:0"><h1 data-notale-id="heading" style="position:absolute;left:180px;top:180px;width:240px;height:70px;margin:0;font-size:40px;color:#111111;text-align:left">原始标题</h1></body></html>';
const synchronized = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
async function headingTextPoint(page: Page) {
  const local = await page.frameLocator('#canvas').locator('h1').evaluate(element => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, viewport: innerWidth };
  });
  const frame = (await page.locator('#canvas').boundingBox())!;
  return { x: frame.x + local.x * frame.width / local.viewport, y: frame.y + local.y * frame.width / local.viewport };
}

test('undo: color, select, number and menu focus use document history once per shortcut', async ({ page }) => {
  const id = await createLecture(page, undoLectureHtml);
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  const heading = page.frameLocator('#canvas').locator('h1');
  const expectTextStyle = (property: string, value: string) => expect.poll(() => heading.evaluate((element, property) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    return getComputedStyle(text?.parentElement ?? element).getPropertyValue(property);
  }, property)).toBe(value);
  await heading.click({ button: 'right' });
  await page.locator('[data-format="color"]').fill('#dd2244');
  await expectTextStyle('color', 'rgb(221, 34, 68)');
  await synchronized(page);
  await page.locator('[data-format="text-align"]').selectOption('center');
  await expectTextStyle('text-align', 'center');
  await synchronized(page);
  await page.locator('[data-format="font-size"]').fill('56');
  await page.locator('[data-format="font-size"]').press('Enter');
  await expectTextStyle('font-size', '56px');
  await synchronized(page);
  const shortcut = async (selector: string, key: string) => {
    await expect(page.locator('#object-context-menu')).toBeVisible();
    await page.locator(selector).focus();
    await page.keyboard.press(key);
    await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
    await synchronized(page);
    await expect(page.locator(selector)).toBeFocused();
  };
  await shortcut('[data-format="color"]', 'Control+z');
  await expectTextStyle('font-size', '40px');
  await expectTextStyle('text-align', 'center');
  // Consecutive presses retain the original menu focus; no right-click repairs it.
  await page.keyboard.press('Control+z');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await synchronized(page);
  await expect(page.locator('[data-format="color"]')).toBeFocused();
  await expectTextStyle('text-align', 'left');
  await expectTextStyle('color', 'rgb(221, 34, 68)');
  await shortcut('[data-format="text-align"]', 'Control+Shift+z');
  await expectTextStyle('text-align', 'center');
  await shortcut('[data-format="text-align"]', 'Control+z');
  await expectTextStyle('text-align', 'left');
  await expectTextStyle('color', 'rgb(221, 34, 68)');
  await shortcut('[data-format="font-size"]', 'Control+z');
  await expectTextStyle('color', 'rgb(17, 17, 17)');
  await shortcut('#object-context-menu [data-action="copy"]', 'Control+Shift+z');
  await expectTextStyle('color', 'rgb(221, 34, 68)');
  await expectTextStyle('text-align', 'left');
  await shortcut('[data-format="text-align"]', 'Control+y');
  await expectTextStyle('text-align', 'center');
  await shortcut('[data-format="font-size"]', 'Meta+Shift+z');
  await expectTextStyle('font-size', '56px');
  await shortcut('#object-context-menu [data-action="copy"]', 'Meta+z');
  await expectTextStyle('font-size', '40px');
  await expectTextStyle('text-align', 'center');
  await page.keyboard.press('Escape');
  await page.locator('#redo').click();
  await expectTextStyle('font-size', '56px');
  await page.locator('#undo').click();
  await expectTextStyle('font-size', '40px');
  await synchronized(page);
});

test('undo: composition, modified keys and native text editing preserve document history', async ({ page }) => {
  const id = await createLecture(page, undoLectureHtml);
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  await page.evaluate(async () => {
    const workbench = (window as any).NotaleWorkbench;
    await workbench.commands([{ type: 'element.patch', slideId: 'first', target: 'heading', patch: { style: { color: '#dd2244' } } }]);
    await workbench.whenSynchronized();
  });
  const heading = page.frameLocator('#canvas').locator('h1');
  await heading.click({ button: 'right' });
  const color = page.locator('[data-format="color"]');
  await color.focus();
  const before = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version);
  for (const modifiers of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }]) {
    await color.dispatchEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...modifiers });
    await page.evaluate(modifiers => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...modifiers })), modifiers);
  }
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await synchronized(page);
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version)).toBe(before);
  await expect(heading).toHaveCSS('color', 'rgb(221, 34, 68)');
  await page.keyboard.press('Escape');
  await page.locator('#toggle-notes').click();
  const notes = page.locator('#notes');
  const initialNotes = await notes.inputValue();
  await notes.focus();
  await notes.press('Control+End');
  await page.keyboard.insertText('原生撤销样本');
  await expect(notes).toHaveValue(initialNotes + '原生撤销样本');
  await notes.press('Control+z');
  await expect(notes).toHaveValue(initialNotes);
  await expect(heading).toHaveCSS('color', 'rgb(221, 34, 68)');
  await page.locator('#toggle-notes').click();
  const textPoint = await headingTextPoint(page);
  await page.mouse.dblclick(textPoint.x, textPoint.y);
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await heading.press('End');
  await page.keyboard.insertText('画布文字');
  await heading.press('Control+z');
  await expect(heading).toHaveText('原始标题');
  await heading.press('Control+Shift+z');
  await expect(heading).toHaveText('原始标题画布文字');
  await expect(heading).toHaveCSS('color', 'rgb(221, 34, 68)');
});

test('undo: rapid history survives removal of the active page while stale delete stays scoped', async ({ page }) => {
  const id = await createLecture(page, undoLectureHtml);
  await page.goto(`/?document=${id}`);
  await ready(page, id);
  const initial = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document);
  await page.evaluate(async () => {
    const workbench = (window as any).NotaleWorkbench;
    for (const command of [
      { type: 'deck.update', title: '撤销标题' },
      { type: 'element.patch', slideId: 'first', target: 'heading', patch: { text: '撤销文字' } },
      { type: 'slide.duplicate', slideId: 'first', newId: 'third' },
    ]) {
      await workbench.commands([command]);
      await workbench.whenSynchronized();
    }
    await workbench.showSlide('third');
  });
  await ready(page, id);
  const changed = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document);
  await page.frameLocator('#canvas').locator('h1').click({ button: 'right' });
  await page.locator('[data-format="color"]').evaluate(target => {
    for (let index = 0; index < 3; index++) target.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await synchronized(page);
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document)).toEqual(initial);
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await synchronized(page);
  expect(await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document)).toEqual(changed);
  await page.evaluate(async () => {
    const workbench = (window as any).NotaleWorkbench;
    await workbench.showSlide('third');
    workbench.select('heading');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
  });
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await expect(page.locator('body')).toContainText('页面已切换，未执行剩余快捷键操作');
  const after = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document);
  expect(after.slides.map((slide: any) => slide.id)).toEqual(['first', 'second']);
  expect(after.slides).toEqual(changed.slides.filter((slide: any) => slide.id !== 'third'));
});

for (const secondGesture of [false, true]) {
  test(`undo: dragging remains reversible while a save acknowledgement is delayed (${secondGesture ? 'unsent second gesture' : 'sent first gesture'})`, async ({ page }) => {
    const id = await createLecture(page, undoLectureHtml);
    await page.goto(`/?document=${id}`);
    await ready(page, id);
    const heading = page.frameLocator('#canvas').locator('h1');
    const x = () => heading.evaluate(element => element.getBoundingClientRect().x);
    const drag = async (dx: number) => {
      const start = await headingTextPoint(page);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + dx, start.y + 15, { steps: 5 });
      await page.mouse.up();
    };
    let release!: () => void;
    const acknowledgement = new Promise<void>(resolve => { release = resolve; });
    let held = false;
    await page.route(`**${api}/documents/${id}/edits`, async route => {
      if (held) return route.continue();
      const response = await route.fetch();
      held = true;
      await acknowledgement;
      await route.fulfill({ response });
    });
    try {
      const initialX = await x();
      await drag(40);
      await expect.poll(() => held).toBe(true);
      const firstX = await x();
      expect(firstX).toBeGreaterThan(initialX + 20);
      if (secondGesture) await drag(35);
      const lastX = await x(), undoneX = secondGesture ? firstX : initialX;
      if (secondGesture) expect(lastX).toBeGreaterThan(firstX + 20);
      const modelX = () => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document.slides[0].transforms.heading?.matrix?.[4] ?? 0);
      await expect.poll(modelX).toBeCloseTo(lastX - initialX, 0);
      const point = await headingTextPoint(page);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.locator('[data-format="color"]').focus();
      await page.keyboard.press('Control+z');
      await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
      // The first acknowledgement remains held for both a sent gesture's inverse
      // and an unsent second gesture's cancellation. Model and canvas must agree.
      await expect.poll(modelX).toBeCloseTo(undoneX - initialX, 0);
      await expect.poll(x).toBeCloseTo(undoneX, 0);
      release();
      await synchronized(page);
      await page.keyboard.press('Control+Shift+z');
      await expect.poll(x).toBeCloseTo(lastX, 0);
      await synchronized(page);
      await page.reload();
      await ready(page, id);
      await expect.poll(x).toBeCloseTo(lastX, 0);
    } finally {
      release();
    }
  });
}

