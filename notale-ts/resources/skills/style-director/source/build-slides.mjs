// Render the editable lecture-page sources to the 40 runtime reference PNGs.
// Run from notale-ts after installing dependencies and a Playwright Chromium browser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = readFileSync(join(root, '..', 'INDEX.md'), 'utf8');
const ids = [...catalog.matchAll(/^\| (\d{2}-[a-z0-9-]+) \|/gm)].map(match => match[1]);
if (ids.length !== 40 || new Set(ids).size !== 40) throw new Error('Expected 40 unique style IDs');
const firstEight = new Set([
  '04-glassmorphism', '08-brutalism', '13-cyberpunk', '18-collage',
  '23-material-design', '27-isometric', '34-monochrome-photography', '39-low-poly-3d',
]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.NOTALE_CHROMIUM_PATH ? { executablePath: process.env.NOTALE_CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  for (const id of ids) {
    const template = firstEight.has(id) ? 'lecture.html' : 'lecture-extra.html';
    const url = pathToFileURL(join(root, template));
    url.searchParams.set('style', id);
    const response = await page.goto(url.href, { waitUntil: 'load' });
    if (response && !response.ok()) throw new Error(`Could not load ${id}: HTTP ${response.status()}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.screenshot({ path: join(root, '..', 'shots', `${id}.png`) });
  }
} finally {
  await browser.close();
}
console.log('Rendered 40 lecture-page style references');
