import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTitle, AUTO_TITLE_MAX } from '../src/core/title.js';
import { createRunRequestSchema } from '../src/protocol/index.js';
import { validate } from '../src/session/understand.js';

test('run titles normalize whitespace, retain Unicode and fall back only when blank', () => {
  const request = createRunRequestSchema.parse({ query: 'A long generation instruction', title: '  贝叶斯\n 推断  ' });
  assert.equal(request.title, '贝叶斯 推断');
  assert.equal(createRunRequestSchema.parse({ query: 'Fallback', title: ' \n ' }).title, undefined);
  assert.equal(normalizeTitle('🪐'.repeat(400))?.length, 300);
  assert.equal(normalizeTitle('🪐'.repeat(400), AUTO_TITLE_MAX)?.length, 80);
  assert.equal(normalizeTitle('🪐'.repeat(400), 3), '🪐');
  assert.throws(() => createRunRequestSchema.parse({ query: 'Topic', title: 42 }));
});

test('understanding and direct runs use the same title normalization', () => {
  const route = validate({ action: 'generate', query: 'Topic', title: '  A\n title  ' }, { text: 'Topic', history: [], artifacts: [], files: [] });
  assert.equal(route.action, 'generate');
  if (route.action === 'generate') assert.equal(route.title, 'A title');
});
