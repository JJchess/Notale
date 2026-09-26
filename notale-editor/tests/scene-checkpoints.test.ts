import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, parse, elements, attr, textOf, NODE_ID } from '../src/domain/html.js';
import { inspectSourceScenes, instrumentSourceScenes } from '../src/domain/source-scenes.js';
import { sceneCheckpointSchema } from '../src/domain/scene-checkpoints.js';

async function fixture() {
  const html = await readFile(new URL('./fixtures/scene-bootstrap.html', import.meta.url), 'utf8');
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'checkpoint',
    title: 'Checkpoint',
    slides: [slideSchema.parse({ id: 'one', sourcePath: 'page-12.html', ...importHtml(html) })],
  });
}
function runtime(slide: Awaited<ReturnType<typeof fixture>>['slides'][number]) {
  const listeners = new Map<string, () => void>();
  const dom = new Map<string, any>();
  const context: any = {
    window: {},
    structuredClone,
    document: {
      getElementById(id: string) {
        if (!dom.has(id))
          dom.set(id, {
            getBoundingClientRect: () => ({ width: 0, height: 0 }),
            addEventListener: (event: string, fn: () => void) =>
              listeners.set(`${id}:${event}`, fn),
          });
        return dom.get(id);
      },
      querySelectorAll: () =>
        [3, 5, 10, 25].map((m) => ({ dataset: { m: String(m) }, classList: { toggle() {} } })),
    },
    Deck: { init() {}, onResize() {} },
  };
  const script = elements(parse(instrumentSourceScenes(slide))).find(
    (el) => el.tagName === 'script' && textOf(el).includes('seedCounter'),
  )!;
  runInNewContext(textOf(script), context, { timeout: 5000 });
  const scene = inspectSourceScenes(slide)[0];
  return {
    scene,
    dom,
    hooks: context.window.__NOTALE_CHECKPOINTS__[scene.id],
    resample: () => listeners.get('resample-btn:click')!(),
  };
}
function apply(doc: Awaited<ReturnType<typeof fixture>>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'test', commands }).commands,
  );
}

test('real bootstrap checkpoint retains trees, comparison history and RNG continuation', async () => {
  const doc = await fixture(),
    live = runtime(doc.slides[0]);
  assert.equal(live.scene.checkpoint, 'bootstrap-forest-v1');
  live.resample();
  live.resample();
  const checkpoint = sceneCheckpointSchema.parse(live.hooks.capture());
  assert.equal(checkpoint.state.runCount, 3);
  assert.equal(typeof checkpoint.state.diffSingle, 'string');
  const edited = apply(doc, [
    { type: 'scene.checkpoint', slideId: 'one', sceneId: live.scene.id, checkpoint },
  ]);
  assert.equal(edited.slides[0].html, doc.slides[0].html);
  const reopened = runtime(edited.slides[0]);
  reopened.hooks.restore(edited.slides[0].scenes![0].checkpoint);
  assert.deepEqual(sceneCheckpointSchema.parse(reopened.hooks.capture()), checkpoint);
  assert.equal(reopened.dom.get('single-tree-id').textContent, '抽样树 #3');
  live.resample();
  reopened.resample();
  assert.deepEqual(
    sceneCheckpointSchema.parse(reopened.hooks.capture()),
    sceneCheckpointSchema.parse(live.hooks.capture()),
  );
  const copied = apply(edited, [
    { type: 'slide.duplicate', slideId: 'one', newId: 'two' },
    { type: 'scene.remove', slideId: 'two', sceneId: live.scene.id },
  ]);
  assert.deepEqual(copied.slides[0].scenes, edited.slides[0].scenes);
  assert.equal(copied.slides[1].scenes, undefined);
  const reset = apply(edited, [
    { type: 'scene.set', slideId: 'one', sceneId: live.scene.id, values: { m: 5 } },
  ]);
  assert.equal(reset.slides[0].scenes![0].checkpoint, undefined);
  assert.equal(runtime(reset.slides[0]).hooks.capture().state.trees.length, 5);
});

test('checkpoint source identity, dependency locks and derived fields reject invalid author writes', async () => {
  const doc = await fixture(),
    live = runtime(doc.slides[0]),
    checkpoint = live.hooks.capture();
  for (const values of [{ diffSingle: 12 }, { runCount: 10 }, { m: 0 }, { m: 7 }])
    assert.throws(
      () => apply(doc, [{ type: 'scene.set', slideId: 'one', sceneId: live.scene.id, values }]),
      { code: 'INVALID_SCENE_VALUE' },
    );
  const locked = structuredClone(doc);
  locked.slides[0].locked = [
    attr(
      elements(parse(locked.slides[0].html)).find((e) => attr(e, 'id') === 'resample-btn')!,
      NODE_ID,
    )!,
  ];
  assert.throws(
    () =>
      apply(locked, [
        { type: 'scene.checkpoint', slideId: 'one', sceneId: live.scene.id, checkpoint },
      ]),
    { code: 'LOCKED' },
  );
  const edited = apply(doc, [
    { type: 'scene.checkpoint', slideId: 'one', sceneId: live.scene.id, checkpoint },
  ]);
  edited.slides[0].html = edited.slides[0].html.replace(
    'let seedCounter = 101',
    'let seedCounter = 102',
  );
  assert.throws(() => validateDocument(edited), { code: 'SCENE_NOT_FOUND' });
  assert.equal(inspectSourceScenes(edited.slides[0])[0].checkpoint, undefined);
  assert.throws(
    () =>
      apply(edited, [
        {
          type: 'scene.checkpoint',
          slideId: 'one',
          sceneId: inspectSourceScenes(edited.slides[0])[0].id,
          checkpoint,
        },
      ]),
    { code: 'INVALID_SCENE_CHECKPOINT' },
  );
});

test('checkpoint validation bounds the native model and rejects malformed or mixed snapshots', async () => {
  const doc = await fixture(),
    live = runtime(doc.slides[0]),
    checkpoint = live.hooks.capture();
  const malformed = [
    { ...checkpoint, locals: { seedCounter: 0 } },
    { ...checkpoint, locals: { seedCounter: 2147483647 } },
    { ...checkpoint, state: { ...checkpoint.state, trees: [] } },
    { ...checkpoint, state: { ...checkpoint.state, m: 25 } },
    { ...checkpoint, state: { ...checkpoint.state, lastSingleGrid: [0] } },
    { ...checkpoint, state: { ...checkpoint.state, diffSingle: '101.0' } },
    {
      ...checkpoint,
      state: {
        ...checkpoint.state,
        trees: [{ isLeaf: false }, ...checkpoint.state.trees.slice(1)],
      },
    },
    { ...checkpoint, locals: { seedCounter: 123, unknown: 4 } },
  ];
  for (const bad of malformed) assert.equal(sceneCheckpointSchema.safeParse(bad).success, false);
  assert.equal(
    slideSchema.safeParse({
      ...doc.slides[0],
      scenes: [{ id: live.scene.id, values: { m: 5 }, checkpoint }],
    }).success,
    false,
  );
  const detached = sceneCheckpointSchema.parse(checkpoint);
  live.resample();
  assert.notDeepEqual(detached, live.hooks.capture());
});
