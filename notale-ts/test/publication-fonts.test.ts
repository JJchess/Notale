import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishLecture } from '../src/core/publication.js';
import { FONT_ROOT } from '../src/core/style-assets.js';

test('relative publication paths still subset registered fonts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-font-publication-'));
  try {
    const pages = path.join(root, 'pages');
    await mkdir(path.join(pages, 'assets'), { recursive: true });
    await cp(path.join(FONT_ROOT, 'inter/face-0.ttf'), path.join(pages, 'assets/inter.ttf'));
    await writeFile(path.join(pages, 'index.html'), '<!doctype html><link rel="stylesheet" href="assets/theme.css"><p>Binary search 123</p>');
    await writeFile(path.join(pages, 'assets/theme.css'), '@font-face{font-family:Test;src:url("inter.ttf")}body{font-family:Test}');
    const output = path.join(root, 'output');
    await publishLecture(path.relative(process.cwd(), pages), path.relative(process.cwd(), output));
    const metadata = JSON.parse(await readFile(path.join(output, 'publication.json'), 'utf8'));
    assert.equal(metadata.fonts, 1);
    const css = await readFile(path.join(output, 'assets/theme.css'), 'utf8');
    assert.match(css, /unicode-range/);
    assert.match(css, /format\("woff2"\)/);
    assert.doesNotMatch(css, /url\("inter\.ttf"\)/);
    assert.match(await readFile(path.join(pages, 'assets/theme.css'), 'utf8'), /inter\.ttf/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
