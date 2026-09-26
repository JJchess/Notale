import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { importHtml, inspectSlide, parse, elements, attr } from '../src/domain/html.js';
import { renderSlide } from '../src/server/render.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Shared lecture',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'pages/one.html',
        ...importHtml('<main id="stage"><p id="first">First</p><p id="second">Second</p></main>'),
      }),
      slideSchema.parse({
        id: 'two',
        sourcePath: 'two.html',
        ...importHtml('<main id="stage"><h1>Destination</h1></main>'),
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
test('shared layouts update referenced pages and detach retains an independently editable copy', async () => {
  let doc = apply(fixture(), [
    {
      type: 'layout.set',
      layout: {
        id: 'master',
        name: 'Footer',
        html: '<footer class="footer">Original <span data-notale-field="slide-number"></span></footer>',
        css: '.footer{color:blue;position:absolute;bottom:20px}',
      },
    },
    { type: 'slide.update', slideId: 'one', patch: { layoutId: 'master' } },
    { type: 'slide.update', slideId: 'two', patch: { layoutId: 'master' } },
  ]);
  assert.match(await renderSlide(doc, doc.slides[0], 'test'), /Original/);
  doc = apply(doc, [
    { type: 'layout.detach', slideId: 'one' },
    { type: 'layout.set', layout: { ...doc.layouts[0], html: '<footer>Updated</footer>' } },
  ]);
  assert.equal(doc.slides[0].layoutId, null);
  assert.ok(
    inspectSlide(doc.slides[0]).some((o) => o.tag === 'footer' && o.text.includes('Original')),
  );
  assert.match(await renderSlide(doc, doc.slides[1], 'test'), /Updated/);
  assert.doesNotMatch(doc.slides[0].html, /Updated/);
  assert.throws(() => apply(doc, [{ type: 'layout.remove', id: 'master' }]), {
    code: 'LAYOUT_IN_USE',
  });
});
test('cross-page copy rebases resources and carries independent IDs, animations and groups', () => {
  let doc = fixture();
  doc.slides[0].html = importHtml(
    '<main id="stage"><section id="source"><img src="../assets/image.png"><p id="caption">Caption</p></section></main>',
  ).html;
  const source = inspectSlide(doc.slides[0]),
    section = source.find((o) => o.attributes.id === 'source')!,
    caption = source.find((o) => o.attributes.id === 'caption')!;
  doc = apply(doc, [
    {
      type: 'animation.set',
      slideId: 'one',
      animation: { id: 'anim', target: caption.id, step: 1, trigger: 'click', effect: 'fade-in' },
    },
    {
      type: 'elements.transfer',
      slideId: 'two',
      sourceSlideId: 'one',
      targets: [section.id],
      computedStyles: { [caption.id]: { 'font-size': '42px', color: 'rgb(10, 20, 30)' } },
    },
  ]);
  const target = inspectSlide(doc.slides[1]),
    copy = target.find((o) => o.tag === 'p')!;
  assert.notEqual(copy.id, caption.id);
  assert.equal(copy.style['font-size'], '42px');
  assert.equal(target.find((o) => o.tag === 'img')!.attributes.src, 'assets/image.png');
  assert.equal(doc.slides[1].animations[0].target, copy.id);
  assert.notEqual(doc.slides[1].animations[0].id, 'anim');
  assert.equal(doc.slides[0].animations[0].target, caption.id);
});
test('cut atomically moves source objects and removes obsolete source metadata', () => {
  let doc = fixture();
  const target = inspectSlide(doc.slides[0]).find((o) => o.tag === 'p')!.id;
  doc = apply(doc, [
    {
      type: 'animation.set',
      slideId: 'one',
      animation: { id: 'anim', target, step: 1, trigger: 'click', effect: 'appear' },
    },
    {
      type: 'elements.transfer',
      slideId: 'two',
      sourceSlideId: 'one',
      targets: [target],
      mode: 'cut',
    },
  ]);
  assert.ok(!inspectSlide(doc.slides[0]).some((o) => o.id === target));
  assert.equal(doc.slides[0].animations.length, 0);
  assert.equal(doc.slides[1].animations.length, 1);
});
test('alignment, distribution and group rotation derive one atomic set of source transforms', () => {
  let doc = fixture();
  const ids = inspectSlide(doc.slides[0])
    .filter((o) => o.tag === 'p')
    .map((o) => o.id);
  doc = apply(doc, [
    {
      type: 'elements.arrange',
      slideId: 'one',
      action: 'right',
      rectangles: [
        { id: ids[0], x: 0, y: 0, width: 100, height: 50 },
        { id: ids[1], x: 200, y: 0, width: 50, height: 50 },
      ],
    },
  ]);
  assert.equal(doc.slides[0].transforms[ids[0]].x, 150);
  assert.equal(doc.slides[0].transforms[ids[1]].x, 0);
  doc = fixture();
  const objects = inspectSlide(doc.slides[0]).filter((o) => o.tag === 'p');
  doc = apply(doc, [
    {
      type: 'elements.arrange',
      slideId: 'one',
      action: 'rotate',
      angle: 180,
      rectangles: [
        { id: objects[0].id, x: 0, y: 0, width: 100, height: 50 },
        { id: objects[1].id, x: 200, y: 0, width: 100, height: 50 },
      ],
    },
  ]);
  assert.equal(Math.round(doc.slides[0].transforms[objects[0].id].x), 200);
  assert.equal(Math.round(doc.slides[0].transforms[objects[1].id].x), -200);
});

test('explicit auto dimensions replace fixed source sizes and survive later arrangement', () => {
  let doc = fixture();
  const id = inspectSlide(doc.slides[0]).find((o) => o.attributes.id === 'first')!.id;
  doc = apply(doc, [
    {
      type: 'element.transform',
      slideId: 'one',
      target: id,
      transform: { width: 300, height: 120 },
    },
  ]);
  doc = apply(doc, [
    {
      type: 'element.transform',
      slideId: 'one',
      target: id,
      transform: { width: 180, height: null, matrix: [1, 0, 0, 1, 10, 20] },
    },
  ]);
  assert.equal(inspectSlide(doc.slides[0]).find((o) => o.id === id)!.style.height, 'auto');
  doc = apply(doc, [
    {
      type: 'elements.arrange',
      slideId: 'one',
      action: 'translate',
      dx: 5,
      dy: 7,
      rectangles: [{ id, x: 10, y: 20, width: 180, height: 150 }],
    },
  ]);
  assert.equal(doc.slides[0].transforms[id].height, null);
  assert.equal(inspectSlide(doc.slides[0]).find((o) => o.id === id)!.style.height, 'auto');
  for (const width of [0, -1, 100001])
    assert.throws(() =>
      apply(doc, [{ type: 'element.transform', slideId: 'one', target: id, transform: { width } }]),
    );
});

test('locked descendants prevent ancestor resize and inherited patches while sibling edits remain available', () => {
  let doc = fixture();
  doc.slides[0].html = importHtml(
    '<main id="stage"><section id="container"><p id="first">Protected</p><p id="second">Editable</p></section></main>',
  ).html;
  const objects = inspectSlide(doc.slides[0]);
  const id = (name: string) => objects.find((o) => o.attributes.id === name)!.id;
  doc = apply(doc, [{ type: 'element.lock', slideId: 'one', target: id('first'), locked: true }]);
  const original = structuredClone(doc);
  const changes = [
    {
      type: 'element.transform',
      slideId: 'one',
      target: id('container'),
      transform: { width: 180, height: null },
    },
    {
      type: 'element.patch',
      slideId: 'one',
      target: id('container'),
      patch: { style: { 'font-size': '48px' } },
    },
    {
      type: 'element.patch',
      slideId: 'one',
      target: id('container'),
      patch: { attributes: { class: 'larger' } },
    },
    {
      type: 'elements.arrange',
      slideId: 'one',
      action: 'translate',
      dx: 10,
      dy: 5,
      rectangles: [{ id: id('container'), x: 0, y: 0, width: 200, height: 100 }],
    },
  ];
  for (const command of changes) {
    assert.throws(
      () =>
        apply(doc, [
          {
            type: 'element.patch',
            slideId: 'one',
            target: id('second'),
            patch: { text: 'Intermediate' },
          },
          command,
        ]),
      { code: 'LOCKED' },
    );
    assert.deepEqual(doc, original);
  }
  const sibling = apply(doc, [
    { type: 'element.patch', slideId: 'one', target: id('second'), patch: { text: 'Allowed' } },
  ]);
  assert.equal(inspectSlide(sibling.slides[0]).find((o) => o.id === id('second'))!.text, 'Allowed');
  const unlocked = apply(doc, [
    { type: 'element.lock', slideId: 'one', target: id('first'), locked: false },
    changes[0],
  ]);
  assert.equal(unlocked.slides[0].transforms[id('container')].height, null);
});

test('SVG child transfer preserves namespace, complete reference graphs and independent identities', () => {
  let doc = fixture();
  doc.slides[0].html = importHtml(`<main id="stage"><svg viewBox="0 0 300 180"><defs>
    <linearGradient id="base"><stop id="color-stop" offset="0" stop-color="red"/></linearGradient>
    <linearGradient id="paint" href="#base"/><clipPath id="clip"><use href="#clip-shape"/></clipPath>
    <rect id="clip-shape" x="10" y="10" width="80" height="50"/>
    <path id="glyph" d="M10 10H90V60H10Z" fill="url( '#paint' )"/>
    </defs><g id="chosen" aria-labelledby="piece-title" clip-path="url( '#clip' )"><title id="piece-title">A copied graphic</title><use href="#glyph"/></g></svg></main>`).html;
  const root = inspectSlide(doc.slides[0]).find((o) => o.attributes.id === 'chosen')!;
  const request = {
    type: 'elements.transfer',
    sourceSlideId: 'one',
    slideId: 'two',
    targets: [root.id],
    offset: { x: 20, y: 30 },
    rectangles: [
      {
        id: root.id,
        x: 100,
        y: 80,
        width: 160,
        height: 100,
        svgViewport: { width: 300, height: 180 },
        geometry: {
          parent: [2, 0, 0, 2],
          local: [1, 0, 0, 1, 0, 0],
          origin: [0, 0],
          size: [80, 50],
          center: [50, 35],
        },
      },
    ],
  };
  doc = apply(doc, [
    {
      type: 'animation.set',
      slideId: 'one',
      animation: {
        id: 'svg-animation',
        target: root.id,
        step: 1,
        trigger: 'click',
        effect: 'fade-in',
      },
    },
  ]);
  doc = apply(doc, [request]);
  const nodes = elements(parse(doc.slides[1].html));
  const copied = nodes.find((n) => n.tagName === 'g')!;
  assert.equal(copied.namespaceURI, 'http://www.w3.org/2000/svg');
  const ids = nodes.map((n) => attr(n, 'id')).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  for (const old of ['base', 'paint', 'clip', 'clip-shape', 'glyph']) assert.ok(!ids.includes(old));
  assert.equal(nodes.filter((n) => n.tagName === 'linearGradient').length, 2);
  assert.equal(nodes.filter((n) => n.tagName === 'clipPath').length, 1);
  for (const node of nodes)
    for (const a of node.attrs) {
      if (a.name === 'href' && a.value.startsWith('#')) assert.ok(ids.includes(a.value.slice(1)));
    }
  const cloneId = attr(copied, 'data-notale-id')!;
  assert.notEqual(cloneId, root.id);
  assert.ok(ids.includes(attr(copied, 'aria-labelledby')));
  assert.notEqual(attr(copied, 'aria-labelledby'), 'piece-title');
  assert.ok(doc.slides[1].transforms[cloneId].matrix);
  assert.equal(doc.slides[1].animations[0].target, cloneId);
  assert.equal(doc.slides[0].animations[0].target, root.id);
  assert.match(doc.slides[1].html, /data-notale-clipboard-svg/);
  assert.equal(doc.slides[0].html.includes('id="chosen"'), true);
  assert.throws(() => apply(doc, [{ ...request, rectangles: [] }]), {
    code: 'SVG_GEOMETRY_REQUIRED',
  });
});

test('SVG dependency cycles terminate and unavailable or interactive definitions reject transfer', () => {
  const make = (definitions: string) => {
    const doc = fixture();
    doc.slides[0].html = importHtml(
      `<main id="stage"><svg><defs>${definitions}</defs><g id="root"><rect width="10" height="10" fill="url( '#a' )"/></g></svg></main>`,
    ).html;
    const root = inspectSlide(doc.slides[0]).find((o) => o.attributes.id === 'root')!;
    return {
      doc,
      command: {
        type: 'elements.transfer',
        sourceSlideId: 'one',
        slideId: 'two',
        targets: [root.id],
        rectangles: [
          {
            id: root.id,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            svgViewport: { width: 100, height: 100 },
            geometry: {
              parent: [1, 0, 0, 1],
              local: [1, 0, 0, 1, 0, 0],
              origin: [0, 0],
              size: [10, 10],
              center: [5, 5],
            },
          },
        ],
      },
    };
  };
  const cycle = make('<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>');
  const copied = apply(cycle.doc, [cycle.command]);
  assert.equal(
    elements(parse(copied.slides[1].html)).filter((n) => n.tagName === 'linearGradient').length,
    2,
  );
  const missing = make('');
  assert.throws(() => apply(missing.doc, [missing.command]), { code: 'MISSING_DEFINITION' });
  const unsafe = make('<g id="a"><script>window.sideEffect=1</script></g>');
  assert.throws(() => apply(unsafe.doc, [unsafe.command]), { code: 'INTERACTION_CLONE' });
});
