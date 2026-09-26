import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml } from '../src/domain/html.js';
import {
  inspectCanvasSources,
  canvasFactory,
  instrumentCanvasLifecycle,
} from '../src/domain/canvas-instances.js';
import { inspectSourceScenes, instrumentSourceScenes } from '../src/domain/source-scenes.js';
const html = readFileSync(new URL('./fixtures/scene-correlation.html', import.meta.url), 'utf8')
  .replace(/<link[^>]*>/g, '')
  .replace(/<script src="assets\/base.js"><\/script>/, '');
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'canvas-doc',
    title: 'Canvas',
    slides: [
      slideSchema.parse({ id: 'source', sourcePath: 'source.html', ...importHtml(html) }),
      slideSchema.parse({
        id: 'target',
        sourcePath: 'target.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
  });
}
function apply(doc: ReturnType<typeof fixture>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'canvas-test', commands }).commands,
  );
}
test('whole Canvas transfers retain source, independent state and members through deletion, copy and reset', () => {
  const original = fixture(),
    root = Object.keys(inspectCanvasSources(original.slides[0]))[0],
    scene = inspectSourceScenes(original.slides[0])[0];
  assert.equal(scene.root, root);
  const source = apply(original, [
    { type: 'scene.set', slideId: 'source', sceneId: scene.id, values: { M: 31, seed: 999 } },
  ]);
  const copied = apply(source, [
    {
      type: 'elements.transfer',
      slideId: 'target',
      sourceSlideId: 'source',
      targets: [root],
      canvasSceneStates: { [root]: { rho: 0.75, M: 9, eps: 0.25, seed: 876 } },
    },
  ]);
  const next = Object.keys(copied.slides[1].canvasInstances!)[0],
    instance = copied.slides[1].canvasInstances![next];
  assert.notEqual(next, root);
  assert.equal(instance.lang, 'zh');
  assert.equal(Object.keys(instance.members).length, 16);
  assert.deepEqual(copied.slides[1].scenes, [
    { id: next, values: { rho: 0.75, M: 9, eps: 0.25, seed: 876 } },
  ]);
  assert.equal(source.slides[0].html, copied.slides[0].html);
  const deleted = apply(copied, [{ type: 'element.delete', slideId: 'source', target: root }]);
  assert.equal(deleted.slides[0].scenes?.length ?? 0, 0);
  assert.match(instrumentCanvasLifecycle(deleted.slides[0]), /Deck.init/);
  assert.doesNotMatch(instrumentCanvasLifecycle(deleted.slides[0]), /function generateMatrix/);
  assert.throws(
    () =>
      apply(copied, [
        { type: 'element.delete', slideId: 'target', target: instance.members['matrix-canvas'] },
      ]),
    { code: 'CANVAS_BOUNDARY' },
  );
  assert.throws(
    () =>
      apply(source, [
        {
          type: 'elements.transfer',
          slideId: 'target',
          sourceSlideId: 'source',
          targets: [inspectCanvasSources(source.slides[0])[root].members['matrix-canvas']],
        },
      ]),
    { code: 'CANVAS_BOUNDARY' },
  );
  assert.throws(
    () =>
      apply(copied, [{ type: 'scene.set', slideId: 'target', sceneId: next, values: { M: 10 } }]),
    { code: 'INVALID_SCENE_VALUE' },
  );
  const reset = apply(copied, [{ type: 'scene.remove', slideId: 'target', sceneId: next }]);
  assert.equal(reset.slides[1].scenes, undefined);
  assert.ok(reset.slides[1].canvasInstances![next]);
  const locked = structuredClone(copied);
  locked.slides[1].locked.push(instance.members['resample']);
  assert.throws(
    () =>
      apply(locked, [
        { type: 'scene.set', slideId: 'target', sceneId: next, values: { seed: 123 } },
      ]),
    { code: 'LOCKED' },
  );
  const corrupt = structuredClone(copied);
  corrupt.slides[1].canvasInstances![next].script += ' ';
  assert.throws(() => validateDocument(corrupt), { code: 'INVALID_CANVAS_SOURCE' });
  const removed = apply(copied, [{ type: 'element.delete', slideId: 'target', target: next }]);
  assert.deepEqual(removed.slides[1].canvasInstances, {});
  assert.deepEqual(removed.slides[1].scenes, []);
});
test('reviewed Canvas factory isolates native closures, document metrics and events while preserving source state instrumentation', () => {
  const doc = fixture(),
    instance = Object.values(inspectCanvasSources(doc.slides[0]))[0];
  const factory = runInNewContext('(' + canvasFactory(instance) + ')');
  const create = (initial: object) => {
    const nodes = new Map<string, any>();
    const get = (id: string) => {
      if (!nodes.has(id))
        nodes.set(id, {
          style: {},
          dataset: { rho: '0' },
          classList: { toggle() {}, add() {}, remove() {} },
          events: {},
          addEventListener(type: string, callback: Function) {
            this.events[type] = callback;
          },
        });
      return nodes.get(id);
    };
    const local: any = { getElementById: get, querySelectorAll: () => [get('preset')] },
      view: any = {};
    factory(
      local,
      {
        autofit() {},
        token() {
          return '';
        },
        init() {},
      },
      initial,
      view,
    );
    return { local, view, get };
  };
  const a = create({ M: 31, seed: 999 }),
    b = create({ M: 9, seed: 876 });
  b.get('rho-slider').events.input({ target: { value: '0.75' } });
  assert.equal(b.view.read().rho, 0.75);
  assert.equal(a.view.read().rho, 0);
  assert.equal(a.view.read().M, 31);
  assert.equal(b.view.read().M, 9);
  assert.notEqual(a.local.currentSimEnsRate, b.local.currentSimEnsRate);
  const scene = inspectSourceScenes(doc.slides[0])[0],
    saved = apply(doc, [
      { type: 'scene.set', slideId: 'source', sceneId: scene.id, values: { seed: 1234 } },
    ]);
  const projected = instrumentCanvasLifecycle(
    saved.slides[0],
    instrumentSourceScenes(saved.slides[0]),
  );
  assert.ok(projected.includes(scene.id));
  assert.match(projected, /seed: 1234/);
  assert.match(projected, /closest\('\.workspace'\)/);
});

test('portable rendering declares UTF-8 before long head content without changing author source', async () => {
  const { renderSlide } = await import('../src/server/render.js');
  const doc = fixture();
  doc.slides[1].html =
    '<html><head><style>' +
    '/* padding */'.repeat(120) +
    '</style><meta charset="windows-1252"></head><body><main id="stage"><p>讲授与投票</p></main><script>window.label="投票裁决"</script></body></html>';
  const original = doc.slides[1].html;
  const rendered = await renderSlide(doc, doc.slides[1], 'export');
  assert.match(rendered, /<head><meta charset="utf-8">/);
  assert.doesNotMatch(rendered, /charset="windows-1252"/);
  assert.ok(rendered.indexOf('charset="utf-8"') < 1024);
  assert.equal(doc.slides[1].html, original);
});
