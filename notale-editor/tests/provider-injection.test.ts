import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createConfiguredAiRuntime, ModelRegistry } from '../src/server/ai-model.js';
import { streamOpenAIHttp, openAIHttpBody } from '../src/server/agent/pi/ai/openai-http.js';
import type { Model, Api } from '../src/server/agent/pi/index.js';

const model = (api: Api, baseUrl = 'http://127.0.0.1:1'): Model<Api> => ({ id: 'host-model', name: 'Host model', api, provider: 'host', baseUrl,
  reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 1000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });

test('explicit registry ignores built-ins and model files; missing default or key cannot fall back to Google', async () => {
  const poisoned = { GEMINI_API_KEY: 'old-key', EDITOR_AI_MODELS_JSON: '/must-not-read/models.json' };
  const registry = new ModelRegistry(poisoned, fetch, { providers: { host: { name: 'Host', api: 'openai-responses', baseUrl: 'http://host/v1', apiKey: 'host-key', models: [{ id: 'host-model', input: ['text', 'image'] }] } }, defaultModel: { provider: 'host', id: 'host-model' } });
  assert.deepEqual((await registry.list()).map(p => p.provider), ['host']);
  const runtime = await registry.runtime();
  assert.equal(runtime.model.api, 'openai-responses');
  assert.equal(runtime.getApiKey?.(), 'host-key');
  await assert.rejects(registry.runtime({ provider: 'google', id: 'gemini-3.8-flash' }), /模型不可用/);
  await assert.rejects(new ModelRegistry(poisoned, fetch, { providers: {} }).runtime(), /No default model/);
  assert.throws(() => createConfiguredAiRuntime({ model: model('openai-responses'), apiKey: '' }), /credential/);
  assert.throws(() => createConfiguredAiRuntime({ model: model('unexpected'), apiKey: 'host-key' }), /Unsupported/);
});

for (const api of ['openai-responses', 'openai-completions'] as const) test(`${api} uses configured endpoint/key and preserves a tool round trip`, async t => {
  const requests: { path: string; auth: string | undefined; body: any }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ path: req.url!, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const event = (value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
    if (api === 'openai-responses') {
      event({ type: 'response.output_text.delta', delta: 'Checking' });
      event({ type: 'response.completed', response: { id: 'resp_1', status: 'completed', output: [
        { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] },
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read', arguments: '{"path":"page.html"}' },
      ], usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 4 } } } });
    } else {
      event({ id: 'chat_1', choices: [{ delta: { content: 'Checking', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read', arguments: '{"path":' } }] } }] });
      event({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"page.html"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    }
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const target = model(api, `http://127.0.0.1:${address.port}/v1`);
  const context = { systemPrompt: 'Test', messages: [{ role: 'user' as const, content: 'Read', timestamp: 1 }] };
  const stream = streamOpenAIHttp(target, context, { apiKey: 'host-key', timeoutMs: 1000 });
  const events: string[] = []; for await (const event of stream) events.push(event.type);
  const result = await stream.result();
  assert.equal(result.stopReason, 'toolUse', result.errorMessage);
  assert.ok(events.includes('text_delta'));
  assert.deepEqual(result.content.find(part => part.type === 'toolCall'), { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'page.html' } });
  assert.equal(requests[0]!.auth, 'Bearer host-key');
  assert.equal(requests[0]!.path, api === 'openai-responses' ? '/v1/responses' : '/v1/chat/completions');
  const next = openAIHttpBody(target, { messages: [result, { role: 'toolResult', toolCallId: 'call_1', toolName: 'read', content: [{ type: 'text', text: '<p>Done</p>' }], isError: false, timestamp: 2 }] });
  if (api === 'openai-responses') { assert.equal(next.input[0].encrypted_content, 'opaque'); assert.equal(next.input[2].call_id, 'call_1'); }
  else assert.equal(next.messages[1].tool_call_id, 'call_1');
});

test('missing credential and aborted requests finish as errors without a request', async () => {
  const missing = await streamOpenAIHttp(model('openai-responses'), { messages: [] }).result();
  assert.equal(missing.stopReason, 'error'); assert.match(missing.errorMessage!, /credential/);
  const aborted = await streamOpenAIHttp(model('openai-responses'), { messages: [] }, { apiKey: 'host-key', signal: AbortSignal.abort() }).result();
  assert.equal(aborted.stopReason, 'aborted');
});

test('Responses rejects truncated streams and HTTP errors instead of reporting success', async t => {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/failure')) { res.writeHead(503); res.end('upstream failed'); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"response.output_text.delta","delta":"partial"}\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  for (const [path, expected] of [['truncated', /without a completed response/], ['failure', /HTTP 503/]] as const) {
    const result = await streamOpenAIHttp(model('openai-responses', `http://127.0.0.1:${address.port}/${path}`), { messages: [] }, { apiKey: 'host-key', timeoutMs: 1000 }).result();
    assert.equal(result.stopReason, 'error'); assert.match(result.errorMessage!, expected);
  }
});

test('Chat keeps all parallel tool outputs before image follow-ups', () => {
  const target = model('openai-completions');
  const base = { role: 'assistant' as const, api: target.api, provider: target.provider, model: target.id, timestamp: 1,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse' as const,
    content: ['a', 'b'].map(id => ({ type: 'toolCall' as const, id, name: 'read', arguments: { path: id } })) };
  const body = openAIHttpBody(target, { messages: [base,
    ...['a', 'b'].map(id => ({ role: 'toolResult' as const, toolCallId: id, toolName: 'read', content: [{ type: 'image' as const, mimeType: 'image/png', data: 'AA==' }], isError: false, timestamp: 2 })),
  ] });
  assert.deepEqual(body.messages.map((row: { role: string }) => row.role), ['assistant', 'tool', 'tool', 'user']);
  assert.equal(body.messages[3].content.length, 2);
});

test('configured runtime sends reasoning and token limits on the Responses wire', async t => {
  let submitted: any;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    submitted = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'resp_options', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done' }] }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const target = model('openai-responses', `http://127.0.0.1:${address.port}/v1`);
  const runtime = createConfiguredAiRuntime({ model: target, apiKey: 'host-key', reasoning: 'medium' });
  const result = await (await runtime.streamFn(target, { messages: [] }, { reasoning: 'low' })).result();
  assert.equal(result.stopReason, 'stop');
  assert.deepEqual(submitted.reasoning, { effort: 'medium' });
  assert.equal(submitted.max_output_tokens, 1000);
  await (await runtime.streamFn(target, { messages: [] }, { maxTokens: 128 })).result();
  assert.equal(submitted.max_output_tokens, 128, 'title requests retain their bounded output budget');
});
