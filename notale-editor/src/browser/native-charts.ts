import { compileChart, chartAtState, type ChartSelection } from '../domain/chart-authoring.js';
import type { NativeChart, LearningRate, NativeChartInteraction } from '../domain/native-charts.js';

type Instance = {
  on?: (event:string,handler:(event:any)=>void)=>void;
  off?: (event:string,handler:(event:any)=>void)=>void;
  convertToPixel?: (finder:unknown,value:unknown)=>any;
  getDataURL?: (options?:unknown)=>string;
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
  selectedChart?:()=>string|undefined,
  selectPart?:(target:string,selection:ChartSelection)=>void,
) {
  const host = (id: string) =>
    document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`);
  const instance = (el: HTMLElement | null) =>
    el ? window.__NOTALE_CHART_ENGINE__?.getInstanceByDom(el) ?? window.echarts?.getInstanceByDom(el) : undefined;
  let editing=false;
  const states=new Map<string,string[]>();
  const applyUpdates=new Map<string,()=>void>();
  const baselines=new Map<string,any>();
  const copy=(v:any):any=>Array.isArray(v)?v.map(copy):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;
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
  function refresh() {
    for (const [id, chart] of owned)
      if ((!charts[id]?.source&&!charts[id]?.authoring) || !host(id)) {
        chart.dispose();
        owned.delete(id);
      }
    for (const [id, settings] of Object.entries(charts)) {
      const el = host(id);
      if ((settings.source||settings.authoring) && el && (!instance(el) || instance(el)!.isDisposed())) {
        try {
          const factory = window.__NOTALE_CHART_FACTORIES__?.[id];
          const engine=settings.source?window.echarts:window.__NOTALE_CHART_ENGINE__;
          if ((!factory&&!settings.authoring) || !engine)
            throw new Error('Independent chart source is unavailable');
          const created = engine.init(el, null, { renderer: settings.source?'svg':'canvas' });
          owned.set(id, created);
          created.setOption(factory?factory():compileChart(settings.authoring!));
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
      if(!baselines.has(id))baselines.set(id,copy(chart.getOption()));
      let applying = false;
      const apply = () => {
        if (applying || chart.isDisposed()) return;
        applying = true;
        try {
          // ECharts performs its own component/data merge. Never serialize native callbacks.
          const settings=charts[id];if(!settings)return;
          if(settings.authoring){
            const model=chartAtState(settings.authoring,states.get(id)??[]),option=compileChart(model);
            if(settings.source&&model.origin==='native'){
              const baseline=baselines.get(id);original.call(chart,copy(baseline),{notMerge:true,silent:true});
              option.series=option.series.map((s:any,i:number)=>{const {data,type,id,...style}=s;return {...style,...(baseline?.series?.[i]?.id?{id:baseline.series[i].id}:{})};});
              if(option.xAxis)delete option.xAxis.data;
              original.call(chart,option,{notMerge:false,silent:true});
            }else original.call(chart,option,{notMerge:true,silent:true});
          }else {original.call(chart,copy(baselines.get(id)),{notMerge:true,silent:true});original.call(chart, structuredClone(settings.option), { notMerge: false, silent: true });}
          if(editing&&settings.authoring&&!settings.source)original.call(chart,{animation:false,tooltip:{show:false},legend:{selectedMode:false},series:(chart.getOption().series??[]).map((s:any)=>({id:s.id,roam:false,draggable:false,expandAndCollapse:false}))},{silent:true});
          failures.delete(id);
        } catch (error) {
          fail(id, error);
        } finally {
          applying = false;
        }
      };
      const wrapped: Instance['setOption'] = function (option, options, lazyUpdate) {
        original.call(chart,copy(baselines.get(id)),{notMerge:true,silent:true});
        original.call(chart, option, options, lazyUpdate);
        baselines.set(id,copy(chart.getOption()));
        apply();
      };
      chart.setOption = wrapped;
      applyUpdates.set(id,apply);
      const clicked=(event:any)=>{if(!editing||selectedChart?.()!==id||!charts[id]?.authoring)return;
        const model=charts[id].authoring!,series=model.series[event.seriesIndex??0];
        let selection:ChartSelection={kind:'chart'};
        if(event.componentType==='series')selection={kind:'series',seriesId:series?.id,rowId:event.data?.id??model.rows[event.dataIndex]?.id};
        else if(['title','legend','xAxis','yAxis'].includes(event.componentType))selection={kind:event.componentType};
        selectPart?.(id,selection);
      };
      chart.on?.('click',clicked);

      const observer = new ResizeObserver(() => {
        if (!chart.isDisposed() && el.clientWidth && el.clientHeight)
          chart.resize({ silent: true });
      });
      observer.observe(el);
      attached.set(id, {
        chart,
        dispose: () => {
          observer.disconnect();
          chart.off?.('click',clicked);
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
    if(Object.values(charts).some(c=>!!c.source||!c.authoring))frame = setTimeout(tick,250);
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
    if (Object.keys(charts).length) if(Object.values(charts).some(c=>!!c.source||!c.authoring))frame = setTimeout(tick,250);
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
        model:charts[id]?.authoring,
        title:option.title?.[0]?.text??'',
        labels:(option.xAxis?.[0]?.data??[]).map((x:any)=>String(x?.value??x)),
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
    update(next:Record<string,NativeChart>){for(const key of Object.keys(charts))if(!next[key])delete charts[key];Object.assign(charts,next);refresh();for(const apply of applyUpdates.values())apply();},
    editing(value:boolean){editing=value;for(const apply of applyUpdates.values())apply();},
    state(id:string,ids:string[]){states.set(id,ids);applyUpdates.get(id)?.();},
    resetStates(){states.clear();for(const apply of applyUpdates.values())apply();},
    exportImage(id:string){return instance(host(id))?.getDataURL?.({type:'png',pixelRatio:2,backgroundColor:'#ffffff'});},
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
