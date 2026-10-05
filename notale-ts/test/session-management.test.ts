import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { SessionStore, type SessionSummary } from '../src/session/session.js';
import { sessionRoutes } from '../src/session/routes.js';
import type { Complete } from '../src/session/understand.js';

async function fixture(complete: Complete = async () => ({ content: [{ type: 'toolCall', name: 'Route', arguments: { action: 'reply', text: '收到' } }] })) {
  const root = await mkdtemp(join(tmpdir(), 'notale-session-management-'));
  const sessions = join(root, 'sessions');
  const store = new SessionStore(sessions);
  const app = Fastify({ logger: false });
  app.register(fastifyStatic, { serve: false });
  sessionRoutes(app, {
    root: sessions, complete,
    generator: {
      start: async () => ({ runId: 'test-run' }), follow: async () => ({ status: 'completed' }),
      cancel: async () => {}, describe: async () => ({ title: '测试讲义', pages: ['一'] }),
    },
    fixer: { run: async () => ({ status: 'no-change', text: '收到' }) },
    runOutput: () => join(root, 'runs'),
  });
  await app.ready();
  return { root, sessions, store, app, close: async () => { await app.close(); await rm(root, { recursive: true, force: true }); } };
}

async function diskSnapshot(root: string): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const name of (await readdir(root)).sort()) {
    const file = join(root, name), info = await stat(file);
    result.push([name, info.mtimeMs, info.isDirectory() ? await diskSnapshot(file) : (await readFile(file)).toString('base64')]);
  }
  return result;
}

test('legacy sessions are discovered without writes; titles and version summaries use real history', async () => {
  const f = await fixture();
  try {
    const empty = await f.app.inject('/v1/sessions');
    assert.deepEqual(empty.json(), { items: [] });
    assert.deepEqual(await readdir(f.root), []);
    const session = await f.store.create();
    await session.append({ type: 'user', text: '给大一同学讲神经网络', files: [], at: new Date().toISOString() });
    await session.append({ type: 'understood', route: { action: 'generate', title: '神经网络导引', query: '神经网络', reason: '', files: [] }, at: new Date().toISOString() });
    await session.append({ type: 'run', runId: 'done-run', kind: 'generate', at: new Date().toISOString() });
    await session.append({ type: 'finished', runId: 'done-run', status: 'completed', at: new Date().toISOString() });
    await session.append({ type: 'run', runId: 'failed-run', kind: 'fix', at: new Date().toISOString() });
    await session.append({ type: 'finished', runId: 'failed-run', status: 'failed', at: new Date().toISOString() });
    const before = await diskSnapshot(f.sessions);
    const listing = (await f.app.inject('/v1/sessions')).json<{ items: SessionSummary[] }>();
    assert.equal(listing.items.length, 1);
    const summary = listing.items[0]!;
    assert.equal(summary.title, '神经网络导引');
    assert.equal(summary.versions, 2);
    assert.equal(summary.latestCompletedRunId, 'done-run');
    assert.equal(summary.busy, false);
    assert.equal(summary.archived, false);
    const snapshot = (await f.app.inject(`/v1/sessions/${session.id}`)).json();
    assert.equal(snapshot.title, summary.title);
    assert.equal(snapshot.updatedAt, summary.updatedAt);
    assert.deepEqual(await diskSnapshot(f.sessions), before);
  } finally { await f.close(); }
});

test('metadata updates persist atomically, preserve the transcript, and merge concurrent partial edits', async () => {
  const f = await fixture();
  try {
    const session = await f.store.create(), transcript = await readFile(join(session.dir, 'session.jsonl'), 'utf8');
    const responses = await Promise.all([
      f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { title: '  手动标题  ' } }),
      f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { archived: true } }),
    ]);
    assert.deepEqual(responses.map(response => response.statusCode), [200, 200]);
    const reloaded = await new SessionStore(f.sessions).get(session.id);
    assert.equal(reloaded.summary().title, '手动标题');
    assert.equal(reloaded.archived, true);
    assert.equal(await readFile(join(session.dir, 'session.jsonl'), 'utf8'), transcript);
    assert.deepEqual((await readdir(session.dir)).sort(), ['files', 'metadata.json', 'session.jsonl']);
    await reloaded.append({ type: 'understood', route: { action: 'generate', title: '模型的新标题', reason: '', query: '主题', files: [] }, at: new Date().toISOString() });
    assert.equal(reloaded.summary().title, '手动标题');
    assert.equal((await f.app.inject('/v1/sessions')).json().items.length, 0);
    assert.equal((await f.app.inject('/v1/sessions?archived=true')).json().items[0].title, '手动标题');
    const restored = await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { archived: false } });
    assert.equal(restored.json().archived, false);
    assert.equal(restored.json().title, '手动标题');
    const beforeInvalid = await readFile(join(session.dir, 'metadata.json'), 'utf8');
    for (const payload of [{}, { title: '' }, { title: 'x'.repeat(301) }, { title: 'line\nfeed' }, { archived: 'false' }, { unexpected: true }]) {
      assert.equal((await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload })).statusCode, 400);
    }
    assert.equal(await readFile(join(session.dir, 'metadata.json'), 'utf8'), beforeInvalid);
  } finally { await f.close(); }
});

test('history pagination, title search, filters and invalid cursors are deterministic', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5; i++) {
      const session = await f.store.create();
      await session.append({ type: 'user', text: `Lesson ${i} 神经网络`, files: [], at: new Date(Date.now() + i * 1000).toISOString() });
    }
    const all = (await f.app.inject('/v1/sessions')).json<{ items: SessionSummary[] }>().items;
    assert.equal(all.length, 5);
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = (await f.app.inject(`/v1/sessions?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json<{ items: SessionSummary[]; nextCursor?: string }>();
      assert.ok(page.items.length <= 2);
      ids.push(...page.items.map(item => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, all.map(item => item.id));
    assert.deepEqual((await f.app.inject('/v1/sessions?q=LESSON%203')).json().items.map((item: SessionSummary) => item.title), ['Lesson 3 神经网络']);
    assert.equal((await f.app.inject('/v1/sessions?q=missing')).json().items.length, 0);
    for (const suffix of ['limit=0', 'limit=101', 'limit=1.1', 'archived=no', 'cursor=bad', 'cursor=%3Cscript%3E']) assert.equal((await f.app.inject(`/v1/sessions?${suffix}`)).statusCode, 400, suffix);
  } finally { await f.close(); }
});

test('a running task permits rename, rejects archive, and an archived session must be restored before a turn', async () => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const active = new Promise<void>(resolve => { started = resolve; });
  const f = await fixture(async () => { started(); await gate; return { content: [{ type: 'text', text: '处理完成' }] }; });
  try {
    const session = await f.store.create();
    const turn = f.app.inject({ method: 'POST', url: `/v1/sessions/${session.id}/turns`, payload: { text: '开始' } });
    void turn.then(() => {});
    await active;
    assert.equal((await f.app.inject('/v1/sessions')).json().items[0].busy, true);
    assert.equal((await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { title: '新的名字' } })).statusCode, 200);
    const archived = await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { archived: true } });
    assert.equal(archived.statusCode, 409);
    assert.equal(archived.json().error, 'SESSION_BUSY');
    release();
    assert.equal((await turn).statusCode, 200);
    assert.equal((await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { archived: true } })).statusCode, 200);
    assert.equal((await f.app.inject({ method: 'POST', url: `/v1/sessions/${session.id}/turns`, payload: { text: '又开始' } })).json().error, 'SESSION_ARCHIVED');
    await f.app.inject({ method: 'PATCH', url: `/v1/sessions/${session.id}`, payload: { archived: false } });
    assert.equal((await f.app.inject({ method: 'POST', url: `/v1/sessions/${session.id}/turns`, payload: { text: '恢复后继续' } })).statusCode, 200);
  } finally { release(); await f.close(); }
});

test('attachment preview is scoped, uses safe headers, supports video ranges and refuses symlink escapes', async () => {
  const f = await fixture();
  try {
    const first = await f.store.create(), second = await f.store.create();
    const upload = async (name: string, bytes: Buffer) => {
      const response = await f.app.inject({ method: 'POST', url: `/v1/sessions/${first.id}/files`, headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) }, payload: bytes });
      assert.equal(response.statusCode, 201);
      return response.json<{ id: string }>().id;
    };
    const pdf = await upload('讲义"\r\n.pdf', Buffer.from('%PDF-1.7\nnotale'));
    const url = `/v1/sessions/${first.id}/files/${pdf}`;
    const response = await f.app.inject(url);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/pdf');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(String(response.headers['content-disposition']), /^inline; filename="[^"]+"; filename\*=UTF-8''/);
    assert.ok(!String(response.headers['content-disposition']).includes('\r'));
    assert.equal(response.body, '%PDF-1.7\nnotale');
    assert.equal((await f.app.inject(`/v1/sessions/${second.id}/files/${pdf}`)).statusCode, 404);
    assert.equal((await f.app.inject(`/v1/sessions/${first.id}/files/..%2F..%2Fsession.jsonl`)).statusCode, 404);
    const doc = await upload('notes.docx', Buffer.from('test document'));
    assert.match(String((await f.app.inject(`/v1/sessions/${first.id}/files/${doc}`)).headers['content-disposition']), /^attachment;/);
    const video = await upload('demo.mp4', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]));
    const ranged = await f.app.inject({ url: `/v1/sessions/${first.id}/files/${video}`, headers: { range: 'bytes=0-7' } });
    assert.equal(ranged.statusCode, 206);
    assert.equal(ranged.rawPayload.length, 8);
    assert.equal(ranged.headers['content-type'], 'video/mp4');
    const original = join(first.dir, 'files', pdf, 'original');
    await unlink(original);
    await symlink(join(second.dir, 'session.jsonl'), original);
    assert.equal((await f.app.inject(url)).statusCode, 404);
    const metaFile = join(first.dir, 'files', doc, 'meta.json');
    const meta = JSON.parse(await readFile(metaFile, 'utf8')) as Record<string, unknown>;
    await writeFile(metaFile, JSON.stringify({ ...meta, mime: 'text/html' }));
    assert.equal((await f.app.inject(`/v1/sessions/${first.id}/files/${doc}`)).statusCode, 404);
  } finally { await f.close(); }
});
