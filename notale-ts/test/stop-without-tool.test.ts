import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssistantTurn, ChatMessage } from '../src/adapters/models/chat-model.js';
import { deckCall } from '../src/core/planner.js';
import { direct, type DirectorPorts } from '../src/core/director.js';

/** A model that plays back scripted turns: text only (no tool call), or one tool call. */
function scripted(turns: (string | { name: string; args: unknown })[]) {
  const seen: ChatMessage[][] = [];
  const respond = async (messages: ChatMessage[]): Promise<AssistantTurn> => {
    seen.push(messages);
    const turn = turns[Math.min(seen.length, turns.length) - 1]!;
    const message: ChatMessage = typeof turn === 'string'
      ? { role: 'assistant', content: turn }
      : { role: 'assistant', content: '', tool_calls: [{ id: `c${seen.length}`, type: 'function', function: { name: turn.name, arguments: JSON.stringify(turn.args) } }] };
    return { id: String(seen.length), message, inputTokens: 1, outputTokens: 1 };
  };
  return { respond, seen };
}
const mentions = (messages: ChatMessage[], text: string) => messages.some(m => m.role === 'user' && JSON.stringify(m.content).includes(text));
const PLAN = '## Audience\n学过一点基础的读者\n\n## Continuity\n无\n\n# page-01 [标题页]\n测试讲义\n\n# page-02 [内容页]\n一个概念\n';
const run = (root: string) => ({ root, query: '测试', minutes: 45, audience: '读者' });

test('planner: a round without a tool call is told to submit, then the plan is accepted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-stop-'));
  try {
    const model = scripted(['我先想想页表……', { name: 'Submit', args: { pages_md: PLAN } }]);
    const plan = await deckCall(run(root), { model, media: async () => ({ text: '{}', images: [] }), trace: () => {} });
    assert.equal(plan.pagesDoc, PLAN);
    assert.equal(model.seen.length, 2);
    assert.ok(mentions(model.seen[1]!, '请用 Submit 提交完整页表'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('planner: rounds that never call a tool stop at the bound', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-stop-'));
  try {
    const model = scripted(['只说话']);
    await assert.rejects(deckCall(run(root), { model, media: async () => ({ text: '{}', images: [] }), trace: () => {} }, undefined, 3), /Planner 交付不合格/);
    assert.equal(model.seen.length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/** Just enough Director ports to reach the theme loop with a named catalog style (no style-pick). */
function directorPorts(model: ReturnType<typeof scripted>, published: string[]): DirectorPorts {
  const none = async () => ({ text: '', images: [] });
  return {
    model, visionInput: true, trace: () => {},
    catalog: { rows: () => [['01-minimalism', '极简', '']], match: () => '01-minimalism', identify: () => '01-minimalism', readPath: () => '', selectionInputs: none, selectedInputs: none, inputs: none, detail: none },
    images: async () => [], media: async () => ({ text: '{}', images: [] }),
    theme: {
      checkOptions: () => {}, importInput: async () => ({ css: '', shots: [] }), importedAssets: async () => [],
      prepareFonts: async () => undefined, referenceImages: async () => undefined, references: () => [['style', '01-minimalism']],
      gates: async () => [], publish: async (css: string) => { published.push(css); },
    },
  };
}

test('director: CSS answered as text is sent back to Write, then published', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-stop-'));
  try {
    const target = join(root, 'pages/assets/theme.css'), published: string[] = [];
    const model = scripted([':root { --bg: #fff; }', { name: 'Write', args: { file_path: target, content: ':root { --bg: #fff; }' } }]);
    await direct({ ...run(root), style: '01-minimalism' }, directorPorts(model, published));
    assert.deepEqual(published, [':root { --bg: #fff; }']);
    assert.ok(mentions(model.seen[1]!, '请用 Write 提交完整的 theme.css'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('director: rounds that never call a tool stop at the bound', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notale-stop-'));
  try {
    const model = scripted(['只说话']);
    await assert.rejects(direct({ ...run(root), style: '01-minimalism' }, directorPorts(model, []), undefined, 3), /主题技术校验失败: 本轮没有调用工具/);
    assert.equal(model.seen.length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});
