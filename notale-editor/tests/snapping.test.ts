import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTranslation, snapResize, snapConstrainedPoint } from '../src/domain/snapping.js';
import { commandSchema, documentSchema, slideSchema } from '../src/domain/model.js';
import { importHtml } from '../src/domain/html.js';
import { applyCommands } from '../src/domain/commands.js';
const options = { width: 1600, height: 900, tolerance: 6 };
const selection = [
  { x: 100, y: 120, width: 60, height: 80 },
  { x: 250, y: 200, width: 100, height: 60 },
];
test('snaps the entire selection bounds to page, objects and authored guides', () => {
  const centered = snapTranslation(selection, [], 574, 0, options);
  assert.equal(centered.dx, 575);
  assert.deepEqual(centered.lines, [{ axis: 'x', position: 800, source: 'page' }]);
  const object = snapTranslation(
    selection,
    [{ x: 605, y: 750, width: 30, height: 30 }],
    252,
    0,
    options,
  );
  assert.equal(object.dx, 255);
  assert.equal(object.lines[0].source, 'object');
  const guide = snapTranslation(selection, [], 252, 0, {
    ...options,
    guides: [{ axis: 'x', position: 605 }],
  });
  assert.equal(guide.dx, object.dx);
  assert.equal(guide.lines[0].source, 'guide');
});
test('Alt bypass, Shift constraint and screen-scaled tolerance do not invent perpendicular motion', () => {
  assert.deepEqual(snapTranslation(selection, [], 574, 15, { ...options, enabled: false }), {
    dx: 574,
    dy: 15,
    lines: [],
  });
  const constrained = snapTranslation(selection, [], 574, 15, {
    ...options,
    constrain: true,
    guides: [{ axis: 'y', position: 125 }],
  });
  assert.equal(constrained.dx, 575);
  assert.equal(constrained.dy, 0);
  const far = snapTranslation(selection, [], 560, 0, options);
  assert.equal(far.dx, 560);
  const zoomed = snapTranslation(selection, [], 560, 0, { ...options, tolerance: 6 / 0.25 });
  assert.equal(zoomed.dx, 575);
});
test('grid follows the nearest group edge and exact guide ties are stable', () => {
  const result = snapTranslation([{ x: 103, y: 117, width: 80, height: 60 }], [], 18, 0, {
    ...options,
    grid: 20,
  });
  assert.equal(result.dx, 17);
  assert.equal(result.dy, 3);
  assert.equal(
    snapTranslation(selection, [], 574, 0, { ...options, guides: [{ axis: 'x', position: 800 }] })
      .lines[0].source,
    'guide',
  );
  assert.deepEqual(snapTranslation([], [], 10, 20, options), { dx: 10, dy: 20, lines: [] });
});
test('guide schema remains backward compatible, updates preserve omitted guides, copies are independent', () => {
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'deck',
    title: 'Guides',
    slides: [
      slideSchema.parse({
        id: 'slide',
        sourcePath: 'page.html',
        ...importHtml('<main id="stage"><p>Hello</p></main>'),
      }),
    ],
  });
  assert.deepEqual(doc.slides[0].guides, []);
  const guide = { id: 'guide', axis: 'x' as const, position: 400.25 };
  const changed = applyCommands(doc, [
    commandSchema.parse({ type: 'slide.update', slideId: 'slide', patch: { guides: [guide] } }),
    commandSchema.parse({ type: 'slide.update', slideId: 'slide', patch: { name: 'Renamed' } }),
    { type: 'slide.duplicate', slideId: 'slide', newId: 'copy' },
    commandSchema.parse({ type: 'slide.update', slideId: 'copy', patch: { guides: [] } }),
  ]);
  assert.deepEqual(changed.slides[0].guides, [guide]);
  assert.deepEqual(changed.slides[1].guides, []);
  for (const guides of [
    [guide, guide],
    [{ ...guide, position: Infinity }],
    [{ ...guide, axis: 'z' }],
  ])
    assert.equal(
      commandSchema.safeParse({ type: 'slide.update', slideId: 'slide', patch: { guides } })
        .success,
      false,
    );
});

test('resize anchors remain fixed while grabbed edges snap independently to guides, objects and grid', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  const right = snapResize(box, 'e', [{ x: 400, y: 600, width: 50, height: 50 }], 95, 0, options);
  assert.deepEqual(right.anchor, [100, 150]);
  assert.equal(right.factorX, 1.5);
  assert.equal(right.factorY, 1);
  assert.equal(right.lines[0].source, 'object');
  const corner = snapResize(box, 'nw', [], -96, -47, {
    ...options,
    guides: [
      { axis: 'x', position: 0 },
      { axis: 'y', position: 50 },
    ],
  });
  assert.deepEqual(corner.anchor, [300, 200]);
  assert.equal(corner.factorX, 1.5);
  assert.equal(corner.factorY, 1.5);
  assert.deepEqual(
    corner.lines.map((l) => l.source),
    ['guide', 'guide'],
  );
  const grid = snapResize(box, 'e', [], 97, 0, { ...options, grid: 50 });
  assert.equal(grid.factorX, 1.5);
  assert.equal(grid.lines[0].source, 'grid');
});
test('centered and proportional resize keep their pivot and avoid large perpendicular snap jumps', () => {
  const centered = snapResize({ x: 100, y: 100, width: 200, height: 100 }, 'e', [], 46, 0, {
    ...options,
    centered: true,
    constrain: true,
    guides: [{ axis: 'x', position: 350 }],
  });
  assert.deepEqual(centered.anchor, [200, 150]);
  assert.equal(centered.factorX, 1.5);
  assert.equal(centered.factorY, 1.5);
  const tall = { x: 100, y: 100, width: 20, height: 200 };
  const noJump = snapResize(tall, 'se', [], 8, 80, {
    ...options,
    constrain: true,
    guides: [{ axis: 'x', position: 132 }],
  });
  assert.equal(noJump.factorX, 1.4);
  assert.equal(noJump.factorY, 1.4);
  assert.deepEqual(noJump.lines, []);
  const feasible = snapResize(tall, 'se', [], 8, 80, {
    ...options,
    constrain: true,
    guides: [
      { axis: 'x', position: 132 },
      { axis: 'y', position: 385 },
    ],
  });
  assert.equal(feasible.factorX, 1.425);
  assert.equal(feasible.factorY, 1.425);
  assert.deepEqual(feasible.lines, [{ axis: 'y', position: 385, source: 'guide' }]);
});
test('resize bypass, zoom tolerance, degenerate bounds and scale limits do not produce false guide lines', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 },
    guides = [{ axis: 'x' as const, position: 400 }];
  assert.equal(snapResize(box, 'e', [], 90, 0, { ...options, guides }).factorX, 1.45);
  assert.equal(snapResize(box, 'e', [], 90, 0, { ...options, guides, tolerance: 24 }).factorX, 1.5);
  assert.deepEqual(snapResize(box, 'e', [], 96, 0, { ...options, guides, enabled: false }), {
    anchor: [100, 150],
    factorX: 1.48,
    factorY: 1,
    lines: [],
  });
  const collapsed = snapResize(box, 'e', [], -300, 0, {
    ...options,
    guides: [{ axis: 'x', position: 100 }],
  });
  assert.equal(collapsed.factorX, 0.01);
  assert.deepEqual(collapsed.lines, []);
  const line = snapResize({ x: 100, y: 100, width: 0, height: 100 }, 'e', [], 50, 0, options);
  assert.equal(line.factorX, 1);
  assert.equal(line.factorY, 1);
  assert.deepEqual(line.lines, []);
});

test('constrained point snapping follows rotated axes and bounds the full displacement', () => {
  const p = { x: 311, y: 227 };
  const result = snapConstrainedPoint(p, [{ x: 2, y: 1 }], [], {
    ...options,
    guides: [
      { axis: 'x', position: 315 },
      { axis: 'y', position: 229 },
    ],
  });
  assert.deepEqual(result.delta, [2]);
  assert.equal(result.lines.length, 2);
  const steep = snapConstrainedPoint(p, [{ x: 0.01, y: 1 }], [], {
    ...options,
    guides: [{ axis: 'x', position: 312 }],
  });
  assert.deepEqual(steep.lines, []);
  const vertical = snapConstrainedPoint(p, [{ x: 0, y: -2 }], [], {
    ...options,
    guides: [
      { axis: 'x', position: 311 },
      { axis: 'y', position: 231 },
    ],
  });
  assert.deepEqual(vertical.delta, [-2]);
});
test('two-axis point snapping solves skewed dimensions and preserves tolerance and guide ties', () => {
  const result = snapConstrainedPoint(
    { x: 311, y: 227 },
    [
      { x: 2, y: 1 },
      { x: -1, y: 3 },
    ],
    [{ x: 315, y: 229, width: 100, height: 100 }],
    {
      ...options,
      guides: [
        { axis: 'x', position: 315 },
        { axis: 'y', position: 229 },
      ],
    },
  );
  assert.deepEqual(result.delta, [2, 0]);
  assert.equal(result.lines.length, 2);
  assert.ok(result.lines.every((l) => l.source === 'guide'));
  const diagonal = snapConstrainedPoint(
    { x: 311, y: 227 },
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    [],
    {
      ...options,
      guides: [
        { axis: 'x', position: 316 },
        { axis: 'y', position: 232 },
      ],
    },
  );
  assert.equal(diagonal.lines.length, 1);
  assert.equal(Math.hypot(...diagonal.delta), 5);
});
test('point snapping respects bypass, zoom, grid and singular geometry', () => {
  const p = { x: 311, y: 227 },
    d = [{ x: 1, y: 0 }];
  assert.equal(snapConstrainedPoint(p, d, [], { ...options, grid: 20 }).lines.length, 0);
  assert.deepEqual(snapConstrainedPoint(p, d, [], { ...options, grid: 20, tolerance: 12 }).delta, [
    9,
  ]);
  assert.equal(
    snapConstrainedPoint(p, d, [], { ...options, grid: 20, tolerance: 12, enabled: false }).lines
      .length,
    0,
  );
  assert.equal(
    snapConstrainedPoint(
      p,
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      [],
      options,
    ).lines.length,
    0,
  );
});
