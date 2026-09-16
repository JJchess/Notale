import { test, expect, type Page } from '@playwright/test';
import {reveal} from './harness/format-panel';
import { randomUUID } from 'node:crypto';
// The shared 4312 host is sometimes pointed at another build; INSERT_TEST_URL runs this
// suite against a server of its own.
test.use({ baseURL: process.env.INSERT_TEST_URL ?? 'http://127.0.0.1:4312' });
const original = 'f5d596d1-0584-4de4-ada6-ecf918147cd4';
const DEFAULT_TEX = '\\hat{y}=\\sum_{i=1}^{n} w_i x_i + b';
const ready = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
const version = (page: Page) => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().version);
async function change(page: Page, action: () => Promise<unknown>) {
  const before = await version(page);
  await action();
  await expect.poll(() => version(page)).toBeGreaterThan(before);
  await ready(page);
  return (await version(page)) - before;
}
async function open(page: Page, id: string) {
  await page.goto('/?document=' + id);
  await expect(page.locator('#save-status')).toContainText('已保存');
  await ready(page);
}
// Appearance edits commit on `change`; assert the rendered result rather than a version delta.
async function commit(page: Page, action: () => Promise<unknown>) {
  await action();
  // Number and range inputs commit on blur, matching how the animation panel is driven.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  await ready(page);
}
// The insert drawer groups entries into collapsible categories, so open whatever
// contains the entry instead of naming a category.
async function pick(page: Page, selector: string) {
  if ((await page.locator('[data-tool="insert"]').getAttribute('aria-pressed')) !== 'true') await page.locator('[data-tool="insert"]').click();
  const button = page.locator(selector);
  await button.evaluate((el) => { for (let node = el.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true; });
  await button.click();
}
// 导入 and 导出 are menus in the header; open the one holding the action first.
async function openHeaderMenu(page: Page, key: 'import' | 'export') {
  const menu = page.locator(`[data-header-menu="${key}"]`);
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator('summary').click();
}
// The style tool toggles, so opening it twice in a row would hide the inspector.
async function openStyle(page: Page) {
  // Selecting an object can open the inspector on its own, and the tool button toggles,
  // so only click when the panel is actually closed.
  if (await page.locator('#property-panel').isVisible()) return;
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#property-panel')).toBeVisible();
}
/** Open the panel and bring the tab that owns this control to the front. */
async function openStyleAt(page: Page, id: string) {
  await openStyle(page);
  await reveal(page, id);
}
async function select(page: Page, id: string) {
  if ((await page.locator('[data-tool="objects"]').getAttribute('aria-pressed')) !== 'true') await page.locator('[data-tool="objects"]').click();
  await page.locator(`[data-object="${id}"]`).click();
}
const fill = (page: Page, selector: string) =>
  page.frameLocator('#canvas').locator(selector).evaluate((el) => getComputedStyle(el).fill);
// Inserted objects follow the lecture theme: their accent resolves to the page's --model when defined.
const pageAccent = (page: Page) =>
  page.frameLocator('#canvas').locator('#stage').evaluate((el) => {
    const v = getComputedStyle(el).getPropertyValue('--model').trim();
    const probe = document.createElement('span'); probe.style.color = v || '#466ddb'; document.body.append(probe);
    const rgb = getComputedStyle(probe).color; probe.remove(); return rgb;
  });
const katexFont = (page: Page) =>
  page.frameLocator('#canvas').locator('[data-notale-tex] .katex').first().evaluate((el) => getComputedStyle(el).fontFamily);

test('insert gallery: shapes recolor, equations render/edit with one stylesheet asset, symbols insert', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '插入库验收 · 真实讲义副本';
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');

  // Shape library: twelve buttons with generated icons, inserted shape inherits fill/stroke from its root.
  await page.locator('[data-tool="insert"]').click();
  // The panel groups shapes (basic, arrows, callouts); all twelve stay reachable with generated icons.
  await expect(page.locator('[data-insert^="shape:"]')).toHaveCount(12);
  await expect(page.locator('[data-insert^="shape:"] svg')).toHaveCount(12);
  // Picker chrome: the cell is invisible at rest, the glyph takes the button's neutral
  // colour, the name lives in the tooltip, and a preview tile keeps its frame.
  const tile = page.locator('[data-insert="shape:star"]');
  expect(await tile.evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: style.borderTopColor, background: style.backgroundColor, glyph: getComputedStyle(el.querySelector('svg')!).stroke === style.color, label: getComputedStyle(el.querySelector('.insert-item-label')!).display };
  })).toEqual({ border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)', glyph: true, label: 'none' });
  await expect(tile).toHaveAttribute('title', /五角星/);
  await tile.hover();
  await expect.poll(() => tile.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('[data-insert-category="diagrams"] > summary').click();
  expect(await page.locator('.diagram-grid > button').first().evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  await change(page, () => pick(page, '[data-insert="shape:star"]'));
  const star = frame.locator('[data-notale-shape="star"]');
  await expect(star).toBeVisible();
  expect(await fill(page, '[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');
  // Page 1's title overlaps the insertion point, so select through the layer list.
  await select(page, (await star.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await reveal(page,'#property-appearance');await expect(page.locator('#property-appearance')).toBeVisible();
  await expect(page.locator('#appearance-fill')).toHaveValue('#dee8ff');
  await commit(page, () => page.locator('#appearance-fill').fill('#ff0000'));
  await expect.poll(() => fill(page, '[data-notale-shape="star"] path')).toBe('rgb(255, 0, 0)');
  await commit(page, () => page.locator('#appearance-stroke').fill('#00ff00'));
  await expect.poll(() => frame.locator('[data-notale-shape="star"] path').evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(0, 255, 0)');
  await page.screenshot({ path: '.local/insert-gallery-shape.png' });
  await change(page, () => page.locator('#undo').click());
  await change(page, () => page.locator('#undo').click());
  await expect.poll(() => fill(page, '[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');
  // Ctrl+Z with a swatch focused reaches the document: a colour input carries no text
  // history, so the browser's field undo must not swallow the shortcut, and the swatch
  // follows the undone value.
  await commit(page, () => page.locator('#appearance-fill').fill('#0000ff'));
  await expect.poll(() => fill(page, '[data-notale-shape="star"] path')).toBe('rgb(0, 0, 255)');
  await page.locator('#appearance-fill').focus();
  await change(page, () => page.keyboard.press('Control+z'));
  await expect.poll(() => fill(page, '[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');
  await expect(page.locator('#appearance-fill')).toHaveValue('#dee8ff');
  // A textarea keeps its own undo, so the shape is left alone.
  await page.locator('#toggle-notes').click();
  await page.locator('#notes').focus();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  expect(await fill(page, '[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');
  await page.locator('#toggle-notes').click();

  // Equation on a lecture that already carries KaTeX CSS: one version, no new asset.
  const assetsBefore = Object.keys((await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets).length;
  await page.locator('[data-tool="insert"]').click();
  expect(await change(page, () => pick(page, '[data-insert="equation"]'))).toBe(1);
  const equation = frame.locator('[data-notale-tex]');
  await expect(equation).toHaveAttribute('data-notale-tex', DEFAULT_TEX);
  await expect(equation.locator('.katex')).toBeVisible();
  await expect.poll(() => katexFont(page)).toContain('KaTeX');
  expect(Object.keys((await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets).length).toBe(assetsBefore);
  await page.screenshot({ path: '.local/insert-gallery-equation.png' });

  // Re-edit through the equation dialog: content and source attribute change together in one version.
  await select(page, (await equation.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await expect(page.locator('#open-equation-editor')).toBeVisible();
  await reveal(page,'#open-equation-editor');await page.locator('#open-equation-editor').click();
  await expect(page.locator('#equation-editor-dialog')).toBeVisible();
  await expect(page.locator('#equation-tex')).toHaveValue(DEFAULT_TEX);
  await page.locator('#equation-tex').fill('E=mc^2');
  await expect(page.locator('#equation-preview .katex')).toContainText('mc');
  expect(await change(page, () => page.locator('#save-equation').click())).toBe(1);
  await expect(page.locator('#equation-editor-dialog')).toBeHidden();
  await expect(equation).toHaveAttribute('data-notale-tex', 'E=mc^2');
  await expect(equation.locator('.katex')).toContainText('mc');
  await expect(equation.locator('link[rel="stylesheet"]')).toHaveCount(1);
  await change(page, () => page.locator('#undo').click());
  await expect(equation).toHaveAttribute('data-notale-tex', DEFAULT_TEX);

  // Symbols insert as text objects.
  await change(page, () => pick(page, '[data-insert="symbol"][data-symbol="∑"]'));
  await expect(frame.locator('p', { hasText: '∑' })).toBeVisible();
  await page.screenshot({ path: '.local/insert-gallery-symbol.png' });

  // Reopen: everything survives the round trip.
  await open(page, doc.id);
  await expect(frame.locator('[data-notale-shape="star"]')).toBeVisible();
  await expect(frame.locator('[data-notale-tex] .katex')).toBeVisible();
  await expect(frame.locator('p', { hasText: '∑' })).toBeVisible();
  expect(errors).toEqual([]);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('insert gallery: a lecture without KaTeX gets the stylesheet stored once', async ({ page }) => {
  // The reference lecture ships KaTeX files no page references; dropping them yields a KaTeX-free lecture.
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '插入库验收 · 无 KaTeX 讲义';
  for (const path of Object.keys(doc.assets)) if (path.includes('katex')) delete doc.assets[path];
  const count = Object.keys(doc.assets).length;
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  await page.locator('[data-tool="insert"]').click();
  expect(await change(page, () => pick(page, '[data-insert="equation"]'))).toBe(1);
  await expect(page.frameLocator('#canvas').locator('[data-notale-tex] .katex')).toBeVisible();
  await expect.poll(() => katexFont(page)).toContain('KaTeX');
  const assets = (await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets;
  expect(Object.keys(assets).length).toBe(count + 1);
  expect(assets['assets/lib/katex.min.css']).toBeTruthy();
  // A second equation reuses the stored stylesheet.
  expect(await change(page, () => pick(page, '[data-insert="equation"]'))).toBe(1);
  expect(Object.keys((await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets).length).toBe(count + 1);
  await expect(page.frameLocator('#canvas').locator('[data-notale-tex]')).toHaveCount(2);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('insert gallery: icons, word art, date, code and layouts', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '插入库验收 · 第二轮';
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  const stroke = (selector: string) => frame.locator(selector).first().evaluate((el) => getComputedStyle(el).stroke);

  // Icons: generated gallery, inherited stroke, stroke-only colour field, undo.
  await page.locator('[data-tool="insert"]').click();
  const iconCount = await page.locator('#icon-gallery button').count();
  expect(iconCount).toBeGreaterThanOrEqual(100);
  await expect(page.locator('#icon-gallery button svg')).toHaveCount(iconCount);
  // Search narrows by Chinese label and by icon name.
  await page.locator('#icon-search').evaluate((el) => { for (let node = el.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true; });
  await page.locator('#icon-search').fill('箭头');
  await expect.poll(async () => page.locator('#icon-gallery button:visible').count()).toBeLessThan(iconCount);
  await page.locator('#icon-search').fill('rocket');
  await expect(page.locator('[data-insert="icon:rocket"]')).toBeVisible();
  await page.locator('#icon-search').fill('');
  await change(page, () => pick(page, '[data-insert="icon:brain"]'));
  const icon = frame.locator('svg[data-notale-icon="brain"]');
  await expect(icon).toBeVisible();
  const accent = await pageAccent(page);
  expect(await stroke('svg[data-notale-icon="brain"] path')).toBe(accent);
  await select(page, (await icon.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await reveal(page,'#appearance-stroke');await expect(page.locator('#appearance-stroke')).toBeVisible();
  await expect(page.locator('#appearance-radius-field')).toBeHidden();
  await commit(page, () => page.locator('#appearance-stroke').fill('#ff0000'));
  await expect.poll(() => stroke('svg[data-notale-icon="brain"] path')).toBe('rgb(255, 0, 0)');
  await change(page, () => page.locator('#undo').click());
  await expect.poll(() => stroke('svg[data-notale-icon="brain"] path')).toBe(accent);

  // Word art stays a paragraph: editable text with the preset style.
  await change(page, () => pick(page, '[data-insert="wordart:gradient"]'));
  const art = frame.locator('p', { hasText: '艺术字' });
  await expect(art).toBeVisible();
  expect(await art.evaluate((el) => (getComputedStyle(el) as any).webkitBackgroundClip)).toBe('text');
  await select(page, (await art.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await reveal(page,'#object-text');await expect(page.locator('#object-text')).toHaveValue('艺术字');

  // Date and code block.
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  await change(page, () => pick(page, '[data-insert="date"]'));
  await expect(frame.locator('p', { hasText: today })).toBeVisible();
  await change(page, () => pick(page, '[data-insert="code"]'));
  const code = frame.locator('pre');
  await expect(code).toContainText('def predict');
  // Highlighting ships as inline colours so the slide needs no extra stylesheet.
  await expect(code.locator('span[style*="color"]').first()).toBeVisible();
  expect(await code.locator('span[style*="color"]').count()).toBeGreaterThan(2);
  await select(page, (await code.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await expect(page.locator('#object-text')).toHaveValue(/def predict/);
  // The code dialog re-highlights in the chosen language.
  await page.locator('#open-code-editor').click();
  await expect(page.locator('#code-editor-dialog')).toBeVisible();
  await page.locator('#code-language').selectOption('sql');
  await page.locator('#code-source').fill('select model, accuracy from runs where accuracy > 0.9;');
  await expect(page.locator('#code-preview span[style*="color"]').first()).toBeVisible();
  await change(page, () => page.locator('#save-code').click());
  await expect(code).toContainText('select model');
  await expect(code).toHaveAttribute('data-notale-code-lang', 'sql');
  await page.screenshot({ path: '.local/insert-gallery-round2-text.png' });

  // Process layout: leaves are editable paragraphs, the container keeps its structure.
  await change(page, () => pick(page, '[data-insert="smart:process"]'));
  const process = frame.locator('[data-notale-smart="process"]');
  await expect(process.locator('> *')).toHaveCount(3);
  const step = frame.locator('p', { hasText: '步骤一' });
  await expect(step).toBeVisible();
  await select(page, (await step.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await page.locator('#object-text').fill('训练');
  expect(await change(page, () => page.locator('#apply-text').click())).toBe(1);
  await expect(frame.locator('p', { hasText: '训练' })).toBeVisible();
  await expect(process.locator('> *')).toHaveCount(3);
  // Layout items duplicate and delete as whole cards; the accent field recolours the layout.
  await select(page, (await process.locator('> *').nth(1).getAttribute('data-notale-id'))!);
  await openStyle(page);
  await expect(page.locator('#layout-item-tools')).toBeVisible();
  await change(page, () => page.locator('#layout-item-duplicate').click());
  await expect(process.locator('> *')).toHaveCount(4);
  await change(page, () => page.locator('#layout-item-delete').click());
  await expect(process.locator('> *')).toHaveCount(3);
  await select(page, (await process.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await expect(page.locator('#appearance-accent-field')).toBeVisible();
  await commit(page, () => page.locator('#appearance-accent').fill('#ff0000'));
  await expect.poll(() => frame.locator('[data-notale-smart="list"], [data-notale-smart="process"]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe('#ff0000');
  await change(page, () => pick(page, '[data-insert="smart:cycle"]'));
  await expect(frame.locator('[data-notale-smart="cycle"] p')).toHaveCount(3);
  // The ring re-flows for more stages and keeps the text already written.
  const cycleId = (await frame.locator('[data-notale-smart="cycle"]').getAttribute('data-notale-id'))!;
  await select(page, (await frame.locator('[data-notale-smart="cycle"] p').first().getAttribute('data-notale-id'))!);
  await openStyle(page);
  await page.locator('#object-text').fill('准备数据');
  await change(page, () => page.locator('#apply-text').click());
  await select(page, cycleId);
  await openStyle(page);
  await expect(page.locator('#cycle-count-field')).toBeVisible();
  await commit(page, () => page.locator('#cycle-count').fill('5'));
  await expect(frame.locator('[data-notale-smart="cycle"] p')).toHaveCount(5);
  await expect(frame.locator('[data-notale-smart="cycle"] p').first()).toHaveText('准备数据');
  await expect(frame.locator('[data-notale-smart="cycle"] path')).toHaveCount(10);
  await page.screenshot({ path: '.local/insert-gallery-round2-layouts.png' });

  await open(page, doc.id);
  for (const selector of ['svg[data-notale-icon="brain"]', 'pre', '[data-notale-smart="process"]', '[data-notale-smart="cycle"]']) await expect(frame.locator(selector)).toBeVisible();
  await expect(frame.locator('p', { hasText: '训练' })).toBeVisible();
  expect(errors).toEqual([]);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('insert gallery: equations stay atomic, survive nested-page paste, export and the slide show', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '插入库验收 · 完备性';
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  const errors: string[] = [];
  // The lecture's own page script expects the player's `Deck` global; a single page opened
  // outside the player, and the preview overlay, both run it without one. Only other
  // errors count here.
  page.on('pageerror', (error) => { if (!error.message.includes('Deck is not defined')) errors.push(error.message); });
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  await change(page, () => pick(page, '[data-insert="equation"]'));
  await change(page, () => pick(page, '[data-insert="shape:hexagon"]'));
  await change(page, () => pick(page, '[data-insert="icon:rocket"]'));
  const equation = frame.locator('[data-notale-tex]');
  const equationId = (await equation.getAttribute('data-notale-id'))!;

  // Clicking inside the rendered equation selects the whole object; internals stay out of the layer list.
  // The page title overlaps the insertion point, so target the equation's inner span directly.
  await equation.locator('.katex .mord').first().dispatchEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1, isPrimary: true });
  await equation.locator('.katex .mord').first().dispatchEvent('pointerup', { button: 0, bubbles: true, pointerId: 1, isPrimary: true });
  await expect(page.locator('#selection-name')).toHaveText(/公式/);
  await page.locator('[data-tool="objects"]').click();
  await expect(page.locator(`[data-object="${equationId}"]`)).toBeVisible();
  expect(await page.locator('#objects .object-row small', { hasText: /^span$/ }).count()).toBe(0);
  await expect(page.locator('#object-text').locator('xpath=ancestor::label')).toBeHidden();

  // Inline toggle re-renders without display mode and records the choice.
  await select(page, equationId);
  await openStyle(page);
  await reveal(page,'#open-equation-editor');await page.locator('#open-equation-editor').click();
  await page.locator('#equation-inline').check();
  expect(await change(page, () => page.locator('#save-equation').click())).toBe(1);
  await expect(equation).toHaveAttribute('data-notale-tex-display', '0');
  await expect(equation.locator('.katex-display')).toHaveCount(0);

  // Paste onto a nested page: the stylesheet link is rebased and the fonts still resolve.
  const nestedId = randomUUID();
  await page.evaluate(async ({ after, id }) => {
    await (window as any).NotaleWorkbench.commands([{ type: 'slide.insert', after, slide: { id, name: '嵌套公式页', sourcePath: 'chapters/math/page.html', html: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="stage"></main></body></html>' } }]);
  }, { after: doc.slides[0].id, id: nestedId });
  await ready(page);
  await select(page, equationId);
  await page.locator('#canvas-viewport').focus();
  await page.keyboard.press('Control+c');
  await page.evaluate(() => (window as any).NotaleWorkbench.whenEditsIdle());
  await page.locator('[data-tool="pages"]').click();
  await page.locator(`[data-slide="${nestedId}"]`).click();
  await ready(page);
  await page.locator('#canvas-viewport').focus();
  await change(page, () => page.keyboard.press('Control+v'));
  const pasted = frame.locator('[data-notale-tex]');
  await expect(pasted).toHaveCount(1);
  expect(await pasted.locator('link').getAttribute('href')).toMatch(/^\.\.\/\.\.\/assets\/lib\/katex\.min\.css$/);
  await expect.poll(() => katexFont(page)).toContain('KaTeX');

  // Export: the archive carries the stylesheet and the rendered pages keep the objects; the portable player renders them.
  const { unzipSync } = await import('fflate');
  const exported = await page.request.get('/api/documents/' + doc.id + '/export', { timeout: 60000 });
  expect(exported.status()).toBe(200);
  const files = unzipSync(new Uint8Array(await exported.body()));
  expect(files['assets/lib/katex.min.css']).toBeTruthy();
  const firstPage = Buffer.from(files[doc.slides[0].sourcePath]).toString('utf8');
  expect(firstPage).toContain('data-notale-tex');
  expect(firstPage).toContain('data-notale-shape="hexagon"');
  expect(firstPage).toContain('data-notale-icon="rocket"');
  await page.route('**/portable/**', async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice('/portable/'.length));
    const file = files[path];
    await route.fulfill({ status: file ? 200 : 404, body: file ? Buffer.from(file) : 'missing', contentType: path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  });
  await page.goto('/portable/' + doc.slides[0].sourcePath);
  await expect(page.locator('[data-notale-tex] .katex')).toBeVisible();
  expect(await page.locator('[data-notale-tex] .katex').first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain('KaTeX');
  await expect(page.locator('[data-notale-shape="hexagon"]')).toBeVisible();
  await page.screenshot({ path: '.local/insert-gallery-complete-portable.png' });
  await page.unroute('**/portable/**');

  // Slide show renders the same objects on the first page.
  await open(page, doc.id);
  const popup = page.waitForEvent('popup');
  await page.locator('#present').click();
  const show = await popup;
  const present = show.frameLocator('#slides section.present iframe');
  await expect(present.locator('[data-notale-tex] .katex')).toBeVisible();
  await expect(present.locator('svg[data-notale-icon="rocket"]')).toBeVisible();
  await show.screenshot({ path: '.local/insert-gallery-complete-show.png' });
  await show.close();
  expect(errors).toEqual([]);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('appearance panel paints fills, strokes, gradients, radius, shadow and opacity across object types', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '外观面板验收'; doc.slides = [doc.slides[0]];
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  const css = (selector: string, property: string) =>
    frame.locator(selector).first().evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);

  // A vector shape maps fill/stroke to SVG paint properties.
  await change(page, () => pick(page, '[data-insert="shape:hexagon"]'));
  const shape = frame.locator('[data-notale-shape="hexagon"]');
  await select(page, (await shape.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await reveal(page,'#property-appearance');await expect(page.locator('#property-appearance')).toBeVisible();
  await expect(page.locator('#appearance-radius-field')).toBeHidden();
  await commit(page, () => page.locator('#appearance-fill').fill('#ff0000'));
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'fill')).toBe('rgb(255, 0, 0)');
  await commit(page, () => page.locator('#appearance-stroke-width').fill('9'));
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'stroke-width')).toBe('9px');
  await reveal(page,'#appearance-shadow');
  await commit(page, () => page.locator('#appearance-shadow').selectOption('strong'));
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'filter')).toContain('drop-shadow');
  await commit(page, () => page.locator('#appearance-fill-none').check());
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'fill')).toBe('none');
  // Picking a colour restores the paint in one gesture.
  await commit(page, () => page.locator('#appearance-fill').fill('#ffff00'));
  await expect(page.locator('#appearance-fill-none')).not.toBeChecked();
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'fill')).toBe('rgb(255, 255, 0)');
  await change(page, () => page.locator('#undo').click());
  await expect.poll(() => css('[data-notale-shape="hexagon"]', 'fill')).toBe('none');

  // An HTML text box gets background, gradient, radius and opacity.
  await change(page, () => pick(page, '[data-insert="text"]'));
  const text = frame.locator('p', { hasText: '输入你的内容' });
  const textId = (await text.getAttribute('data-notale-id'))!;
  await select(page, textId);
  await openStyle(page);
  await expect(page.locator('#appearance-radius-field')).toBeVisible();
  await commit(page, () => page.locator('#appearance-fill').fill('#0000ff'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'background-color')).toBe('rgb(0, 0, 255)');
  await commit(page, () => page.locator('#appearance-gradient').check());
  expect(await css(`[data-notale-id="${textId}"]`, 'background-image')).toContain('linear-gradient');
  await commit(page, () => page.locator('#appearance-radius').fill('24'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'border-radius')).toBe('24px');
  await commit(page, () => page.locator('#appearance-stroke-width').fill('4'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'border-top-width')).toBe('4px');
  await commit(page, () => page.locator('#appearance-opacity').fill('40'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'opacity')).toBe('0.4');

  // Text box sizing mirrors PowerPoint autofit: hug the text, then go back to a fixed box.
  await expect(page.locator('#appearance-fit-field')).toBeVisible();
  await expect(page.locator('#appearance-fit')).toHaveValue('height');
  const wide = await frame.locator(`[data-notale-id="${textId}"]`).evaluate((el) => el.getBoundingClientRect().width);
  await commit(page, () => page.locator('#appearance-fit').selectOption('both'));
  await expect.poll(() => frame.locator(`[data-notale-id="${textId}"]`).evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(wide);
  await commit(page, () => page.locator('#appearance-fit').selectOption('fixed'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'height')).not.toBe('auto');

  // Reopening reads the authored values back into the fields, and a mixed selection patches both objects.
  await open(page, doc.id);
  await select(page, textId);
  await openStyle(page);
  await expect(page.locator('#appearance-radius')).toHaveValue('24');
  await expect(page.locator('#appearance-opacity')).toHaveValue('40');
  await expect(page.locator('#appearance-gradient')).toBeChecked();
  const shapeId = (await shape.getAttribute('data-notale-id'))!;
  await page.evaluate((ids) => (window as any).NotaleWorkbench.selectMany(ids), [textId, shapeId]);
  await openStyle(page);
  await commit(page, () => page.locator('#appearance-opacity').fill('70'));
  await expect.poll(() => css(`[data-notale-id="${textId}"]`, 'opacity')).toBe('0.7');
  await expect.poll(() => css(`[data-notale-id="${shapeId}"]`, 'opacity')).toBe('0.7');
  await page.screenshot({ path: '.local/appearance-panel.png' });
  expect(errors).toEqual([]);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('insertion lands in view, staggers repeats and follows a drag from the panel', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '插入落点验收'; doc.slides = [doc.slides[0]];
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  const at = (index: number) =>
    frame.locator('[data-notale-shape="star"]').nth(index).evaluate((el) => ({ left: parseFloat((el as HTMLElement).style.left), top: parseFloat((el as HTMLElement).style.top) }));

  // The header carries three entries; the actions live in the 导入 and 导出 menus.
  expect((await page.locator('.app-header button:visible, .app-header summary:visible').allTextContents()).filter((text) => /导入|导出|放映/.test(text))).toEqual(['导入', '导出', '放映 ↗']);
  await expect(page.locator('#export-pdf')).toBeHidden();
  await openHeaderMenu(page, 'export');
  await expect(page.locator('#export-pdf')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-pdf')).toBeHidden();
  // The save indicator states one thing and keeps the detail in its tooltip.
  await expect(page.locator('#save-status')).toHaveText('已保存');
  await expect(page.locator('#save-status')).toHaveAttribute('data-state', 'saved');
  await expect(page.locator('#save-status')).toHaveAttribute('title', /版本 v\d+/);

  // Centred in the visible canvas rather than pinned under the page title.
  await change(page, () => pick(page, '[data-insert="shape:star"]'));
  const first = await at(0);
  expect(first.left).toBeGreaterThan(500);
  expect(first.top).toBeGreaterThan(300);
  // Nothing from the page covers the new object, so it can be grabbed straight away.
  expect(await frame.locator('[data-notale-shape="star"]').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = el.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return el.contains(hit) || hit === el;
  })).toBe(true);

  // The caption inside a shape is an ordinary editable paragraph.
  const caption = frame.locator('[data-notale-shape="star"] p');
  await expect(caption).toHaveText('文字');
  await select(page, (await caption.getAttribute('data-notale-id'))!);
  await openStyle(page);
  await page.locator('#object-text').fill('弱学习器');
  await change(page, () => page.locator('#apply-text').click());
  await expect(frame.locator('[data-notale-shape="star"] p')).toHaveText('弱学习器');
  await expect(frame.locator('[data-notale-shape="star"] svg')).toHaveCount(1);

  // A repeat offsets so both stay visible.
  await change(page, () => pick(page, '[data-insert="shape:star"]'));
  const second = await at(1);
  expect(second.left - first.left).toBe(24);
  expect(second.top - first.top).toBe(24);

  // Dragging an entry onto the canvas drops it at the pointer.
  const canvas = (await page.locator('#canvas').boundingBox())!;
  const target = { x: canvas.x + canvas.width * 0.3, y: canvas.y + canvas.height * 0.7 };
  // Panel entries are real drag sources; the drop is driven directly because Chromium's
  // native drag plumbing is not simulated in this harness.
  await expect(page.locator('[data-insert="shape:diamond"]')).toHaveJSProperty('draggable', true);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await change(page, async () => {
    await page.locator('[data-insert="shape:diamond"]').dispatchEvent('dragstart', { dataTransfer: transfer });
    await expect(page.locator('#insert-drop-overlay')).toBeVisible();
    await page.locator('#insert-drop-overlay').dispatchEvent('drop', { dataTransfer: transfer, clientX: target.x, clientY: target.y });
  });
  await expect(page.locator('#insert-drop-overlay')).toBeHidden();
  const diamond = await frame.locator('[data-notale-shape="diamond"]').evaluate((el) => ({ left: parseFloat((el as HTMLElement).style.left), top: parseFloat((el as HTMLElement).style.top) }));
  const expected = { x: (target.x - canvas.x) * doc.width / canvas.width - 150, y: (target.y - canvas.y) * doc.height / canvas.height - 80 };
  expect(Math.abs(diamond.left - expected.x)).toBeLessThanOrEqual(4);
  expect(Math.abs(diamond.top - expected.y)).toBeLessThanOrEqual(4);
  await page.screenshot({ path: '.local/insert-placement.png' });
});

test('deck theme presets repaint authored pages and inserted objects together', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '主题面板验收'; doc.slides = [doc.slides[0]];
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  const stroke = () => frame.locator('[data-notale-shape="hexagon"]').evaluate((el) => getComputedStyle(el).stroke);
  const titleColor = () => frame.locator('h1').first().evaluate((el) => getComputedStyle(el).color);

  await change(page, () => pick(page, '[data-insert="shape:hexagon"]'));
  const before = { stroke: await stroke(), title: await titleColor() };
  expect(before.stroke).toBe('rgb(23, 98, 142)');

  // The theme lives with the deck, so it is edited with nothing selected.
  await page.locator('#canvas-viewport').press('Escape');
  await openStyleAt(page, '#deck-theme');
  await expect(page.locator('#deck-theme')).toBeVisible();
  await expect(page.locator('#theme-presets button')).toHaveCount(6);
  await change(page, () => page.locator('[data-theme-preset="3"]').click());
  await expect.poll(stroke).toBe('rgb(178, 58, 50)');
  await expect.poll(titleColor).toBe('rgb(36, 20, 19)');

  // Individual tokens stay editable and the choice survives a reopen.
  await commit(page, () => page.locator('[data-theme-token="--model"]').fill('#00ff00'));
  await expect.poll(stroke).toBe('rgb(0, 255, 0)');
  await page.screenshot({ path: '.local/theme-panel.png' });
  await open(page, doc.id);
  await expect.poll(stroke).toBe('rgb(0, 255, 0)');
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('find and replace rewrites matching text across pages in one undo step', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '查找替换验收'; doc.slides = doc.slides.slice(0, 3);
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');

  await page.locator('[data-tool="pages"]').click();
  await page.locator('#open-find-replace').click();
  await expect(page.locator('#find-replace-dialog')).toBeVisible();
  await page.locator('#find-query').fill('集成学习');
  await expect(page.locator('#find-status')).toContainText('找到');
  const matches = Number((await page.locator('#find-status').textContent())!.replace(/\D/g, ''));
  expect(matches).toBeGreaterThan(0);

  // A match jumps to its page and selects the object.
  await page.locator('#find-results button').first().click();
  await expect(page.locator('#find-replace-dialog')).toBeVisible();

  await page.locator('#find-replacement').fill('模型集成');
  const before = await version(page);
  await page.locator('#find-replace-all').click();
  await expect(page.locator('#find-status')).toContainText('已替换');
  await expect.poll(() => version(page), { timeout: 15000 }).toBe(before + 1);
  await ready(page);
  await page.locator('#find-close').click();
  await expect(frame.locator('h1').first()).toContainText('模型集成');

  // One undo restores every page.
  await change(page, () => page.locator('#undo').click());
  await expect(frame.locator('h1').first()).toContainText('集成学习');
  await page.screenshot({ path: '.local/find-replace.png' });
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('page background overrides the deck colour for one page and can apply to all', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '页面背景验收'; doc.slides = doc.slides.slice(0, 2);
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  const background = () => page.frameLocator('#canvas').locator('body').evaluate((el) => getComputedStyle(el).background);
  await page.locator('#canvas-viewport').press('Escape');
  await openStyle(page);
  await expect(page.locator('#page-background')).toBeVisible();

  await commit(page, () => page.locator('#background-color').fill('#ffdd00'));
  await expect.poll(background).toContain('rgb(255, 221, 0)');
  await commit(page, () => page.locator('#background-gradient').check());
  await expect.poll(background).toContain('linear-gradient');

  // The second page keeps the deck colour until "apply to all".
  await page.locator('[data-tool="pages"]').click();
  await page.locator(`[data-slide="${doc.slides[1].id}"]`).click();
  await ready(page);
  expect(await background()).not.toContain('linear-gradient');
  await page.locator(`[data-slide="${doc.slides[0].id}"]`).click();
  await ready(page);
  await openStyle(page);
  await change(page, () => page.locator('#background-apply-all').click());
  await page.locator('[data-tool="pages"]').click();
  await page.locator(`[data-slide="${doc.slides[1].id}"]`).click();
  await ready(page);
  await expect.poll(background).toContain('linear-gradient');

  // Reset returns the page to the deck colour.
  await openStyle(page);
  await change(page, () => page.locator('#background-reset').click());
  await expect.poll(background).not.toContain('linear-gradient');
  await page.screenshot({ path: '.local/page-background.png' });
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('PDF export prints one page per visible slide at the deck size', async ({ page, context }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = 'PDF 导出验收'; doc.slides = doc.slides.slice(0, 3);
  doc.slides[2].hidden = true;
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  // Printing cannot be driven headlessly, so record the call instead of opening a dialog.
  await context.addInitScript(() => { (window as any).__printed = 0; window.print = () => { (window as any).__printed++; }; });
  await open(page, doc.id);
  await openHeaderMenu(page, 'export');
  const sheetPromise = page.waitForEvent('popup');
  await page.locator('#export-pdf').click();
  const sheet = await sheetPromise;
  await expect(sheet.locator('.print-page')).toHaveCount(2);
  await expect(sheet.locator('iframe')).toHaveCount(2);
  const size = await sheet.locator('.print-page').first().evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  expect(size).toEqual({ width: doc.width, height: doc.height });
  await expect(sheet.frameLocator('iframe >> nth=0').locator('h1').first()).toBeVisible();
  await expect.poll(() => sheet.evaluate(() => (window as any).__printed), { timeout: 30000 }).toBeGreaterThan(0);
  await expect(sheet.locator('#print-hint')).toHaveCount(0);
  await sheet.screenshot({ path: '.local/pdf-export-sheet.png' });
  await sheet.close();
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('comments attach to pages and objects, reply, resolve and stay out of the show', async ({ page }) => {
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  const doc = structuredClone(baseline.document);
  doc.id = randomUUID(); doc.title = '批注验收'; doc.slides = doc.slides.slice(0, 2);
  expect((await page.request.post('/api/documents', { data: doc })).status()).toBe(201);
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');

  await page.locator('#toggle-comments').click();
  await expect(page.locator('#comments-panel')).toBeVisible();
  await expect(page.locator('#comments-list')).toContainText('还没有批注');

  // A page comment.
  await page.locator('#comment-author').fill('讲师');
  await page.locator('#comment-text').fill('这一页需要一个例子');
  await change(page, () => page.locator('#comment-form button[type="submit"]').click());
  await expect(page.locator('.comment')).toHaveCount(1);
  await expect(page.locator('.comment')).toContainText('这一页需要一个例子');
  await expect(page.locator('.comment small')).toHaveText('整页');

  // A comment anchored to a selected object records its name.
  await change(page, () => pick(page, '[data-insert="shape:star"]'));
  await select(page, (await frame.locator('[data-notale-shape="star"]').getAttribute('data-notale-id'))!);
  await expect(page.locator('#comment-anchor-label')).toBeVisible();
  await page.locator('#comment-anchor').check();
  await page.locator('#comment-text').fill('这个形状改成图标');
  await change(page, () => page.locator('#comment-form button[type="submit"]').click());
  await expect(page.locator('.comment')).toHaveCount(2);
  await expect(page.locator('.comment').last().locator('small')).toHaveText('五角星');

  // Replying and resolving keep one record per thread.
  await page.locator('.comment').first().locator('input').fill('下周补一个');
  await change(page, () => page.locator('.comment').first().locator('[data-comment-action="reply"]').click());
  await expect(page.locator('.comment').first().locator('.comment-reply')).toHaveText(/下周补一个/);
  await change(page, () => page.locator('.comment').first().locator('[data-comment-action="resolve"]').click());
  await expect(page.locator('.comment')).toHaveCount(1);
  await page.locator('#comments-resolved').check();
  await expect(page.locator('.comment.is-resolved')).toHaveCount(1);

  // Comments live with the document, so the show never renders them.
  const popup = page.waitForEvent('popup');
  await page.locator('#present').click();
  const show = await popup;
  await expect(show.locator('#slides section.present iframe')).toBeVisible();
  expect(await show.locator('body').textContent()).not.toContain('这一页需要一个例子');
  await show.close();

  await page.screenshot({ path: '.local/comments-panel.png' });
  await open(page, doc.id);
  await page.locator('#toggle-comments').click();
  await expect(page.locator('.comment')).toHaveCount(1);
  const stored = (await (await page.request.get('/api/documents/' + doc.id)).json()).document.comments;
  expect(stored).toHaveLength(2);
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('PPTX import creates an editable lecture from a real template', async ({ page }) => {
  const source = '../秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx';
  const baseline = await (await page.request.get('/api/documents/' + original)).json();
  await open(page, original);
  await page.locator('#import-pptx').setInputFiles(source);
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document.id), { timeout: 60000 })
    .not.toBe(original);
  await expect(page.locator('#save-status')).toContainText('已保存', { timeout: 30000 });
  await ready(page);
  const doc = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document);
  expect(doc.title).toContain('秀钟书院');
  // 12192000 x 6858000 EMU is a 16:9 deck at 96dpi.
  expect({ width: doc.width, height: doc.height }).toEqual({ width: 1280, height: 720 });
  expect(doc.slides).toHaveLength(7);
  // This template keeps its artwork in the masters and its only slide picture is an EMF,
  // which browsers cannot render, so the importer reports it as skipped.
  await expect(page.locator('#toast')).toContainText('跳过');

  // Imported text is an ordinary editable object.
  const frame = page.frameLocator('#canvas');
  const text = (await page.evaluate(() => (window as any).NotaleWorkbench.getObjects())).find((o: any) => o.tag === 'p' && o.text.trim());
  expect(text).toBeTruthy();
  await select(page, text.id);
  await openStyle(page);
  await page.locator('#object-text').fill('导入后改写');
  await change(page, () => page.locator('#apply-text').click());
  await expect(frame.locator('p', { hasText: '导入后改写' })).toBeVisible();
  await page.screenshot({ path: '.local/pptx-import.png' });
  expect((await (await page.request.get('/api/documents/' + original)).json()).version).toBe(baseline.version);
});

test('PPTX import places pictures and their positions', async ({ page }) => {
  // A minimal deck exercises the picture path, which the shipped template cannot: one text
  // frame and one PNG at a known offset.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M+AFzCOKhhVMPwUAADAcwGm4G3CQgAAAABJRU5ErkJggg==', 'base64');
  const { zipSync, strToU8 } = await import('fflate');
  const slide = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>
   <p:sp><p:nvSpPr><p:cNvPr id="2" name="标题"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="952500" y="476250"/><a:ext cx="7620000" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-CN" sz="4400" b="1"/><a:t>导入的标题</a:t></a:r></a:p><a:p><a:r><a:rPr lang="zh-CN" sz="2000"/><a:t>第二行</a:t></a:r></a:p></p:txBody></p:sp>
   <p:pic><p:nvPicPr><p:cNvPr id="3" name="图片"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="1905000" y="2857500"/><a:ext cx="2857500" cy="1905000"/></a:xfrm></p:spPr></p:pic>
  </p:spTree></p:cSld></p:sld>`;
  const zip = zipSync({
    'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>'),
    'ppt/slides/slide1.xml': strToU8(slide),
    'ppt/slides/_rels/slide1.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'),
    'ppt/media/image1.png': new Uint8Array(png),
  });
  await open(page, original);
  await page.locator('#import-pptx').setInputFiles({ name: '最小演示.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(zip) });
  await expect
    .poll(() => page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document.id), { timeout: 60000 })
    .not.toBe(original);
  await ready(page);
  const doc = await page.evaluate(() => (window as any).NotaleWorkbench.getSnapshot().document);
  expect({ width: doc.width, height: doc.height }).toEqual({ width: 960, height: 720 });
  expect(doc.slides[0].name).toContain('导入的标题');
  expect(Object.keys(doc.assets)).toEqual(['media/pptx/image1.png']);
  const frame = page.frameLocator('#canvas');
  await expect(frame.locator('p', { hasText: '导入的标题' })).toBeVisible();
  await expect(frame.locator('p', { hasText: '第二行' })).toBeVisible();
  // 952500 EMU is 100px and 4400 hundredths of a point is 44px.
  const heading = await frame.locator('p', { hasText: '导入的标题' }).evaluate((el) => ({ size: getComputedStyle(el).fontSize, align: getComputedStyle(el).textAlign, weight: getComputedStyle(el).fontWeight }));
  expect(heading).toEqual({ size: '44px', align: 'center', weight: '700' });
  const box = await frame.locator('img').evaluate((el) => ({ left: (el as HTMLElement).style.left, top: (el as HTMLElement).style.top, width: (el as HTMLElement).style.width }));
  expect(box).toEqual({ left: '200px', top: '300px', width: '300px' });
  await expect.poll(() => frame.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: '.local/pptx-import-minimal.png' });
});
