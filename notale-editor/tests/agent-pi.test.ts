import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { Type } from 'typebox';
import {
  Agent,
  AssistantMessageEventStream,
  type AgentMessage,
  type AgentTool,
  type AssistantMessage,
  type BashOperations,
  type Context,
  type Model,
  type StreamFn,
  compactIfNeeded,
  createBashTool,
  createEditTool,
  createLocalBashOperations,
  createReadTool,
  getCompactionSummary,
} from '../src/server/agent/pi/index.js';

const model: Model = {
  id: 'gemini-test', name: 'test', api: 'google-generative-ai', provider: 'google', baseUrl: '',
  reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000, maxTokens: 8192,
};

function assistant(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: content.some((b) => b.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now(),
  };
}

/** Fake StreamFn that replays scripted assistant messages and records each request context. */
function scripted(replies: AssistantMessage[]): { streamFn: StreamFn; calls: Context[] } {
  const calls: Context[] = [];
  const streamFn: StreamFn = (_model, context) => {
    calls.push(structuredClone(context));
    const message = replies.shift();
    assert.ok(message, 'unexpected extra model call');
    const stream = new AssistantMessageEventStream();
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason === 'toolUse' ? 'toolUse' : 'stop', message });
    });
    return stream;
  };
  return { streamFn, calls };
}

const tmp = () => mkdtemp(join(tmpdir(), 'agent-pi-'));
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? '').join('');

test('edit applies two disjoint edits in one call; overlapping or non-unique oldText is an error', async () => {
  const dir = await tmp();
  const file = join(dir, 'a.txt');
  await writeFile(file, 'alpha\nbeta\ngamma\ndelta\n');
  const edit = createEditTool(dir);
  await edit.execute('1', { path: 'a.txt', edits: [{ oldText: 'beta', newText: 'BETA' }, { oldText: 'delta', newText: 'DELTA' }] });
  assert.equal(await readFile(file, 'utf8'), 'alpha\nBETA\ngamma\nDELTA\n');

  await assert.rejects(
    edit.execute('2', { path: 'a.txt', edits: [{ oldText: 'alpha\nBETA', newText: 'x' }, { oldText: 'BETA\ngamma', newText: 'y' }] }),
    /overlap/i,
  );
  await writeFile(file, 'dup\ndup\n');
  await assert.rejects(edit.execute('3', { path: 'a.txt', edits: [{ oldText: 'dup', newText: 'x' }] }), /occurrences|unique/i);
  assert.equal(await readFile(file, 'utf8'), 'dup\ndup\n');
});

test('read returns an image block for a PNG and honours offset/limit with a continuation hint', async () => {
  const dir = await tmp();
  await writeFile(join(dir, 'p.png'), await sharp({ create: { width: 4, height: 3, channels: 3, background: '#f00' } }).png().toBuffer());
  await writeFile(join(dir, 't.txt'), Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n'));
  const read = createReadTool(dir);

  const image = await read.execute('1', { path: 'p.png' });
  const block = image.content.find((c) => c.type === 'image');
  assert.ok(block && block.type === 'image');
  assert.equal(block.mimeType, 'image/png');
  assert.ok(Buffer.from(block.data, 'base64').length > 0);

  const slice = await read.execute('2', { path: 't.txt', offset: 3, limit: 2 });
  assert.equal(text(slice), 'line3\nline4\n\n[6 more lines in file. Use offset=5 to continue.]');

  const nonVision = createReadTool(dir, { model: { ...model, input: ['text'] } });
  assert.match(text(await nonVision.execute('3', { path: 'p.png' })), /does not support images/);
});

test('bash routes command and cwd through custom BashOperations; local timeout kills', async () => {
  const seen: { command: string; cwd: string }[] = [];
  const ops: BashOperations = {
    exec: async (command, cwd, { onData }) => {
      seen.push({ command, cwd });
      onData(Buffer.from('from-container\n'));
      return { exitCode: 0 };
    },
  };
  const result = await createBashTool('/workspace', { operations: ops }).execute('1', { command: 'ls -la' });
  assert.deepEqual(seen, [{ command: 'ls -la', cwd: '/workspace' }]);
  assert.equal(text(result), 'from-container\n');

  const started = Date.now();
  await assert.rejects(
    createBashTool(await tmp(), { operations: createLocalBashOperations() }).execute('2', { command: 'sleep 5', timeout: 1 }),
    /Command timed out after 1 seconds/,
  );
  assert.ok(Date.now() - started < 3000, 'timeout should kill the process well before sleep ends');
});

test('agent loop: tool call -> tool result -> text ends the run; beforeSettle continueWith adds exactly one turn', async () => {
  const echo: AgentTool = {
    name: 'echo', label: 'echo', description: 'echo', parameters: Type.Object({ value: Type.String() }),
    execute: async (_id, params) => ({ content: [{ type: 'text', text: `echo:${(params as { value: string }).value}` }], details: {} }),
  };
  const run = async (withSettle: boolean) => {
    const { streamFn, calls } = scripted([
      assistant([{ type: 'toolCall', id: 'c1', name: 'echo', arguments: { value: 'hi' } }]),
      assistant([{ type: 'text', text: 'done' }]),
      ...(withSettle ? [assistant([{ type: 'text', text: 'checked' }])] : []),
    ]);
    let settles = 0;
    const agent = new Agent({
      initialState: { model, systemPrompt: 'sys', tools: [echo] },
      streamFn,
      ...(withSettle && {
        beforeSettle: async () => (settles++ === 0 ? { continueWith: 'please verify' } : undefined),
      }),
    });
    const turns: string[] = [];
    agent.subscribe((e) => { if (e.type === 'turn_end') turns.push(e.message.role); });
    await agent.prompt('go');
    await agent.waitForIdle();
    return { calls, agent, turns };
  };

  const plain = await run(false);
  assert.equal(plain.calls.length, 2);
  assert.equal(plain.calls[0]?.systemPrompt, 'sys');
  assert.deepEqual(plain.calls[0]?.tools?.map((t) => t.name), ['echo']);
  const second = plain.calls[1]!.messages;
  const toolResult = second[second.length - 1] as AgentMessage;
  assert.equal(toolResult.role, 'toolResult');
  assert.equal(text(toolResult as { content: { type: string; text?: string }[] }), 'echo:hi');
  assert.deepEqual(plain.agent.state.messages.map((m) => m.role), ['user', 'assistant', 'toolResult', 'assistant']);

  const settled = await run(true);
  assert.equal(settled.calls.length, 3);
  assert.equal(settled.turns.length, 3);
  const last = settled.calls[2]!.messages.at(-1)!;
  assert.equal(last.role, 'user');
  assert.equal(text(last as { content: { type: string; text?: string }[] }), 'please verify');
  assert.equal(settled.agent.state.messages.at(-1)?.role, 'assistant');
});

test('compactIfNeeded summarizes old history into a leading summary message', async () => {
  const filler = (s: string) => s.repeat(400);
  const messages: AgentMessage[] = [
    { role: 'user', content: filler('a'), timestamp: 1 },
    assistant([{ type: 'text', text: filler('b') }, { type: 'toolCall', id: 't', name: 'read', arguments: { path: 'x.html' } }]),
    { role: 'toolResult', toolCallId: 't', toolName: 'read', content: [{ type: 'text', text: filler('c') }], isError: false, timestamp: 3 },
    assistant([{ type: 'text', text: filler('d') }]),
    { role: 'user', content: filler('e'), timestamp: 5 },
  ];
  const { streamFn, calls } = scripted([assistant([{ type: 'text', text: '## Goal\nsummary' }])]);
  const untouched = await compactIfNeeded(messages, { model, streamFn, contextWindow: 1_000_000 });
  assert.equal(untouched, messages);

  const compacted = await compactIfNeeded(messages, { model, streamFn, contextWindow: 200, reserveTokens: 50, keepRecentTokens: 50 });
  assert.equal(calls.length, 1);
  assert.ok(compacted.length < messages.length);
  const summary = getCompactionSummary(compacted[0]);
  assert.ok(summary?.startsWith('## Goal\nsummary'));
  assert.match(summary!, /<read-files>\nx\.html\n<\/read-files>/);
  assert.equal(compacted.at(-1), messages.at(-1));
  assert.match(text(calls[0]!.messages[0] as { content: { type: string; text?: string }[] }), /^<conversation>\n\[User\]: a/);
});
