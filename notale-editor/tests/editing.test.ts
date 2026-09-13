import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema, animationSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
import { timeline } from '../src/domain/timeline.js';
import { references, missingReferences } from '../src/domain/resources.js';

function source() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Editing',
    slides: [
      slideSchema.parse({
        id: randomUUID(),
        sourcePath: 'page.html',
        ...importHtml(
          '<main id="stage"><section id="group"><h1 id="title">Title</h1><p>Paragraph</p></section><svg><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#paint)" width="100" height="60"/></svg></main>',
        ),
      }),
    ],
  });
}
test('locked descendants cannot be deleted through a container; failed batch leaves the original intact', () => {
  const doc = source(),
    s = doc.slides[0],
    objects = inspectSlide(s),
    title = objects.find((o) => o.attributes.id === 'title')!,
    group = objects.find((o) => o.attributes.id === 'group')!;
  s.locked = [title.id];
  assert.throws(
    () => applyCommands(doc, [{ type: 'element.delete', slideId: s.id, target: group.id }]),
    { code: 'LOCKED' },
  );
  assert.throws(
    () =>
      applyCommands(doc, [
        { type: 'element.patch', slideId: s.id, target: group.id, patch: { text: 'lost' } },
      ]),
    { code: 'LOCKED' },
  );
  assert.match(doc.slides[0].html, /Paragraph/);
});
test('SVG duplication remaps paint references and object IDs independently', () => {
  const doc = source(),
    s = doc.slides[0],
    svg = inspectSlide(s).find((o) => o.tag === 'svg')!;
  const changed = applyCommands(doc, [
      { type: 'element.duplicate', slideId: s.id, target: svg.id },
    ]),
    objects = inspectSlide(changed.slides[0]);
  assert.equal(objects.filter((o) => o.tag === 'svg').length, 2);
  const fills = objects.filter((o) => o.tag === 'rect').map((o) => o.attributes.fill);
  assert.equal(new Set(fills).size, 2);
  assert.equal(new Set(objects.map((o) => o.id)).size, objects.length);
});
test('native step remapping and animation sequencing remain explicit author data', () => {
  const doc = source(),
    s = doc.slides[0],
    target = inspectSlide(s).find((o) => o.tag === 'h1')!.id;
  const a = animationSchema.parse({
    id: randomUUID(),
    target,
    step: 1,
    trigger: 'object',
    triggerTarget: target,
    effect: 'pulse',
    duration: 300,
    delay: 100,
  });
  const b = animationSchema.parse({
    ...a,
    id: randomUUID(),
    trigger: 'after-previous',
    delay: 50,
    duration: 200,
  });
  const changed = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        { type: 'slide.update', slideId: s.id, patch: { stepMap: [0, 0, 2, 1] } },
        { type: 'animation.set', slideId: s.id, animation: a },
        { type: 'animation.set', slideId: s.id, animation: b },
      ],
    }).commands,
  );
  const cues = timeline(changed.slides[0]);
  assert.equal(cues[1].eventTarget, target);
  assert.equal(cues[1].start, 450);
  assert.equal(cues[1].end, 650);
  assert.deepEqual(changed.slides[0].stepMap, [0, 0, 2, 1]);
});
test('dependency resolution follows relative HTML/CSS resources and excludes external and embedded data', () => {
  const doc = source();
  doc.slides[0].html = importHtml(
    '<img src="assets/picture.png"><img src="https://example.com/external.png"><style>div {background: url(data:image/png;base64,abc)}</style>',
  ).html;
  assert.equal(missingReferences(doc).length, 1);
  assert.equal(missingReferences(doc)[0].path, 'assets/picture.png');
  const css = references(
    'assets/styles/main.css',
    '@font-face{src:url(../fonts/font.woff2)}',
    'css',
  );
  assert.equal(css[0].path, 'assets/fonts/font.woff2');
});

test('partial page and deck updates never reset omitted authored settings to schema defaults', () => {
  let doc = documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Partial updates',
    presentation: { loop: true, showSlideNumber: false },
    layouts: [{ id: 'master', name: 'Master', html: '<footer>Footer</footer>' }],
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'one.html',
        ...importHtml('<main id="stage"><p>Text</p></main>'),
        notes: 'Keep notes',
        hidden: true,
        section: 'Keep section',
        layoutId: 'master',
        theme: { '--ink': 'red' },
        stepMap: [0, 0, 1],
        advanceAfter: 2000,
      }),
    ],
  });
  const batch = commitSchema.parse({
    baseVersion: 1,
    mutationId: randomUUID(),
    commands: [
      { type: 'slide.update', slideId: 'one', patch: { name: 'Renamed' } },
      { type: 'deck.update', title: 'Updated title' },
    ],
  });
  doc = applyCommands(doc, batch.commands);
  const slide = doc.slides[0];
  assert.equal(slide.notes, 'Keep notes');
  assert.equal(slide.hidden, true);
  assert.equal(slide.section, 'Keep section');
  assert.equal(slide.layoutId, 'master');
  assert.deepEqual(slide.stepMap, [0, 0, 1]);
  assert.equal(slide.advanceAfter, 2000);
  assert.equal(slide.theme['--ink'], 'red');
  assert.deepEqual(doc.presentation, { loop: true, showSlideNumber: false });
});

test('custom keyframes reject invalid offsets before a browser animation can fail', () => {
  const base = { id: 'cue', target: 'title', step: 1, trigger: 'click', effect: 'custom' };
  assert.throws(() =>
    animationSchema.parse({
      ...base,
      keyframes: [
        { opacity: 0, offset: 0.9 },
        { opacity: 1, offset: 0.2 },
      ],
    }),
  );
  assert.throws(() =>
    animationSchema.parse({
      ...base,
      keyframes: [
        { opacity: 0, offset: -0.1 },
        { opacity: 1, offset: 1 },
      ],
    }),
  );
  assert.throws(() =>
    animationSchema.parse({
      ...base,
      keyframes: [{ opacity: 0, easing: 'invalid' }, { opacity: 1 }],
    }),
  );
  assert.equal(
    animationSchema.parse({
      ...base,
      keyframes: [{ opacity: 0, offset: 0 }, { opacity: 0.5 }, { opacity: 1, offset: 1 }],
    }).keyframes!.length,
    3,
  );
});

test('duplicating a page rewrites explicit self-links while preserving local IDs and script source', () => {
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Copy',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'pages/one.html',
        ...importHtml(
          '<main id="stage"><a id="self" href="one.html#self">Self</a><a href="#self">Fragment</a></main><script>window.literal="one.html"</script>',
        ),
      }),
    ],
  });
  const next = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [{ type: 'slide.duplicate', slideId: 'one', newId: 'copy' }],
    }).commands,
  );
  assert.match(next.slides[1].html, /href="copy.html#self"/);
  assert.match(next.slides[1].html, /href="#self"/);
  assert.match(next.slides[1].html, /window.literal="one.html"/);
  assert.match(next.slides[0].html, /href="one.html#self"/);
});
