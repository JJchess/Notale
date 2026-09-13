import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeChartOptionSchema } from '../src/domain/native-charts.js';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml } from '../src/domain/html.js';
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'native',
    title: 'Native chart',
    slides: [
      slideSchema.parse({
        id: 'one',
        sourcePath: 'one.html',
        ...importHtml(
          '<main id="stage" data-notale-id="stage"><div data-notale-id="host" id="chart"></div><p data-notale-id="text">Original</p><script>window.callback = (value) => value + "%";</script></main>',
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
test('native chart patches retain script source and have independent page history data', () => {
  const original = fixture(),
    option = {
      series: [
        {
          lineStyle: { width: 9, color: '#b83d0b' },
          data: [
            [1, 0.5],
            [2, 0.25],
          ],
        },
      ],
    };
  const edited = apply(original, [
    { type: 'native-chart.set', slideId: 'one', target: 'host', option },
  ]);
  assert.equal(edited.slides[0].html, original.slides[0].html);
  assert.deepEqual(edited.slides[0].nativeCharts.host, { adapter: 'echarts', option });
  assert.deepEqual(original.slides[0].nativeCharts, {});
  const copied = apply(edited, [
    { type: 'slide.duplicate', slideId: 'one', newId: 'two' },
    { type: 'native-chart.remove', slideId: 'two', target: 'host' },
  ]);
  assert.deepEqual(copied.slides[0].nativeCharts, edited.slides[0].nativeCharts);
  assert.deepEqual(copied.slides[1].nativeCharts, {});
  const removed = apply(edited, [{ type: 'element.delete', slideId: 'one', target: 'host' }]);
  assert.deepEqual(removed.slides[0].nativeCharts, {});
  assert.match(removed.slides[0].html, /window.callback/);
});
test('native chart edits reject invalid hosts and locked ancestors without partial source writes', () => {
  const original = fixture();
  assert.throws(
    () =>
      apply(original, [
        {
          type: 'element.patch',
          slideId: 'one',
          target: 'text',
          patch: { text: 'Must roll back' },
        },
        { type: 'native-chart.set', slideId: 'one', target: 'text', option: {} },
      ]),
    { code: 'INVALID_NATIVE_CHART' },
  );
  assert.match(original.slides[0].html, />Original</);
  original.slides[0].locked = ['stage'];
  for (const command of [{ type: 'native-chart.set', option: {} }, { type: 'native-chart.remove' }])
    assert.throws(() => apply(original, [{ ...command, slideId: 'one', target: 'host' }]), {
      code: 'LOCKED',
    });
  const nested = fixture();
  nested.slides[0].html = nested.slides[0].html.replace(
    '</div>',
    '<span data-notale-id="protected">Keep</span></div>',
  );
  nested.slides[0].locked = ['protected'];
  assert.throws(
    () =>
      apply(nested, [
        {
          type: 'native-chart.set',
          slideId: 'one',
          target: 'host',
          option: { series: [{ lineStyle: { width: 8 } }] },
        },
      ]),
    { code: 'LOCKED' },
  );
  const malformed = fixture();
  malformed.slides[0].nativeCharts.missing = { adapter: 'echarts', option: {} };
  assert.throws(() => validateDocument(malformed), { code: 'DANGLING_OBJECT' });
});
test('native chart option validation rejects callbacks, malformed values and unbounded samples', () => {
  for (const option of [
    { series: [{ lineStyle: { width: -1 } }] },
    { series: [{ data: [Infinity] }] },
    { series: [{ label: { formatter: () => '%' } }] },
    { series: [{ lineStyle: { color: 'red;script()' } }] },
    { series: [{ data: Array(20001).fill(1) }] },
    { yAxis: { min: 2, max: 1 } },
    { tooltip: { formatter: 'unsupported' } },
  ])
    assert.equal(nativeChartOptionSchema.safeParse(option).success, false);
  assert.equal(
    nativeChartOptionSchema.safeParse({
      series: [{}, { data: [0, null, '-', [1, 2], { name: 'A', value: 3 }] }],
      xAxis: { axisLabel: { rotate: -45 } },
    }).success,
    true,
  );
});
test('legacy slides default native metadata and instance duplication cannot silently create empty charts', () => {
  const doc = fixture();
  delete (doc.slides[0] as any).nativeCharts;
  assert.deepEqual(validateDocument(doc).slides[0].nativeCharts, {});
  const edited = apply(doc, [
    {
      type: 'native-chart.set',
      slideId: 'one',
      target: 'host',
      option: { series: [{ lineStyle: { width: 9 } }] },
    },
  ]);
  assert.throws(
    () => apply(edited, [{ type: 'element.duplicate', slideId: 'one', target: 'host' }]),
    { code: 'INTERACTION_CLONE' },
  );
});
