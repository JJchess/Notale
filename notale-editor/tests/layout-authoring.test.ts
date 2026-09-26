import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { inspectSlide, normalizeHtml } from '../src/domain/html.js';
import { materializeLayout } from '../src/domain/layouts.js';
const fixture = () =>
  documentSchema.parse({
    id: 'deck',
    schemaVersion: 1,
    title: 'Lecture',
    slides: [
      {
        id: 'page',
        name: 'Page',
        sourcePath: 'pages/page.html',
        html: normalizeHtml('<main id="stage"></main>'),
        layoutId: 'master',
      },
    ],
    layouts: [
      {
        id: 'master',
        name: 'Master',
        sourcePath: 'design/base.html',
        html: '<footer><span id="label">Footer</span><span data-notale-field="slide-number"></span></footer>',
        css: 'footer{color:red}',
      },
    ],
  });
const apply = (doc: ReturnType<typeof fixture>, commands: unknown[]) =>
  applyCommands(doc, commitSchema.parse({ baseVersion: 1, mutationId: 'test', commands }).commands);
test('master source checkout edits source objects and publishes with placeholders and independent detach intact', () => {
  let doc = apply(fixture(), [{ type: 'layout.checkout', id: 'master', newId: 'edit' }]);
  const source = doc.slides[1],
    id = inspectSlide(source).find((item) => item.domId === 'label')!.id;
  assert.equal(source.hidden, true);
  assert.equal(source.layoutSourceId, 'master');
  doc = apply(doc, [
    {
      type: 'element.patch',
      slideId: 'edit',
      target: id,
      patch: { text: 'Revised', style: { 'font-size': '32px' } },
    },
  ]);
  assert.doesNotMatch(materializeLayout(doc, doc.slides[0]), /Revised/);
  doc = apply(doc, [{ type: 'layout.publish', slideId: 'edit' }]);
  assert.match(materializeLayout(doc, doc.slides[0]), /Revised/);
  assert.match(doc.layouts[0].html, /data-notale-field="slide-number"/);
  doc = apply(doc, [
    { type: 'layout.detach', slideId: 'page' },
    { type: 'element.patch', slideId: 'edit', target: id, patch: { text: 'Next' } },
    { type: 'layout.publish', slideId: 'edit' },
  ]);
  assert.match(doc.slides[0].html, /Revised/);
  assert.doesNotMatch(doc.slides[0].html, /Next/);
});
test('master editing rejects competing sources, inherited masters and interactive publication atomically', () => {
  const doc = apply(fixture(), [{ type: 'layout.checkout', id: 'master', newId: 'edit' }]);
  assert.throws(
    () => apply(doc, [{ type: 'layout.checkout', id: 'master', newId: 'other' }]),
    /existing master/,
  );
  assert.throws(
    () => apply(doc, [{ type: 'slide.update', slideId: 'edit', patch: { layoutId: 'master' } }]),
    /cannot inherit/,
  );
  const copied = apply(doc, [{ type: 'slide.duplicate', slideId: 'edit', newId: 'draft-copy' }]);
  assert.equal(copied.slides.find((page) => page.id === 'draft-copy')!.layoutSourceId, undefined);
  const before = structuredClone(doc);
  assert.throws(
    () =>
      apply(doc, [
        { type: 'element.insert', slideId: 'edit', html: '<canvas></canvas>' },
        { type: 'layout.publish', slideId: 'edit' },
      ]),
    /static/,
  );
  assert.deepEqual(doc, before);
});

test('master checkout expands imported CSS and rebases inline and linked resources into its editable path', () => {
  const doc = fixture();
  doc.layouts[0].css = '@import "parts/type.css"; footer{background:url(../images/bg.png)}';
  doc.layouts[0].html =
    '<link rel="stylesheet" href="parts/theme.css"><footer><img src="../images/logo.png"></footer>';
  const next = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: 'resources',
      commands: [{ type: 'layout.checkout', id: 'master', newId: 'edit' }],
    }).commands,
    { stylesheets: { 'design/parts/type.css': 'footer{color:blue}' } },
  );
  const source = next.slides[1];
  assert.match(source.html, /color:blue/);
  assert.match(source.html, /href="..\/design\/parts\/theme.css"/);
  assert.match(source.html, /src="..\/images\/logo.png"/);
  assert.match(source.html, /images\/bg.png/);
});

test('rendered page fields exclude master sources and identify detached snapshot copies by id',async()=>{
  const {renderSlide}=await import('../src/server/render.js');
  let doc=apply(fixture(),[{type:'layout.checkout',id:'master',newId:'edit'}]);
  doc=apply(doc,[{type:'slide.move',slideId:'edit',index:0}]);
  doc.layouts[0].html='<span data-notale-field="slide-number"></span>/<span data-notale-field="slide-count"></span>';
  const page=doc.slides.find(s=>s.id==='page')!;
  const html=await renderSlide(doc,structuredClone(page),'test');
  assert.match(html,/data-notale-field="slide-number"[^>]*>1<\/span>/);
  assert.match(html,/data-notale-field="slide-count"[^>]*>1<\/span>/);
});
