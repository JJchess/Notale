import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlLayerCommands } from '../src/domain/html-layers.js';
const objects = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  parent: 'p',
  tag: 'div',
  namespace: 'http://www.w3.org/1999/xhtml',
  locked: false,
}));
function result(
  targets: string[],
  action: 'front' | 'back' | 'forward' | 'backward',
  locked: string[] = [],
) {
  const nodes = objects.map((node) => ({ ...node, locked: locked.includes(node.id) }));
  const styles: Record<string, Record<string, string>> = {
    p: { display: 'block' },
    a: { position: 'absolute', 'z-index': '900' },
    b: { position: 'absolute', 'z-index': '900' },
    c: { position: 'relative', 'z-index': '5000' },
    d: { position: 'absolute', 'z-index': '5000' },
  };
  const edits = htmlLayerCommands('page', targets, nodes, styles, action);
  for (const edit of edits) {
    assert.equal(edit.type, 'element.patch');
    if (edit.type === 'element.patch') {
      assert.ok(!locked.includes(edit.target));
      assert.deepEqual(Object.keys(edit.patch.style!), ['z-index']);
      styles[edit.target] = { ...styles[edit.target], ...edit.patch.style };
    }
  }
  return nodes
    .map((node, index) => ({ ...node, index, z: Number(styles[node.id]['z-index']) }))
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map((node) => node.id);
}
test('HTML layer planning handles large/tied z-indices, all four actions and stable multi-selection', () => {
  assert.deepEqual(result(['a'], 'front'), ['b', 'c', 'd', 'a']);
  assert.deepEqual(result(['d'], 'back'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(result(['a'], 'forward'), ['b', 'a', 'c', 'd']);
  assert.deepEqual(result(['c'], 'backward'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(result(['a', 'b'], 'forward'), ['c', 'a', 'b', 'd']);
  assert.deepEqual(result(['b', 'c'], 'back'), ['b', 'c', 'a', 'd']);
});
test('locked HTML layers retain their exact stacking values while movable layers reorder around them', () => {
  assert.deepEqual(result(['a'], 'front', ['b', 'd']), ['b', 'c', 'd', 'a']);
  assert.throws(() => result(['a'], 'front', ['a']), /locked/);
});
test('flow-layer placement preserves old offsets and rejects positioned-descendant or one-step reparenting hazards', () => {
  const edits = htmlLayerCommands(
    'page',
    ['a'],
    objects,
    { a: { position: 'static' }, b: { position: 'absolute', 'z-index': '9000' } },
    'front',
  );
  const edit = edits.find((edit) => edit.type === 'element.patch' && edit.target === 'a');
  assert.ok(edit && edit.type === 'element.patch');
  assert.equal(edit.patch.style!['z-index'], '9001');
  assert.equal(edit.patch.style!.position, 'relative');
  assert.throws(
    () =>
      htmlLayerCommands(
        'page',
        ['a'],
        [...objects, { id: 'child', parent: 'a', tag: 'div', namespace: objects[0].namespace }],
        { a: { position: 'static' }, child: { position: 'absolute' } },
        'front',
      ),
    /positioned descendants/,
  );
  assert.throws(
    () => htmlLayerCommands('page', ['a'], objects, { a: { position: 'static' } }, 'forward'),
    /Single-layer/,
  );
});
