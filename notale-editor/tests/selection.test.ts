import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectIds } from '../src/domain/selection.js';
const objects = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c', parent: 'a' },
  { id: 'd', parent: 'c' },
  { id: 'e' },
];
test('groups toggle atomically and repeated hits in one gesture do not toggle twice', () => {
  const groups = [{ members: ['a', 'b'] }];
  assert.deepEqual(selectIds([], ['a', 'b'], objects, groups, 'toggle'), ['a', 'b']);
  assert.deepEqual(selectIds(['a', 'b', 'e'], ['b'], objects, groups, 'toggle'), ['e']);
  assert.deepEqual(selectIds(['e'], ['b'], objects, groups, 'add'), ['e', 'a', 'b']);
});
test('explicit child selection replaces its ancestor group, while a marquee keeps selected roots', () => {
  const groups = [{ members: ['a', 'b'] }];
  assert.deepEqual(selectIds(['a', 'b'], ['d'], objects, groups, 'add'), ['d']);
  assert.deepEqual(selectIds(['d'], ['a'], objects, groups, 'add'), ['a', 'b']);
  assert.deepEqual(selectIds([], ['d', 'c', 'a', 'e'], objects, []), ['a', 'e']);
  assert.deepEqual(selectIds(['a', 'c'], [], objects, [], 'add'), ['a']);
  assert.deepEqual(selectIds(['missing'], ['c', 'missing'], objects, [], 'add'), ['c']);
});
