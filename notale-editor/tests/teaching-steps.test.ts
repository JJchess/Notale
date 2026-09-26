import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentSchema,
  slideSchema,
  commitSchema,
  type DeckDocument,
} from '../src/domain/model.js';
import { componentSchema } from '../src/domain/components.js';
import { mediaSettingsSchema } from '../src/domain/media.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import {
  importHtml,
  inspectSlide,
  parse,
  findElement,
  attr,
  setAttr,
  serialize,
} from '../src/domain/html.js';
import { maxStep, stepLabel, stepNotes, stepInterval } from '../src/domain/timeline.js';
function fixture() {
  const slide = slideSchema.parse({
    id: 'one',
    sourcePath: 'one.html',
    ...importHtml(
      '<main id="stage"><section id="card"><h2 id="title">Question</h2><button id="button">Reveal</button><p id="answer">Answer</p><audio id="audio" controls></audio></section><aside data-step="3">Native</aside></main>',
    ),
  });
  const ids = Object.fromEntries(
    inspectSlide(slide)
      .filter((item) => item.domId)
      .map((item) => [item.domId!, item.id]),
  );
  slide.components = [
    componentSchema.parse({
      id: 'question',
      root: ids.card,
      name: 'Question',
      initial: 'base',
      states: [
        { id: 'base', name: 'Question', patches: { [ids.answer]: { visible: false } } },
        { id: 'answer', name: 'Answer', patches: { [ids.answer]: { visible: true } } },
      ],
      steps: [{ step: 2, state: 'answer' }],
    }),
  ];
  const tree = parse(slide.html);
  setAttr(
    findElement(tree, ids.audio),
    'data-notale-media',
    JSON.stringify(mediaSettingsSchema.parse({ startStep: 2 })),
  );
  slide.html = serialize(tree);
  slide.steps = Array.from({ length: 4 }, (_, index) => ({
    id: `s${index}`,
    name: `Step ${index}`,
    notes: `Notes ${index}`,
    advanceAfter: index === 2 ? 1200 : null,
  }));
  slide.notes = 'Page notes';
  slide.advanceAfter = 500;
  slide.animations = [
    {
      id: 'effect',
      target: ids.title,
      step: 2,
      trigger: 'click',
      effect: 'fade-in',
      duration: 500,
      delay: 0,
      easing: 'ease',
      dx: 0,
      dy: 0,
    },
  ];
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'steps',
    title: 'Steps',
    slides: [
      slide,
      slideSchema.parse({
        id: 'two',
        sourcePath: 'two.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
  });
  return { doc, ids };
}
function apply(doc: DeckDocument, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'step-test', commands }).commands,
  );
}
function media(slide: DeckDocument['slides'][number], id: string) {
  return JSON.parse(attr(findElement(parse(slide.html), id), 'data-notale-media')!);
}
test('teaching step duplication and reordering move native states, animations, components and repeated media cues together', () => {
  const { doc, ids } = fixture();
  let next = apply(doc, [{ type: 'step.duplicate', slideId: 'one', id: 's2', newId: 'reprise' }]);
  assert.deepEqual(next.slides[0].stepMap, [0, 1, 2, 2, 3]);
  assert.deepEqual(
    next.slides[0].animations.map((cue) => cue.step),
    [2, 3],
  );
  assert.equal(next.slides[0].animations[0].id, 'effect');
  assert.notEqual(next.slides[0].animations[1].id, 'effect');
  assert.equal(media(next.slides[0], ids.audio).startStep, 2);
  assert.deepEqual(media(next.slides[0], ids.audio).startSteps, [3]);
  assert.equal(next.slides[0].steps![3].notes, 'Notes 2');
  next = apply(next, [{ type: 'step.move', slideId: 'one', id: 'reprise', index: 1 }]);
  assert.deepEqual(next.slides[0].stepMap, [0, 2, 1, 2, 3]);
  assert.deepEqual(
    next.slides[0].components![0].steps.map((step) => step.state),
    ['base', 'answer', 'base', 'answer', 'answer'],
  );
  assert.deepEqual(
    next.slides[0].animations.map((cue) => cue.step),
    [3, 1],
  );
  assert.equal(media(next.slides[0], ids.audio).startStep, 1);
  assert.deepEqual(media(next.slides[0], ids.audio).startSteps, [3]);
  next = apply(next, [{ type: 'step.remove', slideId: 'one', id: 's2' }]);
  assert.equal(next.slides[0].animations.length, 1);
  assert.equal(next.slides[0].animations[0].step, 1);
  assert.deepEqual(media(next.slides[0], ids.audio).startSteps, []);
  assert.equal(maxStep(next.slides[0]), 3);
});
test('blank teaching steps hold the preceding native and component state without copying cues', () => {
  const { doc, ids } = fixture();
  const next = apply(doc, [
    { type: 'step.insert', slideId: 'one', index: 2, step: { id: 'pause', name: 'Pause' } },
  ]);
  assert.deepEqual(next.slides[0].stepMap, [0, 1, 1, 2, 3]);
  assert.equal(next.slides[0].animations[0].step, 3);
  assert.equal(next.slides[0].components![0].steps[2].state, 'base');
  assert.equal(media(next.slides[0], ids.audio).startStep, 3);
  assert.equal(next.slides[0].steps![2].notes, '');
});
test('step notes and interval patches preserve omitted fields and expose presenter content', () => {
  const { doc } = fixture();
  const next = apply(doc, [
    { type: 'step.update', slideId: 'one', id: 's2', patch: { name: 'Explanation' } },
  ]);
  assert.equal(stepNotes(next.slides[0], 2), 'Page notes\n\nNotes 2');
  assert.equal(stepInterval(next.slides[0], 2), 1200);
  assert.equal(stepLabel(next.slides[0], 2), 'Explanation');
  assert.equal(stepInterval(next.slides[0], 1), 500);
  const manual = apply(next, [
    { type: 'step.update', slideId: 'one', id: 's2', patch: { advanceAfter: 0 } },
  ]);
  assert.equal(stepInterval(manual.slides[0], 2), 0);
  assert.equal(manual.slides[0].html, doc.slides[0].html);
});
test('step edits validate initial state, bounds, identities and affected locks atomically', () => {
  const { doc, ids } = fixture();
  assert.throws(
    () => apply(doc, [{ type: 'step.remove', slideId: 'one', id: 's0' }]),
    /initial step/,
  );
  assert.throws(
    () => apply(doc, [{ type: 'step.duplicate', slideId: 'one', id: 's2', newId: 's1' }]),
    /duplicate ID/,
  );
  doc.slides[0].locked = [ids.title];
  const original = JSON.stringify(doc);
  assert.throws(
    () => apply(doc, [{ type: 'step.move', slideId: 'one', id: 's2', index: 1 }]),
    /locked/,
  );
  assert.equal(JSON.stringify(doc), original);
  assert.doesNotThrow(() =>
    apply(doc, [
      { type: 'step.update', slideId: 'one', id: 's2', patch: { notes: 'Safe metadata edit' } },
    ]),
  );
  const malformed = structuredClone(doc);
  malformed.slides[0].steps![1].id = 's0';
  assert.throws(() => validateDocument(malformed), /step IDs/);
});
test('step plans include media-only and newly added cues without changing legacy document parsing', () => {
  const { doc, ids } = fixture();
  delete doc.slides[0].steps;
  assert.ok(!Object.hasOwn(documentSchema.parse(doc).slides[0], 'steps'));
  let next = apply(doc, [
    {
      type: 'media.update',
      slideId: 'one',
      target: ids.audio,
      patch: { settings: { startStep: 7 } },
    },
    { type: 'step.initialize', slideId: 'one' },
  ]);
  assert.equal(next.slides[0].steps!.length, 8);
  next = apply(next, [
    {
      type: 'animation.set',
      slideId: 'one',
      animation: { ...next.slides[0].animations[0], id: 'later', step: 9 },
    },
  ]);
  assert.equal(next.slides[0].steps!.length, 10);
});
test('local teaching sequences on linked instances survive shared updates and live-state copying', () => {
  const { doc, ids } = fixture();
  let next = apply(doc, [
    {
      type: 'component.publish',
      slideId: 'one',
      id: 'question',
      definitionId: 'shared',
      name: 'Question',
    },
    { type: 'component.instantiate', slideId: 'two', definitionId: 'shared' },
    { type: 'step.initialize', slideId: 'two' },
  ]);
  const instance = next.slides[1].components![0],
    step = next.slides[1].steps![2];
  next = apply(next, [
    { type: 'step.move', slideId: 'two', id: step.id, index: 1 },
    {
      type: 'component.publish',
      slideId: 'one',
      id: 'question',
      definitionId: 'shared',
      name: 'Updated',
    },
  ]);
  assert.equal(next.slides[1].components![0].steps[1].state, 'answer');
  assert.equal(next.slides[1].components![0].instance!.steps![1].state, 'answer');
  next = apply(next, [
    {
      type: 'elements.transfer',
      slideId: 'two',
      sourceSlideId: 'two',
      targets: [instance.root],
      componentStates: { [instance.id]: 'answer' },
    },
    {
      type: 'component.publish',
      slideId: 'one',
      id: 'question',
      definitionId: 'shared',
      name: 'Updated again',
    },
  ]);
  assert.equal(next.slides[1].components![1].initial, 'answer');
  assert.equal(next.slides[1].components![1].steps[0].state, 'answer');
  assert.ok(inspectSlide(next.slides[0]).some((object) => object.id === ids.title));
});
