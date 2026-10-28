import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '@notale/editor/browser';
import { documentSchema } from '@notale/editor';
import { AuthorRuntimeRefreshBaselines, needsAuthorRuntimeRefresh } from '../src/canvas/author-runtime-refresh';

const html = '<!doctype html><html><head><style>.box { color: red; }</style><script src="assets/app.js" defer></script></head><body><main id="stage" data-notale-id="stage"><p id="title" data-notale-id="title" style="color:red;translate:0px 0px">Original</p><canvas id="chart" data-notale-id="chart"></canvas></main></body></html>';
function snapshot(): Snapshot {
  return { version: 1, createdAt: '2026-10-21T00:00:00Z', actor: 'test', document: documentSchema.parse({
    schemaVersion: 1, id: 'document', title: 'Document',
    slides: [{ id: 'page', name: 'Page', sourcePath: 'pages/page.html', html }, { id: 'other', name: 'Other', sourcePath: 'pages/other.html', html: '<p>Other</p>' }],
  }) };
}
function changed(before: Snapshot, change: (draft: Snapshot) => void): Snapshot {
  const after = structuredClone(before);
  after.version++;
  change(after);
  return after;
}
const page = (value: Snapshot) => value.document.slides[0];

test('text, geometry, font, color and hot author state do not require compiled refresh in either history direction', () => {
  const before = snapshot();
  const after = changed(before, draft => {
    page(draft).html = page(draft).html.replace('Original', 'Edited').replace('color:red;translate:0px 0px', 'color:blue;translate:84px 19px;width:200px;height:90px;font-size:42px;font-family:serif');
    draft.document.width = 1920;
    draft.document.theme = { '--accent': '#012345' };
    page(draft).theme = { '--text': '#555555' };
    page(draft).notes = 'Changed notes';
    page(draft).transforms.title = { x: 84, y: 19, rotate: 0, scaleX: 1, scaleY: 1, width: 200, height: 90 };
  });
  assert.equal(needsAuthorRuntimeRefresh(before, after, 'page'), false);
  assert.equal(needsAuthorRuntimeRefresh(after, before, 'page'), false);
  assert.equal(before.document.slides[0].html, html);
});

test('attribute order, quote style, comments and serializer whitespace are not runtime changes', () => {
  const before = snapshot();
  const after = changed(before, draft => {
    page(draft).html = page(draft).html.replace('<script src="assets/app.js" defer>', "<script defer='' src='assets/app.js'>")
      .replace('<p id="title" data-notale-id="title" style="color:red;translate:0px 0px">', "\n<!-- author note --><p style='color:green' data-notale-id='title' id='title'>");
  });
  assert.equal(needsAuthorRuntimeRefresh(before, after, 'page'), false);
});

test('source, stylesheet, structure and semantic attribute changes keep the compiled refresh path', () => {
  const before = snapshot();
  const changes: Array<[string, (draft: Snapshot) => void]> = [
    ['script address', draft => { page(draft).html = page(draft).html.replace('assets/app.js', 'assets/new.js'); }],
    ['inline source', draft => { page(draft).html = page(draft).html.replace('</body>', '<script>window.example=2</script></body>'); }],
    ['stylesheet source', draft => { page(draft).html = page(draft).html.replace('.box { color: red; }', '.box { color: blue; }'); }],
    ['base URL', draft => { page(draft).html = page(draft).html.replace('<head>', '<head><base href="/different/">'); }],
    ['source path', draft => { page(draft).sourcePath = 'elsewhere/page.html'; }],
    ['structure', draft => { page(draft).html = page(draft).html.replace('<canvas id="chart" data-notale-id="chart"></canvas>', ''); }],
    ['DOM id', draft => { page(draft).html = page(draft).html.replace('id="chart"', 'id="different-chart"'); }],
    ['control attribute', draft => { page(draft).html = page(draft).html.replace('id="title"', 'id="title" data-lr="0.2"'); }],
    ['event handler', draft => { page(draft).html = page(draft).html.replace('id="title"', 'id="title" onclick="change()"'); }],
  ];
  for (const [label, change] of changes) {
    const after = changed(before, change);
    assert.equal(needsAuthorRuntimeRefresh(before, after, 'page'), true, label);
    assert.equal(needsAuthorRuntimeRefresh(after, before, 'page'), true, `${label} undo`);
  }
});

test('compiler factories and scene inputs remain dependencies although runtimeIdentity alone omits them', () => {
  const before = snapshot();
  const changes: Array<[string, (draft: Snapshot) => void]> = [
    ['chart factory', draft => { page(draft).nativeCharts.chart = { adapter: 'echarts', option: {}, source: { script: 'const chart=make();', domId: 'chart', library: 'assets/chart.js' } }; }],
    ['canvas factory', draft => { page(draft).canvasInstances = { chart: { adapter: 'correlation-v1', lang: 'zh-CN', script: 'const state={value:1}', members: { canvas: 'chart' } } }; }],
    ['scene initializer', draft => { page(draft).scenes = [{ id: 'scene', values: { count: 7 } }]; }],
  ];
  for (const [label, change] of changes) assert.equal(needsAuthorRuntimeRefresh(before, changed(before, change), 'page'), true, label);
});

test('chart option edits stay on the hot adapter path while chart source edits require refresh', () => {
  const before = snapshot();
  page(before).nativeCharts.chart = { adapter: 'echarts', option: { color: ['red'] }, source: { script: 'const chart=make();', domId: 'chart', library: 'assets/chart.js' } };
  const appearance = changed(before, draft => { page(draft).nativeCharts.chart.option = { color: ['blue'] }; });
  assert.equal(needsAuthorRuntimeRefresh(before, appearance, 'page'), false);
  const source = changed(appearance, draft => { page(draft).nativeCharts.chart.source!.script = 'const chart=makeNew();'; });
  assert.equal(needsAuthorRuntimeRefresh(appearance, source, 'page'), true);
});

test('layout compilation and dependent executable assets remain covered, independent of version or map ordering', () => {
  const before = snapshot();
  before.document = documentSchema.parse({ ...before.document, layouts: [{ id: 'layout', name: 'Layout', html: '<div data-notale-id="slot">Layout</div>' }] });
  page(before).layoutId = 'layout';
  before.document.assets = {
    'pages/assets/app.js': { hash: 'a'.repeat(64), size: 1, mime: 'text/javascript' },
    'theme.css': { hash: 'b'.repeat(64), size: 1, mime: 'text/css' },
  };
  const reordered = changed(before, draft => { draft.document.assets = Object.fromEntries(Object.entries(draft.document.assets).reverse()); });
  assert.equal(needsAuthorRuntimeRefresh(before, reordered, 'page'), false);
  const changes: Array<[string, (draft: Snapshot) => void]> = [
    ['layout HTML', draft => { draft.document.layouts[0].html += '<span>New slot</span>'; }],
    ['layout CSS', draft => { draft.document.layouts[0].css = '.slot{display:none}'; }],
    ['layout values', draft => { page(draft).layoutValues = { slot: { title: 'Changed' } }; }],
    ['layout image', draft => { page(draft).layoutImages = { slot: { cover: { path: 'new.png' } } }; }],
    ['script asset', draft => { draft.document.assets['pages/assets/app.js'].hash = 'c'.repeat(64); }],
    ['stylesheet asset', draft => { draft.document.assets['theme.css'].hash = 'd'.repeat(64); }],
    ['inline module dependency', draft => { draft.document.assets['indirect.mjs'] = { hash: 'e'.repeat(64), size: 1, mime: 'text/javascript' }; }],
  ];
  for (const [label, change] of changes) assert.equal(needsAuthorRuntimeRefresh(before, changed(before, change), 'page'), true, label);
});

test('another page does not invalidate the active runtime and missing or replaced documents fail conservatively', () => {
  const before = snapshot();
  const other = changed(before, draft => { draft.document.slides[1].html = '<script>different()</script>'; });
  assert.equal(needsAuthorRuntimeRefresh(before, other, 'page'), false);
  assert.equal(needsAuthorRuntimeRefresh(before, changed(before, draft => { draft.document.slides.shift(); }), 'page'), true);
  assert.equal(needsAuthorRuntimeRefresh(before, changed(before, draft => { draft.document.id = 'new-document'; }), 'page'), true);
});

test('retry baselines survive acknowledgement and remain isolated by document and mutation', () => {
  const baselines = new AuthorRuntimeRefreshBaselines();
  const before = snapshot();
  const accepted = changed(before, draft => { page(draft).html = '<script>changed()</script>'; });
  assert.equal(baselines.capture(before, 'mutation'), before);
  assert.equal(baselines.capture(accepted, 'mutation'), before);
  assert.equal(needsAuthorRuntimeRefresh(baselines.capture(accepted, 'mutation'), accepted, 'page'), true);
  const anotherDocument = changed(accepted, draft => { draft.document.id = 'other-document'; });
  assert.equal(baselines.capture(anotherDocument, 'mutation'), anotherDocument);
  assert.equal(baselines.capture(accepted, 'different-mutation'), accepted);
  baselines.complete(before.document.id, 'mutation');
  assert.equal(baselines.capture(accepted, 'mutation'), accepted);
  baselines.clear();
  assert.equal(baselines.capture(before, 'mutation'), before);
});
