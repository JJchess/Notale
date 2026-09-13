import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
import { byteRange } from '../src/server/range.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Media',
    slides: [
      slideSchema.parse({
        id: 'page',
        sourcePath: 'page.html',
        ...importHtml(
          '<main id="stage"><picture><source srcset="old.webp"><img src="old.png" style="width:300px;height:200px"></picture><video controls src="movie.webm"></video></main>',
        ),
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
test('media replacement retains source identity, geometry, animations and responsive source selection', () => {
  let doc = fixture();
  const target = inspectSlide(doc.slides[0]).find((o) => o.tag === 'img')!.id;
  doc = apply(doc, [
    {
      type: 'animation.set',
      slideId: 'page',
      animation: { id: 'cue', target, step: 1, trigger: 'click', effect: 'fade-in' },
    },
    {
      type: 'media.update',
      slideId: 'page',
      target,
      patch: {
        src: 'new.png',
        settings: { fit: 'cover', positionX: 90, crop: { left: 10, right: 5 } },
      },
    },
  ]);
  const objects = inspectSlide(doc.slides[0]),
    image = objects.find((o) => o.id === target)!;
  assert.equal(image.attributes.src, 'new.png');
  assert.equal(image.style.width, '300px');
  assert.equal(image.style['object-position'], '90% 50%');
  assert.equal(objects.find((o) => o.tag === 'source')!.attributes.srcset, 'new.png');
  assert.equal(doc.slides[0].animations[0].target, target);
});
test('partial media settings preserve existing trim and rate; invalid ranges and empty crops are atomic', () => {
  let doc = fixture();
  const target = inspectSlide(doc.slides[0]).find((o) => o.tag === 'video')!.id;
  doc = apply(doc, [
    {
      type: 'media.update',
      slideId: 'page',
      target,
      patch: { settings: { startAt: 2, endAt: 8, rate: 1.5, muted: true } },
    },
  ]);
  doc = apply(doc, [
    { type: 'media.update', slideId: 'page', target, patch: { settings: { volume: 0.4 } } },
  ]);
  const settings = JSON.parse(
    inspectSlide(doc.slides[0]).find((o) => o.id === target)!.attributes['data-notale-media'],
  );
  assert.equal(settings.startAt, 2);
  assert.equal(settings.rate, 1.5);
  assert.equal(settings.volume, 0.4);
  assert.equal(settings.muted, true);
  assert.throws(() =>
    apply(doc, [
      { type: 'deck.update', title: 'Must not survive' },
      { type: 'media.update', slideId: 'page', target, patch: { settings: { endAt: 1 } } },
    ]),
  );
  assert.equal(doc.title, 'Media');
  assert.throws(() =>
    apply(doc, [
      {
        type: 'media.update',
        slideId: 'page',
        target,
        patch: { settings: { crop: { left: 80, right: 40 } } },
      },
    ]),
  );
});
test('byte range parsing supports bounded, open, suffix and unsatisfiable requests', () => {
  assert.deepEqual(byteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(byteRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(byteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange('bytes=2-999', 10), { start: 2, end: 9 });
  assert.equal(byteRange('bytes=10-', 10), null);
  assert.equal(byteRange('bytes=-0', 10), null);
  assert.equal(byteRange('bytes=0-', 0), null);
  assert.equal(byteRange('bytes=0-1,3-4', 10), undefined);
});

test('resource-only replacement preserves existing visual effects and native playback ownership', () => {
  let doc = fixture();
  const objects = inspectSlide(doc.slides[0]),
    image = objects.find((o) => o.tag === 'img')!,
    video = objects.find((o) => o.tag === 'video')!;
  doc = apply(doc, [
    {
      type: 'element.patch',
      slideId: 'page',
      target: image.id,
      patch: { style: { 'object-fit': 'cover', 'clip-path': 'circle(40%)' } },
    },
    { type: 'media.update', slideId: 'page', target: image.id, patch: { src: 'replacement.png' } },
    { type: 'media.update', slideId: 'page', target: video.id, patch: { src: 'replacement.webm' } },
  ]);
  const edited = inspectSlide(doc.slides[0]);
  assert.equal(edited.find((o) => o.id === image.id)!.style['object-fit'], 'cover');
  assert.equal(edited.find((o) => o.id === image.id)!.style['clip-path'], 'circle(40%)');
  assert.equal(edited.find((o) => o.id === video.id)!.attributes['data-notale-media'], undefined);
});
