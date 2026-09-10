import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
  await expect(page.locator('#shape-gallery button')).toHaveCount(12);
  await expect(page.locator('#shape-gallery button svg')).toHaveCount(12);
  await change(page, () => page.locator('[data-insert="shape:star"]').click());
  const star = frame.locator('svg[data-notale-shape="star"]');
  await expect(star).toBeVisible();
  expect(await fill(page, 'svg[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');
  // Page 1's title overlaps the insertion point, so select through the layer list.
  await select(page, (await star.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#shape-fill-field')).toBeVisible();
  await expect(page.locator('#object-fill')).toHaveValue('#dee8ff');
  await change(page, () => page.locator('#object-fill').fill('#ff0000'));
  await expect.poll(() => fill(page, 'svg[data-notale-shape="star"] path')).toBe('rgb(255, 0, 0)');
  await change(page, () => page.locator('#object-stroke').fill('#00ff00'));
  expect(await frame.locator('svg[data-notale-shape="star"] path').evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(0, 255, 0)');
  await page.screenshot({ path: '.local/insert-gallery-shape.png' });
  await change(page, () => page.locator('#undo').click());
  await change(page, () => page.locator('#undo').click());
  await expect.poll(() => fill(page, 'svg[data-notale-shape="star"] path')).toBe('rgb(222, 232, 255)');

  // Equation on a lecture that already carries KaTeX CSS: one version, no new asset.
  const assetsBefore = Object.keys((await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets).length;
  await page.locator('[data-tool="insert"]').click();
  expect(await change(page, () => page.locator('[data-insert="equation"]').click())).toBe(1);
  const equation = frame.locator('[data-notale-tex]');
  await expect(equation).toHaveAttribute('data-notale-tex', DEFAULT_TEX);
  await expect(equation.locator('.katex')).toBeVisible();
  await expect.poll(() => katexFont(page)).toContain('KaTeX');
  expect(Object.keys((await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets).length).toBe(assetsBefore);
  await page.screenshot({ path: '.local/insert-gallery-equation.png' });

  // Re-edit through the equation dialog: content and source attribute change together in one version.
  await select(page, (await equation.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#open-equation-editor')).toBeVisible();
  await page.locator('#open-equation-editor').click();
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
  await page.locator('[data-tool="insert"]').click();
  await page.locator('[data-insert-category="symbols"] > summary').click();
  await change(page, () => page.locator('[data-insert="symbol"][data-symbol="∑"]').click());
  await expect(frame.locator('p', { hasText: '∑' })).toBeVisible();
  await page.screenshot({ path: '.local/insert-gallery-symbol.png' });

  // Reopen: everything survives the round trip.
  await open(page, doc.id);
  await expect(frame.locator('svg[data-notale-shape="star"]')).toBeVisible();
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
  expect(await change(page, () => page.locator('[data-insert="equation"]').click())).toBe(1);
  await expect(page.frameLocator('#canvas').locator('[data-notale-tex] .katex')).toBeVisible();
  await expect.poll(() => katexFont(page)).toContain('KaTeX');
  const assets = (await (await page.request.get('/api/documents/' + doc.id)).json()).document.assets;
  expect(Object.keys(assets).length).toBe(count + 1);
  expect(assets['assets/lib/katex.min.css']).toBeTruthy();
  // A second equation reuses the stored stylesheet.
  expect(await change(page, () => page.locator('[data-insert="equation"]').click())).toBe(1);
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
  await page.locator('[data-insert-category="icons"] > summary').click();
  await expect(page.locator('#icon-gallery button')).toHaveCount(48);
  await expect(page.locator('#icon-gallery button svg')).toHaveCount(48);
  await change(page, () => page.locator('[data-insert="icon:brain"]').click());
  const icon = frame.locator('svg[data-notale-icon="brain"]');
  await expect(icon).toBeVisible();
  const accent = await pageAccent(page);
  expect(await stroke('svg[data-notale-icon="brain"] path')).toBe(accent);
  await select(page, (await icon.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#shape-stroke-field')).toBeVisible();
  await expect(page.locator('#shape-fill-field')).toBeHidden();
  await change(page, () => page.locator('#object-stroke').fill('#ff0000'));
  await expect.poll(() => stroke('svg[data-notale-icon="brain"] path')).toBe('rgb(255, 0, 0)');
  await change(page, () => page.locator('#undo').click());
  await expect.poll(() => stroke('svg[data-notale-icon="brain"] path')).toBe(accent);

  // Word art stays a paragraph: editable text with the preset style.
  await page.locator('[data-tool="insert"]').click();
  await change(page, () => page.locator('[data-insert="wordart:gradient"]').click());
  const art = frame.locator('p', { hasText: '艺术字' });
  await expect(art).toBeVisible();
  expect(await art.evaluate((el) => (getComputedStyle(el) as any).webkitBackgroundClip)).toBe('text');
  await select(page, (await art.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#object-text')).toHaveValue('艺术字');

  // Date and code block.
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  await page.locator('[data-tool="insert"]').click();
  await change(page, () => page.locator('[data-insert="date"]').click());
  await expect(frame.locator('p', { hasText: today })).toBeVisible();
  await change(page, () => page.locator('[data-insert="code"]').click());
  const code = frame.locator('pre');
  await expect(code).toContainText('def predict');
  await select(page, (await code.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#object-text')).toHaveValue(/def predict/);
  await page.screenshot({ path: '.local/insert-gallery-round2-text.png' });

  // Process layout: leaves are editable paragraphs, the container keeps its structure.
  await page.locator('[data-tool="insert"]').click();
  await page.locator('[data-insert-category="smart"] > summary').click();
  await change(page, () => page.locator('[data-insert="smart:process"]').click());
  const process = frame.locator('[data-notale-smart="process"]');
  await expect(process.locator('> *')).toHaveCount(3);
  const step = frame.locator('p', { hasText: '步骤一' });
  await expect(step).toBeVisible();
  await select(page, (await step.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await page.locator('#object-text').fill('训练');
  expect(await change(page, () => page.locator('#apply-text').click())).toBe(1);
  await expect(frame.locator('p', { hasText: '训练' })).toBeVisible();
  await expect(process.locator('> *')).toHaveCount(3);
  // Layout items duplicate and delete as whole cards; the accent field recolours the layout.
  await select(page, (await process.locator('> *').nth(1).getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#layout-item-tools')).toBeVisible();
  await change(page, () => page.locator('#layout-item-duplicate').click());
  await expect(process.locator('> *')).toHaveCount(4);
  await change(page, () => page.locator('#layout-item-delete').click());
  await expect(process.locator('> *')).toHaveCount(3);
  await select(page, (await process.getAttribute('data-notale-id'))!);
  await page.locator('[data-tool="style"]').click();
  await expect(page.locator('#accent-field')).toBeVisible();
  await change(page, () => page.locator('#object-accent').fill('#ff0000'));
  await expect.poll(() => frame.locator('[data-notale-smart="list"], [data-notale-smart="process"]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe('#ff0000');
  await page.locator('[data-tool="insert"]').click();
  await change(page, () => page.locator('[data-insert="smart:cycle"]').click());
  await expect(frame.locator('[data-notale-smart="cycle"] p')).toHaveCount(3);
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
  // A single exported page opened outside the player runs the lecture's own scripts without the Deck global; only editor errors count.
  page.on('pageerror', (error) => { if (!page.url().includes('/portable/')) errors.push(error.message); });
  await open(page, doc.id);
  const frame = page.frameLocator('#canvas');
  await page.locator('[data-tool="insert"]').click();
  await change(page, () => page.locator('[data-insert="equation"]').click());
  await change(page, () => page.locator('[data-insert="shape:hexagon"]').click());
  await page.locator('[data-insert-category="icons"] > summary').click();
  await change(page, () => page.locator('[data-insert="icon:rocket"]').click());
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
  await page.locator('[data-tool="style"]').click();
  await page.locator('#open-equation-editor').click();
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
  await expect(page.locator('svg[data-notale-shape="hexagon"]')).toBeVisible();
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
