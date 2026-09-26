import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { getEventListeners } from 'node:events';
import type { AddressInfo, Socket } from 'node:net';
import { Type } from 'typebox';
import { streamOpenAICompletions, type Api, type Context, type Model } from '../src/server/agent/pi/index.js';

/** A local Chat Completions endpoint: `reply` writes the SSE body (or nothing); request bodies are recorded. */
async function withServer(reply: (res: ServerResponse) => void, run: (baseUrl: string, bodies: any[]) => Promise<void>) {
  const bodies: any[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
      reply(res);
    });
  });
  server.on('connection', s => { sockets.add(s); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise(done => server.close(done));
  }
}

const sse = (chunks: object[]) => (res: ServerResponse) => {
  for (const c of chunks) res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'm', ...c })}\n\n`);
  res.end('data: [DONE]\n\n');
};
const delta = (d: object, finish_reason: string | null = null) => ({ choices: [{ index: 0, delta: d, finish_reason }] });

const model = (baseUrl: string, input: ('text' | 'image')[] = ['text']) => ({
  id: 'm', name: 'm', api: 'openai-completions', provider: 'test', baseUrl, reasoning: false, input,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 100,
}) as Model<Api>;
const hi: Context = { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] };

test('text deltas stream as text_delta events; final message has text, stop and usage', async () => {
  await withServer(sse([
    delta({ role: 'assistant', content: 'Hel' }),
    delta({ content: 'lo' }),
    delta({}, 'stop'),
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } } },
  ]), async (baseUrl) => {
    const s = streamOpenAICompletions(model(baseUrl), hi, { apiKey: 'k' });
    const deltas: string[] = [];
    for await (const e of s) if (e.type === 'text_delta') deltas.push(e.delta);
    const message = await s.result();
    assert.deepEqual(deltas, ['Hel', 'lo']);
    assert.equal(message.stopReason, 'stop');
    assert.deepEqual(message.content, [{ type: 'text', text: 'Hello' }]);
    assert.equal(message.usage.input, 6);
    assert.equal(message.usage.cacheRead, 4);
    assert.equal(message.usage.output, 2);
    assert.equal(message.usage.totalTokens, 12);
  });
});

test('a tool call split across chunks becomes one toolCall with parsed arguments', async () => {
  await withServer(sse([
    delta({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read', arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '{"path":"sl' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: 'ide.html"}' } }] }, 'tool_calls'),
  ]), async (baseUrl) => {
    const message = await streamOpenAICompletions(model(baseUrl), hi, { apiKey: 'k' }).result();
    assert.equal(message.stopReason, 'toolUse');
    assert.deepEqual(message.content, [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'slide.html' } }]);
  });
});

test('request body carries tools, and user images only when the model takes images', async () => {
  const context: Context = {
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', mimeType: 'image/png', data: 'AAAA' }], timestamp: 0 }],
    tools: [{ name: 'read', description: 'Read a file', parameters: Type.Object({ path: Type.String() }) }],
  };
  await withServer(sse([delta({ content: 'ok' }, 'stop')]), async (baseUrl, bodies) => {
    await streamOpenAICompletions(model(baseUrl, ['text', 'image']), context, { apiKey: 'k' }).result();
    await streamOpenAICompletions(model(baseUrl, ['text']), context, { apiKey: 'k' }).result();
    const [withImages, textOnly] = bodies;
    assert.equal(withImages.tools[0].function.name, 'read');
    assert.equal(withImages.messages[0].role, 'system');
    assert.equal(withImages.stream, true);
    const parts = (body: any) => body.messages.find((m: any) => m.role === 'user').content;
    assert.deepEqual(parts(withImages)[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
    assert.ok(!JSON.stringify(parts(textOnly)).includes('image_url'));
  });
});

test('a stream that goes quiet is cut by the idle timer and leaves no listener on the caller signal', async () => {
  await withServer(() => {}, async (baseUrl) => {
    const run = new AbortController();
    const started = Date.now();
    const message = await streamOpenAICompletions(model(baseUrl), hi, { apiKey: 'k', signal: run.signal, timeoutMs: 300 }).result();
    assert.equal(message.stopReason, 'error');
    assert.match(message.errorMessage ?? '', /idle timeout/);
    assert.ok(Date.now() - started < 5_000);
    assert.equal(getEventListeners(run.signal, 'abort').length, 0);
  });
});
