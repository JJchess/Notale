import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const echarts = createRequire(import.meta.url)('echarts');
import {
  chartKinds,
  newChart,
  compileChart,
  chartAuthoringSchema,
  chartAtState,
  cloneChart,
  cleanChartReferences,
  mergeChartEdit,
} from '../src/domain/chart-authoring.js';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { chartSvg } from '../src/domain/charts.js';
import { importHtml } from '../src/domain/html.js';

test('every advertised chart compiles into a real ECharts SVG', () => {
  for (const kind of chartKinds) {
    const model = newChart(kind);
    chartAuthoringSchema.parse(model);
    const chart = echarts.init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 900,
      height: 520,
    });
    try {
      chart.setOption(compileChart(model));
      const svg = chart.renderToSVGString();
      assert.match(svg, /<svg/);
      assert.ok(svg.length > 500, kind);
    } finally {
      chart.dispose();
    }
  }
});
test('editing keeps missing values, series identities and point formatting across row reordering', () => {
  const model = newChart();
  model.rows[0].values.training = null;
  model.series[0].points.row_1 = { color: '#ff0000' };
  model.rows.reverse();
  const option = compileChart(model);
  assert.equal(option.series[0].data.find((p: any) => p.id === 'row_0').value, null);
  assert.equal(option.series[0].data.find((p: any) => p.id === 'row_1').itemStyle.color, '#ff0000');
});
test('invalid numeric data, hierarchy cycles and orphan links are rejected', () => {
  const numeric = newChart();
  numeric.rows[0].values.training = 'wrong';
  assert.equal(chartAuthoringSchema.safeParse(numeric).success, false);
  const tree = newChart('tree');
  tree.rows[0].parentId = tree.rows[1].id;
  assert.equal(chartAuthoringSchema.safeParse(tree).success, false);
  const network = newChart('sankey');
  network.edges[0].target = 'missing';
  assert.equal(chartAuthoringSchema.safeParse(network).success, false);
});
test('chart states are deterministic and preserve the base chart', () => {
  const base = newChart('line');
  base.states = [
    { id: 'first', name: '突出训练误差', series: { series_validation: { opacity: 0.2 } } },
    { id: 'second', name: '下一步', series: { series_training: { hidden: true } } },
  ];
  assert.equal(chartAtState(base, ['first', 'second']).series[0].style.hidden, true);
  assert.equal(chartAtState(base, ['first']).series[0].style.hidden, undefined);
  assert.deepEqual(base.series[0].style, {});
});
test('chart creation and clipboard transfer preserve independent authoring data', () => {
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'chart_document',
    title: 'Charts',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'one.html',
        ...importHtml('<main id="stage" data-notale-id="stage"></main>'),
      }),
      slideSchema.parse({
        id: 'two',
        sourcePath: 'two.html',
        ...importHtml('<main id="stage" data-notale-id="stage2"></main>'),
      }),
    ],
  });
  const apply = (document: typeof doc, commands: unknown[]) =>
    applyCommands(
      document,
      commitSchema.parse({ baseVersion: 1, mutationId: 'chart_test', commands }).commands,
    );
  const created = apply(doc, [
    { type: 'native-chart.create', slideId: 'one', target: 'chart', model: newChart() },
  ]);
  validateDocument(created);
  const copied = apply(created, [
    {
      type: 'elements.transfer',
      slideId: 'two',
      sourceSlideId: 'one',
      sourceSnapshot: created.slides[0],
      targets: ['chart'],
      mode: 'copy',
      nativeChartTargets: ['chart'],
    },
  ]);
  validateDocument(copied);
  const clone = Object.values(copied.slides[1].nativeCharts)[0].authoring!;
  assert.equal(clone.rows.length, 4);
  assert.notEqual(clone.rows[0].id, created.slides[0].nativeCharts.chart.authoring!.rows[0].id);
});
test('deleting data cleans dependent chart annotations and steps atomically', () => {
  const m = newChart();
  m.annotations = [
    {
      id: 'note',
      text: 'Example',
      kind: 'point',
      rowId: 'row_0',
      seriesId: 'series_training',
      x: 0,
      y: 0,
      color: '#ff0000',
      fontSize: 16,
      width: 180,
    },
  ];
  m.states = [{ id: 'state', name: 'State', annotations: ['note'], hiddenRows: ['row_0'] }];
  m.rows.shift();
  cleanChartReferences(m);
  assert.deepEqual(m.annotations, []);
  assert.deepEqual(m.states[0].annotations, []);
});
test('cloning rewrites identity references without rewriting user content', () => {
  const m = newChart();
  m.rows[0].values.label = 'row_1';
  m.annotations = [
    {
      id: 'note',
      text: 'series_training',
      kind: 'point',
      rowId: 'row_1',
      seriesId: 'series_training',
      x: 0,
      y: 0,
      color: '#ff0000',
      fontSize: 16,
      width: 180,
    },
  ];
  let id = 0;
  const { model, ids } = cloneChart(m, () => `new_${id++}`);
  assert.equal(model.rows[0].values[model.bindings.label], 'row_1');
  assert.equal(model.annotations[0].text, 'series_training');
  assert.equal(model.annotations[0].rowId, ids.get('row_1'));
});

test('concurrent edits preserve unrelated fields and keyed rows', () => {
  const base = newChart(),
    remote = structuredClone(base),
    local = structuredClone(base);
  remote.appearance.title = 'Remote title';
  remote.rows[1].values.training = 44;
  local.rows[0].values.training = 55;
  const merged = mergeChartEdit(remote, base, local);
  assert.equal(merged.appearance.title, 'Remote title');
  assert.equal(merged.rows[0].values.training, 55);
  assert.equal(merged.rows[1].values.training, 44);
});

test('SVG conversion preserves the chart identity and data', () => {
  const html = chartSvg({ kind: 'line', labels: ['A', 'B'], values: [2, 5], title: 'Scores' });
  const doc = documentSchema.parse({
    schemaVersion: 1,
    id: 'convert_doc',
    title: 'Convert',
    slides: [slideSchema.parse({ id: 'one', sourcePath: 'one.html', ...importHtml(html) })],
  });
  const match = doc.slides[0].html.match(/<svg[^>]*data-notale-id="([^"]+)"/);
  assert.ok(match);
  const result = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: 'convert',
      commands: [{ type: 'native-chart.convert', slideId: 'one', target: match[1] }],
    }).commands,
  );
  validateDocument(result);
  assert.equal(result.slides[0].nativeCharts[match[1]].authoring!.rows[1].values.value_0, 5);
});
