import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lookup } from 'mime-types';
import { documentSchema, slideSchema } from '../src/domain/model.js';
import { importHtml } from '../src/domain/html.js';

const directory = resolve(process.argv[2] ?? '../notale-v2/runs/ens-trim-full-0907/pages');
const origin = process.env.EDITOR_URL ?? 'http://127.0.0.1:4310';
async function post(path: string, body: unknown) {
  const r = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}
const pageNames = (await readdir(directory)).filter((p) => /^page-\d+\.html$/.test(p)).sort();
if (!pageNames.length) throw new Error('No page-NN.html slides found');
const selected = process.env.EDITOR_SAMPLE_PAGES?.split(',');
const slides = [];
for (const name of pageNames) {
  if (selected && !selected.includes(name)) continue;
  const source = await readFile(resolve(directory, name), 'utf8');
  slides.push(slideSchema.parse({ id: randomUUID(), sourcePath: name, ...importHtml(source) }));
}
const doc = documentSchema.parse({
  schemaVersion: 1,
  id: randomUUID(),
  title: process.argv[3] ?? '集成学习 · 可编辑讲义',
  slides,
});
let bytes = 0;
async function walk(dir: string, ancestors = new Set<string>()) {
  const realDir = await realpath(dir);
  if (ancestors.has(realDir)) throw new Error(`Cyclic dependency symlink: ${dir}`);
  const branch = new Set([...ancestors, realDir]);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name),
      info = await stat(path);
    if (info.isDirectory()) {
      await walk(path, branch);
      continue;
    }
    // Package only authored browser dependencies; skip Python diagnostics and hidden files.
    if (
      entry.name.startsWith('.') ||
      entry.name === 'selfcheck.py' ||
      ['.pyc', '.md', '.map'].includes(extname(entry.name))
    )
      continue;
    const resolved = await realpath(path);
    if (!(await stat(resolved)).isFile()) continue;
    const data = await readFile(resolved);
    bytes += data.length;
    if (bytes > 150_000_000) throw new Error('Dependency bundle exceeds 150 MB');
    const asset = await post('/api/assets', {
      data: data.toString('base64'),
      mime: lookup(entry.name) || 'application/octet-stream',
    });
    doc.assets[relative(directory, path).split(sep).join('/')] = asset;
  }
}
await walk(resolve(directory, 'assets'));
const result = await post('/api/documents', doc);
console.log(
  JSON.stringify(
    {
      id: result.document.id,
      version: result.version,
      slides: slides.length,
      assets: Object.keys(doc.assets).length,
      bytes,
      url: `${origin}/workbench.html?document=${doc.id}`,
    },
    null,
    2,
  ),
);
