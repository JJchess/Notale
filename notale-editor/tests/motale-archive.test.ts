import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { registerFilm } from '../src/server/film/routes.js';
import { scopeDirectory } from '../src/server/film/config.js';
import { decodeMotale, encodeMotale } from '../src/server/motale-archive.js';
import type { Store } from '../src/server/store.js';

const film = (): Record<string, Uint8Array> => ({
  'index.html': strToU8('<script type="module" src="shell.js"></script>'), 'shell.js': strToU8(''),
  'acts.json': strToU8(JSON.stringify({ title: '圆的面积', acts: [{ id: 'a', title: 'A', start: 0, end: 6 }] })),
  'acts/a.js': strToU8('export const ID = "a";'), 'ACT.md': strToU8('notes'), 'cover.jpg': strToU8('jpg'),
});
const author = { schema: 'motale-author/2', acts: { a: { objects: { dot: { x: 10 } } } } };

test('.motale: packed with the leftovers dropped and author data named in acts.json; tampered or unsafe packages are refused', async () => {
  const bytes = await encodeMotale(film(), { id: 'circle', cut: 2 }, author);
  const { manifest, files } = await decodeMotale(bytes);
  assert.deepEqual(manifest.film, { id: 'circle', cut: 2, title: '圆的面积', cover: 'cover.jpg', bridge: 'motale-bridge/2' });
  assert.ok(!('ACT.md' in files));
  assert.equal(JSON.parse(strFromU8(files['acts.json']!)).author, 'author.json');
  assert.deepEqual(JSON.parse(strFromU8(files['author.json']!)), author);
  const raw = unzipSync(bytes);
  await assert.rejects(decodeMotale(zipSync({ ...raw, 'shell.js': strToU8('changed') })), /Corrupt asset shell\.js/);
  await assert.rejects(decodeMotale(zipSync({ ...raw, 'extra.js': strToU8('') })), /not in the manifest/);
  await assert.rejects(decodeMotale(zipSync({ ...raw, '../x.js': strToU8('') })), /Unsafe path/);
  const { 'motale-project.json': _, ...bare } = raw;
  await assert.rejects(decodeMotale(zipSync(bare)), /manifest is missing/);
  await assert.rejects(decodeMotale(strToU8('not a zip')), /Not a \.motale file/);
});

test('.motale through the film routes: imported into its own asset folder with its author data, exported with the clips\' author data', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'notale-motale-'));
  const api = Fastify(), content = Fastify();
  api.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 75_000_000 }, (_req, body, done) => done(null, body));
  registerFilm({ api, content, secret: 's', contentOrigin: 'http://content.example', film: { dataDir, playerDir: path.join(dataDir, 'runtime') },
    context: async () => ({ actor: 'author', scope: 'A' }), store: {} as unknown as Store });
  await api.ready(); await content.ready();
  try {
    const upload = (payload: Uint8Array) => api.inject({ method: 'POST', url: '/api/film/motale-import', headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(payload) });
    const imported = await upload(await encodeMotale(film(), { id: 'circle', cut: 2 }, author));
    assert.equal(imported.statusCode, 200, imported.body);
    const { uri, acts, author: came, title } = imported.json();
    assert.match(uri, /^\/assets\/motale\/[0-9a-f]{16}\/index\.html$/, 'a folder of its own, which collectResources takes whole as a Motale bundle');
    assert.equal(title, '圆的面积');
    assert.equal(acts.acts.length, 1);
    assert.deepEqual(came, author);
    const folder = path.join(scopeDirectory(dataDir, 'A'), path.posix.dirname(uri.slice(1)));
    assert.equal(await readFile(path.join(folder, 'acts/a.js'), 'utf8'), 'export const ID = "a";');
    assert.equal((await upload(strToU8('not a zip'))).statusCode, 422);

    const edited = { schema: 'motale-author/2', acts: { a: { objects: { dot: { x: 99 } } } } };
    const exported = await api.inject({ method: 'POST', url: '/api/film/motale-export', payload: { uri, author: edited } });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.match(String(exported.headers['content-disposition']), /filename\*=UTF-8''%E5%9C%86%E7%9A%84%E9%9D%A2%E7%A7%AF\.motale/);
    const back = await decodeMotale(exported.rawPayload);
    assert.deepEqual([back.manifest.film.id, back.manifest.film.cut], ['circle', 2], 'the film it came from, read from the folder\'s manifest');
    assert.deepEqual(JSON.parse(strFromU8(back.files['author.json']!)), edited);
    assert.ok(!('motale-project.json' in back.files));
    assert.equal((await api.inject({ method: 'POST', url: '/api/film/motale-export', payload: { uri, author: { schema: 'nope' } } })).statusCode, 400);
    assert.equal((await api.inject({ method: 'POST', url: '/api/film/motale-export', payload: { uri: '/assets/index.html' } })).statusCode, 400, 'only a folder of its own, never the shared assets root');
  } finally {
    await api.close(); await content.close(); await rm(dataDir, { recursive: true, force: true });
  }
});
