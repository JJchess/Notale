import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, parse, elements, textOf } from '../src/domain/html.js';
import { inspectSourceScenes, instrumentSourceScenes } from '../src/domain/source-scenes.js';

function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'scene-doc',
    title: 'Scene',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'one.html',
        ...importHtml(
          `<main id="stage"><canvas id="plot" data-notale-id="plot"></canvas><input id="count" data-notale-id="count" type="range" min="1" max="9" step="2" value="3"></main><script>(()=>{const cv=document.getElementById('plot'),slider=document.getElementById('count');let state={count:3,seed:42,title:'Original'};slider.addEventListener('input',e=>{state.count=parseInt(e.target.value,10);});window.read=()=>({...state});})();</script>`,
        ),
      }),
    ],
  });
}
function apply(doc: ReturnType<typeof fixture>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'test', commands }).commands,
  );
}
test('source scenes discover bounded private parameters and instrument defaults without rewriting author source', () => {
  const doc = fixture(),
    scene = inspectSourceScenes(doc.slides[0])[0];
  assert.equal(scene.name, 'state');
  assert.equal(scene.parameters.length, 3);
  assert.deepEqual(scene.parameters[0].control, {
    target: 'count',
    event: 'input',
    min: 1,
    max: 9,
    step: 2,
  });
  const edited = apply(doc, [
    {
      type: 'scene.set',
      slideId: 'one',
      sceneId: scene.id,
      values: { count: 7, seed: 999, title: '</script><script>throw new Error("bad")</script>' },
    },
  ]);
  assert.equal(edited.slides[0].html, doc.slides[0].html);
  const rendered = instrumentSourceScenes(edited.slides[0]),
    scripts = elements(parse(rendered)).filter((el) => el.tagName === 'script');
  assert.equal(scripts.length, 1);
  const context: any = {
    window: {},
    document: { getElementById: () => ({ addEventListener() {} }) },
  };
  runInNewContext(textOf(scripts[0]), context);
  assert.equal(context.window.read().count, 7);
  assert.equal(context.window.read().seed, 999);
  assert.equal(context.window.__NOTALE_SCENES__[scene.id]().seed, 999);
  assert.equal(context.window.read().title, '</script><script>throw new Error("bad")</script>');
  assert.equal(Object.hasOwn(doc.slides[0], 'scenes'), false);
});
test('scene validation rejects stale source, unknown fields, invalid native ranges and locked dependencies', () => {
  const doc = fixture(),
    scene = inspectSourceScenes(doc.slides[0])[0];
  for (const values of [{ count: 2 }, { count: 11 }, { count: '7' }, { unknown: 1 }])
    assert.throws(
      () => apply(doc, [{ type: 'scene.set', slideId: 'one', sceneId: scene.id, values }]),
      { code: 'INVALID_SCENE_VALUE' },
    );
  const edited = apply(doc, [
    { type: 'scene.set', slideId: 'one', sceneId: scene.id, values: { seed: 123 } },
  ]);
  edited.slides[0].html = edited.slides[0].html.replace('seed:42', 'seed:43');
  assert.throws(() => validateDocument(edited), { code: 'SCENE_NOT_FOUND' });
  doc.slides[0].locked = ['plot'];
  assert.throws(
    () =>
      apply(doc, [{ type: 'scene.set', slideId: 'one', sceneId: scene.id, values: { seed: 123 } }]),
    { code: 'LOCKED' },
  );
  assert.throws(() => apply(doc, [{ type: 'scene.remove', slideId: 'one', sceneId: scene.id }]), {
    code: 'LOCKED',
  });
});
test('scene and form defaults use the last explicit edit and page copies reset independently', () => {
  const doc = fixture(),
    scene = inspectSourceScenes(doc.slides[0])[0];
  const bound = apply(doc, [
    {
      type: 'binding.set',
      slideId: 'one',
      binding: { id: 'binding', target: 'count', label: 'Count', value: '5', event: 'input' },
    },
  ]);
  const set = apply(bound, [
    { type: 'scene.set', slideId: 'one', sceneId: scene.id, values: { count: 7, seed: 99 } },
  ]);
  assert.equal(set.slides[0].bindings.length, 0);
  const rebound = apply(set, [
    {
      type: 'binding.set',
      slideId: 'one',
      binding: { id: 'binding', target: 'count', label: 'Count', value: '9', event: 'input' },
    },
  ]);
  assert.deepEqual(rebound.slides[0].scenes, [{ id: scene.id, values: { seed: 99 } }]);
  const copied = apply(rebound, [
    { type: 'slide.duplicate', slideId: 'one', newId: 'two' },
    { type: 'scene.remove', slideId: 'two', sceneId: scene.id },
  ]);
  assert.deepEqual(copied.slides[0].scenes, rebound.slides[0].scenes);
  assert.equal(copied.slides[1].scenes, undefined);
  assert.equal(copied.slides[1].bindings[0].value, '9');
});
test('scene discovery does not execute source or mistake callback-local and computed objects for editable startup state', () => {
  const doc = fixture();
  doc.slides[0].html = doc.slides[0].html.replace(
    "let state={count:3,seed:42,title:'Original'};",
    'let state={count:3,count:5};',
  );
  assert.deepEqual(inspectSourceScenes(doc.slides[0]), []);
  doc.slides[0].html = doc.slides[0].html
    .replace('(()=>{', '(function init(){')
    .replace('})();', '});');
  assert.deepEqual(inspectSourceScenes(doc.slides[0]), []);
});
test('scene discovery keeps nested lexical state separate from startup state and control links', () => {
  const doc = fixture();
  doc.slides[0].html = doc.slides[0].html.replace(
    "slider.addEventListener('input',e=>{state.count=parseInt(e.target.value,10);});",
    "{let state={count:5,seed:9};slider.addEventListener('input',e=>{state.count=parseInt(e.target.value,10);});}",
  );
  const scenes = inspectSourceScenes(doc.slides[0]);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].parameters[0].value, 3);
  assert.equal(scenes[0].parameters[0].control, undefined);
  const callback = fixture();
  callback.slides[0].html = callback.slides[0].html
    .replace('(()=>{', 'function later(){')
    .replace('})();', '}');
  assert.deepEqual(inspectSourceScenes(callback.slides[0]), []);
});

test('real Canvas lecture exposes seed and three source-native control bounds', async () => {
  const html = await readFile(
    new URL('./fixtures/scene-correlation.html', import.meta.url),
    'utf8',
  );
  const slide = slideSchema.parse({ id: 'real', sourcePath: 'page-07.html', ...importHtml(html) });
  const scenes = inspectSourceScenes(slide);
  assert.equal(scenes.length, 1);
  assert.deepEqual(
    scenes[0].parameters.map((p) => p.key),
    ['rho', 'M', 'eps', 'seed'],
  );
  assert.equal(scenes[0].parameters.find((p) => p.key === 'M')?.control?.step, 2);
  assert.equal(scenes[0].parameters.find((p) => p.key === 'rho')?.control?.max, 0.9);
});

test('real method comparison constrains nested task and method lookups without evaluating source', async () => {
  const html = await readFile(new URL('./fixtures/scene-methods.html', import.meta.url), 'utf8');
  const doc = fixture();
  doc.slides[0] = slideSchema.parse({ id: 'one', sourcePath: 'page-31.html', ...importHtml(html) });
  const [scene] = inspectSourceScenes(doc.slides[0]);
  assert.deepEqual(scene.parameters.find((p) => p.key === 'taskIdx')?.choices, [
    { value: 0, label: '深度决策树拟合复杂高噪声数据' },
    { value: 1, label: '弱分类器拟合非线性流形数据' },
    { value: 2, label: '多源混合特征预测（树+线性+近邻）' },
  ]);
  assert.deepEqual(
    scene.parameters.find((p) => p.key === 'selectedMethod')?.choices?.map((c) => c.value),
    ['bagging', 'boosting', 'stacking', 'none'],
  );
  for (const values of [
    { taskIdx: -1 },
    { taskIdx: 0.5 },
    { taskIdx: 3 },
    { selectedMethod: 'invalid' },
  ])
    assert.throws(
      () => apply(doc, [{ type: 'scene.set', slideId: 'one', sceneId: scene.id, values }]),
      { code: 'INVALID_SCENE_VALUE' },
    );
  const edited = apply(doc, [
    {
      type: 'scene.set',
      slideId: 'one',
      sceneId: scene.id,
      values: { taskIdx: 2, selectedMethod: 'stacking' },
    },
  ]);
  assert.equal(edited.slides[0].html, doc.slides[0].html);
  assert.deepEqual(edited.slides[0].scenes?.[0].values, { taskIdx: 2, selectedMethod: 'stacking' });
});

test('lookup choices intersect branches and respect parameter, block and destructuring shadows', () => {
  const doc = fixture();
  doc.slides[0].html = doc.slides[0].html.replace(
    "let state={count:3,seed:42,title:'Original'};",
    `
    const tables=[{methods:{Original:{}, common:{}, a:{}}},{methods:{common:{}, Original:{}, b:{}}}];
    let state={count:0,title:'Original'};
    function update(){const current=tables[state.count];return current.methods[state.title];}
    function unrelated(state){return [{},{},{}][state.count];}
    function shadowTable(tables){return tables[state.count];}
    function destructured({state}){return {wrong:{}}[state.title];}
    {let state={title:'wrong'};const ignored={wrong:{}}[state.title];}
  `,
  );
  const [scene] = inspectSourceScenes(doc.slides[0]);
  assert.deepEqual(
    scene.parameters.find((p) => p.key === 'count')?.choices?.map((c) => c.value),
    [0, 1],
  );
  assert.deepEqual(
    scene.parameters.find((p) => p.key === 'title')?.choices?.map((c) => c.value),
    ['Original', 'common'],
  );
});

test('dynamic, cyclic, sparse and computed lookup tables are not advertised as finite choices', () => {
  for (const expression of ['getTasks()', '[{},,{}]', '{[dynamic]:{}}', 'alias']) {
    const doc = fixture();
    doc.slides[0].html = doc.slides[0].html.replace(
      "let state={count:3,seed:42,title:'Original'};",
      `
      const alias=table, table=${expression}; let state={count:0};
      function read(){return table[state.count];}
    `,
    );
    assert.equal(inspectSourceScenes(doc.slides[0])[0].parameters[0].choices, undefined);
  }
});

test('lookup tables modified directly, through aliases or unknown calls remain dynamic', () => {
  for (const mutation of [
    'table.push({})',
    'table[2]={}',
    'delete table[0]',
    'const alias=table;alias.push({})',
    'mutate(table)',
    'const branch=table[0];branch.extra={}',
  ]) {
    const doc = fixture();
    doc.slides[0].html = doc.slides[0].html.replace(
      "let state={count:3,seed:42,title:'Original'};",
      `
      const table=[{},{}]; let state={count:0}; ${mutation};
      function read(){return table[state.count];}
    `,
    );
    assert.equal(inspectSourceScenes(doc.slides[0])[0].parameters[0].choices, undefined, mutation);
  }
});
