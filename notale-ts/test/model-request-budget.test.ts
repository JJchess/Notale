import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelHttpError, ModelRequestBudgetError, ModelRuntime } from '../src/adapters/models/runtime.js';
import { defaultModelProfile, loadConfig, resolveBuilderProfile, type ModelConfig, type ResolvedProfile } from '../src/adapters/models/profiles.js';
import type { ChatMessage } from '../src/adapters/models/chat-model.js';

const key = 'never-log-this-credential';
const image = 'data:image/png;base64,bmV2ZXItbG9nLXRoaXMtaW1hZ2U=';
const messages: ChatMessage[] = [{ role: 'system', content: '选择风格' }, { role: 'user', content: [
  { type: 'text', text: '课程与视觉风格 🧑‍🏫' }, { type: 'image_url', image_url: { url: image } },
] }];
const profile = (adapter: string, extra: Partial<ResolvedProfile> = {}): ResolvedProfile => ({
  id: 'fixture', model: 'fixture', base_url: 'https://model.invalid/v1', api_key_env: 'TEST_MODEL_KEY',
  adapter, reasoning_effort: 'low', vision_input: true, http_timeout_sec: 5, max_output_tokens: 100,
  request_options: {}, replay_reasoning: false, ...extra,
});
const result = (adapter: string) => adapter === 'chat'
  ? { id: 'ok', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: {} }
  : adapter === 'messages'
    ? { id: 'ok', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: {} }
    : { id: 'ok', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }], status: 'completed', usage: {} };

for (const adapter of ['responses', 'chat', 'messages']) {
  test(`${adapter}: final UTF-8 body includes request options, blocks before fetch and never retries`, async t => {
    const logs: unknown[][] = [];
    t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
    const bodies: string[] = [];
    let waits = 0;
    const transport = {
      env: { TEST_MODEL_KEY: key },
      fetch: (async (_url, init) => { bodies.push(String(init?.body)); return Response.json(result(adapter)); }) as typeof fetch,
      wait: async () => { waits++; },
    };
    const runtime = new ModelRuntime(profile(adapter), transport);
    assert.equal((await runtime.respond(messages)).message.content, 'ok');
    assert.equal(logs.length, 0, 'unconfigured callers keep the original quiet behavior');
    const body = bodies[0]!, bytes = Buffer.byteLength(body, 'utf8');
    assert.ok(bytes > body.length, 'UTF-8 bytes differ from JS string length');
    await runtime.respond(messages, [], undefined, { stage: 'style-pick', maxRequestBytes: bytes });
    assert.equal(bodies.length, 2, 'an exact-size request is allowed');
    assert.deepEqual(logs[0], ['Model request', { stage: 'style-pick', adapter, requestBytes: bytes, maxRequestBytes: bytes, imageCount: 1 }]);
    assert.ok(!bodies[1]!.includes('maxRequestBytes'));
    assert.ok(!bodies[1]!.includes('style-pick'));
    await assert.rejects(runtime.respond(messages, [], undefined, { stage: 'style-pick', maxRequestBytes: bytes - 1 }), error => {
      assert.ok(error instanceof ModelRequestBudgetError);
      assert.equal(error.code, 'MODEL_REQUEST_TOO_LARGE');
      assert.deepEqual(error.request, { stage: 'style-pick', adapter, requestBytes: bytes, maxRequestBytes: bytes - 1, imageCount: 1 });
      assert.ok(!JSON.stringify(error).includes(image));
      assert.ok(!JSON.stringify(error).includes(key));
      return true;
    });
    const overridden = new ModelRuntime(profile(adapter, { request_options: { metadata: { extra: '额外'.repeat(100) } } }), transport);
    await assert.rejects(overridden.respond(messages, [], undefined, { maxRequestBytes: bytes }), error => {
      assert.ok(error instanceof ModelRequestBudgetError);
      assert.ok(error.request.requestBytes > bytes);
      assert.equal(error.request.imageCount, 1);
      return true;
    });
    assert.equal(bodies.length, 2);
    assert.equal(waits, 0);
    assert.ok(!JSON.stringify(logs).includes(image));
    assert.ok(!JSON.stringify(logs).includes(key));
  });

  test(`${adapter}: profile and stage take the smaller limit; gateway 413 carries only safe diagnostics`, async t => {
    t.mock.method(console, 'info', () => {});
    let calls = 0, waits = 0;
    const runtime = new ModelRuntime(profile(adapter, { max_request_bytes: 200_000 }), {
      env: { TEST_MODEL_KEY: key },
      fetch: (async () => { calls++; return new Response(`Request echo ${image} ${key}`, { status: 413 }); }) as typeof fetch,
      wait: async () => { waits++; },
    });
    await assert.rejects(runtime.respond(messages, [], undefined, { stage: 'template-style', maxRequestBytes: 300_000 }), error => {
      assert.ok(error instanceof ModelHttpError);
      assert.equal(error.status, 413);
      assert.equal(error.request?.maxRequestBytes, 200_000);
      assert.equal(error.request?.imageCount, 1);
      assert.equal(error.request?.stage, 'template-style');
      assert.ok(error.message.includes('template-style'));
      assert.ok(error.message.includes(`"requestBytes":${error.request?.requestBytes}`));
      assert.ok(error.message.includes('"maxRequestBytes":200000'));
      assert.ok(!error.message.includes(image));
      assert.ok(!error.message.includes(key));
      assert.equal(error.retryText, '413');
      return true;
    });
    await assert.rejects(runtime.respond(messages, [], undefined, { maxRequestBytes: 1 }), error => {
      assert.ok(error instanceof ModelRequestBudgetError);
      assert.equal(error.request.maxRequestBytes, 1);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(waits, 0);
  });
}

test('model request budget validates config and builder profiles inherit the model limit', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'notale-request-budget-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'config.yaml');
  const config: ModelConfig = {
    model: { name: 'fixture', base_url: 'https://model.invalid/v1', api_key_env: 'TEST_MODEL_KEY', max_request_bytes: 200_000 },
    planner: { reasoning_effort: 'low' },
    builder: { default_profile: 'default', profiles: {
      default: { model: 'fixture', api_key_env: 'TEST_MODEL_KEY', base_url: 'https://model.invalid/v1', adapter: 'chat', reasoning_effort: 'low', vision_input: true },
    } },
  };
  await writeFile(file, JSON.stringify(config));
  const loaded = loadConfig(file);
  assert.equal(defaultModelProfile(loaded).max_request_bytes, 200_000);
  assert.equal(resolveBuilderProfile(loaded).max_request_bytes, 200_000);
  loaded.builder!.profiles.default!.max_request_bytes = 100_000;
  assert.equal(resolveBuilderProfile(loaded).max_request_bytes, 100_000);
  for (const invalid of [0, -1, 1.5]) {
    await writeFile(file, JSON.stringify({ ...config, model: { ...config.model, max_request_bytes: invalid } }));
    assert.throws(() => loadConfig(file), /max_request_bytes/);
    await writeFile(file, JSON.stringify({ ...config, builder: { profiles: { default: { ...config.builder!.profiles.default, max_request_bytes: invalid } } } }));
    assert.throws(() => loadConfig(file), /max_request_bytes/);
  }
});
