import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportWorkspace, readWorkspace, DECK_FILE } from '../src/server/agent/workspace.js';
import { diffDocuments } from '../src/domain/document-diff.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { commitSchema, type Command, type DeckDocument } from '../src/domain/model.js';
import { sha256 } from '../src/server/store.js';

const png = Buffer.from('89504e470d0a1a0a', 'hex');
const page = (id: string, text: string) => ({ id, name: id, sourcePath: `pages/${id}.html`,
  html: `<!doctype html><html><body><main id="stage" data-notale-id="stage-${id}"><h1 data-notale-id="t-${id}">${text}</h1><img data-notale-id="i-${id}" src="../media/a.png"></main></body></html>` });
const deck = (): DeckDocument => validateDocument({ schemaVersion: 1, id: 'doc', title: 't', theme: { '--ink': '#111' },
  assets: { 'media/a.png': { hash: sha256(png), mime: 'image/png', size: png.length } },
  slides: [page('p1', '一'), page('p2', '二'), page('p3', '三')] });
const uploads: Buffer[] = [];
const upload = async (data: Buffer, mime: string) => { uploads.push(data); return { hash: sha256(data), mime, size: data.length }; };
async function round(edit: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'notale-ws-'));
  try {
    const base = deck();
    await exportWorkspace(dir, base, async () => png);
    await edit(dir);
    const commands = diffDocuments(base, await readWorkspace(dir, base, upload));
    const next = commands.length ? applyCommands(base, commitSchema.parse({ baseVersion: 1, mutationId: 'm', commands }).commands as Command[]) : base;
    return { commands, next, base };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const setPages = async (dir: string, pages: string[]) => {
  const file = join(dir, DECK_FILE), data = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...data, pages }));
};

test('an untouched workspace reads back as no change at all', async () => {
  const { commands } = await round(async () => {});
  assert.deepEqual(commands, []);
});
test('editing one page is one replacement, and its author ids survive', async () => {
  const { commands, next } = await round(async dir => {
    const file = join(dir, 'pages/p2.html');
    await writeFile(file, (await readFile(file, 'utf8')).replace('>二<', ' style="color:#c00">二（改）<'));
  });
  assert.deepEqual(commands.map(c => c.type), ['slide.replace']);
  assert.match(next.slides[1].html, /<h1 style="color:#c00" data-notale-id="t-p2">二（改）/);
});
test('a new page lands where deck.json puts it; a removed one is deleted', async () => {
  const { commands, next } = await round(async dir => {
    await writeFile(join(dir, 'pages/extra.html'), '<!doctype html><html><body><main id="stage"><h1>新</h1></main></body></html>');
    await setPages(dir, ['pages/p1.html', 'pages/extra.html', 'pages/p3.html']);
  });
  assert.deepEqual(commands.map(c => c.type).sort(), ['slide.delete', 'slide.insert']);
  assert.deepEqual(next.slides.map(s => s.id), ['p1', 'extra', 'p3']);
  assert.equal(next.slides[1].sourcePath, 'pages/extra.html');
});
test('reordering alone is moves, and lands in the listed order', async () => {
  const { commands, next } = await round(async dir => setPages(dir, ['pages/p3.html', 'pages/p1.html', 'pages/p2.html']));
  assert.ok(commands.every(c => c.type === 'slide.move'));
  assert.deepEqual(next.slides.map(s => s.id), ['p3', 'p1', 'p2']);
});
test('a file the agent adds is uploaded as an asset; one it deletes is removed; theme edits reach the deck', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const { commands, next } = await round(async dir => {
    await writeFile(join(dir, 'media/chart.svg'), svg);
    await unlink(join(dir, 'media/a.png'));
    const file = join(dir, DECK_FILE), data = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...data, theme: { '--ink': '#222' } }));
  });
  assert.deepEqual(commands.map(c => c.type).sort(), ['asset.put', 'asset.remove', 'deck.update']);
  assert.equal(next.assets['media/chart.svg']?.mime, 'image/svg+xml');
  assert.equal(next.assets['media/a.png'], undefined);
  assert.equal(next.theme['--ink'], '#222');
  assert.ok(uploads.some(data => data.equals(svg)));
});
test('page data edited in the sidecar travels with the page', async () => {
  const { commands, next } = await round(async dir => {
    const file = join(dir, 'pages/p1.notale.json'), data = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...data, notes: '先问学生' }));
  });
  assert.deepEqual(commands.map(c => c.type), ['slide.replace']);
  assert.equal(next.slides[0].notes, '先问学生');
});
test('a page whose stored step count differs from what its html implies is left alone when untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notale-ws-'));
  try {
    const base = validateDocument({ schemaVersion: 1, id: 'doc', title: 't', slides: [{ ...page('p1', '一'), nativeStepCount: 0, html: page('p1', '一').html.replace('<h1', '<h1 data-deck-step="4"') }] });
    await exportWorkspace(dir, base, async () => png);
    assert.deepEqual(diffDocuments(base, await readWorkspace(dir, base, upload)), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('a dot-file the deck owns (a code lesson marker) survives; a new dot-file stays out of the deck', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'notale-ws-'));
  try {
    const marker = Buffer.from('{"runtimeVersion":1}');
    const base = validateDocument({ ...deck(), assets: { ...deck().assets, 'assets/lessons/p/.notale-code-lesson.json': { hash: sha256(marker), mime: 'application/json', size: marker.length } } });
    await exportWorkspace(dir, base, async hash => hash === sha256(marker) ? marker : png);
    await writeFile(join(dir, 'pages/p1.html'), (await readFile(join(dir, 'pages/p1.html'), 'utf8')).replace('一', '改'));
    await writeFile(join(dir, '.scratch.txt'), 'notes');
    const next = await readWorkspace(dir, base, upload);
    assert.ok('assets/lessons/p/.notale-code-lesson.json' in next.assets, 'the marker is still an asset');
    assert.equal('.scratch.txt' in next.assets, false);
    assert.deepEqual(diffDocuments(base, next).map(c => c.type), ['slide.replace'], 'only the edited page changed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
