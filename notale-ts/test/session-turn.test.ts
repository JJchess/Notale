import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, type Session } from '../src/session/session.js';
import { saveAttachment } from '../src/session/attachments.js';
import { turn, type Fixer, type Generator, type GenerateRequest, type TurnEvent } from '../src/session/turn.js';
import type { Complete } from '../src/session/understand.js';

/** A model that answers each call with the next scripted Route, and records what it was shown. */
function model(routes: ((seen: string) => Record<string, unknown> | string)[]) {
  const seen: string[] = [];
  const complete: Complete = async ({ messages }) => {
    const parts = (messages[0] as { content: { type: string; text?: string }[] }).content;
    const text = parts.map(p => p.text ?? `[${p.type}]`).join('\n');
    seen.push(text);
    const next = routes[seen.length - 1]!(text);
    return typeof next === 'string' ? { content: [{ type: 'text', text: next }] } : { content: [{ type: 'toolCall', name: 'Route', arguments: next }] };
  };
  return { complete, seen };
}
function workers() {
  const started: GenerateRequest[] = [], fixes: { target: string; instruction: string; page?: number; images: number; files?: string[] }[] = [];
  let n = 0;
  const generator: Generator = {
    async start(request) { started.push(request); return { runId: `run-${++n}` }; },
    async follow(runId, onEvent) { onEvent({ type: 'page', runId, page: 1 }); return { status: 'completed' }; },
    async describe(runId) { return { title: `讲义 ${runId}`, pages: ['封面', '目录', '正文'] }; },
    async cancel() {},
  };
  const fixer: Fixer = {
    async run(request, onEvent) { fixes.push({ target: request.target, instruction: request.instruction, ...(request.page ? { page: request.page } : {}), images: request.images.length, ...(request.files.length ? { files: request.files.map(f => `${f.kind}:${f.name}`) } : {}) }); const runId = `run-${++n}`; onEvent({ runId, type: 'step' }); return { runId, status: 'completed' }; },
  };
  return { generator, fixer, started, fixes };
}
async function world() {
  const root = await mkdtemp(join(tmpdir(), 'notale-session-'));
  const session = await new SessionStore(root).create();
  return { session, done: () => rm(root, { recursive: true, force: true }) };
}
const pdf = Buffer.from('%PDF-1.4\n%fake\n');
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const mp4 = Buffer.from('0000001c6674797069736f6d0000020069736f6d69736f32', 'hex');
/** Uploads, then the message names the uploads -- as the HTTP API does. */
async function say(session: Session, text: string, files: { name: string; bytes: Buffer }[], deps: Parameters<typeof turn>[2]) {
  const fileIds = [];
  for (const file of files) fileIds.push((await saveAttachment(session, file.name, file.bytes)).id);
  await turn(session, { text, fileIds }, deps);
}
const ids = (seen: string) => [...seen.matchAll(/id=([0-9a-f-]{36})/g)].map(m => m[1]!);

test('a new deck with a PDF: generate, the PDF as material, fields only as said, language into the scenario', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    const m = model([seen => ({ action: 'generate', reason: '要做新讲义', query: '贝叶斯推断入门', minutes: 45, language: 'English', files: [{ id: ids(seen)[0], role: 'material' }] })]);
    await say(w.session, '用这篇论文做一份45分钟的英文讲义', [{ name: 'paper.pdf', bytes: pdf }], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.deepEqual(events.map(e => e.type), ['understood', 'run', 'progress', 'result']);
    const request = work.started[0]!;
    assert.deepEqual([request.query, request.minutes, request.scenario, request.materials.map(f => f.name), request.template, request.styleImages], ['贝叶斯推断入门', 45, '全部页面文字使用English撰写', ['paper.pdf'], undefined, []]);
    assert.equal(request.audience, undefined, 'not said, not filled');
    assert.deepEqual(w.session.artifacts.map(a => [a.runId, a.kind]), [['run-1', 'generate']]);
  } finally { await w.done(); }
});
test('a PPTX template and a style picture go to their own inputs', async () => {
  const w = await world(), work = workers();
  try {
    const m = model([seen => { const [a, b] = ids(seen); return { action: 'generate', reason: '', query: '光合作用', files: [{ id: a, role: 'template' }, { id: b, role: 'style-reference' }] }; }]);
    const pptx = Buffer.from('PK\x03\x04');
    await say(w.session, '照这个模板讲光合作用，配色参考这张图', [{ name: 'school.pptx', bytes: pptx }, { name: 'mood.png', bytes: png }], { complete: m.complete, ...work, emit: () => {} });
    assert.equal(work.started[0]!.template?.name, 'school.pptx');
    assert.deepEqual(work.started[0]!.styleImages.map(f => f.name), ['mood.png']);
  } finally { await w.done(); }
});
test('a role that cannot be right becomes a question, not a wrong run', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    const m = model([seen => ({ action: 'generate', reason: '', query: 'x', files: [{ id: ids(seen)[0], role: 'style-reference' }] })]);
    await say(w.session, '参考这个', [{ name: 'a.pdf', bytes: pdf }], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.equal(work.started.length, 0);
    assert.match((events.find(e => e.type === 'question') as { text: string }).text, /风格参考只能是图片/);
  } finally { await w.done(); }
});
test('asked about a file, the answer next turn still has the file: nothing is lost across the question', async () => {
  const w = await world(), work = workers();
  try {
    const m = model([
      () => ({ action: 'ask', reason: '不确定', question: '这份 PPT 当模板还是当内容？', options: ['模板', '内容'] }),
      seen => ({ action: 'generate', reason: '', query: '细胞分裂', files: [{ id: ids(seen)[0], role: 'template' }] }),
    ]);
    await say(w.session, '做一份细胞分裂的讲义', [{ name: 'deck.pptx', bytes: Buffer.from('PK') }], { complete: m.complete, ...work, emit: () => {} });
    await say(w.session, '当模板', [], { complete: m.complete, ...work, emit: () => {} });
    assert.match(m.seen[1]!, /deck\.pptx/, 'the file is shown again with the answer');
    assert.match(m.seen[1]!, /你问：这份 PPT 当模板还是当内容？/);
    assert.equal(work.started[0]!.template?.name, 'deck.pptx');
  } finally { await w.done(); }
});
test('a fix targets this session\'s deck and becomes a new run based on it; without a deck it is a question', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    const m = model([
      () => ({ action: 'fix', reason: '', target: 'nope', instruction: '改', page: 3 }),
      () => ({ action: 'generate', reason: '', query: '牛顿定律', files: [] }),
      seen => ({ action: 'fix', reason: '改最近一份', target: /runId=(run-\d+)/.exec(seen)![1], instruction: '第 3 页改成两栏', page: 3, files: [{ id: ids(seen)[0], role: 'reference' }] }),
    ]);
    await say(w.session, '把第三页改成两栏', [], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.match((events.at(-1) as { text: string }).text, /还没有讲义/);
    await say(w.session, '做一份牛顿定律的讲义', [], { complete: m.complete, ...work, emit: () => {} });
    await say(w.session, '把第三页改成图里这样两栏', [{ name: 'sketch.png', bytes: png }], { complete: m.complete, ...work, emit: () => {} });
    assert.match(m.seen[2]!, /runId=run-1.*牛顿定律|讲义 run-1/);
    assert.deepEqual(work.fixes, [{ target: 'run-1', instruction: '第 3 页改成两栏', page: 3, images: 1 }]);
    assert.deepEqual(w.session.artifacts.map(a => [a.runId, a.kind, a.basedOn]), [['run-1', 'generate', undefined], ['run-2', 'fix', 'run-1']]);
    const reloaded = await new SessionStore(join(w.session.dir, '..')).get(w.session.id);
    assert.deepEqual(reloaded.artifacts.map(a => a.runId), ['run-1', 'run-2'], 'the session survives a reload');
  } finally { await w.done(); }
});
test('small talk is a reply; words without Route count as one too', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    const m = model([() => ({ action: 'reply', reason: '', text: '不客气。' }), () => '我可以帮你做讲义。']);
    await say(w.session, '谢谢', [], { complete: m.complete, ...work, emit: e => events.push(e) });
    await say(w.session, '你能干嘛', [], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.deepEqual(events.filter(e => e.type === 'reply').map(e => (e as { text: string }).text), ['不客气。', '我可以帮你做讲义。']);
    assert.equal(work.started.length + work.fixes.length, 0);
  } finally { await w.done(); }
});
test('a fix that changes nothing is an answer, not an empty run; its steps are relayed while it works', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    work.fixer.run = async (_request, onEvent) => { onEvent({ type: 'step', label: '读 page-01.html', status: 'done' }); return { status: 'no-change', text: '第 3 页已经是两栏了。' }; };
    const m = model([() => ({ action: 'generate', reason: '', query: 'x', files: [] }), seen => ({ action: 'fix', reason: '', target: /runId=(run-\d+)/.exec(seen)![1], instruction: '改两栏' })]);
    await say(w.session, '做一份', [], { complete: m.complete, ...work, emit: () => {} });
    await say(w.session, '第三页改两栏', [], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.deepEqual(events.map(e => e.type), ['understood', 'working', 'reply']);
    assert.equal((events.at(-1) as { text: string }).text, '第 3 页已经是两栏了。');
    assert.deepEqual(w.session.artifacts.map(a => a.runId), ['run-1'], 'no run for no change');
  } finally { await w.done(); }
});

test('a change may bring documents and video: images go in the message, the rest to the fix agent\'s workspace; video is no material', async () => {
  const w = await world(), work = workers(), events: TurnEvent[] = [];
  try {
    const m = model([
      () => ({ action: 'generate', reason: '', query: '牛顿定律', files: [] }),
      seen => ({ action: 'fix', reason: '', target: /runId=(run-\d+)/.exec(seen)![1], instruction: '照论文和视频改', files: ids(seen).map(id => ({ id, role: 'reference' })) }),
      seen => ({ action: 'generate', reason: '', query: '视频讲义', files: [{ id: ids(seen)[0], role: 'material' }] }),
    ]);
    await say(w.session, '做一份牛顿定律的讲义', [], { complete: m.complete, ...work, emit: () => {} });
    await say(w.session, '按论文第 2 节和这个视频改第 1 页', [{ name: 'paper.pdf', bytes: pdf }, { name: 'demo.mp4', bytes: mp4 }, { name: 'sketch.png', bytes: png }], { complete: m.complete, ...work, emit: () => {} });
    assert.deepEqual(work.fixes, [{ target: 'run-1', instruction: '照论文和视频改', images: 1, files: ['pdf:paper.pdf', 'video:demo.mp4'] }]);
    await say(w.session, '用这个视频做一份讲义', [{ name: 'talk.mp4', bytes: mp4 }], { complete: m.complete, ...work, emit: e => events.push(e) });
    assert.match((events.at(-1) as { text: string }).text, /视频目前只能在修改讲义时作参考/);
    await assert.rejects(say(w.session, '看看', [{ name: 'fake.mp4', bytes: pdf }], { complete: m.complete, ...work, emit: () => {} }), /内容与扩展名不符/);
  } finally { await w.done(); }
});
