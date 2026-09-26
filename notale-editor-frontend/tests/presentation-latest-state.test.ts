import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { latestPresentationState } from '../src/presentation/latest-state';
test('takeover keeps newer broadcast progress over a delayed checkpoint', () => {
  const current = { term: 4, sequence: 12, slideId: 'second', step: 2 };
  assert.equal(latestPresentationState(current, { ...current, sequence: 10, slideId: 'first', step: 0 }), current);
  assert.equal(latestPresentationState(current, { ...current, term: 3, sequence: 99 }), current);
  assert.equal(latestPresentationState(current, { ...current }), current);
  assert.equal(latestPresentationState(current), current);
  const newer = { ...current, sequence: 13 };
  assert.equal(latestPresentationState(current, newer), newer);
  const nextController = { ...current, term: 5, sequence: 0 };
  assert.equal(latestPresentationState(current, nextController), nextController);
});
