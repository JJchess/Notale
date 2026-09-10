import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editShortcut } from '../src/browser/shortcuts.js';
test('edit shortcuts use page-space fine/coarse nudging and platform command modifiers', () => {
  assert.deepEqual(editShortcut({ key: 'ArrowRight' }), { type: 'nudge', dx: 1, dy: 0 });
  assert.deepEqual(editShortcut({ key: 'ArrowUp', shiftKey: true }), {
    type: 'nudge',
    dx: 0,
    dy: -10,
  });
  assert.deepEqual(editShortcut({ key: 'z', ctrlKey: true, shiftKey: true }), { type: 'redo' });
  assert.deepEqual(editShortcut({ key: 'd', metaKey: true }), { type: 'duplicate' });
  assert.deepEqual(editShortcut({ key: 'Backspace' }), { type: 'delete' });
  assert.equal(editShortcut({ key: 'ArrowRight', altKey: true }), undefined);
  assert.equal(editShortcut({ key: 'ArrowRight', ctrlKey: true }), undefined);
  assert.equal(editShortcut({ key: 'PageDown' }), undefined);
  assert.deepEqual(editShortcut({ key: 's', metaKey: true }), { type: 'save' });
});
