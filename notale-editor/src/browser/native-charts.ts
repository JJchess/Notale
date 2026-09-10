import { compileChart, chartAtState, type ChartSelection } from '../domain/chart-authoring.js';
import type { NativeChart, LearningRate, NativeChartInteraction } from '../domain/native-charts.js';

type Instance = {
  dispatchAction?: (action: unknown, options?: unknown) => void;
  on?: (event: string, handler: (event: any) => void) => void;
  off?: (event: string, handler: (event: any) => void) => void;
  convertToPixel?: (finder: unknown, value: unknown) => any;
  getDataURL?: (options?: unknown) => string;
  setOption: (option: unknown, options?: unknown, lazyUpdate?: boolean) => void;
  getOption: () => any;
  resize: (options?: unknown) => void;
  isDisposed: () => boolean;
  dispose: () => void;
};
declare global {
  interface Window {
    __NOTALE_CHART_ENGINE__?: Window['echarts'];
    echarts?: {
      getInstanceByDom: (host: HTMLElement) => Instance | undefined;
      init: (host: HTMLElement, theme?: unknown, options?: unknown) => Instance;
    };
    __NOTALE_CHART_FACTORIES__?: Record<string, () => any>;
    __NOTALE_CHART_INTERACTIONS__?: Record<
      string,
      () => (value: LearningRate) => {
        option: unknown;
        metrics: Record<keyof NativeChartInteraction['metrics'], string>;
      }
    >;
  }
}
export type NativeChartInspection = {
  model?: import('../domain/chart-authoring.js').ChartAuthoring;
  title?: string;
  labels?: string[];
  target: string;
  available: boolean;
  error?: string;
  value?: LearningRate;
  component?: NativeChartInteraction;
  series: Array<{
    name: string;
    type: string;
    data: unknown[];
    color: string;
    width: number;
    showSymbol: boolean;
  }>;
};
export function nativeChartController(
  charts: Record<string, NativeChart>,
  report: (target: string, error: string) => void,
  selectedChart?: () => string | undefined,
  selectPart?: (target: string, selection: ChartSelection) => void,
  notify?: (type: string, data: unknown) => void,
) {
  const host = (id: string) =>
    document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`);
  const instance = (el: HTMLElement | null) =>
    el
      ? (window.__NOTALE_CHART_ENGINE__?.getInstanceByDom(el) ??
        window.echarts?.getInstanceByDom(el))
      : undefined;
  let editing = false;
  const states = new Map<string, string[]>();
  const durations = new Map<string, number>();
  const applyUpdates = new Map<string, () => void>();
  const baselines = new Map<string, any>();
  const copy = (v: any): any =>
    Array.isArray(v)
      ? v.map(copy)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]))
        : v;
  const attached = new Map<string, { chart: Instance; dispose: () => void }>();
  const failures = new Map<string, string>();
  const owned = new Map<string, Instance>();
  const values = new Map<string, LearningRate>();
  const selectors = new Map<string, (value: LearningRate) => void>();
  const requestedValues = new Map<string, LearningRate>();
  function fail(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (failures.get(id) !== message) report(id, message);
    failures.set(id, message);
  }
  function overlay(id: string) {
    const el = host(id),
      base = charts[id]?.authoring,model=base?chartAtState(base,states.get(id)??[]):undefined;
    if (!el) return;
    const previous = el.querySelector<HTMLElement>('[data-notale-chart-ui]');
    if (previous?.contains(document.activeElement)) return;
    previous?.remove();
    if (!editing || !model) return;
    const layer = document.createElement('div');
    layer.dataset.notaleChartUi = '';
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '20',
    });
    el.append(layer);
    const text = (
      key: string,
      content: string,
      x: string,
      y: string,
      width: string,
      size: number,
      color: string,
    ) => {
      const node = document.createElement('div');
      node.dataset.chartText = key;
      node.textContent = content;
      node.tabIndex = -1;
      Object.assign(node.style, {
        position: 'absolute',
        left: x,
        top: y,
        width,
        fontSize: size + 'px',
        color,
        fontFamily: model.appearance.fontFamily ?? 'system-ui,sans-serif',
        lineHeight: '1.3',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        pointerEvents: 'auto',
        cursor: 'text',
        minHeight: '1.3em',
        outline: 'none',
      });
      if (key === 'title') {
        node.style.textAlign = 'center';
        node.style.fontWeight = 'bold';
      }
      node.onclick = (e) => {
        e.stopPropagation();
        selectPart?.(
          id,
          key === 'title' ? { kind: 'title' } : { kind: 'annotation', annotationId: key },
        );
      };
      node.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        node.contentEditable = 'true';
        node.style.background = 'var(--chart-edit-background,#ffffff)';
        node.style.outline = '1px solid #7c5ce7';
        node.focus();
      };
      node.onblur = () => {
        if (node.contentEditable !== 'true') return;
        node.contentEditable = 'false';
        node.style.background = '';
        node.style.outline = 'none';
        if (key === 'title') notify?.('chart-title', { target: id, text: node.textContent ?? '' });
        else
          notify?.('chart-annotation', {
            target: id,
            id: key,
            patch: { text: node.textContent ?? '' },
          });
      };
      node.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          node.textContent = content;
          node.blur();
        }
      };
      if (key !== 'title')
        node.onpointerdown = (e) => {
          if (node.isContentEditable) return;
          const start = { x: e.clientX, y: e.clientY, left: node.offsetLeft, top: node.offsetTop };
          node.setPointerCapture(e.pointerId);
          node.onpointermove = (event) => {
            const scale = el.getBoundingClientRect().width / el.clientWidth;
            node.style.left = start.left + (event.clientX - start.x) / scale + 'px';
            node.style.top = start.top + (event.clientY - start.y) / scale + 'px';
          };
          node.onpointerup = (event) => {
            node.onpointermove = null;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3)
              notify?.('chart-annotation', {
                target: id,
                id: key,
                patch: {
                  x: (node.offsetLeft / el.clientWidth) * 100,
                  y: (node.offsetTop / el.clientHeight) * 100,
                },
              });
          };
        };
      layer.append(node);
      if (key !== 'title') {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.setAttribute('aria-label', '调整标注宽度');
        handle.textContent = '';
        Object.assign(handle.style, {
          position: 'absolute',
          left: `calc(${x} + ${width} - 5px)`,
          top: y,
          width: '9px',
          height: '9px',
          background: '#fff',
          border: '1.5px solid #7c5ce7',
          cursor: 'ew-resize',
          pointerEvents: 'auto',
        });
        layer.append(handle);
        handle.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const start = e.clientX,
            w = node.offsetWidth;
          handle.setPointerCapture(e.pointerId);
          handle.onpointermove = (event) => {
            const scale = el.getBoundingClientRect().width / el.clientWidth;
            const next = Math.max(40, Math.min(1000, w + (event.clientX - start) / scale));
            node.style.width = next + 'px';
            handle.style.left = node.offsetLeft + next - 5 + 'px';
          };
          handle.onpointerup = () => {
            handle.onpointermove = null;
            notify?.('chart-annotation', {
              target: id,
              id: key,
              patch: { width: node.offsetWidth },
            });
          };
        };
      }
    };
    if (!charts[id]?.source && model.appearance.title)
      text(
        'title',
        model.appearance.title,
        '15%',
        '12px',
        '70%',
        (model.appearance.fontSize ?? 16) + 6,
        model.appearance.textColor ?? '#374151',
      );
    for (const a of model.annotations)
      if (!a.hidden && a.kind === 'text')
        text(a.id, a.text, a.x + '%', a.y + '%', a.width + 'px', a.fontSize, a.color);
  }
  function refresh() {
    for (const [id, chart] of owned)
      if ((!charts[id]?.source && !charts[id]?.authoring) || !host(id)) {
        chart.dispose();
        owned.delete(id);
      }
    for (const [id, settings] of Object.entries(charts)) {
      const el = host(id);
      if (
        (settings.source || settings.authoring) &&
        el &&
        (!instance(el) || instance(el)!.isDisposed())
      ) {
        try {
          const factory = window.__NOTALE_CHART_FACTORIES__?.[id];
          const engine = settings.source ? window.echarts : window.__NOTALE_CHART_ENGINE__;
          if ((!factory && !settings.authoring) || !engine)
            throw new Error('Independent chart source is unavailable');
          const created = engine.init(el, null, { renderer: settings.source ? 'svg' : 'canvas' });
          owned.set(id, created);
          created.setOption(factory ? factory() : compileChart(settings.authoring!));
        } catch (error) {
          owned.get(id)?.dispose();
          owned.delete(id);
          fail(id, error);
          continue;
        }
      }
      const chart = instance(el),
        previous = attached.get(id);
      if (previous?.chart === chart && chart && !chart.isDisposed()) continue;
      previous?.dispose();
      attached.delete(id);
      if (!el || !chart || chart.isDisposed()) continue;
      const original = chart.setOption;
      if (!baselines.has(id)) baselines.set(id, copy(chart.getOption()));
      let applying = false;
      const apply = () => {
        if (applying || chart.isDisposed()) return;
        applying = true;
        try {
          // ECharts performs its own component/data merge. Never serialize native callbacks.
          const settings = charts[id];
          if (!settings) return;
          if (settings.authoring) {
            const model = chartAtState(settings.authoring, states.get(id) ?? []),
              option = compileChart(model, [], !!durations.get(id));
            option.animationDurationUpdate = durations.get(id) ?? 0;
            if (model.origin === 'native') {
              const baseline = baselines.get(id);
              original.call(chart, copy(baseline), { notMerge: true, silent: true });
              option.series = option.series.map((s: any, i: number) => {
                const { data, type, id, ...style } = s;
                return {
                  ...style,
                  ...(baseline?.series?.[i]?.id ? { id: baseline.series[i].id } : {}),
                };
              });
              if (option.xAxis) delete option.xAxis.data;
              original.call(chart, option, { notMerge: false, silent: true });
            } else {
              for (const key of ['xAxis', 'yAxis', 'radar', 'visualMap']) option[key] ??= [];
              original.call(chart, option, {
                notMerge: false,
                replaceMerge: ['series', 'xAxis', 'yAxis', 'radar', 'visualMap', 'graphic'],
                silent: true,
              });
            }
          } else {
            original.call(chart, copy(baselines.get(id)), { notMerge: true, silent: true });
            original.call(chart, structuredClone(settings.option), {
              notMerge: false,
              silent: true,
            });
          }
          if (editing && settings.authoring && !settings.source)
            original.call(
              chart,
              {
                animation: false,
                tooltip: { show: false },
                legend: { selectedMode: false },
                series: (chart.getOption().series ?? []).map((s: any) => ({
                  id: s.id,
                  roam: false,
                  draggable: false,
                  expandAndCollapse: false,
                })),
              },
              { silent: true },
            );
          if (editing && settings.authoring) {
            original.call(
              chart,
              {
                ...(!settings.source?{title: { textStyle: { color: 'transparent' } }}:{}),
                graphic: {
                  elements: settings.authoring.annotations
                    .filter((a) => a.kind === 'text')
                    .map((a) => ({ id: a.id, invisible: true })),
                },
              },
              { silent: true },
            );
          }
          overlay(id);
          failures.delete(id);
        } catch (error) {
          fail(id, error);
        } finally {
          applying = false;
        }
      };
      const wrapped: Instance['setOption'] = function (option, options, lazyUpdate) {
        original.call(chart, copy(baselines.get(id)), { notMerge: true, silent: true });
        original.call(chart, option, options, lazyUpdate);
        baselines.set(id, copy(chart.getOption()));
        apply();
      };
      chart.setOption = wrapped;
      applyUpdates.set(id, apply);
      const clicked = (event: any) => {
        if (!editing || selectedChart?.() !== id || !charts[id]?.authoring) return;
        const model = charts[id].authoring!,
          series = model.series.find(s=>s.id===event.data?.notaleSeriesId||s.id===event.seriesId||s.id===event.data?.id)??model.series[event.seriesIndex??0];
        let selection: ChartSelection = { kind: 'chart' };
        if (event.componentType === 'series')
          selection = {
            kind: 'series',
            seriesId: series?.id,
            rowId: event.data?.notaleRowId??(model.rows.some(r=>r.id===event.data?.id)?event.data.id:undefined),
          };
        else if (['title', 'legend', 'xAxis', 'yAxis'].includes(event.componentType))
          selection = { kind: event.componentType };
        selectPart?.(id, selection);
      };
      chart.on?.('click', clicked);

      const observer = new ResizeObserver(() => {
        if (!chart.isDisposed() && el.clientWidth && el.clientHeight)
          chart.resize({ silent: true });
      });
      observer.observe(el);
      attached.set(id, {
        chart,
        dispose: () => {
          observer.disconnect();
          chart.off?.('click', clicked);
          applyUpdates.delete(id);
          if (chart.setOption === wrapped) chart.setOption = original;
        },
      });
      apply();
      if (settings.interaction) {
        const interaction = settings.interaction,
          dispose = attached.get(id)!.dispose,
          cleanups: Array<() => void> = [];
        attached.get(id)!.dispose = () => {
          dispose();
          cleanups.forEach((cleanup) => cleanup());
          values.delete(id);
          selectors.delete(id);
        };
        try {
          const build = window.__NOTALE_CHART_INTERACTIONS__?.[id]?.();
          if (!build) throw new Error('Component source is unavailable');
          const select = (value: LearningRate) => {
            const state = build(value);
            chart.setOption(state.option, { notMerge: true });
            for (const [key, target] of Object.entries(interaction.metrics)) {
              const node = host(target);
              if (!node) throw new Error('Component metric is unavailable');
              node.textContent = state.metrics[key as keyof typeof state.metrics];
            }
            for (const [key, target] of Object.entries(interaction.controls)) {
              const button = host(target);
              if (!button) throw new Error('Component control is unavailable');
              const active = key === value;
              button.classList.toggle('active', active);
              button.setAttribute('aria-selected', String(active));
              Object.assign(button.style, active ? interaction.active : interaction.inactive);
            }
            values.set(id, value);
          };
          for (const [value, target] of Object.entries(interaction.controls)) {
            const button = host(target);
            if (!button) throw new Error('Component control is unavailable');
            const click = () => {
              try {
                select(value as LearningRate);
              } catch (error) {
                fail(id, error);
              }
            };
            button.addEventListener('click', click);
            cleanups.push(() => button.removeEventListener('click', click));
          }
          selectors.set(id, select);
          select(requestedValues.get(id) ?? interaction.value);
        } catch (error) {
          fail(id, error);
        }
      }
    }
  }
  let frame: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    refresh();
    if (Object.values(charts).some((c) => !!c.source || !c.authoring))
      frame = setTimeout(tick, 250);
  };
  const stop = () => {
    clearTimeout(frame);
    for (const entry of attached.values()) entry.dispose();
    attached.clear();
    for (const chart of owned.values()) if (!chart.isDisposed()) chart.dispose();
    owned.clear();
  };
  const start = () => {
    stop();
    refresh();
    if (Object.keys(charts).length)
      if (Object.values(charts).some((c) => !!c.source || !c.authoring))
        frame = setTimeout(tick, 250);
  };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  function inspect(id: string): NativeChartInspection {
    refresh();
    const chart = instance(host(id));
    if (!chart || chart.isDisposed())
      return { target: id, available: false, series: [], error: '当前对象没有可用的 ECharts 实例' };
    try {
      const option = chart.getOption();
      return {
        target: id,
        model: charts[id]?.authoring,
        title: option.title?.[0]?.text ?? '',
        labels: (option.xAxis?.[0]?.data ?? []).map((x: any) => String(x?.value ?? x)),
        available: true,
        error: failures.get(id),
        value: values.get(id),
        series: (option.series ?? []).map((s: any) => ({
          name: String(s.name ?? ''),
          type: String(s.type ?? ''),
          // Inspector projection only. This is deliberately not a runtime reconstruction snapshot.
          data: JSON.parse(JSON.stringify(s.data ?? [])),
          color:
            typeof s.lineStyle?.color === 'string'
              ? s.lineStyle.color
              : typeof s.itemStyle?.color === 'string'
                ? s.itemStyle.color
                : '#466ddb',
          width: s.lineStyle?.width ?? 2,
          showSymbol: s.showSymbol !== false,
        })),
      };
    } catch (error) {
      fail(id, error);
      return { target: id, available: false, series: [], error: failures.get(id) };
    }
  }
  return {
    highlight(id: string, selection: ChartSelection) {
      const chart = instance(host(id)),
        model = charts[id]?.authoring;
      if (!chart || !model) return;
      chart.dispatchAction?.({ type: 'downplay' }, { silent: true });
      const rendered=chart.getOption().series??[];
      const seriesIndex = rendered.findIndex((s:any)=>s.id===selection.seriesId||s.data?.some((d:any)=>d?.notaleSeriesId===selection.seriesId));
      if (seriesIndex >= 0)
        chart.dispatchAction?.(
          {
            type: 'highlight',
            seriesIndex,
            ...(selection.kind === 'point'
              ? {
                  dataIndex: rendered[seriesIndex].data?.findIndex((d:any)=>d?.notaleRowId===selection.rowId||d?.id===selection.rowId),
                }
              : {}),
          },
          { silent: true },
        );
    },
    update(next: Record<string, NativeChart>) {
      for (const key of Object.keys(charts)) if (!next[key]) delete charts[key];
      Object.assign(charts, next);
      refresh();
      for (const apply of applyUpdates.values()) apply();
    },
    editing(value: boolean) {
      editing = value;
      for (const apply of applyUpdates.values()) apply();
    },
    state(id: string, ids: string[], duration = 0) {
      states.set(id, ids);
      durations.set(id, duration);
      applyUpdates.get(id)?.();
    },
    resetStates() {
      states.clear();durations.clear();
      for (const apply of applyUpdates.values()) apply();
    },
    exportImage(id: string, format = 'png') {
      const model = charts[id]?.authoring,
        engine = window.__NOTALE_CHART_ENGINE__ ?? window.echarts,
        original = host(id);
      if (!model || !engine || !original) return;
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed',
        left: '-20000px',
        width: original.clientWidth + 'px',
        height: original.clientHeight + 'px',
      });
      document.body.append(el);
      const chart = engine.init(el, null, { renderer: format==='svg'?'svg':'canvas' });
      try {
        const option=compileChart(model,states.get(id)??[]);
        if(model.origin==='native'&&baselines.has(id)){
          const baseline=copy(baselines.get(id));chart.setOption({...baseline,animation:false});
          option.series=option.series.map((s:any,i:number)=>{const {data,type,id,...style}=s;return {...style,...(baseline?.series?.[i]?.id?{id:baseline.series[i].id}:{})};});if(option.xAxis)delete option.xAxis.data;
        }
        chart.setOption(option);
        return chart.getDataURL?.({ type: format==='svg'?'svg':'png',pixelRatio:2,backgroundColor:model.appearance.background??'#ffffff' });
      } finally {
        chart.dispose();
        el.remove();
      }
    },
    start,
    stop,
    inspect,
    select: (id: string, value: LearningRate) => {
      requestedValues.set(id, value);
      selectors.get(id)?.(value);
    },
    isChart: (el: HTMLElement) => !!instance(el),
  };
}
