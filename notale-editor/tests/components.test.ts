import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { componentSchema } from '../src/domain/components.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
import { maxStep } from '../src/domain/timeline.js';
function fixture() {
  const slide = slideSchema.parse({
    id: 'one',
    sourcePath: 'one.html',
    ...importHtml(
      '<main id="stage"><section id="component"><h2 id="title">Question</h2><button id="reveal">Reveal</button><p id="answer">Answer</p></section><p id="outside">Outside</p></main>',
    ),
  });
  const ids = Object.fromEntries(
    inspectSlide(slide)
      .filter((o) => o.domId)
      .map((o) => [o.domId!, o.id]),
  );
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'components',
    title: 'Components',
    slides: [
      slide,
      slideSchema.parse({
        id: 'two',
        sourcePath: 'nested/two.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
  });
  const component = componentSchema.parse({
    id: 'lesson',
    root: ids.component,
    name: 'Reveal',
    initial: 'question',
    states: [
      { id: 'question', name: 'Question', patches: { [ids.answer]: { visible: false } } },
      {
        id: 'answer',
        name: 'Answer',
        patches: {
          [ids.answer]: { visible: true, style: { color: '#135f43' } },
          [ids.title]: { text: 'Explanation' },
        },
      },
    ],
    events: [{ id: 'click', target: ids.reveal, event: 'click', to: 'answer' }],
    steps: [{ step: 2, state: 'answer' }],
  });
  return { doc, ids, component };
}
function apply(doc: ReturnType<typeof fixture>['doc'], commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'test', commands }).commands,
  );
}
test('components preserve source, edit states and steps, detach without flattening author content', () => {
  const { doc, component } = fixture();
  const edited = apply(doc, [{ type: 'component.set', slideId: 'one', component }]);
  assert.equal(edited.slides[0].html, doc.slides[0].html);
  assert.equal(maxStep(edited.slides[0]), 2);
  const explicitZero = apply(edited, [
    {
      type: 'component.set',
      slideId: 'one',
      component: { ...component, steps: [{ step: 0, state: 'question' }] },
    },
  ]);
  assert.equal(
    apply(explicitZero, [
      { type: 'component.state', slideId: 'one', id: component.id, state: 'answer' },
    ]).slides[0].components![0].steps[0].state,
    'answer',
  );
  const changed = apply(edited, [
    { type: 'component.state', slideId: 'one', id: component.id, state: 'answer' },
  ]);
  assert.equal(changed.slides[0].components![0].initial, 'answer');
  assert.equal(changed.slides[0].components![0].steps[0].step, 2);
  const detached = apply(changed, [{ type: 'component.remove', slideId: 'one', id: component.id }]);
  assert.deepEqual(detached.slides[0].components, []);
  assert.equal(detached.slides[0].html, doc.slides[0].html);
  assert.ok(!Object.hasOwn(documentSchema.parse(doc).slides[0], 'components'));
});
test('component metadata remaps through copy/cut with captured state and protects stale capture', () => {
  const { doc, component, ids } = fixture();
  const edited = apply(doc, [{ type: 'component.set', slideId: 'one', component }]);
  const transfer = {
    type: 'elements.transfer',
    sourceSlideId: 'one',
    slideId: 'two',
    targets: [ids.component],
    mode: 'copy',
    componentStates: { lesson: 'answer' },
  };
  const copied = apply(edited, [transfer]);
  const copy = copied.slides[1].components![0];
  assert.notEqual(copy.id, component.id);
  assert.notEqual(copy.root, component.root);
  assert.equal(copy.initial, 'answer');
  assert.notEqual(copy.events[0].target, ids.reveal);
  assert.ok(!Object.hasOwn(copy.states[0].patches, ids.answer));
  validateDocument(copied);
  assert.throws(() => apply(edited, [{ ...transfer, targets: [ids.answer] }]), {
    code: 'COMPONENT_BOUNDARY',
  });
  assert.throws(() => apply(edited, [{ ...transfer, componentStates: { lesson: 'missing' } }]), {
    code: 'INVALID_CLIPBOARD',
  });
  const newer = apply(edited, [
    { type: 'component.state', slideId: 'one', id: 'lesson', state: 'answer' },
  ]);
  assert.throws(
    () => apply(newer, [{ ...transfer, mode: 'cut', sourceSnapshot: edited.slides[0] }]),
    { code: 'CLIPBOARD_CHANGED' },
  );
  const moved = apply(edited, [{ ...transfer, mode: 'cut' }]);
  assert.deepEqual(moved.slides[0].components, []);
  assert.equal(moved.slides[1].components!.length, 1);
});
test('component validation rejects invalid references, destructive text, ambiguous events and conflicting ownership', () => {
  const { doc, component, ids } = fixture();
  const variants = [
    { ...component, initial: 'missing' },
    { ...component, states: [component.states[0], component.states[0]] },
    { ...component, root: ids.answer },
    {
      ...component,
      states: [{ id: 'question', name: 'Bad', patches: { [ids.component]: { text: 'erase' } } }],
    },
    { ...component, steps: [{ step: 2, state: 'missing' }] },
    {
      ...component,
      events: [component.events[0], { ...component.events[0], id: 'other', from: 'answer' }],
    },
  ];
  for (const value of variants)
    assert.throws(() => apply(doc, [{ type: 'component.set', slideId: 'one', component: value }]), {
      code: 'INVALID_COMPONENT',
    });
  assert.throws(
    () =>
      apply(doc, [
        { type: 'component.set', slideId: 'one', component },
        {
          type: 'component.set',
          slideId: 'one',
          component: { ...component, id: 'collision', root: ids.stage },
        },
      ]),
    { code: 'COMPONENT_CONFLICT' },
  );
  assert.throws(() =>
    componentSchema.parse({
      ...component,
      states: [
        {
          id: 'question',
          name: 'Resource',
          patches: { [ids.answer]: { style: { background: 'url(missing.png)' } } },
        },
      ],
    }),
  );
});
test('structural edits prune component events and state targets while locks protect component changes', () => {
  const { doc, component, ids } = fixture();
  const edited = apply(doc, [{ type: 'component.set', slideId: 'one', component }]);
  const pruned = apply(edited, [
    { type: 'element.delete', slideId: 'one', target: ids.answer },
    { type: 'element.delete', slideId: 'one', target: ids.reveal },
  ]);
  assert.deepEqual(pruned.slides[0].components![0].events, []);
  assert.deepEqual(pruned.slides[0].components![0].states[0].patches, {});
  const locked = apply(edited, [
    { type: 'element.lock', slideId: 'one', target: ids.answer, locked: true },
  ]);
  assert.throws(
    () =>
      apply(locked, [{ type: 'component.state', slideId: 'one', id: 'lesson', state: 'answer' }]),
    { code: 'LOCKED' },
  );
  assert.throws(
    () => apply(edited, [{ type: 'element.duplicate', slideId: 'one', target: ids.component }]),
    { code: 'COMPONENT_BOUNDARY' },
  );
  const removed = apply(edited, [
    { type: 'element.delete', slideId: 'one', target: ids.component },
  ]);
  assert.deepEqual(removed.slides[0].components, []);
});
