import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import Fastify from 'fastify';
import { ModelRegistry } from '../src/adapters/models/registry.js';
import { loadConfig } from '../src/adapters/models/profiles.js';
import { baselineRuntime } from '../src/core/baseline-pipeline.js';
import { SessionStore } from '../src/session/session.js';
import { sessionRoutes } from '../src/session/routes.js';
import { turn, type Generator, type Fixer } from '../src/session/turn.js';
import { modelComplete, type Complete } from '../src/session/understand.js';
import { openAIHttpBody } from '../src/fix/pi/ai/openai-http.js';
import { transformMessages } from '../src/fix/pi/ai/transform-messages.js';

const google = { providerId: 'google', modelId: 'gemini-3.8-flash' }, glm = { providerId: 'paratera', modelId: 'GLM-5.3-Flash' };
const env = { GEMINI_API_KEY: 'google-test', PARATERA_API_KEY: 'glm-test' };
const registry = () => new ModelRegistry(loadConfig(), env);
const generator: Generator = { start: async () => ({ runId: 'test-run' }), follow: async () => ({ status: 'completed' }), describe: async () => ({ title: 'test', pages: ['one'] }), cancel: async () => {} };
const fixer: Fixer = { run: async () => ({ status: 'no-change' }) };

test('catalog is curated and contains no credentials; invalid and unconfigured choices never fall back', () => {
  const models = registry(), catalog = models.catalog();
  assert.deepEqual(catalog.defaultModel, google);
  assert.deepEqual(catalog.providers.map(p => p.models.map(m => m.id)), [[google.modelId], [glm.modelId]]);
  assert.ok(!JSON.stringify(catalog).includes('test'));
  assert.throws(() => models.resolve({ ...glm, modelId: 'arbitrary' }), /允许/);
  assert.throws(() => models.resolve({ ...glm, baseUrl: 'http://elsewhere' }), /有效/);
  assert.throws(() => new ModelRegistry(loadConfig(), {}).resolve(glm), /凭据/);
  assert.throws(() => models.resolve(null), /有效/);
  assert.deepEqual(models.resolve().ref, google);
});

test('interleaved selections isolate all planner, director and builder profiles', async () => {
  const models = registry();
  const selected = await Promise.all([google, glm, google].map(async ref => {
    const resolved = models.resolve(ref);
    await Promise.resolve();
    const runtime = baselineRuntime('/tmp/notale-model-selection-unused', { config: resolved.config, env, profile: resolved.profile.id });
    assert.equal(runtime.models.planner.profile.model, ref.modelId);
    assert.equal(runtime.models.director.profile.model, ref.modelId);
    for (const model of Object.values(runtime.models.builders)) assert.equal(model.profile.model, ref.modelId);
    return resolved;
  }));
  selected[0]!.config.model.name = 'mutated';
  assert.equal(selected[2]!.config.model.name, google.modelId);
  assert.equal(models.agent(google).model.api, 'google-generative-ai');
  assert.equal(models.agent(glm).model.api, 'openai-completions');
});

test('a turn persists its model and passes it through generation and cross-provider fixing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'notale-model-turn-')); t.after(() => rm(root, { recursive: true, force: true }));
  const session = await new SessionStore(root).create();
  const seen: unknown[] = [];
  const complete: Complete = async () => ({ content: [{ type: 'toolCall', name: 'Route', arguments: session.artifacts.length ? { action: 'fix', target: 'test-run', instruction: 'change' } : { action: 'generate', query: 'test' } }] });
  const deps = { complete, generator: { ...generator, start: async (request: Parameters<Generator['start']>[0]) => { seen.push(request.model); return generator.start(request); } },
    fixer: { run: async (request: Parameters<Fixer['run']>[0]) => { seen.push(request.model); return { status: 'no-change' }; } }, emit: () => {} };
  await turn(session, { text: 'new', fileIds: [], model: google }, deps);
  await turn(session, { text: 'change', fileIds: [], model: glm }, deps);
  assert.deepEqual(seen, [google, glm]);
  assert.deepEqual(session.entries.filter(e => e.type === 'user').map(e => e.model), [google, glm]);
});

test('interrupt reaches understanding and no generation starts after a late model response', async t => {
  const root = await mkdtemp(join(tmpdir(), 'notale-model-stop-')); t.after(() => rm(root, { recursive: true, force: true }));
  const session = await new SessionStore(root).create(), stop = new AbortController();
  let started = false;
  await assert.rejects(turn(session, { text: 'new', fileIds: [], model: glm }, {
    generator: { ...generator, start: async request => { started = true; return generator.start(request); } }, fixer, emit: () => {}, signal: stop.signal,
    complete: async (_input, signal) => { assert.equal(signal, stop.signal); stop.abort(); return { content: [{ type: 'toolCall', name: 'Route', arguments: { action: 'generate', query: 'test' } }] }; },
  }), { name: 'AbortError' });
  assert.equal(started, false);
});

test('HTTP validates model before recording a message; absent selection records the server default', async t => {
  const root = await mkdtemp(join(tmpdir(), 'notale-model-route-')), app = Fastify();
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const models = registry();
  const complete: Complete = async () => ({ content: [{ type: 'text', text: 'ok' }] });
  sessionRoutes(app, { root, complete, generator, fixer, runOutput: () => root, resolveModel: value => ({ model: models.resolve(value).ref, complete }) });
  const { id } = (await app.inject({ method: 'POST', url: '/v1/sessions' })).json();
  const url = `/v1/sessions/${id}/turns`;
  const rejected = await app.inject({ method: 'POST', url, payload: { text: 'hello', model: { ...glm, modelId: 'old' } } });
  assert.equal(rejected.statusCode, 400);
  assert.equal((await app.inject(`/v1/sessions/${id}`)).json().entries.filter((e: { type: string }) => e.type === 'user').length, 0);
  const accepted = await app.inject({ method: 'POST', url, payload: { text: 'hello' } });
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual((await app.inject(`/v1/sessions/${id}`)).json().entries.find((e: { type: string }) => e.type === 'user').model, google);
});

test('GLM thinking and streamed tool context replay only to the same provider and model', async t => {
  const config = loadConfig();
  let body: any;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    body = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const delta of [{ reasoning_content: 'first' }, { reasoning_content: ' second', tool_calls: [{ index: 0, id: 'call_1', extra_content: { google: { thought_signature: 'opaque' } }, function: { name: 'Route', arguments: '{"action":"reply","text":"ok"}' } }] }]) res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
    res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  config.builder!.profiles['glm53-flash-low']!.base_url = `http://127.0.0.1:${addr.port}/v1`;
  const models = new ModelRegistry(config, env), agent = models.agent(glm);
  const result = await (await agent.streamFn(agent.model, { messages: [] }, {})).result();
  assert.equal(result.stopReason, 'toolUse', result.errorMessage);
  assert.deepEqual(body.thinking, { type: 'enabled', clear_thinking: false });
  const same = openAIHttpBody(agent.model, { messages: [result] });
  assert.equal(same.messages[0].reasoning_content, 'first second');
  assert.equal(same.messages[0].tool_calls[0].extra_content.google.thought_signature, 'opaque');
  const other = openAIHttpBody({ ...agent.model, provider: 'other' }, { messages: [result] });
  assert.equal(other.messages[0].reasoning_content, undefined);
  assert.equal(other.messages[0].tool_calls[0].extra_content, undefined);
  assert.equal(other.messages[0].tool_calls[0].id, 'call_1');
  const files = openAIHttpBody(agent.model, { messages: [{ role: 'user', content: [{ type: 'file', mimeType: 'application/pdf', path: '/old/reference.pdf', bytes: 10 }], timestamp: 1 }] });
  assert.match(files.messages[0].content[0].text, /pdf omitted/);
  const native = models.agent(google).model;
  const signed = { ...result, api: native.api, provider: native.provider, model: native.id, content: [{ type: 'toolCall' as const, id: 'call_1', name: 'read', arguments: {}, thoughtSignature: 'native-signature' }] };
  assert.equal((transformMessages([signed], native)[0]!.content[0] as { thoughtSignature?: string }).thoughtSignature, 'native-signature');
  assert.equal((transformMessages([signed], agent.model)[0]!.content[0] as { thoughtSignature?: string }).thoughtSignature, undefined);
  const aborted = await modelComplete(() => agent)({ systemPrompt: '', messages: [], tools: [] }, AbortSignal.abort());
  assert.equal(aborted.stopReason, 'aborted');
});
