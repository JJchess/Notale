/** Local screenshot evidence; never inserted into model responses. */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
const digests = new Map<string, { stamp: string; hash: string }>();
async function digest(file: string): Promise<string> {
  const info = await stat(file), stamp = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  if (digests.get(file)?.stamp === stamp) return digests.get(file)!.hash;
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digests.size > 4096) digests.clear();
  digests.set(file, { stamp, hash }); return hash;
}
type Evidence = { source: string; png: string; imageHash: string; dependencies: Array<[string, string]> };
export async function recordPreviewSnapshot(page: Page, source: string, png: string): Promise<void> {
  try {
    const root = path.dirname(path.resolve(source)), files = new Set([path.resolve(source)]);
    for (const frame of page.frames()) {
      const urls = await frame.evaluate(() => [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)]);
      for (const url of urls) {
        if (!url.startsWith('file:')) { if (!url.startsWith('data:') && url !== 'about:blank') return; continue; }
        const file = fileURLToPath(new URL(url)); if (!file.startsWith(root + path.sep)) return;
        files.add(file);
      }
    }
    const evidence: Evidence = { source: path.resolve(source), png: path.resolve(png), imageHash: await digest(png), dependencies: await Promise.all([...files].map(async file => [file, await digest(file)] as [string, string])) };
    await writeFile(png + '.evidence.json', JSON.stringify(evidence));
  } catch { /* Unverifiable screenshots simply require a fresh thumbnail. */ }
}
export async function validPreviewSnapshot(png: string, source: string): Promise<boolean> {
  try {
    const evidence = JSON.parse(await readFile(png + '.evidence.json', 'utf8')) as Evidence;
    if (evidence.source !== path.resolve(source) || evidence.png !== path.resolve(png) || evidence.imageHash !== await digest(png)) return false;
    return (await Promise.all(evidence.dependencies.map(async ([file, hash]) => await digest(file) === hash))).every(Boolean);
  } catch { return false; }
}
