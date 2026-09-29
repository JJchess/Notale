import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineRuntime } from '../src/core/baseline-pipeline.js';
import { fixModel, createConfiguredFixModel } from '../src/fix/istar.js';
import type { ModelConfig } from '../src/adapters/models/profiles.js';

const config: ModelConfig = { model: { name: 'host-model', base_url: 'http://host/v1', api_key_env: 'HOST_KEY', wire_api: 'responses', reasoning_effort: 'low', vision_input: true }, planner: { reasoning_effort: 'low' },
  builder: { default_profile: 'host', profiles: { host: { model: 'host-model', base_url: 'http://host/v1', api_key_env: 'HOST_KEY', adapter: 'responses', reasoning_effort: 'low', vision_input: true } } } };

test('explicit generator environment requires configuration and never reads dotenv', () => {
  assert.throws(() => baselineRuntime('/tmp/not-used', { env: {} }), /requires a model config/);
  const runtime = baselineRuntime('/tmp/not-used', { config, env: { HOST_KEY: 'host-key' }, envFile: '/must-not-read/.env' });
  assert.deepEqual(runtime.env, { HOST_KEY: 'host-key' });
  assert.equal(runtime.models.planner.profile.base_url, 'http://host/v1');
  assert.equal(runtime.models.planner.profile.adapter, 'responses');
  assert.equal(runtime.cfg, config);
});

test('explicit fix configuration selects its protocol and cannot fall back to standalone keys', async () => {
  const runtime = fixModel({ HOST_KEY: 'host-key', GEMINI_API_KEY: 'forbidden' }, config);
  assert.equal(runtime.model.api, 'openai-responses'); assert.equal(runtime.model.baseUrl, 'http://host/v1');
  assert.equal(runtime.apiKey, 'host-key');
  assert.throws(() => fixModel({ GEMINI_API_KEY: 'forbidden' }, config), /HOST_KEY/);
  assert.equal(fixModel({ HOST_KEY: 'host-key' }, { ...config, model: { ...config.model, wire_api: 'chat' } }).model.api, 'openai-completions');
  assert.throws(() => createConfiguredFixModel({ model: { ...runtime.model, api: 'unknown' }, apiKey: 'host-key' }), /Unsupported/);
  const result = await (await runtime.streamFn(runtime.model, { messages: [] }, { signal: AbortSignal.abort() })).result();
  assert.equal(result.stopReason, 'aborted');
});
