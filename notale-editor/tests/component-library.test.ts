import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentSchema,
  slideSchema,
  commitSchema,
  type DeckDocument,
} from '../src/domain/model.js';
import { componentSchema } from '../src/domain/components.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import {
  importHtml,
  inspectSlide,
  parse,
  findElement,
  attr,
  parseStyle,
} from '../src/domain/html.js';
function apply(doc: DeckDocument, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'library-test', commands }).commands,
  );
}
function fixture() {
  const source = slideSchema.parse({
    id: 'source',
    sourcePath: 'source.html',
    ...importHtml(
      '<main id="stage"><section id="card" style="width:400px"><h2 id="title">Question</h2><button id="button">Reveal</button><p id="answer">Answer</p></section></main>',
    ),
  });
  const ids = Object.fromEntries(
    inspectSlide(source)
      .filter((item) => item.domId)
      .map((item) => [item.domId!, item.id]),
  );
  source.components = [
    componentSchema.parse({
      id: 'card',
      root: ids.card,
      name: 'Teaching card',
      initial: 'base',
      states: [
        { id: 'base', name: 'Question', patches: { [ids.answer]: { visible: false } } },
        {
          id: 'answer',
          name: 'Answer',
          patches: { [ids.answer]: { visible: true, style: { color: 'green' } } },
        },
      ],
      events: [{ id: 'show', target: ids.button, event: 'click', to: 'answer' }],
      steps: [{ step: 2, state: 'answer' }],
    }),
  ];
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'library',
    title: 'Library',
    slides: [
      source,
      slideSchema.parse({
        id: 'dest',
        sourcePath: 'nested/dest.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
  });
  const publish = {
    type: 'component.publish',
    slideId: 'source',
    id: 'card',
    definitionId: 'shared',
    name: 'Teaching card',
  };
  return { doc, ids, publish };
}
test('shared source updates stable cross-page instances while preserving base and state overrides', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const [first, second] = next.slides[1].components!,
    firstTitle = first.instance!.objects[ids.title],
    firstAnswer = first.instance!.objects[ids.answer];
  next = apply(next, [
    {
      type: 'component.override',
      slideId: 'dest',
      id: first.id,
      target: firstTitle,
      patch: { text: 'Local question' },
    },
    {
      type: 'component.override',
      slideId: 'dest',
      id: first.id,
      target: firstAnswer,
      state: 'answer',
      patch: { text: 'Local explanation', style: { color: 'purple' } },
    },
    {
      type: 'element.patch',
      slideId: 'source',
      target: ids.title,
      patch: { text: 'Shared revision', style: { color: 'blue' } },
    },
    {
      type: 'element.insert',
      slideId: 'source',
      parent: ids.card,
      html: '<p>New shared footer</p>',
    },
    publish,
  ]);
  const objects = inspectSlide(next.slides[1]);
  assert.equal(objects.find((item) => item.id === firstTitle)!.text, 'Local question');
  assert.equal(
    objects.find((item) => item.id === second.instance!.objects[ids.title])!.text,
    'Shared revision',
  );
  assert.equal(next.slides[1].components![0].id, first.id);
  assert.equal(
    next.slides[1].components![0].states[1].patches[firstAnswer].text,
    'Local explanation',
  );
  assert.equal(next.slides[1].components![0].events[0].target, first.instance!.objects[ids.button]);
  assert.equal(
    objects.filter((item) => item.tag === 'p' && item.text === 'New shared footer').length,
    2,
  );
  next = apply(next, [
    { type: 'component.override', slideId: 'dest', id: first.id, target: firstTitle, patch: null },
  ]);
  assert.equal(
    inspectSlide(next.slides[1]).find((item) => item.id === firstTitle)!.text,
    'Shared revision',
  );
  assert.equal(doc.componentLibrary, undefined);
});
test('shared instances copy with links, detach independently and survive removal of source page', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const first = next.slides[1].components![0];
  next = apply(next, [
    { type: 'elements.transfer', slideId: 'dest', sourceSlideId: 'dest', targets: [first.root] },
  ]);
  const second = next.slides[1].components![1];
  assert.equal(second.instance!.definitionId, 'shared');
  assert.notEqual(second.instance!.objects[ids.title], first.instance!.objects[ids.title]);
  next = apply(next, [
    { type: 'component.unlink', slideId: 'dest', id: second.id },
    { type: 'slide.delete', slideId: 'source' },
  ]);
  assert.equal(validateDocument(next).slides[0].components!.length, 2);
  next = apply(next, [{ type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' }]);
  assert.equal(next.slides[0].components!.length, 3);
  assert.throws(
    () => apply(next, [{ type: 'component.library-remove', definitionId: 'shared' }]),
    /Detach instances/,
  );
});
test('shared updates reject locked instances and deletion of overridden objects atomically', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const instance = next.slides[1].components![0],
    title = instance.instance!.objects[ids.title];
  next = apply(next, [
    { type: 'element.patch', slideId: 'dest', target: title, patch: { text: 'Direct local edit' } },
  ]);
  assert.equal(
    next.slides[1].components![0].instance!.overrides[ids.title].text,
    'Direct local edit',
  );
  const before = JSON.stringify(next);
  assert.throws(
    () => apply(next, [{ type: 'element.delete', slideId: 'source', target: ids.title }, publish]),
    /overridden object/,
  );
  assert.equal(JSON.stringify(next), before);
  next.slides[1].locked.push(title);
  assert.throws(() => apply(next, [publish]), /locked/);
  const malformed = structuredClone(next);
  malformed.slides[1].components![0].instance!.objects[ids.title] = 'missing';
  assert.throws(() => validateDocument(malformed), /Instance mappings/);
});
test('container constraints apply flex/grid sizing, retain child identities and remap with components', () => {
  const { doc, ids } = fixture();
  const next = apply(doc, [
    {
      type: 'container.layout',
      slideId: 'source',
      target: ids.card,
      layout: {
        mode: 'row',
        gap: 12,
        padding: 16,
        width: 'fixed',
        height: 'hug',
        wrap: true,
        align: 'center',
        justify: 'space-between',
        children: {
          [ids.title]: { width: 'fill', height: 'hug', grow: 1, minWidth: 80, maxWidth: 300 },
        },
      },
    },
    { type: 'elements.transfer', slideId: 'dest', sourceSlideId: 'source', targets: [ids.card] },
  ]);
  const node = findElement(parse(next.slides[0].html), ids.card),
    style = parseStyle(attr(node, 'style')!);
  assert.equal(style.get('display'), 'flex');
  assert.equal(style.get('flex-wrap'), 'wrap');
  assert.equal(style.get('height'), 'max-content');
  const copied = next.slides[1].components![0],
    constraint = next.slides[1].constraints![copied.root];
  assert.equal(Object.keys(constraint.children).length, 1);
  assert.notEqual(Object.keys(constraint.children)[0], ids.title);
  assert.throws(
    () =>
      apply(doc, [
        {
          type: 'container.layout',
          slideId: 'source',
          target: ids.card,
          layout: { mode: 'row', minWidth: 500, maxWidth: 100 },
        },
      ]),
    /Minimum size/,
  );
  assert.throws(
    () =>
      apply(doc, [
        {
          type: 'container.layout',
          slideId: 'source',
          target: ids.card,
          layout: { mode: 'grid', children: { [ids.stage]: {} } },
        },
      ]),
    /direct container children/,
  );
});

test('instance layout and child geometry overrides survive shared revisions without freezing inherited dimensions', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const instance = next.slides[1].components![0],
    title = instance.instance!.objects[ids.title];
  next = apply(next, [
    {
      type: 'container.layout',
      slideId: 'dest',
      target: instance.root,
      layout: {
        mode: 'column',
        width: 'fixed',
        widthValue: 360,
        height: 'hug',
        gap: 25,
        children: { [title]: { width: 'fill', height: 'hug' } },
      },
    },
    {
      type: 'element.transform',
      slideId: 'dest',
      target: title,
      transform: { x: 12, y: 8, rotate: 4 },
    },
    {
      type: 'element.patch',
      slideId: 'source',
      target: ids.title,
      patch: { text: 'Updated shared heading' },
    },
    publish,
  ]);
  const updated = next.slides[1].components![0];
  assert.equal(updated.id, instance.id);
  assert.equal(next.slides[1].constraints![instance.root].widthValue, 360);
  assert.equal(next.slides[1].transforms[title].rotate, 4);
  assert.equal(
    parseStyle(attr(findElement(parse(next.slides[1].html), title), 'style')!).get('translate'),
    '12px 8px',
  );
  next = apply(next, [
    { type: 'elements.transfer', slideId: 'dest', sourceSlideId: 'dest', targets: [instance.root] },
  ]);
  const copy = next.slides[1].components![1];
  assert.equal(next.slides[1].constraints![copy.root].height, 'hug');
  assert.equal(
    parseStyle(attr(findElement(parse(next.slides[1].html), copy.root), 'style')!).get('height'),
    'max-content',
  );
});

test('resetting an instance patch removes its transform override and empty state ownership', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const instance = next.slides[1].components![0],
    title = instance.instance!.objects[ids.title];
  next = apply(next, [
    { type: 'element.transform', slideId: 'dest', target: title, transform: { x: 15, y: 7 } },
    {
      type: 'component.override',
      slideId: 'dest',
      id: instance.id,
      target: title,
      state: 'answer',
      patch: { text: 'Local' },
    },
    {
      type: 'component.override',
      slideId: 'dest',
      id: instance.id,
      target: title,
      state: 'answer',
      patch: null,
    },
    { type: 'component.override', slideId: 'dest', id: instance.id, target: title, patch: null },
  ]);
  assert.deepEqual(next.slides[1].components![0].instance!.stateOverrides, {});
  assert.deepEqual(next.slides[1].components![0].instance!.transforms, {});
  assert.equal(next.slides[1].transforms[title], undefined);
});

test('copied live instance states become durable initial overrides through shared updates', () => {
  const { doc, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  const instance = next.slides[1].components![0];
  next = apply(next, [
    {
      type: 'elements.transfer',
      slideId: 'dest',
      sourceSlideId: 'dest',
      targets: [instance.root],
      componentStates: { [instance.id]: 'answer' },
    },
    publish,
  ]);
  const copy = next.slides[1].components![1];
  assert.equal(copy.initial, 'answer');
  assert.equal(copy.instance!.initial, 'answer');
  assert.equal(next.slides[1].components![0].initial, 'base');
});

test('a removed shared source can be checked out, edited and republished without losing instance identity or overrides', () => {
  const { doc, ids, publish } = fixture();
  let next = apply(doc, [
    publish,
    { type: 'component.instantiate', slideId: 'dest', definitionId: 'shared' },
  ]);
  assert.throws(
    () => apply(next, [{ type: 'component.checkout', definitionId: 'shared', newId: 'editor' }]),
    /existing source/,
  );
  const instance = next.slides[1].components![0],
    localTitle = instance.instance!.objects[ids.title];
  next = apply(next, [
    {
      type: 'component.override',
      slideId: 'dest',
      id: instance.id,
      target: localTitle,
      patch: { text: 'Local question' },
    },
    { type: 'slide.delete', slideId: 'source' },
    { type: 'component.checkout', definitionId: 'shared', newId: 'editor' },
  ]);
  const editor = next.slides.find((page) => page.id === 'editor')!;
  assert.equal(editor.hidden, true);
  assert.equal(editor.components![0].root, ids.card);
  const frozen = structuredClone(next.componentLibrary);
  next = apply(next, [
    {
      type: 'element.patch',
      slideId: 'editor',
      target: ids.button,
      patch: { text: 'Explain together' },
    },
  ]);
  assert.deepEqual(next.componentLibrary, frozen);
  next = apply(next, [{ ...publish, slideId: 'editor' }]);
  const updated = next.slides.find((page) => page.id === 'dest')!,
    linked = updated.components![0];
  assert.equal(linked.id, instance.id);
  assert.equal(linked.instance!.objects[ids.title], localTitle);
  assert.equal(
    inspectSlide(updated).find((item) => item.id === localTitle)!.text,
    'Local question',
  );
  assert.equal(
    inspectSlide(updated).find((item) => item.id === linked.instance!.objects[ids.button])!.text,
    'Explain together',
  );
  validateDocument(next);
});
