import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands } from '../src/domain/commands.js';
import { parse, elements, importHtml, inspectSlide, attr } from '../src/domain/html.js';
import { tableGrid } from '../src/domain/tables.js';
import { chartDataSchema, chartSvg } from '../src/domain/charts.js';
function table() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Table',
    slides: [
      slideSchema.parse({
        id: 'page',
        sourcePath: 'page.html',
        ...importHtml(
          '<main id="stage"><table><tbody><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>&lt;script&gt;literal&lt;/script&gt;</td><td>F</td></tr><tr><td>G</td><td>H</td><td>I</td></tr></tbody></table></main>',
        ),
      }),
    ],
  });
}
test('merged table edits preserve a rectangular grid, cell identities and literal text', () => {
  let doc = table();
  const id = inspectSlide(doc.slides[0]).find((o) => o.tag === 'table')!.id;
  const run = (action: string, row = 0, column = 0, rowSpan = 1, colSpan = 1) => {
    doc = applyCommands(
      doc,
      commitSchema.parse({
        baseVersion: 1,
        mutationId: randomUUID(),
        commands: [
          {
            type: 'table.edit',
            slideId: 'page',
            target: id,
            action,
            row,
            column,
            rowSpan,
            colSpan,
          },
        ],
      }).commands,
    );
    return tableGrid(elements(parse(doc.slides[0].html)).find((e) => e.tagName === 'table')!);
  };
  let grid = run('merge', 0, 0, 2, 2);
  assert.equal(grid.cells.length, 6);
  assert.equal(grid.grid[1][1], grid.grid[0][0]);
  assert.ok(!elements(parse(doc.slides[0].html)).some((e) => e.tagName === 'script'));
  grid = run('insert-row', 1);
  assert.equal(grid.rows.length, 4);
  assert.equal(grid.grid[0][0].rowSpan, 3);
  grid = run('insert-column', 0, 1);
  assert.equal(grid.width, 4);
  assert.equal(grid.grid[0][0].colSpan, 3);
  grid = run('delete-row', 0);
  assert.equal(grid.rows.length, 3);
  assert.equal(grid.grid[0][0].rowSpan, 2);
  grid = run('delete-column', 0, 1);
  assert.equal(grid.width, 3);
  assert.equal(grid.grid[0][0].colSpan, 2);
  grid = run('unmerge', 0, 0);
  assert.equal(grid.cells.length, 9);
  assert.ok(grid.cells.every((c) => c.colSpan === 1 && c.rowSpan === 1));
});
test('table merge cannot cut through an existing spanning cell', () => {
  let doc = table();
  const id = inspectSlide(doc.slides[0]).find((o) => o.tag === 'table')!.id;
  function command(row: number, colSpan: number) {
    return commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        {
          type: 'table.edit',
          slideId: 'page',
          target: id,
          action: 'merge',
          row,
          column: 0,
          rowSpan: 2,
          colSpan,
        },
      ],
    }).commands;
  }
  doc = applyCommands(doc, command(0, 2));
  assert.throws(() => applyCommands(doc, command(1, 3)), { code: 'PARTIAL_MERGE' });
});
test('data-backed charts render multiple series and reject incompatible pie values', () => {
  for (const kind of ['bar', 'line', 'area', 'pie', 'doughnut']) {
    const html = chartSvg({ kind, labels: ['A', 'B', 'C'], values: [20, 40, 60] });
    const root = parse(html),
      svg = elements(root).find((e) => e.tagName === 'svg')!;
    assert.equal(JSON.parse(attr(svg, 'data-notale-chart')!).kind, kind);
    assert.ok(elements(svg).length > 3);
  }
  const html = chartSvg({
    kind: 'line',
    labels: ['A', 'B'],
    series: [
      { name: 'first', values: [-10, 30] },
      { name: 'second', values: [20, 5] },
    ],
  });
  assert.equal(elements(parse(html)).filter((e) => e.tagName === 'polyline').length, 2);
  assert.throws(() => chartDataSchema.parse({ kind: 'pie', labels: ['A', 'B'], values: [-1, 2] }));
  assert.throws(() => chartDataSchema.parse({ labels: ['A', 'B'], values: [1] }));
});

test('dense cartesian charts retain every sample while bounding axis labels and validating styles', () => {
  const labels = Array.from({ length: 100 }, (_, i) => `训练阶段 ${i + 1} — 完整长分类名称`);
  const series = Array.from({ length: 8 }, (_, j) => ({
    name: `比较系列 ${j + 1} 的完整长名称`,
    values: labels.map((_, i) => (i - 50) * (j + 1)),
  }));
  for (const kind of ['bar', 'line', 'area']) {
    const html = chartSvg({
      kind,
      labels,
      series,
      fontSize: 24,
      labelEvery: 0,
      title: '完整标题',
      colors: ['#1234', '#abcdef'],
      valueDecimals: 2,
    });
    const nodes = elements(parse(html));
    assert.equal(nodes.filter((n) => attr(n, 'data-chart-point') !== undefined).length, 800);
    assert.equal(nodes.filter((n) => attr(n, 'data-chart-legend') !== undefined).length, 8);
    const ticks = nodes.filter((n) => attr(n, 'data-chart-tick') !== undefined);
    assert.ok(ticks.length >= 2 && ticks.length <= 5);
    const categories = nodes.filter((n) => attr(n, 'data-chart-category') !== undefined);
    assert.ok(categories.length > 0 && categories.length < 100);
    for (const n of nodes) if (attr(n, 'textLength')) assert.ok(Number(attr(n, 'textLength')) > 0);
    assert.deepEqual(
      JSON.parse(attr(nodes.find((n) => n.tagName === 'svg')!, 'data-notale-chart')!).series,
      series,
    );
    assert.doesNotMatch(html, /NaN|Infinity/);
  }
  for (const patch of [
    { colors: ['#12345'] },
    { fontSize: 0 },
    { labelAngle: 45 },
    { lineWidth: -1 },
    { labelEvery: -1 },
  ])
    assert.throws(() => chartDataSchema.parse({ labels: ['A'], values: [1], ...patch }));
  assert.doesNotMatch(
    chartSvg({ labels: ['A'], values: [1], showGrid: false, showLegend: false, showValues: false }),
    /data-chart-grid|data-chart-legend|data-chart-value/,
  );
  const forced = elements(parse(chartSvg({ labels, series, labelEvery: 1 })));
  assert.equal(forced.filter((n) => attr(n, 'data-chart-category') !== undefined).length, 100);
  for (const n of forced) if (attr(n, 'textLength')) assert.ok(Number(attr(n, 'textLength')) > 0);
});

test('chart restyling preserves root identity, placement and source sizing', () => {
  let doc = documentSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    title: 'Styled chart',
    slides: [
      slideSchema.parse({
        id: 'page',
        sourcePath: 'page.html',
        ...importHtml(chartSvg({ labels: ['A', 'B'], values: [2, 5] })),
      }),
    ],
  });
  const target = inspectSlide(doc.slides[0]).find((o) => o.attributes['data-notale-chart'])!.id;
  const edit = (commands: unknown[]) => {
    doc = applyCommands(
      doc,
      commitSchema.parse({ baseVersion: 1, mutationId: randomUUID(), commands }).commands,
    );
  };
  edit([
    {
      type: 'element.transform',
      slideId: 'page',
      target,
      transform: { x: 80, y: 20, rotate: 15, scaleX: 1, scaleY: 1, width: 750, height: 450 },
    },
  ]);
  const before = inspectSlide(doc.slides[0]).find((o) => o.id === target)!,
    transform = structuredClone(doc.slides[0].transforms[target]);
  edit([
    {
      type: 'chart.update',
      slideId: 'page',
      target,
      data: {
        kind: 'line',
        labels: ['A', 'B'],
        values: [2, 5],
        background: '#fff0',
        textColor: '#333',
        lineWidth: 8,
        pointRadius: 0,
      },
    },
  ]);
  const after = inspectSlide(doc.slides[0]).find((o) => o.id === target)!;
  for (const key of ['left', 'top', 'width', 'height', 'transform'])
    assert.equal(after.style[key], before.style[key]);
  assert.deepEqual(doc.slides[0].transforms[target], transform);
  assert.equal(after.style.background, 'transparent');
  assert.equal(JSON.parse(after.attributes['data-notale-chart']).lineWidth, 8);
});
