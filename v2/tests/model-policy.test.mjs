import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_POLICY } from '../src/model-policy.mjs';

test('运行时模型策略统一到指定的四类 provider', () => {
  assert.deepEqual(MODEL_POLICY.text, {
    provider: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnv: 'SILCONFLOW_API_KEY',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
  });
  assert.equal(MODEL_POLICY.vision.provider, 'siliconflow');
  assert.equal(MODEL_POLICY.vision.model, 'Qwen/Qwen3-VL-32B-Instruct');
  assert.equal(MODEL_POLICY.referenceImage.model, 'openai/gpt-image-2');
  assert.equal(MODEL_POLICY.transparentFallback.model, 'Doubao-Seedream-4.0');
});
