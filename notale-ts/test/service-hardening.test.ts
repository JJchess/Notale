import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.js';
import type { GenerationPipeline } from '../src/core/run-service.js';

/** Never finishes on its own: runs stay "running" until cancelled. */
const idle: GenerationPipeline = ({ signal }) => new Promise((_, fail) => {
  if (signal.aborted) return fail(signal.reason);
  signal.addEventListener('abort', () => fail(signal.reason), { once: true });
});
const body = (query: string) => JSON.stringify({ query, minutes: 5 });
const json = { 'content-type': 'application/json' };

test('healthz, the service token, and Idempotency-Key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-hardening-'));
  const { app } = createApp({ runsRoot: root, pipeline: idle, logger: false, apiToken: 'secret' });
  try {
    assert.deepEqual((await app.inject({ url: '/healthz' })).json(), { ok: true });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/runs', headers: json, payload: body('a') })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/runs', headers: { ...json, authorization: 'Bearer wrong!' }, payload: body('a') })).statusCode, 401);
    assert.equal((await app.inject({ url: '/v1/runs' })).statusCode, 200, 'reads stay open');

    const auth = { ...json, authorization: 'Bearer secret', 'idempotency-key': 'k1' };
    const [first, again] = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/v1/runs', headers: auth, payload: body('a') })));
    assert.equal(first!.statusCode, 202);
    assert.equal(again!.json().id, first!.json().id, 'a concurrent retry gets the same run');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/runs', headers: auth, payload: body('a') })).json().id, first!.json().id);
    const other = await app.inject({ method: 'POST', url: '/v1/runs', headers: auth, payload: body('b') });
    assert.equal(other.statusCode, 409);
    assert.equal(other.json().error, 'IDEMPOTENCY_MISMATCH');
    assert.equal((await app.inject({ url: '/v1/runs' })).json().length, 1);
    await app.inject({ method: 'POST', url: `/v1/runs/${first!.json().id}/cancel`, headers: { authorization: 'Bearer secret' } });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('runs orphaned by a restart are failed; a live owner is left alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-recover-'));
  const now = new Date().toISOString();
  const seed = async (id: string, owner?: number) => {
    await mkdir(join(root, id, 'output'), { recursive: true });
    await writeFile(join(root, id, 'run.json'), JSON.stringify({ protocolVersion: 1, id, status: 'running', request: { query: 'x', minutes: 5 }, createdAt: now, updatedAt: now, lastSequence: 0, pages: [] }));
    await writeFile(join(root, id, 'events.jsonl'), '');
    if (owner !== undefined) await writeFile(join(root, id, '.owner'), String(owner));
  };
  await seed('20260101t000000z-dead0000', 2 ** 22 + 12345); // above Linux's pid_max: never alive
  await seed('20260101t000000z-live0000', process.ppid);
  const { app, store } = createApp({ runsRoot: root, pipeline: idle, logger: false });
  try {
    await app.ready();
    assert.equal((await store.get('20260101t000000z-dead0000')).status, 'failed');
    assert.equal((await store.get('20260101t000000z-live0000')).status, 'running');
    const cancel = await app.inject({ method: 'POST', url: '/v1/runs/20260101t000000z-dead0000/cancel' });
    assert.equal(cancel.statusCode, 200);
    assert.equal((await store.events('20260101t000000z-dead0000')).at(-1)?.kind, 'run.failed');
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
