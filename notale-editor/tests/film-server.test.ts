import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { registerFilm } from '../src/server/film/routes.js';
import { scopeDirectory } from '../src/server/film/config.js';
import { migrateFilm } from '../src/server/film/migrate.js';
import type { Store } from '../src/server/store.js';
import { emptyFilm } from '../src/film/index.js';
import { request } from 'node:http';
import { readdir } from 'node:fs/promises';
import { fulfillRenderFile } from '../src/server/film/export-runtime.mjs';

test('isolated render media supports byte ranges and HEAD for native seeking', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'notale-render-range-'));
  try {
    const file = path.join(dir, 'audio.wav'), bytes = Buffer.from('0123456789');
    await writeFile(file, bytes);
    for (const cached of [undefined, bytes]) {
      for (const [range, method, status, content] of [['bytes=3-5', 'GET', 206, '345'], ['bytes=-2', 'GET', 206, '89'], ['bytes=11-', 'GET', 416, ''], ['bytes=2-4', 'HEAD', 206, '']] as const) {
        let result: any;
        await fulfillRenderFile({ request: () => ({ headers: () => ({ range }), method: () => method }), fulfill: (value: unknown) => { result = value; } }, file, 'audio/wav', cached);
        assert.equal(result.status, status); assert.equal(String(result.body), content);
        assert.equal(result.headers['accept-ranges'], 'bytes');
        if (status === 206) assert.match(result.headers['content-range'], /^bytes \d+-\d+\/10$/);
        if (method === 'HEAD') assert.equal(result.headers['content-length'], '3');
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

async function setup() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'notale-film-server-'));
  const api = Fastify(), content = Fastify();
  const document = emptyFilm('owned-document', 'Integration');
  const checks: string[] = [];
  registerFilm({ api, content, secret: 'test-secret', contentOrigin: 'http://content.example', film: { dataDir, playerDir: path.join(dataDir, 'runtime') },
    context: async (req, action, id) => {
      if (!req.headers['x-actor']) throw Object.assign(Error('Missing identity'), { statusCode: 401 });
      if (req.headers['x-deny'] === action) throw Object.assign(Error('Denied'), { statusCode: 403 });
      checks.push(`${req.headers['x-scope']}:${action}:${id ?? ''}`);
      return { actor: String(req.headers['x-actor']), scope: String(req.headers['x-scope']) };
    },
    store: { get: async (ctx: { scope: string }, id: string) => { if (ctx.scope !== 'A' || id !== document.id) throw Object.assign(Error('Document not found'), { statusCode: 404 }); return { document, version: 1 }; } } as unknown as Store,
  });
  await api.ready(); await content.ready();
  return { api, content, dataDir, document, checks, headers: { 'x-actor': 'author', 'x-scope': 'A' }, close: async () => { await api.close(); await content.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

test('film imports stream into scoped storage; ranges, authorization and actor ownership', async () => {
  const s = await setup();
  try {
    assert.equal((await s.api.inject({ method: 'POST', url: '/film-media/imports' })).statusCode, 401);
    const create = await s.api.inject({ method: 'POST', url: '/film-media/imports', headers: s.headers });
    assert.equal(create.statusCode, 201, create.body); const { id } = create.json();
    const upload = await s.api.inject({ method: 'PUT', url: `/film-media/imports/${id}?path=bytes.txt`, headers: { ...s.headers, 'content-type': 'application/octet-stream' }, payload: Buffer.from('0123456789') });
    assert.equal(upload.statusCode, 201, upload.body); const uri = upload.json().uri;
    const range = await s.api.inject({ url: uri, headers: { ...s.headers, range: 'bytes=-4' } });
    assert.equal(range.statusCode, 206, range.body); assert.equal(range.body, '6789');
    assert.equal((await s.api.inject({ url: uri, headers: { ...s.headers, range: 'bytes=20-' } })).statusCode, 416);
    assert.equal((await s.api.inject({ url: uri, headers: { ...s.headers, 'x-scope': 'B' } })).statusCode, 404);
    assert.equal((await s.api.inject({ url: uri, headers: { ...s.headers, 'x-deny': 'read' } })).statusCode, 403);
    assert.equal((await s.api.inject({ method: 'PUT', url: `/film-media/imports/${id}?path=evil.txt`, headers: { ...s.headers, 'x-actor': 'other' }, payload: 'bad' })).statusCode, 400);
    const traversal = await s.api.inject({ method: 'PUT', url: `/film-media/imports/${id}?path=..%2Fescape`, headers: s.headers, payload: 'bad' });
    assert.equal(traversal.statusCode, 400);
    assert.equal((await s.api.inject({ method: 'POST', url: `/film-media/imports/${id}/complete`, headers: s.headers })).statusCode, 200);
    assert.equal((await s.api.inject({ method: 'DELETE', url: `/film-media/imports/${id}`, headers: s.headers })).statusCode, 400);
    assert.equal(await readFile(path.join(scopeDirectory(s.dataDir, 'A'), uri.slice(1)), 'utf8'), '0123456789');
  } finally { await s.close(); }
});

test('signed film content is isolated and restricted to the authorized resource closure', async () => {
  const s = await setup();
  try {
    const root = scopeDirectory(s.dataDir, 'A'); await mkdir(path.join(root, 'assets', 'page'), { recursive: true });
    await writeFile(path.join(root, 'assets/page/index.html'), '<h1>safe</h1>');
    await writeFile(path.join(root, 'assets/secret.txt'), 'unrelated');
    s.document.sources.push({ id: 'page', kind: 'motale', title: 'Test', uri: '/assets/page/index.html', duration: 1 });
    const preview = await s.api.inject({ method: 'POST', url: '/api/documents/owned-document/film-preview', headers: s.headers, payload: { document: s.document } });
    assert.equal(preview.statusCode, 200, preview.body);
    const url = new URL(preview.json().document.sources[0].uri);
    assert.equal(url.origin, 'http://content.example');
    assert.equal((await s.content.inject({ url: url.pathname })).body, '<h1>safe</h1>');
    assert.equal((await s.content.inject({ url: url.pathname.replace('/assets/page/index.html', '/assets/secret.txt') })).statusCode, 404);
    assert.equal((await s.content.inject({ url: url.pathname.replace('/content/film/', '/content/film/bad') })).statusCode, 403);
    assert.equal((await s.api.inject({ url: '/assets/page/index.html', headers: s.headers })).statusCode, 403);
    assert.ok(s.checks.includes('A:read:owned-document'));
    const foreign = await s.api.inject({ method: 'POST', url: '/film-export/jobs', headers: { ...s.headers, 'x-scope': 'B' }, payload: { document: s.document, options: { format: 'png' } } });
    assert.equal(foreign.statusCode, 404, foreign.body);
  } finally { await s.close(); }
});

test('film migration previews, copies and verifies without changing original bytes', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'film-migration-')); const from = path.join(temp, 'legacy'), dataDir = path.join(temp, 'data');
  await mkdir(path.join(from, 'assets/imports/demo'), { recursive: true }); await writeFile(path.join(from, 'assets/imports/demo/a.txt'), 'original');
  const options = { from, dataDir, scope: 'film-smoke', actor: 'film-smoke' };
  try {
    const preview = await migrateFilm(options); assert.equal(preview.applied, false); assert.equal(preview.files, 1);
    const result = await migrateFilm({ ...options, apply: true }); assert.equal(result.applied, true);
    assert.equal((await migrateFilm({ ...options, apply: true })).alreadyApplied, true);
    assert.equal(await readFile(path.join(from, 'assets/imports/demo/a.txt'), 'utf8'), 'original');
    await writeFile(path.join(result.target, 'assets/imports/demo/a.txt'), 'changed');
    await assert.rejects(migrateFilm({ ...options, apply: true }), /变化/);
    await symlink('/etc/hosts', path.join(from, 'assets/escape'));
    await assert.rejects(migrateFilm(options), /符号链接/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('an interrupted network upload publishes no partial file', async () => {
  const s = await setup();
  try {
    const address = await s.api.listen({ host: '127.0.0.1', port: 0 });
    const created = await s.api.inject({ method: 'POST', url: '/film-media/imports', headers: s.headers });
    const id = created.json().id;
    await new Promise<void>(done => {
      const req = request(`${address}/film-media/imports/${id}?path=partial.bin`, { method: 'PUT', headers: { ...s.headers, 'content-type': 'application/octet-stream', 'content-length': 100000 } });
      req.on('error', () => done()); req.write(Buffer.alloc(128)); setTimeout(() => { req.destroy(); done(); }, 25);
    });
    const directory = path.join(scopeDirectory(s.dataDir, 'A'), 'assets/imports', id);
    const deadline = Date.now() + 2000;
    while ((await readdir(directory)).length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(await readdir(directory), []);
  } finally { await s.close(); }
});

test('persisted export lookup and download enforce actor, workspace and document policy', async () => {
  const s = await setup();
  try {
    const id = '00000000-0000-4000-8000-000000000001', dir = path.join(scopeDirectory(s.dataDir, 'A'), 'exports', id);
    await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'frame.png'), 'immutable result');
    await writeFile(path.join(dir, 'job.json'), JSON.stringify({ version: 2, id, actor: 'author', scope: 'A', state: 'complete', doc: s.document, options: { format: 'png' }, file: 'frame.png' }));
    const url = `/film-export/jobs/${id}/files/frame.png`;
    assert.equal((await s.api.inject({ url, headers: { ...s.headers, 'x-actor': 'other' } })).statusCode, 404);
    assert.equal((await s.api.inject({ url, headers: { ...s.headers, 'x-scope': 'B' } })).statusCode, 404);
    assert.equal((await s.api.inject({ url, headers: { ...s.headers, 'x-deny': 'read' } })).statusCode, 403);
    const allowed = await s.api.inject({ url, headers: s.headers }); assert.equal(allowed.statusCode, 200); assert.equal(allowed.body, 'immutable result');
    assert.ok(s.checks.includes('A:read:owned-document'));
  } finally { await s.close(); }
});
