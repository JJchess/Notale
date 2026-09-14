/** The actual notale-v2 lab assembly shell, with portable asset paths. */
import { readFileSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { RESOURCES } from './guidance.js';
import { acquireVisualChecker, browser, staticServer } from '../tools/visual-check.js';
import { validPreviewSnapshot } from './preview-snapshot.js';

const source = path.join(RESOURCES, 'preview');
let thumbnailSlots = 2;
const thumbnailWaiters: Array<() => void> = [];
export async function queueLectureThumbnail(root: string, pid: string, signal?: AbortSignal): Promise<void> {
  if (thumbnailSlots > 0) thumbnailSlots--; else await new Promise<void>(resolve => thumbnailWaiters.push(resolve));
  try { signal?.throwIfAborted(); await prepareLecturePreview(root, [pid], signal ? { signal } : {}); }
  finally { const next = thumbnailWaiters.shift(); if (next) next(); else thumbnailSlots++; }
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function lecturePreview(title: string, pages: string[], titles: Record<string, string> = {}, codePages: string[] = []): string {
  if (!pages.length) return '<!doctype html><meta charset="utf-8"><p>本次未留下页面产物，请查看 Builder 结果。</p>';
  const sections = pages.map((pid, i) => {
    const label = escape(titles[pid] || pid);
    return `<section data-name="${escape(pid)}.html"${codePages.includes(pid) ? ' data-preview-code' : ''}><iframe class="preview-frame" data-preview-src="${escape(pid)}.html" title="${label}" allow="autoplay"></iframe><div class="overview-card"><img data-preview-thumbnail="assets/preview/thumbnails/${escape(pid)}.png" alt="${label}"><div class="overview-label">${String(i + 1).padStart(2, '0')} · ${label}</div></div></section>`;
  }).join('\n');
  const values: Record<string, string> = { n: String(pages.length), sections, reveal_css: 'assets/preview/reveal.css', reveal_js: 'assets/preview/reveal.js', preview_js: 'assets/preview/preview.js' };
  return readFileSync(path.join(source, 'shell.html'), 'utf8')
    .replaceAll('{{', '{').replaceAll('}}', '}')
    .replace(/\{(n|sections|reveal_css|reveal_js|preview_js)\}/g, (_, key: string) => values[key]!)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`);
}

/** Thumbnails are assembly assets, not a new generation/quality gate. */
export async function prepareLecturePreview(root: string, pages: string[], options: { thumbnailRoot?: string; signal?: AbortSignal } = {}): Promise<void> {
  if (!pages.length) return;
  const assets = path.join(root, 'assets/preview');
  await mkdir(path.join(assets, 'thumbnails'), { recursive: true });
  for (const name of ['preview.js', 'reveal.js', 'reveal.css']) await cp(path.join(source, name), path.join(assets, name));
  if (options.thumbnailRoot) {
    // Explicit callers must establish that these captures match unchanged pages/assets.
    for (const pid of pages) {
      await cp(path.join(options.thumbnailRoot, pid + '.png'), path.join(assets, 'thumbnails', pid + '.png'));
      await cp(path.join(options.thumbnailRoot, pid + '.png'), path.join(assets, 'thumbnails', pid + '-last.png'));
    }
    return;
  }
  const missing: string[] = [];
  for (const pid of pages) {
    const shots = path.join(path.dirname(root), '.shots'), source = path.join(root, pid + '.html');
    const last = path.join(shots, pid + '.png'), first = path.join(shots, pid + '-step0.png');
    if (await validPreviewSnapshot(last, source)) {
      await cp(last, path.join(assets, 'thumbnails', pid + '-last.png'));
      if (await validPreviewSnapshot(first, source)) await cp(first, path.join(assets, 'thumbnails', pid + '.png'));
      else if (!/data-deck-step|Deck\.onStep/.test(readFileSync(source, 'utf8'))) await cp(last, path.join(assets, 'thumbnails', pid + '.png'));
      else { missing.push(pid); }
    } else missing.push(pid);
  }
  if (!missing.length) return;
  const release = acquireVisualChecker();
  try {
    const active = await browser(), server = await staticServer(root);
    let cursor = 0;
    await Promise.all([0, 1].map(async () => { while (cursor < missing.length) {
      const pid = missing[cursor++]!;
      options.signal?.throwIfAborted();
      const page = await active.newPage({ viewport: { width: 1600, height: 900 } });
      const abort = () => { void page.close().catch(() => {}); };
      const timer = setTimeout(abort, 45000);
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        await page.goto(server.origin + '/' + pid + '.html', { waitUntil: 'load', timeout: 45000 });
        await page.locator('#stage').waitFor({ timeout: 45000 });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(image => image.getBoundingClientRect().width > 0).map(image => image.decode())); });
        const code = page.frames().find(frame => frame.url().endsWith('/' + pid + '/index.html'));
        if (code) await code.waitForFunction('window.CodeLab && CodeLab.getState().viewReady', undefined, { timeout: 45000 });
        await page.evaluate('window.Deck?.stepTo(0)');
        await page.screenshot({ path: path.join(assets, 'thumbnails', pid + '.png') });
        await page.evaluate('window.Deck?.stepTo(Deck.stepMax)');
        await page.screenshot({ path: path.join(assets, 'thumbnails', pid + '-last.png') });
      } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); await page.close(); }
    } }));
  } finally { await release(); }
}
