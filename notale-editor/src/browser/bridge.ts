import { chartAuthoringSchema } from '../domain/chart-authoring.js';
import {stageBounds} from './stage-bounds.js';
import {paintVector} from './vector-dom.js';
import type {createVectorEditor} from './vector-editor.js';
import type {createTextEditor,TextContext} from './text-editor.js';
import { canvasInstanceController } from './canvas-instances.js';
import type { SourceScene } from '../domain/source-scenes.js';
import type { SceneScalar } from '../domain/scene-schema.js';
import type { SceneCheckpoint } from '../domain/scene-checkpoints.js';
import { nativeChartController } from './native-charts.js';
import { componentController } from './components.js';
import type { NativeChartInteraction, NativeChartState } from '../domain/native-charts.js';
import { connectorController } from './connectors.js';
import { svgReferenceValue } from '../domain/svg-references.js';
import { rulerOverlay, type Guide } from './rulers.js';
import { editShortcut } from './shortcuts.js';
import { selectIds } from '../domain/selection.js';
import { snapTranslation, type SnapRect, type SnapLine } from '../domain/snapping.js';
import { guideOverlay } from './guides.js';
import { moveableGestures } from './moveable-gestures.js';
import { mediaController } from './media.js';
import { timeline, frames, isEntrance, maxStep } from '../domain/timeline.js';
import type { Slide } from '../domain/model.js';
import { animationSchema, type AnimationSpec } from '../domain/model.js';
import { localPoint, linearMatrix, geometryBasis } from './coordinates.js';

declare global {
  interface Window {
    __NOTALE_SCENES__?: Record<string, () => Record<string, SceneScalar>>;
    __NOTALE_CHECKPOINTS__?: Record<
      string,
      { capture: () => SceneCheckpoint; restore: (checkpoint: SceneCheckpoint) => void }
    >;
    NotaleTextEditor?: {createTextEditor:typeof createTextEditor;canEditText:(el:HTMLElement)=>boolean};
    NotaleVectorEditor?:{createVectorEditor:typeof createVectorEditor};
    __NOTALE__: {
      textEditorUrl?:string;
      vectorEditorUrl?:string;
      vectorWasmUrl?:string;
      scenes?: SourceScene[];
      chartComponents?: Record<string, NativeChartInteraction>;
      slide: Slide;
      navigation?: { id: string; path: string }[];
      channel: string;
      width: number;
      height: number;
    };
    Deck?: {
      step: number;
      stepMax: number;
      stepTo: (i: number) => number;
      _scanSteps?: () => number;
      pt?: (el: HTMLElement, event: any) => { x: number; y: number };
    };
    NotaleBridge: {
      seek: (step: number, animate?: boolean) => void;
      mode: (mode: string) => void;
      measure: () => unknown;
      state: () => unknown;
      capture: (ids: string[]) => unknown;
    };
  }
}
const runtimeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let runtimeReady = false;
const config = window.__NOTALE__,
  slide = config.slide;
let step = 0,
  mode = 'play',
  selected = new Set<string>();
let cues = timeline(slide);
const active: Animation[] = [];
const chartTimers=new Set<ReturnType<typeof setTimeout>>();
const chartStateIds=new Map<string,string[]>();
const triggered = new Set<string>();
const get = (id: string) =>
  document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`);
const send = (type: string, data: unknown) =>
  parent.postMessage({ source: 'notale-slide', channel: config.channel, type, data }, '*');
window.addEventListener('wheel', event => {
  if(mode !== 'edit')return;if(!event.ctrlKey&&!event.metaKey){event.preventDefault();const scale=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;send('camera-pan',{x:event.deltaX*scale,y:event.deltaY*scale});return;}
  event.preventDefault();send('camera-wheel',{x:event.clientX,y:event.clientY,delta:event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1)});
},{passive:false});
window.addEventListener('keyup',event=>{if(event.code==='Space'&&mode==='edit')send('camera-hand',{active:false});});
const media = mediaController(send);
const canvasInstances = canvasInstanceController(slide);
const nativeCharts = nativeChartController(slide.nativeCharts ?? {}, (target, error) =>
  send('native-chart-error', { target, error }),
  ()=>mode==='edit'&&selected.size===1?[...selected][0]:undefined,
  (target,selection)=>send('chart-selected',{target,selection}),
  (type,data)=>send(type,data),
);
const connectors = connectorController(slide.connectors ?? [], {
  selected: () => (mode === 'edit' && selected.size === 1 ? [...selected][0] : undefined),
  locked,
  start: () => {
    handles.cancel();
    rulers.cancel();
    cancelDrag();
    endMarquee(true);
    suppressClick = true;
    pendingSelectionClick = undefined;
  },
  commit: (connector) => send('connector-edit', { slideId: slide.id, connector }),
});
const isConnector = (id: string) => (slide.connectors ?? []).some((c) => c.id === id);
const drawGuides = guideOverlay(config.width, config.height);
let geometrySequence = 0;
let vectorEditor:ReturnType<typeof createVectorEditor>|undefined,vectorLoading:Promise<void>|undefined,vectorActive=false;
async function vectors(){
 if(vectorEditor)return vectorEditor;if(!config.vectorEditorUrl)throw Error('矢量编辑运行时不可用');
 if(!window.NotaleVectorEditor){vectorLoading??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=config.vectorEditorUrl!;script.onload=()=>resolve();script.onerror=()=>{vectorLoading=undefined;reject(Error('矢量工具加载失败，请重试'));};document.head.append(script);});await vectorLoading;}
 if(vectorEditor)return vectorEditor;
 return vectorEditor=window.NotaleVectorEditor!.createVectorEditor({slide,runtimeId,wasmUrl:config.vectorWasmUrl!,enabled:()=>mode==='edit',selection:()=>[...selected],select:ids=>setSelection(ids,true),locked,send,active:value=>{vectorActive=value;handles.cancel();refreshGuides();},refresh:refreshGuides});
}
function commitGeometry(before: {id:string;style:string|null}[], after: {id:string;style:string|null}[]) {
  const commands: unknown[] = [];
  for (const state of after) {
    const el=get(state.id)!;
    const matrix=new DOMMatrix(getComputedStyle(el).transform);
    const previous=document.createElement('div');previous.setAttribute('style',before.find(s=>s.id===state.id)?.style??'');
    const style:Record<string,string>={};
    for(const key of Array.from(el.style)) if(!['transform','translate','rotate','scale'].includes(key)&&el.style.getPropertyValue(key)!==previous.style.getPropertyValue(key)) style[key]=el.style.getPropertyValue(key);
    for(const key of Array.from(previous.style)) if(!['transform','translate','rotate','scale'].includes(key)&&!el.style.getPropertyValue(key))style[key]='';
    if(Object.keys(style).length)commands.push({type:'element.patch',slideId:slide.id,target:state.id,patch:{style}});
    commands.push({type:'element.transform',slideId:slide.id,target:state.id,transform:{x:0,y:0,rotate:0,scaleX:1,scaleY:1,matrix:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]}});
  }
  send('geometry-commit',{id:crypto.randomUUID(),runtimeId,sequence:++geometrySequence,slideId:slide.id,commands,before,after});
}
function gestureRectangles() {
  const stage=stageBounds(config.width,config.height), scale=stage.width/config.width;
  return [...selected].filter(id=>!isConnector(id)).map(id=>{
    const el=get(id)!;const box=el.getBoundingClientRect();
    return {id,x:(box.x-stage.x)/scale,y:(box.y-stage.y)/scale,width:box.width/scale,height:box.height/scale,geometry:geometryBasis(el,scale)};
  });
}
const handles = moveableGestures({
  width:config.width,height:config.height,capture:gestureRectangles,get,locked,
  neighbors:()=>neighborsFor([...selected]),
  snapping:()=>({enabled:snapping.enabled,grid:snapping.grid,guides:slide.guides??[]}),
  guides:lines=>{snapLines=lines;paintGuides();},
  start:()=>{rulers.cancel();cancelDrag();endMarquee(true);suppressClick=true;pendingSelectionClick=undefined;},
  commit:commitGeometry,
  active:active=>send('gesture-active',{active,runtimeId,slideId:slide.id}),
});
let guidePreview: Guide[] | undefined;
const rulers = rulerOverlay({
  width: config.width,
  height: config.height,
  guides: () => slide.guides,
  start: () => {
    handles.cancel();
    cancelDrag();
    endMarquee(true);
    pendingSelectionClick = undefined;
    suppressClick = true;
  },
  preview: (guides) => {
    guidePreview = guides;
    paintGuides();
  },
  commit: (edit) => send('guide-edit', edit),
});
let snapping = { enabled: true, visible: true, grid: 0, rulers: false };
let snapLines: SnapLine[] = [];
let marqueeBox: SnapRect | undefined;
function refreshGuides() {
  handles.refresh(mode === 'edit' && !marqueeBox && !vectorActive);
  rulers.refresh(mode === 'edit' && snapping.rulers, snapping.visible);
  paintGuides();
}
function paintGuides() {
  drawGuides(
    mode === 'edit' && (snapping.visible || !!marqueeBox),
    snapping.visible ? (guidePreview ?? slide.guides ?? []) : [],
    snapping.visible ? snapLines : [],
    snapping.visible ? snapping.grid : 0,
    marqueeBox,
  );
}
window.addEventListener('resize', () => {
  cancelDrag();
  endMarquee(true);
  pendingSelectionClick = undefined;
  requestAnimationFrame(refreshGuides);
});
let mediaEnabled = true;
let componentOverlayFrame = 0,
  componentOverlayUntil = 0;
function refreshComponentGeometry(id: string) {
  componentOverlayUntil = Math.max(
    componentOverlayUntil,
    performance.now() +
      (slide.components?.find((component) => component.id === id)?.duration ?? 0) +
      50,
  );
  if (componentOverlayFrame) return;
  const tick = () => {
    connectors.refresh();
    refreshGuides();
    if (performance.now() < componentOverlayUntil)
      componentOverlayFrame = requestAnimationFrame(tick);
    else {
      componentOverlayFrame = 0;
      send('measure', measure());
    }
  };
  componentOverlayFrame = requestAnimationFrame(tick);
}
const components = componentController(
  slide.components ?? [],
  (target, value) => nativeCharts.select(target, value),
  (id, state) => {
    send('component-state', { id, state });
    refreshComponentGeometry(id);
  },
  (target) => nativeCharts.inspect(target).value ?? slide.nativeCharts[target]?.interaction?.value,
);
function total() {
  return Math.max(
    media.maxStep,
    maxStep(slide),
    slide.stepMap?.length ? 0 : (window.Deck?.stepMax ?? 0),
  );
}
function measure() {
  const stage = document.getElementById('stage'),
    r = stage?.getBoundingClientRect(),
    scale = r ? r.width / config.width : 1;
  return [...document.querySelectorAll<HTMLElement>('[data-notale-id]')].map((el) => {
    const b =
      (el.hasAttribute('data-notale-connector')
        ? el.querySelector('[data-connector-line]')
        : el
      )?.getBoundingClientRect() ?? el.getBoundingClientRect();
    return {
      id: el.dataset.notaleId,
      tag: el.tagName.toLowerCase(),
      nativeChart: nativeCharts.isChart(el),
      x: (b.x - (r?.x ?? 0)) / scale,
      y: (b.y - (r?.y ?? 0)) / scale,
      width: b.width / scale,
      height: b.height / scale,
      text: el.textContent?.slice(0, 200),
      value: 'value' in el ? (el as HTMLInputElement).value : undefined,
    };
  });
}
let componentScope: string | undefined;
function componentHit(node: HTMLElement | null, deep = false): HTMLElement | null {
  if (!node || deep) return node;
  const scope = componentScope ? get(componentScope) : undefined;
  if (scope && !scope.contains(node)) componentScope = undefined;
  const candidates = [...(slide.components ?? [])
    .map((component) => get(component.root))
    ,...document.querySelectorAll<HTMLElement>('svg[data-notale-id],g[data-notale-id],[data-notale-tex][data-notale-id]')].filter(n=>!n?.closest('defs,[data-notale-handles]')).filter(
      (root): root is HTMLElement =>
        !!root &&
        root.contains(node) &&
        root.dataset.notaleId !== componentScope &&
        (!componentScope || !!get(componentScope)?.contains(root)),
    );
  return (
    candidates.find(
      (root) => !candidates.some((parent) => parent !== root && parent.contains(root)),
    ) ?? node
  );
}
function selectionObjects() {
  return [...document.querySelectorAll<HTMLElement>('[data-notale-id]')]
    .filter((el) => el.id !== 'stage')
    .map((el) => ({
      id: el.dataset.notaleId!,
      parent: el.parentElement?.closest<HTMLElement>('[data-notale-id]')?.dataset.notaleId,
    }));
}
function setSelection(ids: string[], notify = false) {
  const next = selectIds([], ids, selectionObjects(), componentScope?[]:slide.groups);
  connectors.cancel();
  if (next.length !== selected.size || next.some((id) => !selected.has(id))) {
    handles.cancel();
    rulers.cancel();
    if (drag) cancelDrag();
    pendingSelectionClick = undefined;
  }
  for (const id of selected) get(id)?.removeAttribute('data-notale-selected');
  selected = new Set(next);
  for (const id of selected) get(id)?.setAttribute('data-notale-selected', '');
  refreshGuides();
  if (notify) send('select', { ids: [...selected], id: [...selected][0], objects: measure(),scope:componentScope });
  if([...selected].some(id=>get(id)?.namespaceURI==='http://www.w3.org/2000/svg'))void vectors().then(v=>v.refresh()).catch(e=>send('edit-error',{message:String(e)}));
  else send('vector-state',{active:false,slideId:slide.id,runtimeId});
}
function choose(id: string, toggle = false) {
  setSelection(
    selectIds([...selected], [id], selectionObjects(), componentScope?[]:slide.groups, toggle ? 'toggle' : 'replace'),
    true,
  );
}
function locked(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement)
    if (slide.locked.includes(node.getAttribute('data-notale-id') ?? '')) return true;
  // A selected container cannot carry a locked descendant along with it.
  return [...el.querySelectorAll('[data-notale-id]')].some((n) =>
    slide.locked.includes(n.getAttribute('data-notale-id')!),
  );
}
function capture(ids: string[], clipboard = false) {
  return clipboard
    ? components.withBaseline(ids, () => captureAuthor(ids, true))
    : captureAuthor(ids, false);
}
function captureAuthor(ids: string[], clipboard: boolean) {
  connectors.refresh();
  const nodes = new Set<Element>();
  for (const id of ids) {
    const el = get(id);
    if (el) {
      nodes.add(el);
      for (const child of el.querySelectorAll('[data-notale-id]')) nodes.add(child);
    }
  }
  const dependencies = new Set<Element>();
  const queue = [...nodes];
  for (let i = 0; i < queue.length; i++) {
    const el = queue[i];
    const values = [...el.attributes].map((a) => ({ name: a.name, value: a.value }));
    const css = getComputedStyle(el);
    for (const name of [
      'fill',
      'stroke',
      'clip-path',
      'mask',
      'filter',
      'marker-start',
      'marker-mid',
      'marker-end',
    ]) {
      let value = css.getPropertyValue(name);
      value = value.replaceAll(location.href.split('#')[0] + '#', '#');
      values.push({ name, value });
    }
    for (const a of values)
      svgReferenceValue(el.localName, a.name, a.value, (id) => {
        const definition = document.getElementById(id);
        if (definition)
          for (const node of [definition, ...definition.querySelectorAll('[data-notale-id]')])
            if (!nodes.has(node) && !dependencies.has(node)) {
              dependencies.add(node);
              queue.push(node);
            }
        return id;
      });
  }
  const properties = [
    'z-index',
    'display',
    'position',
    'left',
    'right',
    'top',
    'bottom',
    'width',
    'height',
    'box-sizing',
    'padding',
    'margin',
    'border',
    'border-radius',
    'background',
    'background-color',
    'border-color',
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'writing-mode',
    'text-align',
    'text-decoration',
    'white-space',
    'vertical-align',
    'opacity',
    'overflow',
    'transform',
    'transform-origin',
    'translate',
    'rotate',
    'scale',
    'flex',
    'flex-direction',
    'align-items',
    'justify-content',
    'gap',
    'grid-template-columns',
    'grid-template-rows',
    'object-fit',
    'object-position',
    'fill',
    'stroke',
    'stroke-width',
    'fill-opacity',
    'fill-rule',
    'stroke-opacity',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'clip-path',
    'clip-rule',
    'mask',
    'marker-start',
    'marker-mid',
    'marker-end',
    'vector-effect',
    'text-anchor',
    'dominant-baseline',
    'filter',
    'box-shadow',
  ];
  const styles: Record<string, Record<string, string>> = {};
  const depth = config.slide.sourcePath.split('/').length - 1,
    base = new URL('../'.repeat(depth) || '.', location.href).href;
  function localUrls(value: string) {
    return value.replace(/url\(["']?([^"')]+)["']?\)/g, (_m, url) => {
      try {
        const u = new URL(url, location.href);
        if (u.href.split('#')[0] === location.href.split('#')[0] && u.hash) return `url(${u.hash})`;
        if (u.href.startsWith(base))
          return `url("${'../'.repeat(depth)}${u.href.slice(base.length)}")`;
      } catch {}
      return `url("${url}")`;
    });
  }
  for (const el of nodes) {
    const css = getComputedStyle(el);
    styles[el.getAttribute('data-notale-id')!] = Object.fromEntries(
      properties
        .map((key) => [key, localUrls(css.getPropertyValue(key))])
        .filter(([, v]) => v !== ''),
    );
  }
  for (const el of dependencies)
    if (el.localName === 'stop' || el.localName === 'feFlood') {
      const css = getComputedStyle(el),
        id = el.getAttribute('data-notale-id');
      if (id)
        styles[id] = Object.fromEntries(
          (el.localName === 'stop'
            ? ['stop-color', 'stop-opacity']
            : ['flood-color', 'flood-opacity']
          ).map((key) => [key, css.getPropertyValue(key)]),
        );
    }
  const stage = document.getElementById('stage'),
    scale = (stage?.getBoundingClientRect().width ?? config.width) / config.width;
  const rectangles = measure()
    .filter((r) => ids.includes(r.id!) && !isConnector(r.id!))
    .map(({ id, x, y, width, height }) => {
      const el = get(id!)!,
        matrix = linearMatrix(el);
      return {
        id,
        x,
        y,
        width,
        height,
        geometry: geometryBasis(el, scale),
        ...(el instanceof SVGGraphicsElement && !(el instanceof SVGSVGElement) && el.ownerSVGElement
          ? {
              svgViewport: {
                width:
                  el.ownerSVGElement.viewBox.baseVal.width ||
                  el.ownerSVGElement.width.baseVal.value,
                height:
                  el.ownerSVGElement.viewBox.baseVal.height ||
                  el.ownerSVGElement.height.baseVal.value,
              },
            }
          : {}),
        ...(matrix && el.offsetWidth && el.offsetHeight
          ? {
              baseWidth: el.offsetWidth,
              baseHeight: el.offsetHeight,
              matrix: [matrix.a / scale, matrix.b / scale, matrix.c / scale, matrix.d / scale],
            }
          : {}),
      };
    });
  const nativeChartTargets = [...nodes]
    .filter((el) => el instanceof HTMLElement && nativeCharts.isChart(el))
    .map((el) => el.getAttribute('data-notale-id')!);
  const nativeChartStates: Record<string, NativeChartState> = {};
  for (const id of nativeChartTargets) {
    const interaction = config.chartComponents?.[id];
    if (!interaction || !nodes.has(get(interaction.root)!)) continue;
    // Reviewed metric slots size to their changing text. A measured pixel width
    // would freeze the current digit count and wrap later native selections.
    for (const metric of Object.values(interaction.metrics)) {
      const el = get(metric);
      if (el && styles[metric]) {
        styles[metric].width = el.style.width || 'auto';
        styles[metric].height = el.style.height || 'auto';
      }
    }
    const controls = Object.entries(interaction.controls).map(([value, id]) => ({
      value,
      el: get(id)!,
    }));
    const active = controls.find((control) => control.el?.classList.contains('active')),
      inactive = controls.find((control) => control !== active);
    if (!active || !inactive) continue;
    const style = (el: HTMLElement) => {
      const css = getComputedStyle(el);
      return {
        backgroundColor: css.backgroundColor,
        color: css.color,
        borderColor: css.borderColor,
        fontWeight: css.fontWeight,
      };
    };
    nativeChartStates[id] = {
      value: active.value as NativeChartState['value'],
      active: style(active.el),
      inactive: style(inactive.el),
    };
  }
  const componentCapture = clipboard
    ? components.capture(new Set([...nodes].map((node) => node.getAttribute('data-notale-id')!)))
    : { states: {}, styles: {}, nativeValues: {} };
  for (const [id, patch] of Object.entries(componentCapture.styles))
    if (styles[id]) Object.assign(styles[id], patch);
  for (const [id, value] of Object.entries(componentCapture.nativeValues))
    if (nativeChartStates[id]) nativeChartStates[id].value = value;
  const canvasSceneStates: Record<
    string,
    Record<string, import('../domain/scene-schema.js').SceneScalar>
  > = {};
  if (clipboard)
    for (const scene of config.scenes ?? []) {
      if (!scene.root || !nodes.has(get(scene.root)!)) continue;
      const read = window.__NOTALE_SCENES__?.[scene.id];
      if (read) canvasSceneStates[scene.root] = read();
      const computed = getComputedStyle(get(scene.root)!);
      for (const token of ['--muted', '--model', '--focus', '--text', '--rule']) {
        const value = computed.getPropertyValue(token).trim();
        if (value) (styles[scene.root] ??= {})[token] = value;
      }
    }
  return {
    ...(Object.keys(componentCapture.states).length
      ? { componentStates: componentCapture.states }
      : {}),
    rectangles,
    ...(Object.keys(canvasSceneStates).length ? { canvasSceneStates } : {}),
    computedStyles: styles,
    ...(nativeChartTargets.length ? { nativeChartTargets } : {}),
    ...(Object.keys(nativeChartStates).length ? { nativeChartStates } : {}),
  };
}
let authorPreview: Animation[] = [];
function stopAuthorPreview() {
  for (const animation of authorPreview) animation.cancel();
  authorPreview = [];
}
document.addEventListener('pointerdown',()=>{if(mode==='edit')stopAuthorPreview();},true);
function cancel() {
  for(const timer of chartTimers)clearTimeout(timer);chartTimers.clear();
  stopAuthorPreview();
  for (const animation of active) animation.cancel();
  active.length = 0;
}
function animateObject(
  el: HTMLElement,
  spec: AnimationSpec,
  delay: number,
  fill: FillMode = 'both',
) {
  if(spec.effect==='chart-state'){const apply=()=>{const ids=chartStateIds.get(spec.target)??[];if(spec.chartStateId)ids.push(spec.chartStateId);chartStateIds.set(spec.target,ids);nativeCharts.state(spec.target,ids,spec.duration);};if(delay){const timer=setTimeout(apply,delay);chartTimers.add(timer);}else apply();return [];}
  const source = frames(spec),
    hasTransform = source.some((f) => f.transform !== undefined),
    out: Animation[] = [];
  const timing: KeyframeAnimationOptions = {
    duration: Math.max(1, spec.duration),
    delay,
    fill,
    easing: spec.easing,
    iterations: (spec.repeat ?? 1) * (spec.autoReverse ? 2 : 1),
    direction: spec.autoReverse ? 'alternate' : 'normal',
  };
  if(spec.effect==='draw-stroke'){
    const targets=el instanceof SVGGeometryElement?[el]:[...el.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')].filter((n):n is SVGGeometryElement=>n instanceof SVGGeometryElement);
    return targets.flatMap(node=>{const length=node.getTotalLength();if(!length)return[];return[node.animate([{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],timing)];});
  }
  if (hasTransform)
    out.push(
      el.animate(
        source.map((f) => ({ transform: f.transform, offset: f.offset, easing: f.easing })),
        { ...timing, composite: 'add' },
      ),
    );
  const other = source.map(({ transform, ...rest }) => rest);
  if (
    !hasTransform ||
    other.some((f) => Object.keys(f).some((k) => !['offset', 'easing', 'composite'].includes(k)))
  )
    out.push(el.animate(other, timing));
  return out;
}
function seek(next: number, animate = false, componentStep = next) {
  step = Math.max(0, Math.min(total(), Math.trunc(next)));
  cancel();
  media.seek(step, animate, mode !== 'edit' && mediaEnabled);
  triggered.clear();
  chartStateIds.clear();nativeCharts.resetStates();
  const native = slide.stepMap?.length
    ? slide.stepMap[Math.min(step, slide.stepMap.length - 1)]
    : step;
  window.Deck?.stepTo(Math.min(native, window.Deck.stepMax));
  if (!window.Deck) {
    document.documentElement.style.setProperty('--step', String(native));
    for (const el of document.querySelectorAll<HTMLElement>('[data-step]')) {
      const hidden = Number(el.dataset.step) > native;
      el.style.visibility = hidden ? 'hidden' : '';
      el.inert = hidden;
    }
  }
  components.seek(Math.max(0, Math.min(total(), componentStep)), animate);
  if (mode === 'edit') {
    send('step', { step, max: total() });
    return;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ordered = [...cues].sort((a, b) => a.spec.step - b.spec.step || a.start - b.start);
  for (const cue of ordered) {
    const el = get(cue.spec.target);
    if (!el) continue;
    if(cue.spec.effect==='chart-state'){
      if(cue.spec.step<=step&&!cue.eventTarget){const apply=()=>{const ids=chartStateIds.get(cue.spec.target)??[];if(cue.spec.chartStateId)ids.push(cue.spec.chartStateId);chartStateIds.set(cue.spec.target,ids);nativeCharts.state(cue.spec.target,ids,animate&&cue.spec.step===step?cue.spec.duration:0);};if(animate&&cue.spec.step===step&&cue.start){const timer=setTimeout(apply,cue.start);chartTimers.add(timer);}else apply();}continue;
    }

    const earlier = ordered
      .slice(0, ordered.indexOf(cue))
      .some(
        (other) =>
          other.spec.target === cue.spec.target && other.spec.step <= step && !other.eventTarget,
      );
    const firstEntrance =
      ordered.find((other) => other.spec.target === cue.spec.target && isEntrance(other.spec)) ===
      cue;
    for (const a of animateObject(el, cue.spec, cue.start, earlier ? 'forwards' : 'both')) {
      a.pause();
      active.push(a);
      if (cue.spec.step > step || cue.eventTarget) {
        const hasApplied = ordered.some(
          (other) =>
            other !== cue &&
            other.spec.target === cue.spec.target &&
            other.spec.step <= step &&
            !other.eventTarget,
        );
        if (isEntrance(cue.spec) && firstEntrance && !hasApplied) a.currentTime = 0;
        else a.cancel();
      } else if (cue.spec.step < step || !animate || reduced) {
        a.currentTime = cue.end + 1;
      } else {
        a.currentTime = 0;
        a.play();
      }
    }
  }
  send('step', { step, max: total() });
}
function setMode(next: string) {
  if(next!=='edit'){endText();vectorEditor?.exit();}
  connectors.cancel();
  cancelDrag();
  endMarquee(true);
  mode = next === 'edit' ? 'edit' : 'play';
  nativeCharts.editing(mode==='edit');
  refreshGuides();
  document.documentElement.dataset.notaleMode = mode;
  seek(mode === 'edit' ? total() : 0, mode === 'play', 0);
}
const style = document.createElement('style');
style.textContent = `[data-notale-mode="edit"] [data-notale-id]{cursor:default!important}[data-notale-mode="edit"] [data-notale-selected]{outline:2px solid #466ddb!important;outline-offset:3px}html[data-notale-mode="edit"] [data-step]{opacity:1!important;visibility:visible!important;pointer-events:auto!important}`;
document.head.append(style);
style.textContent += `[data-notale-connector][data-notale-selected]{outline:none!important}html[data-notale-mode="edit"] [data-notale-connector][data-notale-selected] [data-connector-line]{filter:drop-shadow(0 0 3px #466ddb)}`;
style.textContent += `html[data-notale-mode="edit"] #stage{touch-action:none!important}html[data-notale-mode="edit"] [data-notale-id]{user-select:none!important}html[data-notale-mode="edit"] [contenteditable="true"],html[data-notale-mode="edit"] [contenteditable="true"] *{user-select:text!important}`;
document.addEventListener(
  'dragstart',
  (event) => {
    if (mode === 'edit' && !(event.target instanceof HTMLElement && event.target.isContentEditable))
      event.preventDefault();
  },
  true,
);

document.addEventListener(
  'click',
  (event) => {
    if (
      event
        .composedPath()
        .some((el) => el instanceof Element && el.hasAttribute('data-notale-handles'))
    )
      return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-notale-id]')
        : null;
    if (mode === 'edit') {
      if(target&&selected.has(target.dataset.notaleId!)&&slide.nativeCharts[target.dataset.notaleId!]?.authoring&&!suppressClick)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (suppressClick) {
        suppressClick = false;
        if (pendingSelectionClick) choose(pendingSelectionClick.id, pendingSelectionClick.toggle);
        pendingSelectionClick = undefined;
        return;
      }
      if (target && target.id !== 'stage')
        choose(
          componentHit(target, event.ctrlKey || event.metaKey)!.dataset.notaleId!,
          event.shiftKey,
        );
      else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) setSelection([], true);
      return;
    }
    if (
      mode === 'play' &&
      event.target instanceof Element &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const anchor = event.target.closest('a[href]');
      if (
        anchor &&
        !anchor.hasAttribute('download') &&
        (!anchor.getAttribute('target') || anchor.getAttribute('target') === '_self') &&
        !anchor.getAttribute('href')!.startsWith('#')
      ) {
        const root = new URL(
            '../'.repeat(config.slide.sourcePath.split('/').length - 1) || '.',
            location.href,
          ),
          destination = new URL(anchor.getAttribute('href')!, location.href);
        const page = config.navigation?.find(
          (s) => new URL(s.path, root).href === destination.href.split('#')[0].split('?')[0],
        );
        if (page) {
          event.preventDefault();
          event.stopImmediatePropagation();
          send('navigate', { slideId: page.id });
          return;
        }
      }
    }
    if (mode === 'play' && target)
      for (const cue of cues) {
        if (
          cue.spec.step === step &&
          cue.eventTarget &&
          get(cue.eventTarget)?.contains(target) &&
          !triggered.has(cue.spec.id)
        ) {
          triggered.add(cue.spec.id);
          const el = get(cue.spec.target);
          if (el) active.push(...animateObject(el, cue.spec, cue.start));
        }
      }
  },
  true,
);
let textEditor:ReturnType<typeof createTextEditor>|undefined;
let textLoader:Promise<void>|undefined;
let textGeneration=0;
function isTextRoot(el:HTMLElement){return el.namespaceURI==='http://www.w3.org/1999/xhtml'&&/^(P|H[1-6]|SPAN|A|LABEL|BUTTON|LI|BLOCKQUOTE|TD|TH|DIV|SECTION|ARTICLE)$/.test(el.tagName)&&![...el.querySelectorAll('*')].some(n=>!['span','b','strong','i','em','u','s','sub','sup','a','br','p','ul','ol','li'].includes(n.localName));}
function editableRoot(hit:HTMLElement|null){if(textEditor?.root.contains(hit))return textEditor.root;let node=hit;while(node&&/^(SPAN|A|B|STRONG|I|EM|U|S|SUB|SUP)$/.test(node.tagName)&&node.parentElement?.dataset.notaleId&&isTextRoot(node.parentElement))node=node.parentElement;return node;}
const textHeads=new Map<string,{sessionId:string;sequence:number}>();
function endText(){textGeneration++;if(!textEditor)return;textEditor.flush();const sessionId=textEditor.sessionId;textEditor.destroy();textEditor=undefined;send('text-session-end',{sessionId,slideId:slide.id,runtimeId});refreshGuides();}
async function startText(el:HTMLElement){
 if(mode!=='edit'||locked(el)||!isTextRoot(el)||!config.textEditorUrl)return;
 if(textEditor?.root===el){el.focus();return;}
 endText();const generation=++textGeneration;
 if(!window.NotaleTextEditor){textLoader??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=config.textEditorUrl!;script.onload=()=>resolve();script.onerror=()=>{textLoader=undefined;script.remove();reject(Error('文字编辑器未能加载，请重试'));};document.head.append(script);});await textLoader;}
 if(generation!==textGeneration||mode!=='edit'||!el.isConnected)return;
 setSelection([el.dataset.notaleId!],true);
 const protectedIds=new Set([...slide.animations.flatMap(a=>[a.target,a.triggerTarget].filter(Boolean) as string[]),...slide.bindings.map(b=>b.target),...(slide.groups??[]).flatMap(g=>g.members)]);
 textEditor=window.NotaleTextEditor!.createTextEditor(el,{protectedIds,change:data=>{textHeads.set(data.target,{sessionId:data.sessionId,sequence:data.sequence});send('text-draft',{...data,slideId:slide.id,runtimeId});},context:data=>send('text-context-state',{...data,slideId:slide.id,runtimeId}),history:action=>{textEditor?.flush();send('text-history',{action,slideId:slide.id,runtimeId});},end:endText,error:message=>send('text-error',{message})});
 send('text-session-start',{sessionId:textEditor.sessionId,target:el.dataset.notaleId,slideId:slide.id,runtimeId});
}
function contextAt(x:number,y:number){
 const text=textEditor?.freeze();
 const ids=text?[text.target]:[...selected];
 const info=ids.map(id=>{const el=get(id)!;const css=getComputedStyle(el);return {id,tag:el.localName,editableText:isTextRoot(el),locked:locked(el),styles:Object.fromEntries(['font-family','font-size','font-weight','font-style','text-decoration','color','text-align','fill','stroke','stroke-width'].map(k=>[k,css.getPropertyValue(k)]))};});
 send('object-context',{contextId:crypto.randomUUID(),slideId:slide.id,runtimeId,x,y,width:innerWidth,ids,info,text});
}
document.addEventListener(
  'dblclick',
  (event) => {
    if (mode !== 'edit') return;
    if((event.target as Element)?.closest('[data-notale-chart-ui]'))return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const el = hit?.closest<HTMLElement>('[data-notale-id]') ?? null;
    const component = componentHit(el);
    if (
      (component && component !== el) ||
      (component &&
        (slide.components ?? []).some((item) => item.root === component.dataset.notaleId) &&
        component.dataset.notaleId !== componentScope)
    ) {
      componentScope = component!.dataset.notaleId;
      setSelection(el ? [el.dataset.notaleId!] : [componentScope!], true);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const root=editableRoot(el);
    if(root?.namespaceURI==='http://www.w3.org/2000/svg'){event.preventDefault();event.stopImmediatePropagation();void vectors().then(v=>v.enter(root as unknown as SVGElement)).catch(e=>send('edit-error',{message:String(e)}));return;}
    if(root)void startText(root).catch(e=>send('text-error',{message:String(e)}));
  },
  true,
);
document.addEventListener(
  'keydown',
  (event) => {
    if(event.isComposing)return;
    if (event.key === 'Escape' && (drag || marquee)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelDrag();
      endMarquee(true);
      pendingSelectionClick = undefined;
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
    )
      return;
    if(mode==='edit'&&!vectorActive&&event.key==='Enter'){
      const n=get([...selected][0]);if(n?.namespaceURI==='http://www.w3.org/2000/svg'){
        event.preventDefault();event.stopImmediatePropagation();
        if(['svg','g'].includes(n.localName)){componentScope=n.getAttribute('data-notale-id')!;const child=[...n.children].find(c=>c.hasAttribute('data-notale-id')&&!['defs','title','desc','style'].includes(c.localName));if(child)setSelection([child.getAttribute('data-notale-id')!],true);}
        else void vectors().then(v=>v.enter(n as unknown as SVGElement)).catch(e=>send('edit-error',{message:String(e)}));return;
      }
    }
    if (mode === 'edit' && event.key === 'Escape' && componentScope) {
      const previous = componentScope;
      componentScope = undefined;
      setSelection([previous], true);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if(mode==='edit'&&event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();send('camera-hand',{active:true});return;}
    if (mode === 'edit') {
      const action = editShortcut(event);
      if (action) {
        rulers.cancel();
        cancelDrag();
        endMarquee(true);
        pendingSelectionClick = undefined;
        event.preventDefault();
        event.stopImmediatePropagation();
        send('edit-action', { action, slideId: slide.id });
        return;
      }
    }
    if (
      ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Escape'].includes(event.key) &&
      parent !== window
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      send('navigate', {
        direction: ['ArrowRight', 'PageDown', ' '].includes(event.key)
          ? 1
          : event.key === 'Escape'
            ? 0
            : -1,
      });
    }
  },
  true,
);
type Drag = {
  id: string;
  x: number;
  y: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  stageX: number;
  stageY: number;
  rectangles: ReturnType<typeof capture>['rectangles'];
  neighbors: SnapRect[];
  pointerId: number;
  element: HTMLElement;
  nodes: { el: HTMLElement; style: string | null }[];
};
let drag: Drag | undefined;
function cancelDrag() {
  if (drag) {
    const d = drag;
    drag = undefined;
    restoreDrag(d);
    if (d.element.hasPointerCapture(d.pointerId)) d.element.releasePointerCapture(d.pointerId);
  }
  snapLines = [];
  refreshGuides();
}
function currentDragViewport(d: Drag) {
  const stage = document.getElementById('stage')?.getBoundingClientRect();
  return (
    !!stage &&
    innerWidth === d.viewportWidth &&
    innerHeight === d.viewportHeight &&
    Math.abs(stage.width - d.scale * config.width) < 0.01 &&
    Math.abs(stage.x - d.stageX) < 0.01 &&
    Math.abs(stage.y - d.stageY) < 0.01
  );
}
function dragDelta(d: Drag, event: PointerEvent) {
  return snapTranslation(
    d.rectangles,
    d.neighbors,
    (event.clientX - d.x) / d.scale,
    (event.clientY - d.y) / d.scale,
    {
      width: config.width,
      height: config.height,
      tolerance: 6 / d.scale,
      guides: slide.guides ?? [],
      grid: snapping.grid,
      enabled: snapping.enabled && !event.altKey,
      constrain: event.shiftKey,
    },
  );
}
function restoreDrag(d: Drag) {
  for (const { el, style } of d.nodes) {
    if (style === null) el.removeAttribute('style');
    else el.setAttribute('style', style);
  }
}
let suppressClick = false;
let pendingSelectionClick: { id: string; toggle: boolean } | undefined;
type Marquee = {
  x: number;
  y: number;
  pointerId: number;
  element: Element;
  selection: string[];
  additive: boolean;
  moved: boolean;
};
let marquee: Marquee | undefined;
function endMarquee(cancelled = false) {
  if (!marquee) return;
  const previous = marquee;
  marquee = undefined;
  marqueeBox = undefined;
  if (cancelled) setSelection(previous.selection, true);
  if (previous.element.hasPointerCapture(previous.pointerId))
    previous.element.releasePointerCapture(previous.pointerId);
  refreshGuides();
}
function neighborsFor(ids: string[]) {
  const nodes = ids.map(get).filter((el): el is HTMLElement => !!el);
  return measure().filter((r) => {
    const candidate = get(r.id!);
    if (!candidate || !r.width || !r.height || candidate.id === 'stage' || isConnector(r.id!))
      return false;
    if (nodes.some((n) => n.contains(candidate) || candidate.contains(n))) return false;
    const css = getComputedStyle(candidate);
    return (
      css.visibility !== 'hidden' &&
      css.display !== 'none' &&
      Number(css.opacity) > 0 &&
      r.x + r.width >= 0 &&
      r.y + r.height >= 0 &&
      r.x <= config.width &&
      r.y <= config.height
    );
  });
}
document.addEventListener('pointerdown',()=>send('context-dismiss',{}),true);
document.addEventListener('contextmenu',event=>{
  if(mode!=='edit'||!(event.target instanceof Element)||event.target.closest('input,textarea,select'))return;
  const hit=componentHit(event.target.closest<HTMLElement>('[data-notale-id]'),event.ctrlKey||event.metaKey);
  const selectedParent=[...selected].map(id=>get(id)).find(node=>node?.contains(hit));
  const el=textEditor?.root.contains(hit)?textEditor.root:selectedParent??editableRoot(hit);
  if(!el||el.id==='stage')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(textEditor&&!textEditor.root.contains(el))endText();
  if(!selected.has(el.dataset.notaleId!))choose(el.dataset.notaleId!);
  contextAt(event.clientX,event.clientY);
},true);
document.addEventListener('keydown',event=>{if(mode==='edit'&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){const el=textEditor?.root??get([...selected][0]);if(el){event.preventDefault();event.stopImmediatePropagation();const r=el.getBoundingClientRect();contextAt(r.left+r.width/2,r.top+r.height/2);}}},true);
document.addEventListener('pointerdown',event=>{if(event.button===0&&textEditor&&!textEditor.root.contains(event.target as Node)&&!(event.target as Element).closest('[data-notale-handles]'))endText();},true);
document.addEventListener('pointerdown', (event) => {
  if (mode !== 'edit' || vectorActive || event.button !== 0 || (event.target instanceof Element && event.target.closest('[data-notale-handles]'))) return;
  connectors.cancel();
  rulers.cancel();
  const raw =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-notale-id]') : null;
  const deep=event.ctrlKey||event.metaKey;
  const el = componentHit(raw, deep);
  if(deep&&el)componentScope=el.parentElement?.closest<HTMLElement>('svg[data-notale-id],g[data-notale-id]')?.dataset.notaleId;
  suppressClick = false;
  pendingSelectionClick = undefined;
  if (!el || el.id === 'stage') {
    const stage = document.getElementById('stage');
    if (!stage) return;
    cancelDrag();
    endMarquee(true);
    marquee = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      element: stage,
      selection: [...selected],
      additive: event.shiftKey,
      moved: false,
    };
    if (!marquee.additive) setSelection([], true);
    stage.setPointerCapture(event.pointerId);
    return;
  }
  if(el&&selected.has(el.dataset.notaleId!)&&slide.nativeCharts[el.dataset.notaleId!]?.authoring){suppressClick=false;return;}
  if (el.isContentEditable) return;
  const id = el.dataset.notaleId!;
  if (event.shiftKey) {
    if (selected.has(id)) pendingSelectionClick = { id, toggle: true };
    else choose(id, true);
  } else if (!selected.has(id)) choose(id);
  else {
    pendingSelectionClick = { id, toggle: false };
    setSelection([...selected], true);
  }
  suppressClick = true;
});
let chartDragCandidate:MouseEvent|undefined;
document.addEventListener('mousemove',event=>{if(chartDragCandidate&&Math.hypot(event.clientX-chartDragCandidate.clientX,event.clientY-chartDragCandidate.clientY)>4){const original=chartDragCandidate;chartDragCandidate=undefined;handles.dragStart(original);}},true);
document.addEventListener('mouseup',()=>chartDragCandidate=undefined,true);
document.addEventListener('mousedown', event => {
  if((event.target as Element)?.closest('[data-notale-chart-ui]'))return;
  const chart=(event.target as Element)?.closest<HTMLElement>('[data-notale-id]');if(mode==='edit'&&chart&&selected.has(chart.dataset.notaleId!)&&slide.nativeCharts[chart.dataset.notaleId!]?.authoring&&!event.altKey){chartDragCandidate=event;return;}
  if(mode === 'edit' && !vectorActive && event.button === 0 && event.target instanceof Element && event.target.closest('[data-notale-id]') && !event.target.closest('[data-notale-handles]')) handles.dragStart(event);
});
document.addEventListener('pointermove', (event) => {
  if (marquee && event.pointerId === marquee.pointerId) {
    const m = marquee;
    if (Math.hypot(event.clientX - m.x, event.clientY - m.y) < 3 && !m.moved) return;
    m.moved = true;
    suppressClick = true;
    const stage = stageBounds(config.width,config.height),
      scale = stage.width / config.width;
    marqueeBox = {
      x: (Math.min(m.x, event.clientX) - stage.x) / scale,
      y: (Math.min(m.y, event.clientY) - stage.y) / scale,
      width: Math.abs(event.clientX - m.x) / scale,
      height: Math.abs(event.clientY - m.y) / scale,
    };
    const box = marqueeBox;
    const ids = measure()
      .filter((r) => {
        const el = get(r.id!);
        if (!el || el.id === 'stage' || !r.width || !r.height || locked(el)) return false;
        const css = getComputedStyle(el);
        return (
          css.display !== 'none' &&
          css.visibility !== 'hidden' &&
          Number(css.opacity) > 0 &&
          r.x >= box.x &&
          r.y >= box.y &&
          r.x + r.width <= box.x + box.width &&
          r.y + r.height <= box.y + box.height
        );
      })
      .map((r) => r.id!);
    setSelection(
      selectIds(m.additive ? m.selection : [], ids, selectionObjects(), slide.groups, 'add'),
      true,
    );
    refreshGuides();
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!currentDragViewport(drag)) {
    cancelDrag();
    pendingSelectionClick = undefined;
    return;
  }
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
  pendingSelectionClick = undefined;
  const { dx, dy, lines } = dragDelta(drag, event);
  snapLines = lines;
  refreshGuides();
  for (const { el } of drag.nodes) {
    const r = drag.rectangles.find((r) => r.id === el.dataset.notaleId),
      basis = r?.geometry;
    if (basis) {
      const [a, b, c, d] = basis.parent,
        det = a * d - b * c;
      if (Math.abs(det) < 1e-10) continue;
      const m = [...basis.local];
      m[4] += (d * dx - c * dy) / det;
      m[5] += (-b * dx + a * dy) / det;
      el.style.transform = `matrix(${m.join(',')})`;
      el.style.translate = 'none';
      el.style.rotate = 'none';
      el.style.scale = 'none';
    } else {
      const t = slide.transforms[el.dataset.notaleId!];
      el.style.translate = `${(t?.x ?? 0) + dx}px ${(t?.y ?? 0) + dy}px`;
    }
  }
  refreshGuides();
});
document.addEventListener('pointerup', (event) => {
  if (marquee?.pointerId === event.pointerId) {
    endMarquee();
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!currentDragViewport(drag)) {
    cancelDrag();
    pendingSelectionClick = undefined;
    return;
  }
  const d = drag,
    { dx, dy } = dragDelta(d, event);
  cancelDrag();
  if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < 3 || Math.hypot(dx, dy) < 1e-8) return;
  send('transform', { id: d.id, rectangles: d.rectangles, dx, dy });
});
document.addEventListener('pointercancel', (event) => {
  if (marquee?.pointerId === event.pointerId) endMarquee(true);
  if (drag?.pointerId === event.pointerId) cancelDrag();
});
document.addEventListener('lostpointercapture', (event) => {
  if (marquee?.pointerId === event.pointerId) endMarquee(true);
  if (drag?.pointerId === event.pointerId) cancelDrag();
});
window.addEventListener('blur', () => {
  cancelDrag();
  endMarquee(true);
});
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.data?.source !== 'notale-host' ||
    event.data.channel !== config.channel
  )
    return;
  const { type, data } = event.data;
  if(type==='chart-draft'){
    const parsed=chartAuthoringSchema.safeParse(data.model);if(parsed.success&&get(data.target)){
      slide.nativeCharts[data.target]={...slide.nativeCharts[data.target],adapter:'echarts',option:slide.nativeCharts[data.target]?.option??{},authoring:parsed.data};
      nativeCharts.update({...slide.nativeCharts});nativeCharts.state(data.target,data.stepState?[data.stepState]:[]);
    }return;
  }
  if(type==='charts-update'){
    nativeCharts.update(data.charts);slide.nativeCharts=data.charts;return;
  }
  if(type==='chart-selection'){nativeCharts.highlight(data.target,data.selection);return;}
  if(type==='chart-export'){send('chart-exported',{url:nativeCharts.exportImage(data.target,data.format),format:data.format});return;}

  if (type === 'animations-update' && mode === 'edit' && Array.isArray(data.animations)) {
    const parsed = data.animations.map((a:unknown)=>animationSchema.safeParse(a));
    if(parsed.every((a:ReturnType<typeof animationSchema.safeParse>)=>a.success)) {
      stopAuthorPreview();
      slide.animations = parsed.map((a:{data:AnimationSpec})=>a.data);
      cues = timeline(slide);
      send('step',{step,max:total()});
    }
  }
  if (type === 'animation-preview-stop') stopAuthorPreview();
  if (type === 'animation-preview' && mode === 'edit') {
    stopAuthorPreview();
    const parsed = animationSchema.safeParse(data.animation);
    if (parsed.success) {
      const el = get(parsed.data.target);
      if (el) {
        const preview = animateObject(el, parsed.data, 0, 'none');
        authorPreview = preview;
        void Promise.allSettled(preview.map(a => a.finished)).then(() => {
          if (authorPreview === preview) stopAuthorPreview();
        });
      }
    }
  }
  if (type === 'snapping') {
    snapping = {
      enabled: data.enabled !== false,
      visible: data.visible !== false,
      rulers: data.rulers === true,
      grid:
        typeof data.grid === 'number' && Number.isFinite(data.grid)
          ? Math.max(0, Math.min(10000, data.grid))
          : 0,
    };
    refreshGuides();
  }
  if (type === 'seek') {
    mediaEnabled = data.media !== false;
    seek(data.step, !!data.animate, data.componentStep ?? data.step);
  }
  if (type === 'state' && runtimeReady)
    send('ready', {
      slideId: slide.id,
      runtimeId,
      max: total(),
      nativeMax: window.Deck?.stepMax ?? slide.nativeStepCount,
      objects: measure(),
      scenes: config.scenes ?? [],
    });
  if (type === 'guides-update') {
    slide.guides = data.guides;
    guidePreview = undefined;
    refreshGuides();
  }
  if (type === 'guide-focus') rulers.focus(data.id);
  if (type === 'resize-mode') handles.textReflow(data.reflow !== false);
  if (type === 'mode') setMode(data.mode);
  if(type==='vector-action')void vectors().then(v=>v.action(data.action,data)).catch(e=>send('edit-error',{message:String(e)}));
  if(type==='flush-editor'){
    vectorEditor?.flush();
    const finish=()=>{textEditor?.flush();send('editor-flushed',{id:data.id});};
    if(textEditor?.composing)textEditor.root.addEventListener('compositionend',()=>queueMicrotask(finish),{once:true});else finish();
  }
  if(type==='text-start'){const el=get(data.target);if(el)void startText(el).catch(e=>send('text-error',{message:String(e)}));}
  if(type==='text-end')endText();
  if(type==='text-format'&&textEditor&&textEditor.sessionId===data.sessionId){try{textEditor.format(data.property,data.value,data.selectionToken);}catch(e){send('text-error',{message:String(e)});}}
  if(type==='text-replace'&&textEditor&&textEditor.sessionId===data.sessionId){try{textEditor.replace(data.text,data.selectionToken);}catch(e){send('text-error',{message:String(e)});}}
  if(type==='text-select-all'&&textEditor&&(!data.sessionId||textEditor.sessionId===data.sessionId))textEditor.selectAll();
  if(type==='text-refocus'&&textEditor&&(!data.sessionId||textEditor.sessionId===data.sessionId))textEditor.root.focus();
  if(type==='text-object-format'){void (async()=>{for(const id of data.ids??[]){const el=get(id);if(!el||locked(el)||!isTextRoot(el))continue;await startText(el);if(textEditor){const selection=textEditor.selectAll();textEditor.format(data.property,data.value,selection.selectionToken);endText();}}})().catch(e=>send('text-error',{message:String(e)}));}
  if(type==='text-confirm'){const head=textHeads.get(data.target);if(data.sessionId&&head&&(head.sessionId!==data.sessionId||head.sequence>data.sequence))return;const el=get(data.target);if(el){if(textEditor?.root===el){if(!data.sessionId||textEditor.sessionId===data.sessionId)textEditor.ack(data.sequence??textEditor.sequence,data.html);}else el.innerHTML=data.html;refreshGuides();}}

  if (type === 'focus') {
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
    window.focus();
  }
  if (type === 'camera') {handles.camera(data.scale);vectorEditor?.refresh();}
  if(type==='author-update') {
    const before=new DOMParser().parseFromString(data.before,'text/html'),after=new DOMParser().parseFromString(data.after,'text/html');
    for(const node of after.querySelectorAll<HTMLElement>('[data-notale-id]')){
      const id=node.dataset.notaleId!,old=before.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`),live=get(id);if(!old||!live||textEditor?.root.contains(live))continue;
      for(const key of new Set([...old.style,...node.style]))if(old.style.getPropertyValue(key)!==node.style.getPropertyValue(key)&&live.style.getPropertyValue(key)===old.style.getPropertyValue(key)){const value=node.style.getPropertyValue(key);if(value)live.style.setProperty(key,value,node.style.getPropertyPriority(key));else live.style.removeProperty(key);}
      for(const key of new Set([...old.attributes,...node.attributes].map(a=>a.name)))if(key!=='style'&&key!=='data-notale-id'&&old.getAttribute(key)!==node.getAttribute(key)&&live.getAttribute(key)===old.getAttribute(key)){const value=node.getAttribute(key);if(value===null)live.removeAttribute(key);else live.setAttribute(key,value);}
      if(!old.children.length&&!node.children.length&&old.textContent!==node.textContent&&live.textContent===old.textContent&&!live.isContentEditable)live.textContent=node.textContent;
    }
    Object.assign(slide.transforms,data.transforms);refreshGuides();
  }
  if (type === 'geometry-confirm') { Object.assign(slide.transforms, data.transforms); }
  if (type === 'geometry-draft') {
    handles.cancel();
    for(const state of data.states??[])if(state.vector)paintVector(state.vector);
    for(const state of data.states ?? []) {if(state.vector)continue;const el=get(state.id);if(el){if(state.patch){for(const [key,value] of Object.entries(state.patch)){if(value===null)el.style.removeProperty(key);else el.style.setProperty(key,String(value));}}else if(state.style===null)el.removeAttribute('style');else el.setAttribute('style',state.style);}}
    refreshGuides();
  }
  if (type === 'measure') send('measure', measure());
  if (type === 'capture')
    send('capture', { requestId: data.requestId, ...capture(data.ids, true) });
  if (type === 'scene-inspect') {
    try {
      const getter = window.__NOTALE_SCENES__?.[data.sceneId];
      if (!getter) throw new Error('场景状态尚未初始化');
      send('scene-inspect', {
        requestId: data.requestId,
        sceneId: data.sceneId,
        values: getter(),
        checkpoint: window.__NOTALE_CHECKPOINTS__?.[data.sceneId]?.capture(),
      });
    } catch (error) {
      send('scene-inspect', {
        requestId: data.requestId,
        sceneId: data.sceneId,
        error: String(error),
      });
    }
  }
  if (type === 'component-select') components.select(data.id, data.state, !!data.animate);
  if (type === 'native-chart-inspect') {
    const component = config.chartComponents?.[data.target];
    const state = component
      ? capture([component.root]).nativeChartStates?.[data.target]
      : undefined;
    send('native-chart-inspect', {
      requestId: data.requestId,
      ...nativeCharts.inspect(data.target),
      ...(component && state ? { component: { ...component, ...state }, value: state.value } : {}),
    });
  }
  if (type === 'select')
    setSelection(Array.isArray(data.ids) ? data.ids : data.id ? [data.id] : []);
});
function start() {
  if (window.Deck?.pt) {
    const original = window.Deck.pt;
    window.Deck.pt = (el, event) => {
      const e = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
      return localPoint(el, e) ?? original(el, event);
    };
  }
  if (!window.Deck) {
    const fit = () => {
      const stage = document.getElementById('stage');
      if (stage) {
        stage.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / config.width, innerHeight / config.height)})`;
        stage.style.position = 'absolute';
        stage.style.left = '50%';
        stage.style.top = '50%';
      }
    };
    fit();
    window.addEventListener('resize', fit);
  }
  nativeCharts.start();
  canvasInstances.start();
  for (const settings of slide.scenes ?? []) {
    const scene = config.scenes?.find((scene) => scene.id === settings.id);
    for (const parameter of scene?.parameters ?? []) {
      if (!parameter.control || !Object.hasOwn(settings.values, parameter.key)) continue;
      const el = get(parameter.control.target) as HTMLInputElement | null;
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = Boolean(settings.values[parameter.key]);
      else el.value = String(settings.values[parameter.key]);
      el.dispatchEvent(new Event(parameter.control.event, { bubbles: true }));
    }
  }
  for (const binding of slide.bindings) {
    const el = get(binding.target) as HTMLInputElement | null;
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!binding.value;
    else el.value = String(binding.value);
    el.dispatchEvent(new Event(binding.event, { bubbles: true }));
  }
  for (const settings of slide.scenes ?? []) {
    if (settings.checkpoint) {
      const hooks = window.__NOTALE_CHECKPOINTS__?.[settings.id];
      if (!hooks) throw new Error('保存的场景检查点没有可用的恢复适配器');
      hooks.restore(settings.checkpoint);
    }
  }
  components.start();
  seek(0, false);
  connectors.refresh();
  runtimeReady = true;
  send('ready', {
    slideId: slide.id,
    runtimeId,
    max: total(),
    nativeMax: window.Deck?.stepMax ?? slide.nativeStepCount,
    objects: measure(),
    scenes: config.scenes ?? [],
  });
}
window.NotaleBridge = {
  seek,
  mode: setMode,
  measure,
  capture: (ids: string[]) => capture(ids, true),
  state: () => ({ step, max: total(), mode, components: components.state() }),
};
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
