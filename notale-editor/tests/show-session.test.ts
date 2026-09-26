import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readShowCheckpoint } from '../src/browser/show-session.js';
test('presentation recovery rejects corrupt, cross-document and cross-revision state', () => {
  const state = {
    documentId: 'lecture',
    version: 3,
    slideId: 'page',
    step: 4,
    max: 7,
    started: Date.now() - 5000,
    blank: true,
    speaker: true,
    overview: false,
  };
  assert.deepEqual(readShowCheckpoint(JSON.stringify(state), 'lecture', 3), state);
  assert.equal(readShowCheckpoint('{', 'lecture', 3), undefined);
  assert.equal(readShowCheckpoint(JSON.stringify(state), 'another', 3), undefined);
  assert.equal(readShowCheckpoint(JSON.stringify(state), 'lecture', 4), undefined);
  for (const patch of [
    { step: 8 },
    { max: 501 },
    { started: Date.now() + 60000 },
    { blank: 'yes' },
    { slideId: null },
  ])
    assert.equal(
      readShowCheckpoint(JSON.stringify({ ...state, ...patch }), 'lecture', 3),
      undefined,
    );
});
