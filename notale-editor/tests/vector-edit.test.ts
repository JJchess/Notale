import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'vector-fixture',
    title: 'Vector',
    slides: [
      slideSchema.parse({
        id: 'page',
        sourcePath: 'page.html',
        ...importHtml(
          '<main id="stage"><svg data-notale-id="art" viewBox="0 0 400 300"><defs data-notale-id="defs"><linearGradient id="paint" data-notale-id="paint"><stop data-notale-id="stop" offset="0" stop-color="red"/></linearGradient></defs><path data-notale-id="curve" d="M0 0L20 30" fill="url(#paint)"/><text data-notale-id="text"><tspan data-notale-id="run">中文</tspan></text></svg></main>',
        ),
      }),
    ],
  });
}
function apply(doc: ReturnType<typeof fixture>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: crypto.randomUUID(), commands }).commands,
  );
}
test('SVG edits preserve references, text runs, and input immutability', () => {
  const doc = fixture(),
    copy = structuredClone(doc);
  const out = apply(doc, [
    {
      type: 'svg.patch',
      slideId: 'page',
      mutations: [
        { op: 'set', target: 'curve', attributes: { d: 'M0 0C10 20 40 30 80 90' } },
        { op: 'set', target: 'run', text: '集成学习' },
      ],
    },
  ]);
  assert.deepEqual(doc, copy);
  const nodes = inspectSlide(out.slides[0]);
  assert.equal(nodes.find((n) => n.id === 'curve')?.attributes.fill, 'url(#paint)');
  assert.equal(nodes.find((n) => n.id === 'run')?.text, '集成学习');
  assert.equal(nodes.find((n) => n.id === 'run')?.parent, 'text');
});
test('SVG group insertion and reparenting are one atomic command', () => {
  const out = apply(fixture(), [
    {
      type: 'svg.structure',
      slideId: 'page',
      action: 'group',
      mutations: [
        { op: 'insert', parent: 'art', index: 1, html: '<g data-notale-id="group"></g>' },
        { op: 'move', target: 'curve', parent: 'group', index: 0 },
        { op: 'move', target: 'text', parent: 'group', index: 1 },
      ],
    },
  ]);
  const nodes = inspectSlide(out.slides[0]);
  assert.equal(nodes.find((n) => n.id === 'curve')?.parent, 'group');
  assert.equal(nodes.find((n) => n.id === 'text')?.parent, 'group');
  assert.equal(nodes.find((n) => n.id === 'paint')?.parent, 'defs');
});
test('SVG rejects locked, executable, invalid geometry and dangling animation deletion', () => {
  const doc = fixture();
  doc.slides[0].locked = ['art'];
  assert.throws(
    () =>
      apply(doc, [
        {
          type: 'svg.patch',
          slideId: 'page',
          mutations: [{ op: 'set', target: 'curve', attributes: { fill: 'red' } }],
        },
      ]),
    /locked/,
  );
  for (const html of [
    '<svg><script>alert(1)</script></svg>',
    '<svg></svg><img onerror="alert(1)">',
  ])
    assert.throws(() => apply(fixture(), [{ type: 'svg.import', slideId: 'page', html }]));
  assert.throws(() =>
    apply(fixture(), [
      {
        type: 'svg.patch',
        slideId: 'page',
        mutations: [{ op: 'set', target: 'curve', attributes: { d: 'M NaN 0' } }],
      },
    ]),
  );
  const bound = fixture();
  bound.slides[0].bindings = [
    { target: 'curve', event: 'click', action: 'toggle', value: true } as any,
  ];
  assert.throws(() =>
    apply(bound, [
      {
        type: 'svg.structure',
        slideId: 'page',
        action: 'erase',
        mutations: [{ op: 'remove', target: 'curve' }],
      },
    ]),
  );
});
