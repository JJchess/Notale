import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema, animationSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import {
  importHtml,
  inspectSlide,
  parse,
  elements,
  attr,
  serializeOuter,
} from '../src/domain/html.js';

function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Layers',
    slides: [
      slideSchema.parse({
        id: 'page',
        sourcePath: 'page.html',
        ...importHtml(`<main id="stage"><svg id="drawing" viewBox="0 0 400 300">
      <title>Drawing</title><defs id="defs"><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs>
      <rect id="a" width="100" height="100" fill="url(#paint)"/><!-- unchanged slot -->
      <g id="b" transform="rotate(15)"><circle id="inner" r="50"/></g><style>.chosen {opacity:.8}</style>
      <rect id="c" width="100" height="100"/><path id="d" d="M0 0L30 40"/>
      <svg id="nested"><rect id="n1"/><rect id="n2"/></svg>
      <text id="text">First<tspan id="run">Second</tspan></text>
      <switch id="choice"><rect id="option1"/><rect id="option2"/></switch>
      <foreignObject id="foreign"><div id="html">HTML</div></foreignObject>
      <script>window.sourceSentinel = 1;</script>
    </svg></main>`),
      }),
    ],
  });
}
function apply(doc: ReturnType<typeof fixture>, targets: string[], action: string) {
  const objects = inspectSlide(doc.slides[0]);
  return applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        {
          type: 'elements.order',
          slideId: 'page',
          targets: targets.map((id) => objects.find((o) => o.domId === id)!.id),
          action,
        },
      ],
    }).commands,
  );
}
function order(doc: ReturnType<typeof fixture>, parent = 'drawing') {
  const el = elements(parse(doc.slides[0].html)).find((node) => attr(node, 'id') === parent)!;
  return el.childNodes
    .filter((node) => 'tagName' in node && attr(node, 'id'))
    .map((node) => attr(node as any, 'id'));
}
test('SVG layers preserve selection order, parent context, definitions and metadata for all four actions', () => {
  const doc = fixture(),
    objects = inspectSlide(doc.slides[0]);
  const b = objects.find((o) => o.domId === 'b')!.id,
    inner = objects.find((o) => o.domId === 'inner')!.id;
  doc.slides[0].animations.push(
    animationSchema.parse({
      id: 'cue',
      target: inner,
      step: 1,
      trigger: 'click',
      effect: 'fade-in',
      duration: 400,
      delay: 0,
      easing: 'ease',
    }),
  );
  const before = structuredClone(doc);
  const reordered = apply(doc, ['c', 'a', 'n1'], 'front');
  assert.deepEqual(order(reordered), [
    'defs',
    'b',
    'd',
    'nested',
    'text',
    'choice',
    'foreign',
    'a',
    'c',
  ]);
  assert.deepEqual(order(reordered, 'nested'), ['n2', 'n1']);
  assert.deepEqual(reordered.slides[0].animations, doc.slides[0].animations);
  for (const object of objects.filter(
    (o) => !['drawing', 'stage', 'nested'].includes(o.domId ?? ''),
  ))
    assert.equal(
      inspectSlide(reordered.slides[0]).find((o) => o.id === object.id)!.html,
      object.html,
    );
  assert.equal(
    inspectSlide(reordered.slides[0]).find((o) => o.id === b)!.namespace,
    'http://www.w3.org/2000/svg',
  );
  assert.deepEqual(doc, before);
  assert.deepEqual(order(apply(doc, ['c', 'a'], 'forward')), [
    'defs',
    'b',
    'a',
    'd',
    'c',
    'nested',
    'text',
    'choice',
    'foreign',
  ]);
  assert.deepEqual(order(apply(doc, ['c', 'b'], 'backward')), [
    'defs',
    'b',
    'c',
    'a',
    'd',
    'nested',
    'text',
    'choice',
    'foreign',
  ]);
  assert.deepEqual(order(apply(doc, ['c', 'b'], 'back')), [
    'defs',
    'b',
    'c',
    'a',
    'd',
    'nested',
    'text',
    'choice',
    'foreign',
  ]);
  const combined = apply(doc, ['b', 'inner', 'b'], 'front');
  assert.deepEqual(order(combined), [
    'defs',
    'a',
    'c',
    'd',
    'nested',
    'text',
    'choice',
    'foreign',
    'b',
  ]);
  assert.deepEqual(order(combined, 'b'), ['inner']);
  const nonLayers = (html: string) =>
    elements(parse(html))
      .find((e) => attr(e, 'id') === 'drawing')!
      .childNodes.map((node, index) =>
        !('tagName' in node) || ['title', 'defs', 'style', 'script'].includes(node.tagName)
          ? [
              index,
              'tagName' in node
                ? serializeOuter(node)
                : JSON.stringify({
                    nodeName: node.nodeName,
                    ...('value' in node ? { value: node.value } : {}),
                    ...('data' in node ? { data: node.data } : {}),
                  }),
            ]
          : undefined,
      )
      .filter(Boolean);
  assert.deepEqual(nonLayers(reordered.slides[0].html), nonLayers(doc.slides[0].html));
});

test('SVG layer validation rejects semantic text/switch/HTML ordering and locked ancestors or descendants atomically', () => {
  for (const invalid of ['drawing', 'defs', 'run', 'option1', 'html'])
    assert.throws(() => apply(fixture(), ['a', invalid], 'front'), { code: 'INVALID_LAYER' });
  for (const locked of ['b', 'drawing', 'inner']) {
    const doc = fixture();
    doc.slides[0].locked = [inspectSlide(doc.slides[0]).find((o) => o.domId === locked)!.id];
    const before = structuredClone(doc);
    assert.throws(() => apply(doc, ['a', 'b'], 'front'), { code: 'LOCKED' });
    assert.deepEqual(doc, before);
  }
});
