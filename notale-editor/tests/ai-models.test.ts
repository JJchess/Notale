import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRegistry } from '../src/server/ai-model.js';

/** A fake network: each service answers its model listing; `calls` counts what was asked. */
function network(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const request = (async (url: string | URL) => {
    const href = String(url); calls.push(href);
    const hit = Object.entries(routes).find(([prefix]) => href.startsWith(prefix))?.[1];
    return new Response(JSON.stringify(hit?.body ?? {}), { status: hit ? hit.status ?? 200 : 404 });
  }) as typeof fetch;
  return { request, calls };
}
const env = { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', SILICONFLOW_API_KEY: 's', SILICONFLOW_BASE_URL: 'https://sf.test/v1' } as NodeJS.ProcessEnv;
const routes = {
  'https://openrouter.ai/api/v1/key': { body: { data: { label: 'k' } } },
  'https://generativelanguage.googleapis.com/v1beta/models': { body: { models: [
    { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1_048_576, supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] } },
  'https://openrouter.ai/api/v1/models': { body: { data: [
    { id: 'a/tools-vision', name: 'A', context_length: 200_000, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['tools', 'reasoning'] },
    { id: 'b/no-tools', name: 'B', supported_parameters: ['temperature'] },
  ] } },
  'https://sf.test/v1/models': { body: { data: [{ id: 'deepseek-ai/DeepSeek-V3' }, { id: 'BAAI/bge-m3-embedding' }] } },
};

test('services without a key are listed, disabled; with a key, the models it can use', async () => {
  const { request } = network(routes);
  const providers = await new ModelRegistry(env, request).list();
  const by = Object.fromEntries(providers.map(p => [p.provider, p]));
  assert.deepEqual(by.openai, { provider: 'openai', name: 'OpenAI', available: false, reason: '未配置密钥', models: [] });
  assert.deepEqual(by.google!.models.map(m => m.id), ['gemini-3.8-flash'], 'embedding models are not chat models');
  assert.deepEqual(by.openrouter!.models, [{ id: 'a/tools-vision', name: 'A', vision: true, contextWindow: 200_000, input: ['text', 'image'] }], 'only models that call tools');
  assert.deepEqual(by.siliconflow!.models.map(m => [m.id, m.vision]), [['deepseek-ai/DeepSeek-V3', false]], 'no capability data: text-only, embeddings dropped');
});
test('a key the service rejects says so, and is asked again next time instead of cached', async () => {
  const { request, calls } = network({ ...routes, 'https://openrouter.ai/api/v1/models': { status: 401, body: { error: { message: 'bad key' } } } });
  const registry = new ModelRegistry(env, request);
  const openrouter = (await registry.list()).find(p => p.provider === 'openrouter')!;
  assert.deepEqual([openrouter.available, openrouter.reason], [false, '探测模型失败：HTTP 401']);
  await new Promise(done => setTimeout(done, 0));
  await registry.list();
  assert.equal(calls.filter(url => url.startsWith('https://openrouter.ai/api/v1/models')).length, 2);
  assert.equal(calls.filter(url => url.startsWith('https://sf.test')).length, 1, 'a good listing is cached');
});
test('a turn gets a runtime for the model picked, on the right protocol; an unknown one is refused', async () => {
  const registry = new ModelRegistry(env, network(routes).request);
  const picked = await registry.runtime({ provider: 'openrouter', id: 'a/tools-vision' });
  assert.deepEqual([picked.model.api, picked.model.baseUrl, picked.vision, picked.model.reasoning], ['openai-completions', 'https://openrouter.ai/api/v1', true, true]);
  assert.equal((await registry.runtime({ provider: 'google', id: 'gemini-3.8-flash' })).model.api, 'google-generative-ai');
  assert.equal((await registry.runtime()).model.id, 'gemini-3.8-flash', 'no pick: the default');
  await assert.rejects(registry.runtime({ provider: 'openai', id: 'gpt' }), /模型不可用/);
  await assert.rejects(registry.runtime({ provider: 'openrouter', id: 'b/no-tools' }), /模型不可用/);
});
test('a public model listing does not vouch for the key: OpenRouter\'s key is checked on its own', async () => {
  const { request } = network({ ...routes, 'https://openrouter.ai/api/v1/key': { status: 401, body: { error: { message: 'API key expired.' } } } });
  const openrouter = (await new ModelRegistry(env, request).list()).find(p => p.provider === 'openrouter')!;
  assert.deepEqual([openrouter.available, openrouter.reason, openrouter.models], [false, '密钥无效：HTTP 401', []]);
});
