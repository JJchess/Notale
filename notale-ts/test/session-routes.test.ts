import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.js';
import type { Fixer } from '../src/session/turn.js';
import type { Complete } from '../src/session/understand.js';

/** Generate first (the starter pipeline, no model), then every later message is a fix of it. */
const complete: Complete = async ({ messages }) => {
  const text = ((messages[0] as { content: { text?: string }[] }).content).map(part => part.text ?? '').join('\n');
  const run = /runId=(\S+?)（/.exec(text)?.[1];
  return { content: [{ type: 'toolCall', name: 'Route', arguments: run
    ? { action: 'fix', reason: '改', target: run, instruction: text.includes('停') ? '停' : '改' }
    : { action: 'generate', reason: '新', query: '测试讲义' } }] };
};
/** A fix that reports one step and waits: to be let go, or to be stopped. */
function slowFixer() {
  let release!: () => void, signal: AbortSignal | undefined;
  const gate = new Promise<void>(done => { release = done; });
  const fixer: Fixer = {
    async run(_request, onEvent, stop) {
      signal = stop;
      onEvent({ type: 'step', label: '改 page-01.html', status: 'active' });
      await Promise.race([gate, new Promise(done => stop?.addEventListener('abort', done, { once: true }))]);
      return stop?.aborted ? { status: 'interrupted', text: '' } : { status: 'no-change', text: '看过了，不用改。' };
    },
  };
  return { fixer, release: () => release(), signal: () => signal };
}
async function server(fixer: Fixer) {
  const root = await mkdtemp(join(tmpdir(), 'notale-routes-'));
  const { app } = createApp({ runsRoot: join(root, 'runs'), useStarterPipeline: true, logger: false, sessions: { root: join(root, 'sessions'), complete, fixer } });
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const call = (path: string, init?: RequestInit) => fetch(base + path, init);
  const say = (id: string, text: string, signal?: AbortSignal) => call(`/v1/sessions/${id}/turns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, fileIds: [] }), ...(signal ? { signal } : {}) });
  const session = async (id: string) => (await call(`/v1/sessions/${id}`)).json() as Promise<{ busy: boolean; entries: { type: string; text?: string }[] }>;
  const until = async (id: string, done: (s: Awaited<ReturnType<typeof session>>) => boolean) => { for (let i = 0; i < 200; i++) { const s = await session(id); if (done(s)) return s; await new Promise(r => setTimeout(r, 25)); } throw new Error('timed out'); };
  const { id } = await (await call('/v1/sessions', { method: 'POST' })).json() as { id: string };
  await (await say(id, '做一份讲义')).text();
  return { id, call, say, session, until, close: async () => { await app.close(); await rm(root, { recursive: true, force: true }); } };
}
/** Reads an ndjson response until `stop` says so, then lets it go. */
async function read(response: Response, stop: (event: { type: string }) => boolean) {
  const reader = response.body!.getReader(), decoder = new TextDecoder(), seen: { type: string }[] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return seen;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
    for (const line of lines.filter(Boolean)) { seen.push(JSON.parse(line)); if (stop(seen.at(-1)!)) { await reader.cancel(); return seen; } }
  }
}

test('a fix outlives the connection that asked for it, and a reopened page replays it', async () => {
  const slow = slowFixer(), s = await server(slow.fixer);
  try {
    const gone = new AbortController();
    await read(await s.say(s.id, '改一下', gone.signal), event => event.type === 'working');
    gone.abort();
    assert.equal((await s.session(s.id)).busy, true);
    assert.equal(slow.signal()?.aborted, false);
    // Reopened: everything so far comes back, then the rest.
    const replay = await s.call(`/v1/sessions/${s.id}/turn`);
    const pending = read(replay, event => event.type === 'done');
    slow.release();
    const events = (await pending).map(event => event.type);
    assert.deepEqual([events[0], events.at(-2), events.at(-1)], ['understood', 'reply', 'done']);
    assert.ok(events.includes('working'));
    const after = await s.until(s.id, state => !state.busy);
    assert.equal(after.entries.at(-1)?.text, '看过了，不用改。');
    assert.equal((await s.call(`/v1/sessions/${s.id}/turn`)).status, 404);
  } finally { await s.close(); }
});

test('the stop button stops a fix and says so', async () => {
  const slow = slowFixer(), s = await server(slow.fixer);
  try {
    const stream = read(await s.say(s.id, '改一下，然后停'), event => event.type === 'done');
    await s.until(s.id, state => state.busy);
    await new Promise(r => setTimeout(r, 50));
    assert.equal((await s.call(`/v1/sessions/${s.id}/interrupt`, { method: 'POST' })).status, 200);
    await stream;
    assert.equal(slow.signal()?.aborted, true);
    const after = await s.until(s.id, state => !state.busy);
    assert.equal(after.entries.at(-1)?.text, '已停止。');
    assert.equal((await s.call(`/v1/sessions/${s.id}/interrupt`, { method: 'POST' })).status, 409);
  } finally { await s.close(); }
});

test('the draft preview stays inside the working copy', async () => {
  const s = await server(slowFixer().fixer);
  try {
    for (const path of ['..%2F..%2Fsession.jsonl', '.notale-code-lesson.json', 'assets/.x']) assert.equal((await s.call(`/v1/sessions/${s.id}/draft/${path}`)).status, 400, path);
    assert.equal((await s.call(`/v1/sessions/${s.id}/draft/index.html`)).status, 404);
  } finally { await s.close(); }
});

test('the server says who answers and with which model', async () => {
  const s = await server(slowFixer().fixer);
  try {
    const info = await (await s.call('/v1/info')).json() as Record<string, string>;
    assert.equal(info.assistant, 'Istar');
    assert.ok(info.model && info.effort);
  } finally { await s.close(); }
});
