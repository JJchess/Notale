import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTurn, type TurnDeps } from '../src/server/agent/run.js';
import { SessionStore } from '../src/server/agent/session.js';
import { AssistantMessageEventStream, createLocalBashOperations } from '../src/server/agent/pi/index.js';
import { validateDocument, applyCommands } from '../src/domain/commands.js';
import type { Command, DeckDocument } from '../src/domain/model.js';
import { sha256 } from '../src/server/store.js';
import type { AiRuntime } from '../src/server/ai-model.js';

const model = { id: 'test', name: 'test', api: 'google-generative-ai', provider: 'google', baseUrl: 'x', reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 1000 };
const usage = (input = 0) => ({ input, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: input, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
type Call = { name: string; args: Record<string, unknown> };
/** 'hang' is a model call that never answers until the turn's signal aborts it. */
type Step = Call[] | string | 'hang' | { error: string } | { usage: number; calls: Call[] };
/** Each entry answers one model call: tool calls, a closing text, or an error. Records what it saw. */
function fake(script: ((seen: string[]) => Step)[]) {
  const seen: string[] = [];
  let calls = 0;
  const runtime = { available: true, reason: '', vision: true, model, streamFn: (_m: unknown, context: { systemPrompt?: string; messages: { role: string; content: { type: string; text?: string }[] | string }[] }, options?: { signal?: AbortSignal }) => {
    const stream = new AssistantMessageEventStream();
    const text = context.messages.map(m => typeof m.content === 'string' ? m.content : m.content.map(p => p.text ?? `[${p.type}]`).join('')).join('\n');
    const base = { role: 'assistant' as const, api: model.api, provider: model.provider, model: model.id, usage: usage(), timestamp: Date.now() };
    let message: Record<string, unknown>;
    if (context.systemPrompt?.startsWith('You are a context summarization')) message = { ...base, content: [{ type: 'text', text: '## Goal\n改标题' }], stopReason: 'stop' };
    else {
      seen.push(text);
      const step = script[Math.min(calls++, script.length - 1)]!(seen);
      if (step === 'hang') {
        const aborted = { ...base, content: [], stopReason: 'aborted', errorMessage: 'Request was aborted' };
        const signal = options?.signal;
        const fire = () => stream.push({ type: 'error', reason: 'aborted', error: aborted } as never);
        if (signal?.aborted) queueMicrotask(fire); else signal?.addEventListener('abort', fire, { once: true });
        return stream;
      }
      const toolCalls = (list: Call[]) => list.map((call, index) => ({ type: 'toolCall', id: `c${calls}-${index}`, name: call.name, arguments: call.args }));
      message = typeof step === 'string' ? { ...base, content: [{ type: 'text', text: step }], stopReason: 'stop' }
        : Array.isArray(step) ? { ...base, content: toolCalls(step), stopReason: 'toolUse' }
        : 'error' in step ? { ...base, content: [], stopReason: 'error', errorMessage: step.error }
        : { ...base, usage: usage(step.usage), content: toolCalls(step.calls), stopReason: 'toolUse' };
    }
    // Text streams in two pieces, the way a provider sends deltas.
    const words = message.stopReason === 'stop' ? String((message.content as { text?: string }[])[0]?.text ?? '') : '';
    if (words) queueMicrotask(() => { stream.push({ type: 'start', partial: { ...message, content: [] } } as never); const half = Math.ceil(words.length / 2); for (const delta of [words.slice(0, half), words.slice(half)]) stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message } as never); });
    queueMicrotask(() => stream.push(message.stopReason === 'error' ? { type: 'error', reason: 'error', error: message } as never : { type: 'done', reason: message.stopReason, message } as never));
    return stream;
  } } as unknown as AiRuntime;
  return { runtime, seen, get calls() { return calls; } };
}
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const deck = (): DeckDocument => validateDocument({ schemaVersion: 1, id: 'doc', title: 't', slides: [
  { id: 'p1', name: '一', sourcePath: 'pages/p1.html', html: '<!doctype html><html><body><main id="stage" data-notale-id="stage"><h1 data-notale-id="title">标题</h1><p data-notale-id="body">正文</p></main></body></html>' },
  { id: 'p2', name: '二', sourcePath: 'pages/p2.html', html: '<!doctype html><html><body><main id="stage" data-notale-id="stage2"><p data-notale-id="x">x</p></main></body></html>' },
] });
/** A document that commits in memory, and a session in a temp directory. */
async function world() {
  const root = await mkdtemp(join(tmpdir(), 'notale-turn-'));
  const store = new SessionStore(root);
  let doc = deck(), version = 3;
  const commits: Command[][] = [];
  const session = await store.create('doc', version);
  const deps = (runtime: AiRuntime, extra: Partial<TurnDeps> = {}): TurnDeps => ({
    runtime, session,
    sandbox: async () => ({ exec: createLocalBashOperations().exec, close: async () => {} }),
    snapshot: async () => ({ version, document: doc }),
    commit: async ({ commands }) => { doc = applyCommands(doc, commands); commits.push(commands); return { version: ++version }; },
    blob: async () => png,
    upload: async (data, mime) => ({ hash: sha256(data), mime, size: data.length }),
    render: async () => ({ image: Buffer.from('img'), warnings: ['title「标题」 超出画布'] }),
    mutationId: () => '11111111-1111-4111-8111-111111111111',
    ...extra,
  });
  return { root, store, session, deps, commits, get doc() { return doc; }, done: () => rm(root, { recursive: true, force: true }) };
}
const edit = { name: 'edit', args: { path: 'pages/p1.html', edits: [{ oldText: '>标题<', newText: ' style="color:#c00">新标题<' }] } };

test('a turn edits the files and lands as one commit of the document', async () => {
  const w = await world();
  try {
    const model = fake([() => [{ name: 'read', args: { path: 'pages/p1.html' } }], () => [edit], () => [{ name: 'Look', args: { path: 'pages/p1.html' } }], () => '标题改红了。']);
    const result = await runTurn({ slideId: 'p1', instruction: '标题改红', targets: [] }, w.deps(model.runtime));
    assert.equal(result.status, 'complete');
    assert.equal(result.version, 4);
    assert.equal(result.text, '标题改红了。');
    assert.deepEqual(w.commits.map(batch => batch.map(c => c.type)), [['slide.replace']]);
    assert.match(w.doc.slides[0]!.html, /<h1 style="color:#c00" data-notale-id="title">新标题/);
    assert.ok(model.seen.some(text => /超出画布/.test(text)), 'Look relayed the layout warning');
  } finally { await w.done(); }
});
test('the next instruction continues the real transcript, tool results included, and it survives a reload', async () => {
  const w = await world();
  try {
    await runTurn({ slideId: 'p1', instruction: '标题改红', targets: [] }, w.deps(fake([() => [edit], () => '好了。']).runtime));
    const second = fake([() => '上一轮把标题改成了红色。']);
    await runTurn({ slideId: 'p1', instruction: '刚才改了什么？', targets: [] }, w.deps(second.runtime));
    assert.match(second.seen[0]!, /新标题/, 'the edit call from the first instruction is in the context');
    const reloaded = await new SessionStore(w.root).get('doc', w.session.id);
    assert.equal(reloaded.messages.length, w.session.messages.length);
  } finally { await w.done(); }
});
test('a change notale editor cannot parse comes back as that call\'s error, and the fix lands', async () => {
  const w = await world();
  try {
    const model = fake([
      () => [{ name: 'write', args: { path: 'deck.json', content: '{"theme":{},"pages":["pages/nope.html"]}' } }],
      () => [{ name: 'write', args: { path: 'deck.json', content: '{"theme":{},"pages":["pages/p1.html","pages/p2.html"]}' } }, edit],
      () => '修好了。',
    ]);
    const result = await runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime));
    assert.ok(model.seen[1]!.includes('notale editor 解析不了'), 'the broken write was reported in its own result');
    assert.equal(result.status, 'complete');
    assert.equal(w.commits.length, 1);
  } finally { await w.done(); }
});
test('host file tools stay inside the deck directory, symlinks included', async () => {
  const w = await world();
  try {
    const model = fake([
      () => [{ name: 'read', args: { path: '/etc/hostname' } }],
      () => [{ name: 'bash', args: { command: 'ln -s /etc/hostname pages/leak.txt' } }],
      () => [{ name: 'read', args: { path: 'pages/leak.txt' } }],
      () => [{ name: 'write', args: { path: '../escape.txt', content: 'x' } }],
      () => '不行。',
    ]);
    await runTurn({ slideId: 'p1', instruction: '看看', targets: [] }, w.deps(model.runtime));
    assert.equal((model.seen.at(-1)!.match(/只能访问讲义目录里的文件/g) ?? []).length, 3);
  } finally { await w.done(); }
});
test('words and no change: a reply, no commit; the selection travels as context', async () => {
  const w = await world();
  try {
    const result = await runTurn({ slideId: 'p1', instruction: '改一下', targets: ['title'] }, w.deps(fake([() => '你想改哪部分？']).runtime));
    assert.equal(result.version, undefined);
    assert.equal(result.text, '你想改哪部分？');
    assert.match(JSON.stringify(w.session.messages[0]), /选中的对象：title/);
  } finally { await w.done(); }
});
test('a stopped turn keeps what it already wrote and leaves a marker in the transcript', async () => {
  const w = await world();
  try {
    const stop = new AbortController();
    const model = fake([() => [edit], () => { stop.abort(); return [{ name: 'read', args: { path: 'pages/p2.html' } }]; }, () => '不该到这里。']);
    const result = await runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime, { signal: stop.signal }));
    assert.equal(result.status, 'interrupted');
    assert.equal(result.version, 4, 'the edit made before the stop was committed');
    assert.match(JSON.stringify(w.session.messages.at(-1)), /turn_aborted/);
  } finally { await w.done(); }
});
test('an overflow is compacted and retried once; a transient error is retried with backoff', async () => {
  const w = await world();
  try {
    const model = fake([() => [edit], () => ({ error: 'Your input exceeds the context window of this model' }), () => ({ error: '503 Service Unavailable' }), () => '改好了。']);
    const steps: string[] = [];
    const result = await runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime, { report: step => { steps.push(step.label); } }));
    assert.equal(result.status, 'complete');
    assert.ok(steps.some(label => /重试（第 1 次）/.test(label)));
    assert.equal(result.version, 4);
  } finally { await w.done(); }
});
test('image candidates stay out of the deck until the model copies one in', async () => {
  const w = await world();
  try {
    const media = { tools: [{ name: 'ImageSearch', description: '搜', parameters: { type: 'object', properties: { query: { type: 'string' } } } }],
      async call(_n: string, _a: unknown, outDir: string) {
        await writeFile(join(outDir, '00.png'), png); await writeFile(join(outDir, '01.png'), Buffer.concat([png, Buffer.from('x')]));
        return { text: '{"results":[]}', images: [{ path: '00.png', bytes: png }, { path: '01.png', bytes: png }] };
      } };
    let folder = '';
    const model = fake([
      () => [{ name: 'ImageSearch', args: { query: '森林' } }],
      seen => { folder = /- (\.media\/[^\s]+)\/00\.png/.exec(seen.at(-1)!)![1]!; return [{ name: 'bash', args: { command: `mkdir -p media && cp ${folder}/01.png media/forest.png` } }]; },
      () => [{ name: 'edit', args: { path: 'pages/p1.html', edits: [{ oldText: '<p data-notale-id="body">正文</p>', newText: '<img src="../media/forest.png">' }] } }],
      () => '配好了。',
    ]);
    await runTurn({ slideId: 'p1', instruction: '配图', targets: [] }, w.deps(model.runtime, { media }));
    assert.deepEqual(Object.keys(w.doc.assets), ['media/forest.png']);
  } finally { await w.done(); }
});
test('past the token budget the turn stops like an interrupt, keeping what it wrote', async () => {
  const w = await world();
  try {
    const model = fake([() => [edit], () => ({ usage: 6_000_000, calls: [{ name: 'read', args: { path: 'pages/p2.html' } }] }), () => '不该到这里。']);
    const result = await runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime));
    assert.equal(result.status, 'interrupted');
    assert.match(result.note!, /token/);
    assert.equal(result.version, 4);
  } finally { await w.done(); }
});

const until = async (ok: () => boolean) => { for (let i = 0; i < 400 && !ok(); i++) await new Promise(done => setTimeout(done, 5)); assert.ok(ok()); };
test('interrupt stops a model call in flight: edits kept, marker written, the session free again', async () => {
  const w = await world();
  try {
    const model = fake([() => [edit], () => 'hang']);
    const running = runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime));
    await until(() => model.calls >= 2);
    await w.session.interrupt();
    const result = await running;
    assert.deepEqual([result.status, result.version, w.session.running, w.session.turn], ['interrupted', 4, false, undefined]);
    assert.match(JSON.stringify(w.session.messages.at(-1)), /turn_aborted/);
    await assert.rejects(w.session.interrupt(), /没有进行中的一轮/);
  } finally { await w.done(); }
});
test('interrupt cuts a retry wait short instead of sitting out the backoff', async () => {
  const w = await world();
  try {
    const model = fake([() => [edit], () => ({ error: '503 Service Unavailable' }), () => '不该到这里。']);
    const steps: string[] = [];
    const running = runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime, { report: step => { steps.push(step.label); } }));
    await until(() => steps.some(label => /重试/.test(label)));
    const began = Date.now();
    await w.session.interrupt();
    const result = await running;
    assert.ok(Date.now() - began < 1_000, 'not the 2 s backoff');
    assert.deepEqual([result.status, result.version, model.calls], ['interrupted', 4, 2]);
  } finally { await w.done(); }
});
test('a dropped connection still stops the turn', async () => {
  const w = await world();
  try {
    const gone = new AbortController();
    const model = fake([() => [edit], () => 'hang']);
    const running = runTurn({ slideId: 'p1', instruction: '改', targets: [] }, w.deps(model.runtime, { signal: gone.signal }));
    await until(() => model.calls >= 2);
    gone.abort();
    assert.equal((await running).status, 'interrupted');
  } finally { await w.done(); }
});
test('twelve instructions in one session: compacted along the way, every turn committed, reloadable', async () => {
  const w = await world();
  const budget = process.env.EDITOR_AI_CONTEXT_BUDGET;
  process.env.EDITOR_AI_CONTEXT_BUDGET = '3000';
  try {
    for (let i = 0; i < 12; i++) {
      const model = fake([() => ({ usage: 1_500 * (i + 1), calls: [{ name: 'write', args: { path: `notes/${i}.txt`, content: '记录'.repeat(10_000) } }] }), () => `第 ${i} 轮好了。`]);
      const result = await runTurn({ slideId: 'p1', instruction: `第 ${i} 轮`, targets: [] }, w.deps(model.runtime));
      assert.equal(result.status, 'complete', `turn ${i}`);
    }
    assert.equal(w.commits.length, 12);
    assert.equal(Object.keys(w.doc.assets).length, 12);
    const file = await readFile(join(w.root, 'doc', `${w.session.id}.jsonl`), 'utf8');
    assert.ok((file.match(/"type":"compaction"/g) ?? []).length >= 2, 'compacted more than once');
    const reloaded = await new SessionStore(w.root).get('doc', w.session.id);
    assert.equal(JSON.stringify(reloaded.messages), JSON.stringify(w.session.messages), 'as stored, undefined fields aside');
    assert.equal(reloaded.reviewBase, 3);
  } finally {
    if (budget === undefined) delete process.env.EDITOR_AI_CONTEXT_BUDGET; else process.env.EDITOR_AI_CONTEXT_BUDGET = budget;
    await w.done();
  }
});

test('the words stream as they come, restarting with each model call; attached pictures open the conversation', async () => {
  const w = await world();
  try {
    const pieces: (string | null)[] = [];
    const model = fake([() => [edit], () => '标题改红了。']);
    await runTurn({ slideId: 'p1', instruction: '照这张图改', targets: [], images: [{ mime: 'image/png', data: png.toString('base64') }] },
      w.deps(model.runtime, { text: delta => { pieces.push(delta); } }));
    assert.deepEqual(pieces, [null, null, '标题改', '红了。'], 'a reset per model call, then the reply in pieces');
    const opening = w.session.messages[0] as { content: { type: string; mimeType?: string }[] };
    assert.deepEqual(opening.content.map(part => part.type).sort(), ['image', 'text']);
    assert.match(model.seen[0]!, /\[image\]/, 'the model was shown the picture');
  } finally { await w.done(); }
});
