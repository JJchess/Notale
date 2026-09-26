import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentSchema, commitSchema, type DeckDocument } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { normalizeHtml } from '../src/domain/html.js';
import { materializeLayout, layoutPlaceholders } from '../src/domain/layouts.js';
const fixture = () =>
  documentSchema.parse({
    schemaVersion: 1,
    id: 'deck',
    title: 'Lecture',
    slides: [
      {
        id: 'page',
        name: 'Page',
        sourcePath: 'page.html',
        html: normalizeHtml('<main id="stage"></main>'),
        layoutId: 'master',
      },
    ],
    layouts: [
      {
        id: 'master',
        name: 'Master',
        html: '<h2 data-notale-placeholder="title" data-notale-label="标题">Default</h2><p data-notale-placeholder="body">Description</p>',
      },
    ],
  });
const apply = (doc: DeckDocument, commands: unknown[]) =>
  applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'values', commands }).commands,
  );
test('per-page master text preserves styles, escaping, copying, switching and independent detach', () => {
  let doc = fixture();
  assert.equal(Object.hasOwn(doc.slides[0], 'layoutValues'), false);
  doc = apply(doc, [
    {
      type: 'layout.values',
      slideId: 'page',
      id: 'master',
      values: { title: '<b>Literal</b>', body: '' },
    },
    { type: 'slide.duplicate', slideId: 'page', newId: 'copy' },
  ]);
  assert.match(materializeLayout(doc, doc.slides[0]), /&lt;b&gt;Literal/);
  assert.deepEqual(doc.slides[1].layoutValues, doc.slides[0].layoutValues);
  doc = apply(doc, [
    { type: 'layout.set', layout: { ...doc.layouts[0], css: 'h2{color:red}' } },
    { type: 'slide.update', slideId: 'page', patch: { layoutId: null } },
    { type: 'slide.update', slideId: 'page', patch: { layoutId: 'master' } },
  ]);
  assert.match(materializeLayout(doc, doc.slides[0]), /&lt;b&gt;Literal/);
  doc = apply(doc, [
    { type: 'layout.detach', slideId: 'page' },
    { type: 'layout.values', slideId: 'copy', id: 'master', values: { title: null, body: null } },
  ]);
  assert.equal(doc.slides[0].layoutValues, undefined);
  assert.match(doc.slides[0].html, /&lt;b&gt;Literal/);
  assert.match(materializeLayout(doc, doc.slides[1]), /Default/);
});
test('placeholder schema and page content ownership reject invalid or destructive master updates atomically', () => {
  const doc = apply(fixture(), [
    { type: 'layout.values', slideId: 'page', id: 'master', values: { title: 'Keep me' } },
  ]);
  assert.throws(
    () =>
      apply(doc, [{ type: 'layout.set', layout: { ...doc.layouts[0], html: '<p>No title</p>' } }]),
    /removed a placeholder/,
  );
  assert.throws(
    () =>
      apply(doc, [
        { type: 'layout.values', slideId: 'page', id: 'master', values: { missing: 'No' } },
      ]),
    /Unknown/,
  );
  for (const html of [
    '<p data-notale-placeholder="x"><b>Nested</b></p>',
    '<p data-notale-placeholder="x"></p><p data-notale-placeholder="x"></p>',
    '<p data-notale-placeholder="x" data-notale-field="title"></p>',
  ])
    assert.throws(() => layoutPlaceholders(html));
  assert.equal(doc.slides[0].layoutValues!.master.title, 'Keep me');
});

test('page image slots preserve shared geometry, clone/reset independently and materialize correct relative resources on detach', () => {
  let doc = fixture();
  doc.assets['images/blue.png'] = { hash: 'a'.repeat(64), mime: 'image/png', size: 1 };
  doc.layouts[0].html =
    '<img data-notale-image-placeholder="photo" src="default.png" style="width:300px;object-fit:cover">';
  doc = apply(doc, [
    {
      type: 'layout.image',
      slideId: 'page',
      id: 'master',
      key: 'photo',
      image: { path: 'images/blue.png', alt: 'Local image' },
    },
    { type: 'slide.duplicate', slideId: 'page', newId: 'copy' },
  ]);
  assert.match(materializeLayout(doc, doc.slides[0]), /src="images\/blue.png"/);
  assert.match(materializeLayout(doc, doc.slides[0]), /object-fit:cover/);
  doc = apply(doc, [
    { type: 'layout.image', slideId: 'page', id: 'master', key: 'photo', image: null },
    { type: 'layout.detach', slideId: 'copy' },
  ]);
  assert.match(materializeLayout(doc, doc.slides[0]), /default.png/);
  assert.match(doc.slides[1].html, /images\/blue.png/);
  assert.equal(doc.slides[1].layoutImages, undefined);
});
test('missing image assets and removal of occupied image slots reject without changing the source document', () => {
  let doc = fixture();
  doc.layouts[0].html = '<img data-notale-image-placeholder="photo" src="default.png">';
  assert.throws(
    () =>
      apply(doc, [
        {
          type: 'layout.image',
          slideId: 'page',
          id: 'master',
          key: 'photo',
          image: { path: 'absent.png' },
        },
      ]),
    /available image/,
  );
  doc.assets['image.png'] = { hash: 'a'.repeat(64), mime: 'image/png', size: 1 };
  doc = apply(doc, [
    {
      type: 'layout.image',
      slideId: 'page',
      id: 'master',
      key: 'photo',
      image: { path: 'image.png' },
    },
  ]);
  assert.throws(() => apply(doc, [{ type: 'asset.remove', path: 'image.png' }]), /available image/);
  assert.throws(
    () =>
      apply(doc, [{ type: 'layout.set', layout: { ...doc.layouts[0], html: '<p>No image</p>' } }]),
    /removed an image slot/,
  );
  assert.equal(doc.slides[0].layoutImages!.master.photo.path, 'image.png');
});
