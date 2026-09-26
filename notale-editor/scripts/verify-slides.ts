import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.EDITOR_URL ?? 'http://127.0.0.1:4310';
const docs = await (await fetch(origin + '/api/documents')).json();
const id =
  process.argv[2] ?? docs.find((d: { title: string }) => d.title === '集成学习 · 完整资源讲义')?.id;
if (!id) throw new Error('Import a complete fixture first');
const snapshot = await (await fetch(origin + `/api/documents/${id}`)).json(),
  previews = await (
    await fetch(origin + `/api/documents/${id}/preview?version=${snapshot.version}`)
  ).json();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const results = [];
for (const slide of snapshot.document.slides) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
    errors: string[] = [],
    missing: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400)
      missing.push(`${r.status()} ${r.url().replace(/\/content\/[^/]+\//, '/content/<grant>/')}`);
  });
  const started = Date.now();
  try {
    await page.goto(previews.slides.find((s: { id: string }) => s.id === slide.id).url, {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForFunction(() => !!(window as any).NotaleBridge, {}, { timeout: 10000 });
    const state = await page.evaluate(() => {
      const bridge = (window as any).NotaleBridge;
      bridge.seek(bridge.state().max, false);
      return {
        ...bridge.state(),
        objects: bridge.measure().length,
        canvases: document.querySelectorAll('canvas').length,
        svg: document.querySelectorAll('svg').length,
        text: document.body.textContent?.trim().length,
      };
    });
    if (slide.sourcePath === 'page-18.html') await page.waitForTimeout(5000);
    results.push({
      path: slide.sourcePath,
      ...state,
      errors,
      missing,
      elapsedMs: Date.now() - started,
    });
    console.log(
      `${slide.sourcePath}: ${state.objects} objects, ${state.max} steps, ${errors.length} errors, ${missing.length} missing`,
    );
  } catch (e) {
    results.push({ path: slide.sourcePath, error: String(e), errors, missing });
  } finally {
    await page.close();
  }
}
await browser.close();
await mkdir('.local', { recursive: true });
await writeFile(
  process.env.SLIDES_AUDIT_PATH ?? '.local/slides-audit.json',
  JSON.stringify(
    { documentId: id, version: snapshot.version, date: new Date().toISOString(), results },
    null,
    2,
  ),
);
if (results.some((r) => r.error || r.errors.length || r.missing.length)) process.exitCode = 1;
