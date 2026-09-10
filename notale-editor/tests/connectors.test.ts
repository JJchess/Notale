import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectorSchema, connectorGeometry } from '../src/domain/connectors.js';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Connections',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'one.html',
        ...importHtml(
          '<main id="stage"><p data-notale-id="a">Start</p><svg data-notale-id="b" width="100" height="100"><rect width="100" height="100"/></svg></main>',
        ),
      }),
      slideSchema.parse({
        id: 'two',
        sourcePath: 'two.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
  });
}
function apply(doc: ReturnType<typeof fixture>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: randomUUID(), commands }).commands,
  );
}
const connection = () =>
  connectorSchema.parse({ id: 'edge', start: { target: 'a' }, end: { target: 'b' } });
test('bound connector author data, owned SVG and endpoint changes validate without disturbing object identity', () => {
  const doc = fixture(),
    result = apply(doc, [{ type: 'connector.set', slideId: 'one', connector: connection() }]);
  const malformed = structuredClone(result);
  malformed.slides[0].html = malformed.slides[0].html.replace('data-connector-line=""', '');
  assert.throws(() => validateDocument(malformed), { code: 'INVALID_CONNECTOR' });
  assert.equal(doc.slides[0].connectors.length, 0);
  assert.deepEqual(result.slides[0].connectors, [connection()]);
  const graphic = inspectSlide(result.slides[0]).find((o) => o.id === 'edge')!;
  assert.equal(graphic.namespace, 'http://www.w3.org/2000/svg');
  assert.equal(inspectSlide(result.slides[0]).filter((o) => o.parent === 'edge').length, 0);
  const changed = apply(result, [
    {
      type: 'connector.set',
      slideId: 'one',
      connector: { ...connection(), kind: 'curve', width: 5, dash: 'dashed', startArrow: true },
    },
  ]);
  assert.match(changed.slides[0].html, /stroke-dasharray="20 15"/);
  assert.equal(
    inspectSlide(changed.slides[0]).find((o) => o.id === 'a')!.html,
    inspectSlide(doc.slides[0]).find((o) => o.id === 'a')!.html,
  );
  assert.throws(
    () =>
      apply(result, [
        { type: 'element.transform', slideId: 'one', target: 'edge', transform: { x: 5 } },
      ]),
    { code: 'DERIVED_GEOMETRY' },
  );
  assert.throws(
    () =>
      apply(result, [
        {
          type: 'connector.set',
          slideId: 'one',
          connector: { ...connection(), end: { target: 'missing' } },
        },
      ]),
    { code: 'DANGLING_OBJECT' },
  );
  assert.throws(
    () =>
      apply(result, [
        {
          type: 'connector.set',
          slideId: 'one',
          connector: { ...connection(), end: { target: 'edge' } },
        },
      ]),
    { code: 'INVALID_CONNECTOR' },
  );
  assert.throws(
    () =>
      validateDocument({
        ...result,
        slides: [{ ...result.slides[0], connectors: [] }, result.slides[1]],
      }),
    { code: 'INVALID_CONNECTOR' },
  );
});
test('deleting an endpoint removes its incident connector atomically and respects connector/container locks', () => {
  const doc = apply(fixture(), [
    { type: 'connector.set', slideId: 'one', connector: connection() },
  ]);
  const deleted = apply(doc, [{ type: 'element.delete', slideId: 'one', target: 'a' }]);
  const batch = apply(doc, [
    { type: 'element.delete', slideId: 'one', target: 'a' },
    { type: 'element.delete', slideId: 'one', target: 'edge' },
  ]);
  assert.deepEqual(batch, deleted);
  assert.equal(deleted.slides[0].connectors.length, 0);
  assert.ok(!deleted.slides[0].html.includes('data-notale-connector'));
  assert.ok(inspectSlide(deleted.slides[0]).some((o) => o.id === 'b'));
  for (const locked of ['edge', inspectSlide(doc.slides[0]).find((o) => o.domId === 'stage')!.id]) {
    const before = structuredClone(doc);
    before.slides[0].locked = [locked];
    assert.throws(
      () =>
        apply(before, [
          { type: 'connector.set', slideId: 'one', connector: { ...connection(), kind: 'elbow' } },
        ]),
      { code: 'LOCKED' },
    );
    if (locked === 'edge')
      assert.throws(
        () => apply(before, [{ type: 'element.delete', slideId: 'one', target: 'a' }]),
        { code: 'LOCKED' },
      );
  }
});
test('connected selections transfer with independent endpoint IDs while incomplete cross-page transfers reject', () => {
  const doc = apply(fixture(), [
    { type: 'connector.set', slideId: 'one', connector: connection() },
  ]);
  const command = {
    type: 'elements.transfer',
    slideId: 'two',
    sourceSlideId: 'one',
    targets: ['a', 'b', 'edge'],
  };
  const copied = apply(doc, [command]);
  const c = copied.slides[1].connectors[0];
  assert.ok(c.id !== 'edge' && c.start.target !== 'a' && c.end.target !== 'b');
  const objects = inspectSlide(copied.slides[1]);
  assert.equal(objects.find((o) => o.id === c.start.target)!.text, 'Start');
  assert.equal(objects.find((o) => o.id === c.end.target)!.tag, 'svg');
  assert.deepEqual(copied.slides[0], doc.slides[0]);
  assert.throws(() => apply(doc, [{ ...command, targets: ['edge'] }]), { code: 'CONNECTOR_CLONE' });
  const cut = apply(doc, [{ ...command, mode: 'cut' }]);
  assert.equal(cut.slides[0].connectors.length, 0);
  assert.equal(cut.slides[1].connectors.length, 1);
  const same = apply(doc, [{ ...command, slideId: 'one', targets: ['edge'] }]);
  assert.equal(same.slides[0].connectors.length, 2);
  assert.equal(same.slides[0].connectors[1].start.target, 'a');
});
test('straight, elbow and curve geometry keeps exact ports and arrows without nonfinite path values', () => {
  const start = { x: 100, y: 150, nx: 1, ny: 0 },
    end = { x: 400, y: 250, nx: -1, ny: 0 };
  for (const kind of ['straight', 'elbow', 'curve'] as const) {
    const data = connectorSchema.parse({ ...connection(), kind, startArrow: true }),
      g = connectorGeometry(data, start, end);
    assert.ok(g.d.startsWith('M100 150 '));
    assert.ok(g.d.endsWith('400 250'));
    assert.ok(!/NaN|Infinity/.test(g.d + g.arrows));
    assert.ok(g.arrows.includes('L100 150') && g.arrows.includes('L400 250'));
    if (kind === 'curve') assert.match(g.d, / C/);
    if (kind === 'elbow') assert.equal(g.d.match(/L/g)!.length, 5);
  }
  assert.throws(() => connectorSchema.parse({ ...connection(), end: { target: 'a' } }));
});

test('connector cascades work after page duplication/insertion in the same batch and never excuse unrelated missing objects', () => {
  const doc = apply(fixture(), [
    { type: 'connector.set', slideId: 'one', connector: connection() },
  ]);
  for (const create of [
    { type: 'slide.duplicate', slideId: 'one', newId: 'new-page' },
    {
      type: 'slide.insert',
      after: 'one',
      slide: { ...structuredClone(doc.slides[0]), id: 'new-page', sourcePath: 'new-page.html' },
    },
  ]) {
    const result = apply(doc, [
      create,
      { type: 'element.delete', slideId: 'new-page', target: 'a' },
      { type: 'element.delete', slideId: 'new-page', target: 'edge' },
    ]);
    const added = result.slides.find((s) => s.id === 'new-page')!;
    assert.deepEqual(added.connectors, []);
    assert.ok(!inspectSlide(added).some((o) => o.id === 'a' || o.id === 'edge'));
    assert.deepEqual(result.slides[0], doc.slides[0]);
  }
  assert.throws(
    () =>
      apply(doc, [
        { type: 'element.delete', slideId: 'one', target: 'edge' },
        { type: 'element.delete', slideId: 'one', target: 'edge' },
      ]),
    { code: 'OBJECT_NOT_FOUND' },
  );
  assert.throws(
    () =>
      apply(doc, [
        { type: 'element.delete', slideId: 'one', target: 'a' },
        { type: 'element.delete', slideId: 'one', target: 'missing' },
      ]),
    { code: 'OBJECT_NOT_FOUND' },
  );
  const renewed = apply(doc, [
    { type: 'element.delete', slideId: 'one', target: 'a' },
    { type: 'slide.delete', slideId: 'one' },
    { type: 'slide.insert', after: null, slide: structuredClone(doc.slides[0]) },
  ]);
  assert.deepEqual(renewed.slides[0].connectors, [connection()]);
  assert.throws(
    () =>
      apply(doc, [
        { type: 'element.delete', slideId: 'one', target: 'a' },
        { type: 'slide.delete', slideId: 'one' },
        { type: 'slide.insert', after: null, slide: structuredClone(doc.slides[0]) },
        { type: 'element.delete', slideId: 'one', target: 'edge' },
        { type: 'element.delete', slideId: 'one', target: 'edge' },
      ]),
    { code: 'OBJECT_NOT_FOUND' },
  );
});

test('generic content insertion and reparenting cannot write inside connector-owned geometry', () => {
  const doc = apply(fixture(), [
    { type: 'connector.set', slideId: 'one', connector: connection() },
  ]);
  for (const command of [
    { type: 'element.insert', slideId: 'one', parent: 'edge', html: '<path d="M0 0L50 50"/>' },
    { type: 'element.move', slideId: 'one', target: 'a', parent: 'edge', index: 0 },
    {
      type: 'element.patch',
      slideId: 'one',
      target: 'edge',
      patch: { text: '', style: { 'z-index': '5' } },
    },
  ]) {
    assert.throws(() => apply(doc, [command]), { code: 'DERIVED_GEOMETRY' });
    assert.deepEqual(doc.slides[0].connectors, [connection()]);
    assert.equal(inspectSlide(doc.slides[0]).find((o) => o.id === 'a')!.text, 'Start');
  }
});

test('content destinations respect locked ancestors and recreated connector IDs reset cascade state', () => {
  const doc = fixture();
  doc.slides[0].html = doc.slides[0].html.replace(
    '</main>',
    '<section data-notale-id="locked-box"><div data-notale-id="inner"></div></section><p data-notale-id="c">Third</p></main>',
  );
  doc.slides[0].locked = ['locked-box'];
  for (const command of [
    { type: 'element.insert', slideId: 'one', parent: 'inner', html: '<p>New</p>' },
    { type: 'element.move', slideId: 'one', target: 'a', parent: 'inner', index: 0 },
  ])
    assert.throws(() => apply(doc, [command]), { code: 'LOCKED' });
  assert.throws(
    () =>
      apply(doc, [
        { type: 'connector.set', slideId: 'one', connector: connection() },
        { type: 'element.delete', slideId: 'one', target: 'a' },
        {
          type: 'connector.set',
          slideId: 'one',
          connector: { ...connection(), start: { target: 'b' }, end: { target: 'c' } },
        },
        { type: 'element.delete', slideId: 'one', target: 'edge' },
        { type: 'element.delete', slideId: 'one', target: 'edge' },
      ]),
    { code: 'OBJECT_NOT_FOUND' },
  );
});

test('free and mixed endpoints persist, rebind, transfer and obey reference/lock boundaries', () => {
  const original = fixture();
  const free = connectorSchema.parse({
    id: 'free',
    start: { point: { x: 120, y: 90 } },
    end: { point: { x: 460, y: 280 } },
    kind: 'curve',
  });
  for (const start of [
    {},
    { target: 'a', point: { x: 1, y: 2 } },
    { point: { x: Infinity, y: 2 } },
    { point: { x: 1e7, y: 0 } },
  ])
    assert.equal(connectorSchema.safeParse({ ...free, start }).success, false);
  const created = apply(original, [{ type: 'connector.set', slideId: 'one', connector: free }]);
  const copied = apply(created, [
    {
      type: 'elements.transfer',
      sourceSlideId: 'one',
      slideId: 'two',
      targets: ['free'],
      mode: 'copy',
      offset: { x: 40, y: 30 },
      rectangles: [],
      computedStyles: {},
    },
  ]);
  assert.equal(copied.slides[1].connectors.length, 1);
  assert.deepEqual(copied.slides[1].connectors[0].start.point, { x: 120, y: 90 });
  assert.match(copied.slides[1].html, /translate:\s*40px 30px/);
  const mixed = apply(created, [
    { type: 'connector.set', slideId: 'one', connector: { ...free, start: { target: 'a' } } },
  ]);
  assert.throws(
    () =>
      apply(mixed, [
        {
          type: 'elements.transfer',
          sourceSlideId: 'one',
          slideId: 'two',
          targets: ['free'],
          mode: 'copy',
          offset: { x: 0, y: 0 },
          rectangles: [],
          computedStyles: {},
        },
      ]),
    { code: 'CONNECTOR_CLONE' },
  );
  const graph = apply(mixed, [
    {
      type: 'elements.transfer',
      sourceSlideId: 'one',
      slideId: 'two',
      targets: ['a', 'free'],
      mode: 'copy',
      offset: { x: 0, y: 0 },
      rectangles: [],
      computedStyles: {},
    },
  ]);
  assert.notEqual(graph.slides[1].connectors[0].start.target, 'a');
  assert.deepEqual(graph.slides[1].connectors[0].end.point, free.end.point);
  const detached = apply(mixed, [
    { type: 'connector.set', slideId: 'one', connector: free },
    { type: 'element.delete', slideId: 'one', target: 'a' },
  ]);
  assert.equal(detached.slides[0].connectors.length, 1);
  assert.equal(
    apply(mixed, [{ type: 'element.delete', slideId: 'one', target: 'a' }]).slides[0].connectors
      .length,
    0,
  );
  const locked = structuredClone(mixed);
  locked.slides[0].locked.push('free');
  assert.throws(() => apply(locked, [{ type: 'connector.set', slideId: 'one', connector: free }]), {
    code: 'LOCKED',
  });
  assert.deepEqual(mixed.slides[0].connectors[0].start, { target: 'a', anchor: 'auto' });
});
