import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  inspectChartSources,
  chartFactory,
  instrumentChartLifecycle,
} from '../src/domain/chart-sources.js';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { importHtml, inspectSlide, parse, elements, attr, textOf } from '../src/domain/html.js';
async function fixture(name = 'chart-callbacks') {
  const html = await readFile(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
  const first = slideSchema.parse({ id: 'one', sourcePath: 'one.html', ...importHtml(html) });
  const library = [...inspectChartSources(first).values()][0].library;
  return documentSchema.parse({
    schemaVersion: 1,
    id: 'native-copy',
    title: 'Native copy',
    slides: [
      first,
      slideSchema.parse({
        id: 'two',
        sourcePath: 'nested/two.html',
        ...importHtml('<main id="stage"></main>'),
      }),
    ],
    assets: { [library]: { hash: 'a'.repeat(64), mime: 'application/javascript', size: 100 } },
  });
}
function apply(doc: Awaited<ReturnType<typeof fixture>>, commands: unknown[]) {
  return applyCommands(
    doc,
    commitSchema.parse({ baseVersion: 1, mutationId: 'test', commands }).commands,
  );
}
function transfer(target: string, mode = 'copy', sourceSlideId = 'one', slideId = 'two') {
  return {
    type: 'elements.transfer',
    slideId,
    sourceSlideId,
    targets: [target],
    mode,
    rectangles: [{ id: target, x: 100, y: 100, width: 600, height: 400 }],
  };
}

test('reviewed chart factories reproduce generated arrays and create independent callback closures', async () => {
  for (const name of ['chart-variance', 'chart-callbacks', 'chart-learning-rate']) {
    const doc = await fixture(name),
      sources = inspectChartSources(doc.slides[0]);
    assert.equal(sources.size, name === 'chart-callbacks' ? 2 : 1);
    for (const source of sources.values()) {
      const factory = runInNewContext(`(${chartFactory(source)})`, {}, { timeout: 1000 });
      const one = factory(),
        two = factory();
      assert.notEqual(one, two);
      assert.notEqual(one.series[0].data, two.series[0].data);
      assert.ok(one.series[0].data.length >= 10);
      if (source.domId === 'chart-features') {
        assert.equal(one.xAxis.axisLabel.formatter('4'), 'm=4(√p)');
        assert.equal(one.yAxis.axisLabel.formatter(0.25), '25%');
        assert.notEqual(one.xAxis.axisLabel.formatter, two.xAxis.axisLabel.formatter);
      }
      one.series[0].data[0] = 999;
      assert.notEqual(two.series[0].data[0], 999);
      assert.equal(chartFactory({ ...source, script: source.script + '\n' }), undefined);
    }
  }
});

test('native chart copy freezes a self-contained source and supports independent edit, move, reset and deletion', async () => {
  const doc = await fixture(),
    [target] = [...inspectChartSources(doc.slides[0]).keys()];
  const edited = apply(doc, [
    {
      type: 'native-chart.set',
      slideId: 'one',
      target,
      option: { series: [{ lineStyle: { width: 8 } }] },
    },
  ]);
  const copied = apply(edited, [transfer(target)]),
    [copy] = Object.keys(copied.slides[1].nativeCharts);
  assert.equal(copied.slides[0].html, doc.slides[0].html);
  assert.ok(copied.slides[1].nativeCharts[copy].source);
  assert.deepEqual(copied.slides[1].nativeCharts[copy].option, {
    series: [{ lineStyle: { width: 8 } }],
  });
  assert.equal(inspectSlide(copied.slides[1]).find((o) => o.id === copy)!.style.width, '600px');
  const reset = apply(copied, [{ type: 'native-chart.remove', slideId: 'two', target: copy }]);
  assert.ok(reset.slides[1].nativeCharts[copy].source);
  assert.deepEqual(reset.slides[1].nativeCharts[copy].option, {});
  const moved = apply(copied, [transfer(copy, 'cut', 'two', 'one')]);
  assert.deepEqual(moved.slides[1].nativeCharts, {});
  const owned = Object.entries(moved.slides[0].nativeCharts).find(([, c]) => c.source)!;
  assert.ok(owned);
  assert.notEqual(owned[0], target);
  const removed = apply(moved, [{ type: 'element.delete', slideId: 'one', target: owned[0] }]);
  assert.ok(!removed.slides[0].nativeCharts[owned[0]]);
  assert.ok(removed.slides[0].nativeCharts[target]);
  const independent = apply(copied, [{ type: 'slide.delete', slideId: 'one' }]);
  assert.ok(independent.slides[0].nativeCharts[copy].source);
  validateDocument(independent);
});

test('chart copies reject changed source, missing libraries and stale cut metadata', async () => {
  const doc = await fixture(),
    [target] = [...inspectChartSources(doc.slides[0]).keys()];
  const moved = apply(doc, [transfer(target, 'cut')]);
  assert.equal(Object.keys(moved.slides[1].nativeCharts).length, 1);
  assert.throws(() => apply(doc, [{ type: 'element.duplicate', slideId: 'one', target }]), {
    code: 'INTERACTION_CLONE',
  });
  const copied = apply(doc, [transfer(target)]),
    [copy] = Object.keys(copied.slides[1].nativeCharts);
  const stale = structuredClone(copied.slides[1]);
  const changed = apply(copied, [
    {
      type: 'native-chart.set',
      slideId: 'two',
      target: copy,
      option: { series: [{ name: 'Changed' }] },
    },
  ]);
  assert.throws(
    () => apply(changed, [{ ...transfer(copy, 'cut', 'two', 'one'), sourceSnapshot: stale }]),
    { code: 'CLIPBOARD_CHANGED' },
  );
  const broken = structuredClone(copied);
  broken.slides[1].nativeCharts[copy].source!.script += '\n';
  assert.throws(() => validateDocument(broken), { code: 'INVALID_CHART_SOURCE' });
  const missing = structuredClone(copied);
  missing.assets = {};
  assert.throws(() => validateDocument(missing), { code: 'MISSING_ASSET' });
});

test('deleted original chart hosts leave sibling data, resize and remaining native controls working', async () => {
  for (const name of ['chart-variance', 'chart-callbacks', 'chart-learning-rate']) {
    const doc = await fixture(name),
      original = doc.slides[0];
    for (const [target, source] of inspectChartSources(original)) {
      const removed = apply(doc, [{ type: 'element.delete', slideId: 'one', target }]).slides[0];
      assert.ok(removed.html.includes(source.script));
      const rendered = instrumentChartLifecycle(removed),
        nodes = elements(parse(rendered)),
        hosts = new Map<string, any>(),
        buttons: any[] = [],
        instances: Array<{ id: string; option?: any; resizes: number }> = [],
        resize: Array<() => void> = [];
      for (const node of nodes) {
        const id = attr(node, 'id');
        const el = {
          id,
          style: {} as Record<string, string>,
          textContent: '',
          classList: { add() {}, remove() {} },
          handlers: {} as Record<string, () => void>,
          getAttribute(key: string) {
            return attr(node, key);
          },
          addEventListener(key: string, fn: () => void) {
            this.handlers[key] = fn;
          },
        };
        if (id) hosts.set(id, el);
        if ((attr(node, 'class') ?? '').split(' ').includes('tab-btn')) buttons.push(el);
      }
      const echarts = {
        init(host: any) {
          assert.ok(host, 'Deleted hosts must never reach ECharts initialization');
          const instance = {
            id: host.id,
            option: undefined as any,
            resizes: 0,
            setOption(option: any) {
              this.option = option;
            },
            resize() {
              this.resizes++;
            },
          };
          instances.push(instance);
          return instance;
        },
      };
      const script = nodes.find((node) => node.tagName === 'script' && !attr(node, 'src'))!;
      runInNewContext(
        textOf(script),
        {
          window: {
            echarts,
            addEventListener(event: string, fn: () => void) {
              if (event === 'resize') resize.push(fn);
            },
          },
          echarts,
          Deck: { init() {} },
          document: {
            getElementById(id: string) {
              return hosts.get(id) ?? null;
            },
            querySelectorAll() {
              return buttons;
            },
          },
        },
        { timeout: 1000 },
      );
      for (const fn of resize) fn();
      assert.equal(instances.length, name === 'chart-callbacks' ? 1 : 0);
      for (const instance of instances) {
        assert.notEqual(instance.id, source.domId);
        assert.ok(instance.option.series[0].data.length >= 10);
        assert.equal(instance.resizes, 1);
      }
      if (name === 'chart-learning-rate') {
        assert.notEqual(hosts.get('fallback').style.display, 'block');
        assert.equal(buttons.length, 3);
        for (const button of buttons) {
          button.handlers.click();
          assert.ok(hosts.get('val-opt-m').textContent.endsWith(' 轮'));
        }
        assert.equal(hosts.get('val-opt-m').textContent, '135 轮');
      }
      assert.equal(instrumentChartLifecycle(original), original.html);
    }
  }
});

test('original chart cuts inherit authored data, respect locks and reject changed captured source', async () => {
  const doc = await fixture('chart-variance'),
    original = doc.slides[0],
    target = [...inspectChartSources(original).keys()][0];
  const edited = apply(doc, [
    {
      type: 'native-chart.set',
      slideId: 'one',
      target,
      option: { series: [{ lineStyle: { width: 8 } }] },
    },
  ]);
  const moved = apply(edited, [
    { ...transfer(target, 'cut'), sourceSnapshot: edited.slides[0], nativeChartTargets: [target] },
  ]);
  assert.deepEqual(
    Object.values(moved.slides[1].nativeCharts)[0].option,
    edited.slides[0].nativeCharts[target].option,
  );
  assert.deepEqual(moved.slides[0].nativeCharts, {});
  assert.ok(!inspectSlide(moved.slides[0]).some((o) => o.id === target));
  const changed = structuredClone(edited);
  changed.slides[0].html = changed.slides[0].html.replace(
    'var T_values =',
    '/* Changed */ var T_values =',
  );
  assert.throws(
    () => apply(changed, [{ ...transfer(target, 'cut'), sourceSnapshot: edited.slides[0] }]),
    { code: 'CLIPBOARD_CHANGED' },
  );
  const locked = apply(edited, [{ type: 'element.lock', slideId: 'one', target, locked: true }]);
  assert.throws(() => apply(locked, [transfer(target, 'cut')]), { code: 'LOCKED' });
});

test('captured native hosts reject unsupported source variants and unrelated clipboard hints atomically', async () => {
  const doc = await fixture('chart-variance'),
    target = inspectSlide(doc.slides[0]).find((o) => o.domId === 'chart')!.id;
  const supported = apply(doc, [{ ...transfer(target), nativeChartTargets: [target] }]);
  assert.equal(Object.keys(supported.slides[1].nativeCharts).length, 1);
  doc.slides[0].html = doc.slides[0].html.replace('var T_values =', '/* Variant */ var T_values =');
  assert.equal(inspectChartSources(doc.slides[0]).size, 0);
  const before = structuredClone(doc);
  assert.throws(() => apply(doc, [{ ...transfer(target), nativeChartTargets: [target] }]), {
    code: 'INTERACTION_CLONE',
  });
  assert.deepEqual(doc, before);
  assert.throws(() => apply(doc, [{ ...transfer(target), nativeChartTargets: ['unrelated'] }]), {
    code: 'INVALID_CLIPBOARD',
  });
  const legacy = commitSchema.parse({
    baseVersion: 1,
    mutationId: 'legacy',
    commands: [transfer(target)],
  });
  assert.equal(Object.hasOwn(legacy.commands[0], 'nativeChartTargets'), false);
});
