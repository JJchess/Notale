import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, inspectSlide, parse, elements, attr, textOf } from '../src/domain/html.js';
import { inspectChartComponents, interactionMembers } from '../src/domain/chart-components.js';
import {
  inspectChartSources,
  chartInteractionFactory,
  instrumentChartLifecycle,
} from '../src/domain/chart-sources.js';
async function fixture() {
  const first = slideSchema.parse({
    id: 'one',
    sourcePath: 'one.html',
    ...importHtml(
      await readFile(new URL('./fixtures/chart-learning-rate.html', import.meta.url), 'utf8'),
    ),
  });
  const library = [...inspectChartSources(first).values()][0].library;
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'components',
    title: 'Components',
    slides: [
      first,
      slideSchema.parse({
        id: 'two',
        sourcePath: 'nested/two.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
    assets: { [library]: { hash: 'a'.repeat(64), size: 100, mime: 'application/javascript' } },
  });
}
function apply(doc: Awaited<ReturnType<typeof fixture>>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'components', commands }).commands,
  );
}
function transfer(root: string, slideId = 'one', sourceSlideId = 'one', mode = 'copy') {
  return {
    type: 'elements.transfer',
    slideId,
    sourceSlideId,
    targets: [root],
    mode,
    rectangles: [{ id: root, x: 50, y: 100, width: 1400, height: 700 }],
  };
}
test('whole interactive components remap members, capture choices and remain discoverable beside their copies', async () => {
  const doc = await fixture(),
    [target, component] = [...inspectChartComponents(doc.slides[0])][0];
  assert.equal(
    component.controls['0.1'],
    inspectSlide(doc.slides[0]).find(
      (o) => o.tag === 'button' && o.attributes['data-lr'] === '0.1',
    )!.id,
  );
  const copied = apply(doc, [
    {
      ...transfer(component.root),
      nativeChartTargets: [target],
      nativeChartStates: {
        [target]: { value: '1.0', active: component.active, inactive: component.inactive },
      },
    },
  ]);
  const [copy, chart] = Object.entries(copied.slides[0].nativeCharts)[0];
  assert.equal(chart.interaction!.value, '1.0');
  assert.equal(inspectChartComponents(copied.slides[0]).size, 2);
  assert.deepEqual(inspectChartComponents(copied.slides[0]).get(target), component);
  assert.ok(
    interactionMembers(chart.interaction!).every(
      (id) => !interactionMembers(component).includes(id),
    ),
  );
  assert.ok(copied.slides[0].html.includes(chart.source!.script));
  const third = apply(copied, [transfer(chart.interaction!.root, 'two')]);
  const [other, otherChart] = Object.entries(third.slides[1].nativeCharts)[0];
  assert.notEqual(copy, other);
  assert.equal(otherChart.interaction!.value, '1.0');
  const moved = apply(third, [transfer(chart.interaction!.root, 'two', 'one', 'cut')]);
  assert.deepEqual(moved.slides[0].nativeCharts, {});
  assert.equal(Object.keys(moved.slides[1].nativeCharts).length, 2);
  validateDocument(moved);
  const reset = apply(third, [{ type: 'native-chart.remove', slideId: 'one', target: copy }]);
  assert.equal(reset.slides[0].nativeCharts[copy].interaction!.value, '1.0');
});

test('component edits enforce membership, state choices and locks without partially removing dependencies', async () => {
  const doc = await fixture(),
    [, component] = [...inspectChartComponents(doc.slides[0])][0];
  const copied = apply(doc, [transfer(component.root)]),
    [id, chart] = Object.entries(copied.slides[0].nativeCharts)[0],
    binding = chart.interaction!;
  const changed = apply(copied, [
    { type: 'native-chart.state', slideId: 'one', target: id, value: '0.02' },
  ]);
  assert.equal(changed.slides[0].nativeCharts[id].interaction!.value, '0.02');
  assert.throws(() =>
    apply(copied, [{ type: 'native-chart.state', slideId: 'one', target: id, value: 'bad' }]),
  );
  const locked = apply(copied, [
    { type: 'element.lock', slideId: 'one', target: binding.metrics.optM, locked: true },
  ]);
  assert.throws(
    () =>
      apply(locked, [{ type: 'native-chart.state', slideId: 'one', target: id, value: '0.02' }]),
    { code: 'LOCKED' },
  );
  assert.throws(() => apply(copied, [{ type: 'element.delete', slideId: 'one', target: id }]), {
    code: 'COMPONENT_BOUNDARY',
  });
  const inserted = apply(copied, [
    {
      type: 'element.insert',
      slideId: 'one',
      parent: binding.metrics.optM,
      html: '<span id="locked-metric-child">Protected</span>',
    },
  ]);
  const nested = apply(inserted, [
    {
      type: 'element.lock',
      slideId: 'one',
      target: inspectSlide(inserted.slides[0]).find((o) => o.domId === 'locked-metric-child')!.id,
      locked: true,
    },
  ]);
  assert.throws(
    () => apply(nested, [{ type: 'native-chart.state', slideId: 'one', target: id, value: '1.0' }]),
    { code: 'LOCKED' },
  );
  assert.throws(() => apply(copied, [transfer(binding.controls['1.0'], 'two')]), {
    code: 'COMPONENT_BOUNDARY',
  });
  const removed = apply(copied, [{ type: 'element.delete', slideId: 'one', target: binding.root }]);
  assert.deepEqual(removed.slides[0].nativeCharts, {});
  const broken = structuredClone(copied);
  broken.slides[0].nativeCharts[id].interaction!.metrics.optM = component.metrics.optM;
  assert.throws(() => validateDocument(broken), { code: 'INVALID_COMPONENT' });
  const nestedMetric = structuredClone(copied);
  const control = elements(parse(nestedMetric.slides[0].html)).find(
    (node) => attr(node, 'data-notale-id') === binding.controls['1.0'],
  )!;
  assert.ok(control.parentNode && 'tagName' in control.parentNode);
  nestedMetric.slides[0].nativeCharts[id].interaction!.metrics.optM = attr(
    control.parentNode!,
    'data-notale-id',
  )!;
  assert.throws(() => validateDocument(nestedMetric), { code: 'INVALID_COMPONENT' });
  const enclosing = structuredClone(copied);
  enclosing.slides[0].nativeCharts[id].interaction!.root = inspectSlide(enclosing.slides[0]).find(
    (o) => o.domId === 'stage',
  )!.id;
  assert.throws(() => validateDocument(enclosing), { code: 'INVALID_COMPONENT' });
  const [sourceId] = [...inspectChartComponents(doc.slides[0])][0];
  assert.throws(
    () =>
      apply(doc, [
        {
          ...transfer(sourceId),
          nativeChartStates: {
            [sourceId]: { value: '1.0', active: component.active, inactive: component.inactive },
          },
        },
      ]),
    { code: 'INVALID_CLIPBOARD' },
  );
});

test('rendered source controls exclude independent components and original factories retain profile data', async () => {
  const doc = await fixture(),
    [target, component] = [...inspectChartComponents(doc.slides[0])][0];
  const copied = apply(doc, [transfer(component.root)]),
    [, chart] = Object.entries(copied.slides[0].nativeCharts)[0];
  const factory = runInNewContext(
    `(${chartInteractionFactory(chart.source!)})`,
    {},
    { timeout: 1000 },
  )();
  assert.equal(factory('1.0').metrics.optM, '14 轮');
  assert.equal(factory('0.02').metrics.optM, '135 轮');
  assert.notDeepEqual(factory('1.0').option.series[0].data, factory('0.02').option.series[0].data);
  const rendered = instrumentChartLifecycle(copied.slides[0]),
    nodes = elements(parse(rendered));
  assert.match(rendered, /filter\(button=>!button.closest/);
  const hosts = new Map<string, any>(),
    buttons: any[] = [];
  for (const node of nodes) {
    const domId = attr(node, 'id'),
      nodeId = attr(node, 'data-notale-id');
    const owned = Object.values(chart.interaction!.controls).includes(nodeId!);
    const el = {
      style: {},
      textContent: '',
      handlers: {} as Record<string, () => void>,
      classList: { add() {}, remove() {} },
      getAttribute(key: string) {
        return attr(node, key);
      },
      closest() {
        return owned ? {} : null;
      },
      addEventListener(type: string, fn: () => void) {
        this.handlers[type] = fn;
      },
    };
    if (domId) hosts.set(domId, el);
    if (node.tagName === 'button' && attr(node, 'data-lr')) buttons.push({ el, owned });
  }
  const echarts = {
    init() {
      return { setOption() {}, resize() {} };
    },
  };
  const script = nodes.find((n) => n.tagName === 'script' && !attr(n, 'src'))!;
  runInNewContext(
    textOf(script),
    {
      window: { echarts, addEventListener() {} },
      echarts,
      Deck: { init() {} },
      document: {
        getElementById(id: string) {
          return hosts.get(id);
        },
        querySelectorAll() {
          return buttons.map((b) => b.el);
        },
      },
    },
    { timeout: 1000 },
  );
  assert.equal(buttons.filter((b) => b.owned).length, 3);
  assert.ok(buttons.filter((b) => b.owned).every((b) => !b.el.handlers.click));
  assert.ok(buttons.filter((b) => !b.owned).every((b) => b.el.handlers.click));
  assert.ok(inspectChartSources(copied.slides[0]).has(target));
});

test('original components become editable in place and state appearance patches preserve independent values', async () => {
  const doc = await fixture(),
    [id, component] = [...inspectChartComponents(doc.slides[0])][0];
  const changed = apply(doc, [
    {
      type: 'native-chart.set',
      slideId: 'one',
      target: id,
      option: { series: [{ lineStyle: { width: 9 } }] },
    },
    {
      type: 'native-chart.component',
      slideId: 'one',
      target: id,
      state: { value: '1.0', active: component.active, inactive: component.inactive },
    },
    {
      type: 'native-chart.appearance',
      slideId: 'one',
      target: id,
      state: 'active',
      patch: { backgroundColor: '#6a2488', fontWeight: '900' },
    },
  ]);
  const chart = changed.slides[0].nativeCharts[id];
  assert.equal(changed.slides[0].html, doc.slides[0].html);
  assert.equal(chart.interaction!.root, component.root);
  assert.equal(chart.interaction!.value, '1.0');
  assert.deepEqual(chart.interaction!.inactive, component.inactive);
  assert.deepEqual(chart.interaction!.active, {
    ...component.active,
    backgroundColor: '#6a2488',
    fontWeight: '900',
  });
  assert.deepEqual(chart.option, { series: [{ lineStyle: { width: 9 } }] });
  const teaching = {
    id: 'steps',
    root: id,
    name: 'Teaching',
    initial: 'base',
    states: [
      { id: 'base', name: 'Base', patches: {} },
      { id: 'slow', name: 'Slow', patches: { [id]: { nativeChartValue: '0.02' } } },
    ],
  };
  assert.throws(
    () => apply(changed, [{ type: 'component.set', slideId: 'one', component: teaching }]),
    { code: 'INVALID_COMPONENT' },
  );
  validateDocument(
    apply(changed, [
      { type: 'component.set', slideId: 'one', component: { ...teaching, root: component.root } },
    ]),
  );
  const rendered = instrumentChartLifecycle(changed.slides[0]);
  assert.ok(!rendered.includes('chart = echarts.init(chartHost'));
  assert.match(rendered, /filter\(button=>!button.closest/);
  const copy = apply(changed, [transfer(component.root, 'two')]);
  const copied = Object.values(copy.slides[1].nativeCharts)[0];
  assert.deepEqual(copied.interaction!.active, chart.interaction!.active);
  assert.equal(copied.interaction!.value, '1.0');
  validateDocument(copy);
});

test('component appearance rejects empty patches and protects affected controls without blocking unrelated locked metrics', async () => {
  const doc = await fixture(),
    [id, component] = [...inspectChartComponents(doc.slides[0])][0];
  const adopted = apply(doc, [{ type: 'native-chart.component', slideId: 'one', target: id }]);
  const command = {
    type: 'native-chart.appearance',
    slideId: 'one',
    target: id,
    state: 'inactive',
    patch: { color: '#334455' },
  };
  const metricLocked = apply(adopted, [
    { type: 'element.lock', slideId: 'one', target: component.metrics.optM, locked: true },
  ]);
  assert.equal(
    apply(metricLocked, [command]).slides[0].nativeCharts[id].interaction!.inactive.color,
    '#334455',
  );
  const controlLocked = apply(adopted, [
    { type: 'element.lock', slideId: 'one', target: component.controls['1.0'], locked: true },
  ]);
  assert.throws(() => apply(controlLocked, [command]), { code: 'LOCKED' });
  assert.throws(() => apply(doc, [command]), { code: 'COMPONENT_NOT_FOUND' });
  for (const patch of [{}, { color: '' }, { color: '  ' }, { opacity: '0.5' }])
    assert.throws(() => apply(adopted, [{ ...command, patch }]));
  const originalLocked = apply(doc, [
    { type: 'element.lock', slideId: 'one', target: component.controls['0.1'], locked: true },
  ]);
  assert.throws(
    () => apply(originalLocked, [{ type: 'native-chart.component', slideId: 'one', target: id }]),
    { code: 'LOCKED' },
  );
  assert.deepEqual(originalLocked.slides[0].nativeCharts, {});
});
