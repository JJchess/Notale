import {prepareSvgImport} from './vector-import.js';
import {createVectorIngress} from './vector-ingress.js';
import {createVectorInspector} from './vector-inspector.js';
import {createDocumentUI} from './document-ui.js';
import {createTextIngress, type TextDraft} from './text-ingress.js';
import { createAnimationPath } from './animation-path.js';
import { createObjectMenu, type ObjectMenuItem, type FormatControl } from './object-menu.js';
import { GeometrySession, type GeometryEdit } from './geometry-session.js';
import { installDockIcons } from './dock-icons.js';
import { createPreviewOverlay } from './preview-overlay.js';
import { bindAnimationTiming } from './animation-timing.js';
import { createPageSettings } from './page-settings.js';
import { renderSelectionTools } from './selection-tools.js';
import { createCanvasLoading } from './canvas-loading.js';
import { createChartEditor } from './chart-editor.js';
import { createTableInspector } from './table-inspector.js';
import { applyFeatureAvailability } from './feature-availability.js';
import { createLayoutManager } from './layout-manager.js';
import { createImageCrop } from './image-crop.js';
import { createMediaIngress } from './media-ingress.js';
import { createRichEditor } from './rich-editor.js';
import { createLinkInspector } from './link-inspector.js';
import { createRevealPreset } from './reveal-preset.js';
import { createPageThumbnails } from './page-thumbnails.js';
import { createAssetLibrary } from './asset-library.js';
import { createTypography } from './typography.js';
import { createContextInspector } from './context-inspector.js';
import { createEditorShell } from './editor-shell.js';
import { bindPageNavigation } from './page-navigation.js';
import { timeline } from '@notale/editor/browser';
import { htmlLayerCommands } from '@notale/editor/browser';
import { createLayoutValues } from './layout-values.js';
import { createStepInspector } from './step-inspector.js';
import { createComponentInspector } from './component-inspector.js';
import type { SourceScene } from '@notale/editor/browser';
import { sceneValuesSchema, type SceneScalar } from '@notale/editor/browser';
import { sceneCheckpointSchema, type SceneCheckpoint } from '@notale/editor/browser';
import {
  nativeChartOptionSchema,
  nativeChartAppearancePatchSchema,
  type NativeChartInteraction,
} from '@notale/editor/browser';
import type { NativeChartInspection } from '@notale/editor/browser';
import { connectorSchema } from '@notale/editor/browser';
import { keepPreviewAlive } from './preview-lease.js';
let previewLease: ReturnType<typeof keepPreviewAlive> | undefined;
window.addEventListener('pagehide', () => previewLease?.stop());
import {
  PendingJournal,
  pendingRecordKey,
  isJournalKey,
  validHistory,
  type Pending,
  type PendingEntry,
  type HistoryPlan,
} from './pending-journal.js';
import { editShortcut, type EditAction } from './shortcuts.js';
import { selectIds } from '@notale/editor/browser';
import { isSvgLayer } from '@notale/editor/browser';
import { mediaSettingsSchema } from '@notale/editor/browser';
import type { Snapshot, Slide, Command, AnimationSpec } from '@notale/editor/browser';
import { template, DEFAULT_TEX } from './templates.js';
import { createEquationEditor } from './equation-editor.js';
import { buildInsertPanel } from './insert-panel.js';
type ObjectInfo = {
  id: string;
  tag: string;
  namespace: string;
  parent?: string;
  text: string;
  html: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  locked: boolean;
  kind: string;
};
type Rect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nativeChart?: boolean;
  value?: string;
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => $<HTMLInputElement>(id).value;
const num = (id: string) => Number(value(id));
const set = (id: string, v: unknown) => {
  $<HTMLInputElement>(id).value = String(v ?? '');
};
const esc = (s: unknown) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const uuid = () => crypto.randomUUID();
let snapshot: Snapshot,
  slideId = '',
  objects: ObjectInfo[] = [],
  selected = new Set<string>(),
  rects: Rect[] = [],
  channel = '',
  interacting = false,
  step = 0,
  max = 0;
let undo: number[] = [],
  redo: number[] = [],
  busy = false;
const idleWaiters = new Set<() => void>();
async function whenIdle() {
  if (busy) await new Promise<void>((resolve) => idleWaiters.add(resolve));
}
function releaseBusy() {
  busy = false;
  for (const done of idleWaiters) done();
  idleWaiters.clear();
}
let pending: Pending | undefined;
let pendingConflict = false;
let documentUI:ReturnType<typeof createDocumentUI>|undefined;
type Capture = {
  rectangles: (Rect & {
    baseWidth?: number;
    baseHeight?: number;
    matrix?: number[];
    geometry?: unknown;
  })[];
  computedStyles: Record<string, Record<string, string>>;
  componentStates?: Record<string, string>;
  canvasSceneStates?: Record<
    string,
    Record<string, import('@notale/editor/browser').SceneScalar>
  >;
  nativeChartTargets?: string[];
  nativeChartStates?: Record<string, import('@notale/editor/browser').NativeChartState>;
};
let canvasReady = false;
let nativeMax = 0;
const readyWaiters = new Set<() => void>();
function whenReady(): Promise<void> {
  if (canvasReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timeout);
      readyWaiters.delete(done);
      resolve();
    };
    const timeout = setTimeout(() => {
      readyWaiters.delete(done);
      reject(new Error('页面仍未加载完成'));
    }, 30000);
    readyWaiters.add(done);
  });
}
const captures = new Map<string, (result: Capture) => void>();
let clipboard:
  | { documentId: string; source: Slide; targets: string[]; mode: 'copy' | 'cut'; capture: Capture }
  | undefined;
async function captureSelection(ids = [...selected]): Promise<Capture> {
  await whenReady();
  if (!ids.length) return Promise.reject(new Error('请先选择对象'));
  const requestId = uuid();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      captures.delete(requestId);
      reject(new Error('画布未响应，请等待页面加载后重试'));
    }, 5000);
    captures.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    send('capture', { requestId, ids });
  });
}
let clipboardCapture: Promise<void> | undefined;
function copySelection(mode: 'copy' | 'cut') {
  const task = (async () => {
    const ids = [...selected],
      source = structuredClone(slide()),
      documentId = snapshot.document.id;
    const capture = await captureSelection(ids);
    clipboard = { documentId, source, targets: ids, mode, capture };
  })();
  clipboardCapture = task;
  return task.finally(() => {
    if (clipboardCapture === task) clipboardCapture = undefined;
  });
}
async function pasteSelection() {
  await clipboardCapture;
  if (!clipboard) throw new Error('剪贴板中没有对象');
  if (clipboard.documentId !== snapshot.document.id)
    throw new Error('跨讲义请使用工程导入；当前剪贴板属于另一份讲义');
  const beforeIds = new Set(objects.map((o) => o.id));
  await commands([
    {
      type: 'elements.transfer',
      slideId,
      sourceSlideId: clipboard.source.id,
      sourceSnapshot: clipboard.source,
      targets: clipboard.targets,
      mode: clipboard.mode,
      ...clipboard.capture,
    },
  ]);
  const definitionHelper = (object: ObjectInfo) => {
    let node: ObjectInfo | undefined = object;
    while (node) {
      if ('data-notale-clipboard-defs' in node.attributes) return true;
      node = objects.find((o) => o.id === node!.parent);
    }
    return false;
  };
  changeSelection(
    objects.filter((o) => !beforeIds.has(o.id) && !definitionHelper(o)).map((o) => o.id),
  );
  renderObjects();
  renderSelection();
  if (clipboard.mode === 'cut') clipboard = undefined;
}
const journal = new PendingJournal(localStorage, sessionStorage);
let migratedLegacy: PendingEntry | undefined;
const frame = $<HTMLIFrameElement>('canvas');
buildInsertPanel($('insert-drawer'));
const editorShell = createEditorShell(scale=>send('camera',{scale}));
const geometrySession = new GeometrySession({
  task: edit => ({documentId:snapshot.document.id,slideId:edit.slideId,selection:[...selected],request:{baseVersion:snapshot.version,mutationId:edit.id,commands:edit.commands},after:{undo:[...undo],redo:[]}}),
  submit: task => transmit(task),
  snapshot:()=>snapshot,
  recovered:task=>{journal.clear(task);if(pending?.request.mutationId===task.request.mutationId)pending=undefined;},
  confirm:(task,version)=>{const plan=nextHistory(task,version);undo=plan.undo;redo=plan.redo;sessionStorage.setItem(historyKey(task.documentId),JSON.stringify({version:Math.max(version,snapshot.version),...plan}));mark();},
  remote: async()=>{if(!busy&&!canvasGesture&&!textSession&&snapshot){const head=await api(`/api/documents/${snapshot.document.id}/sync-head`);if(head.version<=snapshot.version)return;const next:Snapshot=await api(`/api/documents/${snapshot.document.id}`);if(next.version>snapshot.version){const previous=slide();snapshot=next;await updateAuthor(previous);mark();}}},
  paint: states => send('geometry-draft',{states}),
  changed: () => {if(snapshot)mark();},error,
});
let textSession:{sessionId:string;target:string}|undefined;
const textIngress=createTextIngress({queue:geometrySession,documentId:()=>snapshot.document.id,version:()=>snapshot.version,error,confirm:data=>send('text-confirm',data)});
bindPageNavigation({
  pages: normalPages,
  documentId: () => snapshot.document.id,
  show: showPage,
  move: moveNormalPage,
  error,
});
function normalPages() { return snapshot.document.slides.filter(page=>!page.layoutSourceId); }
function moveNormalPage(id:string,index:number) {
  if(!normalPages().some(page=>page.id===id))throw new Error('请在普通页面列表中排序');
  const remaining=snapshot.document.slides.filter(page=>page.id!==id),ordinary=remaining.filter(page=>!page.layoutSourceId);
  const target=ordinary[Math.max(0,index)];
  const at=target?remaining.findIndex(page=>page.id===target.id):ordinary.length?remaining.findIndex(page=>page.id===ordinary.at(-1)!.id)+1:0;
  return commands([{type:'slide.move',slideId:id,index:at}]);
}
class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); }
}
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body === undefined
      ? {signal:AbortSignal.timeout(15000)}
      : {
          signal:AbortSignal.timeout(15000),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!r.ok) {
    const e = await r.json().catch(()=>({}));
    throw new ApiError(String(e.error ?? 'HTTP_'+r.status), e.message ?? JSON.stringify(e.issues) ?? `HTTP ${r.status}`);
  }
  return r.json();
}
function error(e: unknown) {
  const status=document.querySelector<HTMLElement>('dialog[open] [role="status"]');if(status)status.textContent=e instanceof Error?e.message:String(e);
  $('toast').textContent = e instanceof Error ? e.message : String(e);
  $('toast').hidden = false;
  setTimeout(() => ($('toast').hidden = true), 10000);
  if(snapshot)mark();
}
function on(id: string, fn: () => unknown) {
  $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(error));
}
function slide(): Slide {
  return snapshot.document.slides.find((s) => s.id === slideId)!;
}
function send(type: string, data: unknown) {
  frame.contentWindow?.postMessage({ source: 'notale-host', channel, type, data }, '*');
}
function current() {
  const id = [...selected][0];
  if (!id) throw new Error('请先选择一个对象');
  return objects.find((o) => o.id === id)!;
}
let selectionScope:string|undefined;
function changeSelection(ids: string[], operation: 'replace' | 'add' | 'toggle' = 'replace') {
  selected = new Set(
    selectIds(
      [...selected],
      ids,
      objects.filter((o) => o.attributes.id !== 'stage'),
      selectionScope?[]:slide().groups,
      operation,
    ),
  );
}
function refreshPendingControls() {
  $('retry-save').hidden = !geometrySession.blocked;
  $('reload-head').hidden = !geometrySession.blocked;
  $('export-draft').hidden = !geometrySession.blocked;
  $<HTMLButtonElement>('retry-save').disabled = busy;
  $<HTMLButtonElement>('reload-head').disabled = busy;
}
function mark() {
  if(snapshot)documentUI?.render();
  refreshPendingControls();
  $('save-status').textContent = geometrySession.status || (busy ? '正在保存…' : `已保存 · v${snapshot.version}`);
  $<HTMLButtonElement>('undo').disabled = !textIngress.canUndo && !geometrySession.canUndo && (!undo.length || (busy && !geometrySession.count) || (!!pending && !geometrySession.count));
  $<HTMLButtonElement>('redo').disabled = !textIngress.canRedo && !geometrySession.canRedo && (!redo.length || busy || !!pending);
  $<HTMLSelectElement>('documents').disabled = busy;
  refreshRecoveries();
}
async function updateAuthor(previous:Slide){
  const next=snapshot.document.slides.find(s=>s.id===slideId);if(!next){await render();return;}
  const shape=(html:string)=>{const d=new DOMParser().parseFromString(html,'text/html');return JSON.stringify([...d.querySelectorAll('[data-notale-id]')].map(e=>[e.getAttribute('data-notale-id'),e.tagName,e.parentElement?.getAttribute('data-notale-id')]));};
  const metadata=({html,transforms,notes,animations,...rest}:Slide)=>JSON.stringify(rest);
  const runtime=(html:string)=>{const d=new DOMParser().parseFromString(html,'text/html');return JSON.stringify([...d.querySelectorAll('script,style,link')].map(e=>e.outerHTML));};
  if(previous.id!==next.id||shape(previous.html)!==shape(next.html)||metadata(previous)!==metadata(next)||runtime(previous.html)!==runtime(next.html)){await render();return;}
  send('author-update',{before:previous.html,after:next.html,transforms:next.transforms});
  if(JSON.stringify(previous.animations)!==JSON.stringify(next.animations)){send('animations-update',{animations:next.animations});renderAnimations();teachingStepsUI.render();}
}
const flushWaiters=new Map<string,()=>void>();
async function flushTextEditor(){const id=uuid();await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{flushWaiters.delete(id);reject(Error('画布尚未确认编辑内容，请稍后再试'));},5000);flushWaiters.set(id,()=>{clearTimeout(timer);resolve();});send('flush-editor',{id});});await textIngress.flush();await vectorIngress.flush();}
async function flushAuthor(){await whenReady();await flushTextEditor();await whenEditsIdle();await geometrySession.barrier();await geometrySession.pull();}
const historyKey = (id: string) => `notale-editor-history-v2:${id}`;
function nextHistory(task:Pending,version:number):HistoryPlan {
  const old=validHistory(task.after)?task.after:{undo:[...undo],redo:[...redo]};
  const add=(values:number[])=>values.includes(version)?[...values]:[...values,version];
  return task.historyAction==='undo'?{undo:old.undo,redo:add(old.redo)}:task.historyAction==='redo'?{undo:add(old.undo),redo:old.redo}:{undo:add(undo),redo:[]};
}
async function transmit(task: Pending) {
  await initialized;
  await whenIdle();
  busy = true;
  $<HTMLSelectElement>('documents').disabled = true;
  pending = task;
  pendingConflict = false;
  if(snapshot)documentUI?.render();
  refreshPendingControls();
  $('save-status').textContent = task.kind === 'restore' ? '正在恢复…' : '正在保存…';
  try {
    // Persist the exact request AND its resulting local history before sending.
    // Replaying an acknowledged request reapplies this plan instead of pushing twice.
    journal.put(task, snapshot.document.title);
    refreshRecoveries();
    const acknowledged: Snapshot = await api(
      `/api/documents/${task.documentId}/sync`,
      task.inverseVersion ? {baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],inverseVersion:task.inverseVersion} : task.kind==='restore'?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],restoreVersion:task.request.version}:task.geometry?{...task.request,geometry:true}:task.request,
    );
    const result=snapshot.document.id===acknowledged.document.id&&snapshot.version>acknowledged.version?snapshot:acknowledged;
    const confirmedVersion=acknowledged.version;
    const advanced=false;
    const geometryOnly=!!task.geometry || geometrySession.has(task.request.mutationId);
    const foreign=!await geometrySession.ownsHistory(task);
    const plan=foreign?{undo:[...undo],redo:[...redo]}:nextHistory(task,confirmedVersion);
    sessionStorage.setItem(
      historyKey(task.documentId),
      JSON.stringify({ version: result.version, ...plan }),
    );
    const withoutGuides = (document: Snapshot['document']) =>
      JSON.stringify({ ...document, slides: document.slides.map(({ guides, ...slide }) => slide) });
    const guideOnly =
      canvasReady &&
      snapshot.document.id === result.document.id &&
      (!task.slideId || task.slideId === slideId) &&
      JSON.stringify(snapshot.document.slides.map((slide) => slide.guides)) !==
        JSON.stringify(result.document.slides.map((slide) => slide.guides)) &&
      withoutGuides(snapshot.document) === withoutGuides(result.document);
    const withoutAnimations=(document:Snapshot['document'])=>JSON.stringify({...document,slides:document.slides.map(({animations,...rest})=>rest)});
    const animationOnly=canvasReady && (!task.slideId||task.slideId===slideId) && withoutAnimations(snapshot.document)===withoutAnimations(result.document);
    const previousSlide=slide();
    snapshot = result;
    undo = [...plan.undo];
    redo = [...plan.redo];
    if (!foreign && task.slideId && result.document.slides.some((s) => s.id === task.slideId))
      slideId = task.slideId;
    if(!geometryOnly&&!foreign&&!task.textEdit) selected = new Set(task.selection ?? []);
    journal.clear(task);
    pending = undefined;
    history.replaceState(null, '', `?document=${task.documentId}`);
    selectDocument(snapshot.document);
    if(task.textEdit&&canvasReady&&task.slideId===slideId){
      const doc=new DOMParser().parseFromString(slide().html,'text/html'),node=doc.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(task.textEdit.target)}"]`);
      if(node){send('text-confirm',{...task.textEdit,html:node.innerHTML});const cached=objects.find(o=>o.id===task.textEdit!.target);if(cached){cached.html=node.outerHTML;cached.text=node.textContent??'';}}
      send('author-update',{before:previousSlide.html,after:slide().html,transforms:slide().transforms});renderedSlide=structuredClone(slide());mark();
    }else if(task.vector&&canvasReady&&task.slideId===slideId){send('author-update',{before:previousSlide.html,after:slide().html,transforms:slide().transforms});renderedSlide=structuredClone(slide());mark();
    }else if(animationOnly){send('animations-update',{animations:slide().animations});renderAnimations();teachingStepsUI.render();mark();}
    else if (geometryOnly||foreign) {
      await updateAuthor(previousSlide);
      send('geometry-confirm',{mutationId:task.request.mutationId,version:result.version,transforms:slide().transforms});
      // The rendered geometry already includes newer local gestures. Never replace it
      // with an older acknowledgement or rebuild the iframe on this path.
    } else if (guideOnly) {
      send('guides-update', { guides: slide().guides });
      renderGuides();
      renderSelection();
      mark();
    } else await render();
    if (advanced) {
      $('toast').textContent = '这批修改已确认，已载入其他窗口的较新版本';
      $('toast').hidden = false;
      setTimeout(() => ($('toast').hidden = true), 10000);
    }
    return confirmedVersion;
  } catch (cause) {
    pendingConflict = (cause instanceof ApiError && cause.code === 'VERSION_CONFLICT') || (cause instanceof Error && cause.message.startsWith('版本冲突'));
    throw cause;
  } finally {
    releaseBusy();
    mark();
  }
}
async function commands(cmds: unknown[], remember = true, focusSlide?: string) {
  await initialized;
  if(textSession){await flushTextEditor();send("text-end",{});}
  await textIngress.flush();
  await geometrySession.submit({
    kind: 'commit',
    documentId: snapshot.document.id,
    request: { baseVersion: snapshot.version, mutationId: uuid(), commands: cmds },
    after: {
      undo: [...undo],
      redo: remember ? [] : [...redo],
    },
    slideId: focusSlide ?? slideId,
    selection: focusSlide ? [] : [...selected],
  });
}
function selectDocument(document: Snapshot['document']) {
  const select = $<HTMLSelectElement>('documents');
  let option = [...select.options].find((o) => o.value === document.id);
  if (!option) {
    option = new Option(document.title, document.id);
    select.add(option);
  }
  option.textContent = document.title;
  select.value = document.id;
}
async function load(id: string) {
  if(textSession){await flushTextEditor();send("text-end",{});textSession=undefined;}
  await clipboardCapture?.catch(() => undefined);
  await geometrySession.barrier();
  if (busy) throw new Error('正在保存或载入，请稍后切换讲义');
  busy = true;
  $<HTMLSelectElement>('documents').disabled = true;
  if(snapshot)documentUI?.render();
  refreshPendingControls();
  $('save-status').textContent = '正在载入…';
  try {
    let entry = journal.own(id);
    if (!entry && migratedLegacy?.task.documentId === id) {
      entry = journal.adopt(pendingRecordKey(migratedLegacy.task));
      migratedLegacy = undefined;
    }
    const result: Snapshot = await api(`/api/documents/${id}`);
    pending = undefined;
    pendingConflict = false;
    snapshot = result;
    await geometrySession.load(id);
    await geometrySession.checkpoint(snapshot);
    selectDocument(snapshot.document);
    slideId = geometrySession.firstSlide ?? normalPages()[0]?.id ?? snapshot.document.slides[0].id;
    selected.clear();
    undo = [];
    redo = [];
    try {
      const stored = JSON.parse(sessionStorage.getItem(historyKey(id)) ?? 'null');
      if (stored?.version <= snapshot.version && validHistory(stored)) {
        undo = stored.undo;
        redo = stored.redo;
      }
    } catch {}
    history.replaceState(null, '', `?document=${id}`);
    await render();
  } finally {
    releaseBusy();
    if (snapshot) mark();
  }
}

class SupersededPage extends Error {}
function pageError(e: unknown) {
  if (!(e instanceof SupersededPage)) error(e);
}
async function showPage(id: string) {
  if(textSession){await flushAuthor();send("text-end",{});textSession=undefined;}
  await initialized;
  await clipboardCapture?.catch(() => undefined);
  await geometrySession.barrier();
  await whenIdle();
  if (!snapshot.document.slides.some((s) => s.id === id)) throw new Error('页面不存在');
  slideId = id;
  selected.clear();
  await render();
  if (slideId !== id) throw new SupersededPage('页面切换已被后续请求替代');
  await whenReady();
  if (slideId !== id) throw new SupersededPage('页面切换已被后续请求替代');
}

type MenuContext={contextId:string;slideId:string;runtimeId:string;x:number;y:number;width:number;ids:string[];info:{id:string;tag:string;editableText:boolean;locked:boolean;styles:Record<string,string>}[];text?:{sessionId:string;target:string;selectionToken:number;selectedText:string;selectedHtml:string;collapsed:boolean;styles:Record<string,string>;mixed:string[]}};
let menuContext:MenuContext|undefined;
const objectMenu=createObjectMenu(()=>send(textSession?'text-refocus':'focus',{}),error);
function formatControls(ctx:MenuContext):FormatControl[]{
 const info=ctx.info,styles=ctx.text?.styles??info[0]?.styles??{},mixed=ctx.text?.mixed??Object.keys(styles).filter(k=>info.some(o=>o.styles[k]!==styles[k]));
 const disabled=info.some(o=>o.locked)||geometrySession.blocked;
 const format=(property:string,value:string)=>{if(ctx.text)send('text-format',{sessionId:ctx.text.sessionId,selectionToken:ctx.text.selectionToken,property,value});else send('text-object-format',{ids:ctx.ids,property,value});};
 const color=(value:string)=>{const m=value.match(/\d+/g);return /^#[\da-f]{6}$/i.test(value)?value:m&&m.length>=3?'#'+m.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'#000000';};
 if(ctx.text||info.every(o=>o.editableText)){
  const fonts=[...new Set([styles['font-family'],'Arial','Inter','Noto Sans SC','Microsoft YaHei','serif','monospace'].filter(Boolean))];
  return [
   {id:'font-family',label:'字体',kind:'select',value:styles['font-family'],mixed:mixed.includes('font-family'),options:fonts.map(value=>({value,label:value})),disabled,run:v=>format('font-family',v)},
   {id:'font-size',label:'字号（px）',kind:'number',value:String(parseFloat(styles['font-size'])||24),mixed:mixed.includes('font-size'),min:1,max:500,disabled,run:v=>format('font-size',v+'px')},
   ...(['font-weight','font-style','text-decoration'] as const).map((id,i):FormatControl=>({id,label:['加粗','斜体','下划线'][i],icon:['bold','italic','underline'][i],kind:'button',checked:i===0?parseInt(styles[id])>=600:i===1?styles[id]==='italic':styles[id]?.includes('underline'),mixed:mixed.includes(id),disabled,run:()=>format(id,'toggle')})),
   {id:'color',label:'文字颜色',kind:'color',value:color(styles.color??''),mixed:mixed.includes('color'),disabled,run:v=>format('color',v)},
   {id:'text-align',label:'段落对齐',kind:'select',value:styles['text-align']==='start'?'left':styles['text-align'],mixed:mixed.includes('text-align'),options:[{value:'left',label:'左对齐'},{value:'center',label:'居中'},{value:'right',label:'右对齐'},{value:'justify',label:'两端对齐'}],disabled,run:v=>format('text-align',v)},
  ];
 }
 if(info.length===1&&info[0].tag==='img')return [{id:'replace-image',label:'替换图片',kind:'button',icon:'image',disabled,run:()=>chooseMedia('image',ctx.ids[0])},{id:'crop-image',label:'裁剪图片',kind:'button',icon:'crop',disabled,run:()=>imageCrop.open()}];
 if(info.length===1&&['rect','circle','ellipse','path','polygon','line','polyline'].includes(info[0].tag))return (['fill','stroke','stroke-width'] as const).map(id=>({id,label:({fill:'填充颜色',stroke:'描边颜色','stroke-width':'描边宽度'})[id],kind:id==='stroke-width'?'number':'color',value:id==='stroke-width'?String(parseFloat(styles[id])||1):color(styles[id]??''),min:0,max:100,disabled,run:(v:string)=>commands([{type:'element.patch',slideId,target:ctx.ids[0],patch:{style:{[id]:v}}}])}));
 return [];
}
function openObjectMenu(data:MenuContext) {
 if(!data.ids?.length||![data.x,data.y,data.width].every(Number.isFinite)||data.width<=0)return;
 changeSelection(data.ids);menuContext=data;
 const documentId=snapshot.document.id,valid=()=>documentId===snapshot.document.id&&data.slideId===slideId&&data.runtimeId===frameRuntimeId&&menuContext?.contextId===data.contextId&&(!data.text?JSON.stringify([...selected])===JSON.stringify(data.ids):data.text.sessionId===textSession?.sessionId);
 const blocked=geometrySession.blocked,locked=data.info.some(o=>o.locked),mod=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
 const edit=(label:string,type:'copy'|'cut'|'paste'|'duplicate'|'delete',key:string,disabled=false,separator=false):ObjectMenuItem=>({id:type,label,icon:type,shortcut:key,disabled:blocked||disabled,separator,danger:type==='delete',run:()=>enqueueEdit({type},true)});
 let items:ObjectMenuItem[];
 if(data.text){
  const replace=(text:string,selectionToken:number)=>{if(valid())send('text-replace',{sessionId:data.text!.sessionId,selectionToken,text});};
  const write=()=>{const t=data.text!;if(navigator.clipboard.write&&window.ClipboardItem)return navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([t.selectedText],{type:'text/plain'}),'text/html':new Blob([t.selectedHtml],{type:'text/html'})})]);return navigator.clipboard.writeText(t.selectedText);};
  items=[{id:'cut',label:'剪切',icon:'cut',shortcut:mod+' X',disabled:data.text.collapsed||locked,run:async()=>{const token=data.text!.selectionToken;await write();replace('',token);}},{id:'copy',label:'复制',icon:'copy',shortcut:mod+' C',disabled:data.text.collapsed,run:write},{id:'paste',label:'粘贴',icon:'paste',shortcut:mod+' V',disabled:locked,run:async()=>{const token=data.text!.selectionToken;const text=await navigator.clipboard.readText();replace(text,token);}},{id:'select-all',label:'全选文字',shortcut:mod+' A',separator:true,run:()=>send('text-select-all',{})},{id:'clear-format',label:'清除格式',icon:'clear',disabled:locked,run:()=>send('text-format',{sessionId:data.text!.sessionId,selectionToken:data.text!.selectionToken,property:'clear',value:''})},{id:'text-link',label:'链接…',icon:'link',disabled:locked||data.text.collapsed,run:()=>openTextLink(data)},{id:'end-text',label:'结束文字编辑',separator:true,run:()=>send('text-end',{})},{id:'format',label:'文字设置',icon:'format',run:()=>editorShell.inspect('format')}];
 }else{
  const groups=slide().groups.filter(g=>g.members.some(id=>data.ids.includes(id)));
  const svgSelection=data.info.every(n=>['svg','g','path','rect','circle','ellipse','line','polygon','polyline','text','tspan','use'].includes(n.tag));
  items=[edit('剪切','cut',mod+' X',locked),edit('复制','copy',mod+' C'),edit('粘贴','paste',mod+' V',!clipboard||clipboard.documentId!==documentId),edit('创建副本','duplicate',mod+' D'),
   ...(svgSelection?[{id:'vector-edit',label:'编辑图形',icon:'format',disabled:locked,children:[{label:'编辑顶点',disabled:data.info.length!==1||!['path','rect','circle','ellipse','line','polyline','polygon'].includes(data.info[0].tag),run:()=>send('vector-action',{action:'nodes'})},{label:'编辑文字',disabled:data.info.length!==1||!['text','tspan','textPath'].includes(data.info[0].tag),run:()=>send('vector-action',{action:'text'})},{label:'图形格式',run:()=>editorShell.inspect('format')},{label:'导出 SVG',run:()=>send('vector-action',{action:'export'})}]}]:[]),
   {id:'arrange',label:'排列',icon:'layers',separator:true,disabled:locked||blocked,children:([{action:'front',label:'置于顶层'},{action:'forward',label:'上移一层'},{action:'backward',label:'下移一层'},{action:'back',label:'置于底层'}] as const).map(i=>({id:i.action,label:i.label,run:async()=>{await geometrySession.barrier();if(valid())await changeLayer(i.action);}}))},
   ...(data.ids.length>1?[{id:'group',label:'组合',icon:'group',disabled:locked||blocked,run:()=>svgSelection?send('vector-action',{action:'group'}):commands([{type:'group.set',slideId,id:uuid(),name:'组合',members:data.ids}])}]:[]),
   ...(svgSelection&&data.info[0].tag==='g'?[{id:'svg-ungroup',label:'取消组合',icon:'group',disabled:locked||blocked,run:()=>send('vector-action',{action:'ungroup'})}]:[]),
   ...(groups.length?[{id:'ungroup',label:'取消组合',icon:'group',disabled:locked||blocked,run:()=>commands(groups.map(g=>({type:'group.remove',slideId,id:g.id})))}]:[]),
   {id:'lock',label:locked?'解锁':'锁定',icon:'lock',disabled:blocked||(locked&&!data.ids.some(id=>objects.find(o=>o.id===id)?.locked)),reason:locked&&!data.ids.some(id=>objects.find(o=>o.id===id)?.locked)?'请先解锁父级对象':undefined,run:()=>commands(data.ids.map(target=>({type:'element.lock',slideId,target,locked:!locked})))},
   ...(data.info.length===1&&data.info[0].editableText?[{id:'edit-text',label:'编辑文字',icon:'format',separator:true,disabled:locked,run:()=>send('text-start',{target:data.ids[0]})}]:[]),
   {id:'animation',label:'动画…',icon:'animation',run:()=>editorShell.inspect('animation')},
   {id:'format',label:'设置对象格式',icon:'format',run:()=>editorShell.inspect('format')},edit('删除','delete','Delete',locked,true)];
 }
 const rect=frame.getBoundingClientRect(),scale=rect.width/data.width;
 objectMenu.open(rect.left+data.x*scale,rect.top+data.y*scale,items,formatControls(data),valid);
}
function openTextLink(ctx:MenuContext){
 const dialog=document.createElement('dialog');dialog.className='context-link-dialog';dialog.innerHTML='<form method="dialog"><label>链接地址<input name="url" type="url" placeholder="https://" aria-label="链接地址"></label><footer><button value="cancel">取消</button><button value="remove">移除链接</button><button value="apply" class="primary">应用</button></footer></form>';document.body.append(dialog);dialog.showModal();dialog.querySelector('input')!.focus();dialog.addEventListener('close',()=>{if(['apply','remove'].includes(dialog.returnValue)&&ctx.text?.sessionId===textSession?.sessionId)send('text-format',{sessionId:ctx.text!.sessionId,selectionToken:ctx.text!.selectionToken,property:'link',value:dialog.returnValue==='remove'?'':dialog.querySelector('input')!.value});dialog.remove();});
}
let canvasGesture=false;const gestureWaiters=new Set<()=>void>();
let renderedSlide:Slide|undefined;
let frameRuntimeId = '';
let renderGeneration = 0;
async function render() {
  if(canvasGesture)await new Promise<void>(resolve=>gestureWaiters.add(resolve));
  objectMenu.close();textSession=undefined;
  const generation = ++renderGeneration;
  canvasReady = false;
  canvasLoading.start();
  channel = '';
  frame.inert = true;
  if (!snapshot.document.slides.some((s) => s.id === slideId))
    slideId = normalPages()[0]?.id ?? snapshot.document.slides[0].id;
  const s = slide();
  const pages=normalPages();
  $('slide-count').textContent = String(pages.length);
  for(const id of ['copy-slide','delete-slide','up-slide','down-slide','add-slide'])$<HTMLButtonElement>(id).disabled=!!s.layoutSourceId;
  
  $('page-name').textContent = s.name;
  $('slides').innerHTML = pages
    .map(
      (s, i) =>
        `<button class="slide-card ${s.id === slideId ? 'active' : ''}" data-slide="${s.id}" draggable="true" aria-current="${s.id === slideId ? 'page' : 'false'}" title="拖动排序 · Alt + ↑ / ↓ 调整顺序"><span class="number">${String(i + 1).padStart(2, '0')}${s.hidden ? ' · 已隐藏' : ''}</span><span class="page-thumbnail" data-thumbnail="${s.id}" aria-hidden="true"><span>载入页面…</span></span><span class="name">${esc(s.name)}</span><span class="meta">${esc(s.section || '未分章节')} · ${s.animations.length} 动画</span></button>`,
    )
    .join('');
  editorShell.render(snapshot.document.width, snapshot.document.height, pages.findIndex(s => s.id === slideId), pages.length);
  for (const el of document.querySelectorAll<HTMLElement>('[data-slide]'))
    el.onclick = () => {
      document.body.classList.remove('overview-mode');
      void showPage(el.dataset.slide!).catch(pageError);
    };
  const [nextObjects, previews] = await Promise.all([
    api(`/api/documents/${snapshot.document.id}/slides/${slideId}/objects?version=${snapshot.version}`),
    api(`/api/documents/${snapshot.document.id}/preview?version=${snapshot.version}`),
  ]);
  if (generation !== renderGeneration) return;
  objects = nextObjects;
  selected = new Set([...selected].filter((id) => objects.some((o) => o.id === id)));
  renderObjects();
  set('notes', s.notes);
  if(snapshot)documentUI?.render();
  renderGuides();
  if (generation !== renderGeneration) return;
  previewLease?.stop();
  previewLease = keepPreviewAlive(snapshot.document.id, previews);
  pageThumbnails.update(previews.slides, snapshot.document);
  channel = previews.channel;
  renderedSlide=structuredClone(s);
  frame.src = previews.slides.find((p: { id: string }) => p.id === slideId).url;
  assetLibrary.update(frame.src, s.sourcePath);
  $('empty').hidden = true;
  renderAnimations();
  teachingStepsUI.render();
  renderSelection();
  mark();
  set('step-map', JSON.stringify(s.stepMap ?? []));
  $('shared-layout').innerHTML =
    '<option value="">选择母版</option>' +
    snapshot.document.layouts
      .map((l) => `<option value="${l.id}">${esc(l.name)} · ${snapshot.document.slides.filter(p=>p.layoutId===l.id&&!p.layoutSourceId).length} 页使用</option>`)
      .join('');
  set('shared-layout', s.layoutSourceId ?? s.layoutId ?? '');
  fillLayout();
  layoutValuesUI.render();
  layoutManager.render();
}
// Equations and data charts are edited through their dialogs; their internals stay out of the layer list.
function insideAtomic(o: ObjectInfo) {
  const byId = new Map(objects.map((x) => [x.id, x]));
  for (let p = o.parent ? byId.get(o.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined)
    if (p.attributes['data-notale-tex'] !== undefined || p.attributes['data-notale-chart'] !== undefined) return true;
  return false;
}
function renderObjects() {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const query = value('object-search').trim().toLocaleLowerCase();
  $('objects').innerHTML = objects
    .filter(
      (o) =>
        !query ||
        `${o.attributes['data-notale-name'] ?? ''} ${o.tag} ${o.text} ${o.attributes.id ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .filter(
      (o) =>
        o.attributes.id !== 'stage' && !['aside', 'defs', 'linearGradient', 'stop', 'link'].includes(o.tag) && !insideAtomic(o),
    )
    .map((o) => {
      let depth = 0,
        parent = o.parent;
      while (parent && depth < 5) {
        depth++;
        parent = byId.get(parent)?.parent;
      }
      return `<button class="object-row ${selected.has(o.id) ? 'selected' : ''}" data-object="${o.id}" style="padding-left:${8 + depth * 8}px" title="${esc(o.attributes.id || o.id)}"><small>${esc(o.tag)}</small>${esc((o.attributes['data-notale-name'] || o.text.trim() || o.attributes.alt || o.attributes.id || o.kind).slice(0, 28))}${o.locked ? ' 🔒' : ''}</button>`;
    })
    .join('');
  for (const el of document.querySelectorAll<HTMLElement>('[data-object]'))
    el.onclick = (e) => {
      changeSelection(
        [el.dataset.object!],
        e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace',
      );
      renderObjects();
      renderSelection();
    };
  $('trigger-target').innerHTML = objects
    .map(
      (o) =>
        `<option value="${o.id}">${esc(o.tag + ' ' + (o.text.trim() || o.attributes.id || '').slice(0, 30))}</option>`,
    )
    .join('');
}
let selectionFieldsKey = '',
  bindingRendered = '';
function renderSelection() {
  syncAnimationSelection();
  editorShell.selectionChanged(selected.size > 0);
  renderSelectionTools(objects, selected, slide().groups, canvasReady);
  chartEditor.render();
  equationEditor.render();
  tableInspector.render();
  imageCrop.render();
  richEditor.render();
  linkInspector.render();
  revealPreset.render();
  assetLibrary.selection();
  authoredComponents.render();
  renderComponentNavigation();
  if (canvasReady) send('select', { ids: [...selected] });
  const hasSelection = selected.size > 0;
  $<HTMLButtonElement>('layer-forward').disabled = !hasSelection;
  $<HTMLButtonElement>('layer-backward').disabled = !hasSelection;
  renderConnector();
  renderNativeChart();
  renderScene();
  for (const id of ['apply-format', 'apply-text', 'apply-advanced'])
    $<HTMLButtonElement>(id).disabled = [...selected].some((id) =>
      (slide().connectors ?? []).some((c) => c.id === id),
    );
  $('media-panel').hidden = !selected.size || !['img', 'video', 'audio'].includes(current().tag);
  contextInspector.render(objects, [...selected]);
  if (!selected.size) {
    $('selection-name').textContent = '未选择对象';
    selectionFieldsKey = '';
    typographyUI.render();
    return;
  }
  const o = current(),
    t = slide().transforms[o.id] ?? { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };

  const binding = slide().bindings.find((b) => b.target === o.id),
    bindingValue = String(
      binding?.value ?? rects.find((r) => r.id === o.id)?.value ?? o.attributes.value ?? '',
    ),
    fieldsKey = JSON.stringify([snapshot.document.id, snapshot.version, slideId, [...selected], o, t, binding]);
  // A runtime-ready or repeated selection notification must not overwrite an
  // unfinished form when its authored source has not changed.
  if (fieldsKey === selectionFieldsKey) {
    if ($<HTMLInputElement>('binding-value').value === bindingRendered)
      set('binding-value', bindingValue);
    bindingRendered = bindingValue;
    typographyUI.render();
    return;
  }
  selectionFieldsKey = fieldsKey;
  bindingRendered = bindingValue;
  set('object-name', o.attributes['data-notale-name'] ?? '');
  set('object-text', o.text);
  set('font-size', parseFloat(o.style['font-size']) || 32);
  set('tx', t.x);
  set('ty', t.y);
  set('rotation', t.rotate);
  set('scale', t.scaleX);
  set('object-width', t.width ?? '');
  set('object-height', t.height ?? '');
  const shape = selected.size === 1 && o.tag === 'svg' && !!o.attributes['data-notale-shape'],
    icon = selected.size === 1 && o.tag === 'svg' && !!o.attributes['data-notale-icon'],
    accent = selected.size === 1 && !shape && !icon && (o.attributes['data-notale-smart'] !== undefined || o.attributes['data-notale-wordart'] !== undefined),
    layoutItem = selected.size === 1 && !!o.parent && objects.find((x) => x.id === o.parent)?.attributes['data-notale-smart'] !== undefined
      && ['process', 'list'].includes(objects.find((x) => x.id === o.parent)!.attributes['data-notale-smart']);
  $('shape-fill-field').hidden = !shape;
  $('shape-stroke-field').hidden = !(shape || icon);
  $('accent-field').hidden = !accent;
  $('layout-item-tools').hidden = !layoutItem;
  if (shape || icon || accent) {
    // Templates use CSS variables, so read the resolved colours from the canvas.
    const key = fieldsKey;
    void captureSelection([o.id]).then((capture) => {
      if (selectionFieldsKey !== key) return;
      const css = capture.computedStyles?.[o.id] ?? {};
      if (shape) set('object-fill', toHex(css.fill) ?? '#dee8ff');
      if (shape || icon) set('object-stroke', toHex(css.stroke) ?? '#466ddb');
      if (accent) set('object-accent', toHex(o.style['--accent']) ?? toHex(css['--accent'] ?? css.stroke ?? css.color) ?? '#466ddb');
    }, () => undefined);
  }
  for (const id of ['tx', 'ty', 'rotation', 'scale', 'object-width', 'object-height']) $<HTMLInputElement>(id).dataset.initial = value(id);
  set('color', /^#[0-9a-f]{6}$/i.test(o.style.color ?? '') ? o.style.color : '#263449');
  for (const id of ['font-size', 'color']) $<HTMLInputElement>(id).dataset.initial = value(id);
  set('style-json', JSON.stringify(o.style, null, 2));
  set('attrs-json', '{}');
  if (!$('media-panel').hidden) fillMedia(o);
  const chart = JSON.parse(o.attributes['data-notale-chart'] ?? '{}');
  set('chart-kind', chart.kind ?? 'bar');
  set('chart-title', chart.title ?? '');
  set(
    'chart-colors',
    (chart.colors ?? ['#466ddb', '#28a69b', '#e69444', '#a46bd1', '#dc667a']).join(', '),
  );
  for (const [key, fallback] of Object.entries({
    fontSize: 16,
    textColor: '#273247',
    background: '#ffffff',
    gridColor: '#dce3ed',
    labelAngle: 0,
    labelEvery: 0,
    valueDecimals: 0,
    lineWidth: 3,
    pointRadius: 4,
  }))
    set(`chart-${key}`, chart[key] ?? fallback);
  for (const key of ['showValues', 'showLegend', 'showGrid'])
    $<HTMLInputElement>(`chart-${key}`).checked = chart[key] ?? true;
  set('binding-value', bindingValue);
  set(
    'chart-data',
    o.attributes['data-notale-chart'] ?? '{"labels":["A","B","C"],"values":[48,72,91]}',
  );
  typographyUI.render();
}
let editingAnimation: string | undefined;
let animationSelectionKey = '';
let animationFieldsKey = '';
function showAnimationGroup(kind:string){
  for(const group of document.querySelectorAll<HTMLElement>('.animation-effect-group'))group.hidden=!group.classList.contains(kind);
  for(const tab of document.querySelectorAll<HTMLElement>('[data-animation-category]'))tab.setAttribute('aria-selected',String(tab.dataset.animationCategory===kind));
}
const effectGroups = [
  {name:'进入', kind:'entrance', effects:['draw-stroke','appear','fade-in','fly-in','zoom-in','float-in','bounce-in','wipe-in','split-in']},
  {name:'强调', kind:'emphasis', effects:['pulse','spin']},
  {name:'退出', kind:'exit', effects:['disappear','fade-out','fly-out','zoom-out','wipe-out','split-out']},
  {name:'路径', kind:'motion', effects:['motion']},
];
function resetAnimationDraft() {
  const next=Math.min(500,Math.max(0,...slide().animations.map(a=>a.step))+1);
  if(!$<HTMLSelectElement>('animation-step').querySelector(`option[value="${next}"]`))$('animation-step').append(new Option(`${next} · 单击步骤`,String(next)));
  set('animation-step',next);set('trigger','click');set('duration',.6);set('delay',0);
  set('animation-repeat',1);$<HTMLInputElement>('animation-reverse').checked=false;
  set('dx',-120);set('dy',0);set('easing','ease-out');set('effect-direction','left');
  animationPath.set([{x:0,y:0},{x:200,y:0}]);
}
function syncAnimationSelection() {
  const key = slideId + ':' + [...selected].join(',');
  if (key === animationSelectionKey) return;
  animationSelectionKey = key;
  editingAnimation = selected.size === 1 ? slide().animations.find(a => selected.has(a.target))?.id : undefined;
  if (editingAnimation) fillAnimation(slide().animations.find(a => a.id === editingAnimation)!);
  else resetAnimationDraft();
  renderAnimations();
}
async function previewSingleAnimation(spec?: AnimationSpec) {
  const currentSlide = slideId;
  await whenReady();
  if (currentSlide !== slideId) return;
  const a = spec ?? slide().animations.find(a => a.id === editingAnimation);
  if (!a) throw Error('请先选择一条动画');
  send('animation-preview', { animation: a });
}
async function applyAnimationEffect(effect: string) {
  if (!selected.size) throw Error('请先选择画布对象');
  if(effect==='draw-stroke'&&[...selected].some(id=>!['path','line','polyline','polygon','rect','circle','ellipse','svg','g'].includes(objects.find(o=>o.id===id)?.tag??'')))throw Error('描边绘制适用于矢量图形');
  set('effect', effect);
  if(['appear','disappear'].includes(effect))set('duration',0);
  else if(num('duration')===0)set('duration',.6);
  const edits: Command[] = [];
  let first: string | undefined;
  for (const target of selected) {
    const old = slide().animations.find(a => a.id === editingAnimation && a.target === target);
    const id = old?.id ?? uuid(); first ??= id;
    const animation = {...readAnimation(id), target};
    edits.push({type:'animation.set', slideId, animation} as Command);
  }
  editingAnimation = first;
  await commands(edits);
  await previewSingleAnimation();
}

function animationLabel(id: string, v: string) { return Array.from($<HTMLSelectElement>(id).options).find(o => o.value === v)?.textContent ?? v; }
function renderAnimationFields() {
  $('keyframes').closest<HTMLElement>('label')!.hidden = value('effect') !== 'custom';
  $('animation-custom').hidden = value('effect') !== 'custom';
  for (const id of ['dx', 'dy']) $(id).closest<HTMLElement>('label')!.hidden = !['fly-in','fly-out','float-in'].includes(value('effect'));
  $('trigger-target').closest<HTMLElement>('label')!.hidden = value('trigger') !== 'object';
  $('effect-direction').closest<HTMLElement>('label')!.hidden = !['wipe-in','wipe-out','split-in','split-out','fly-in','fly-out','float-in'].includes(value('effect'));
  $('animation-path').hidden = value('effect') !== 'motion';
}

function renderAnimations() {
  const restoreFocus=$('animations').contains(document.activeElement);
  const s = slide();
  renderAnimationFields();
  if(!s.animations.some(a=>a.id===editingAnimation))editingAnimation=restoreFocus?s.animations.find(a=>selected.has(a.target))?.id:undefined;
  const chosen = s.animations.find(a => a.id === editingAnimation);
  if(chosen && JSON.stringify(chosen)!==animationFieldsKey && !$('animation-settings').contains(document.activeElement)){fillAnimation(chosen);animationFieldsKey=JSON.stringify(chosen);}
  $('animation-target').textContent = selected.size ? `${selected.size > 1 ? `已选 ${selected.size} 个对象` : (objects.find(o=>selected.has(o.id))?.text?.trim().slice(0,30) || '已选对象')}` : '选择对象，添加动画';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-animation-effect]')) {
    button.disabled = !selected.size;
    button.setAttribute('aria-pressed', String(chosen?.effect === button.dataset.animationEffect));
  }
  $('animation-settings').toggleAttribute('disabled', !chosen);
  $('preview-selected-animation').toggleAttribute('disabled', !chosen);
  $('add-animation').toggleAttribute('disabled', !selected.size);
  $('new-animation').toggleAttribute('disabled', !selected.size);
  $('clear-object-animations').toggleAttribute('disabled',!s.animations.some(a=>selected.has(a.target)));

  const oldStep=value('animation-step');
  const lastStep=Math.min(500,Math.max(1,max,...s.animations.map(a=>a.step),Number(oldStep)||0)+1);
  $('animation-step').innerHTML=Array.from({length:lastStep+1},(_,i)=>`<option value="${i}">${i===0?'随页面出现':`${i} · ${esc(s.steps?.[i]?.name ?? '单击步骤')}`}</option>`).join('');
  set('animation-step',oldStep);
  const cues = timeline(s);
  const objectLabel = (id: string) => {
    const object = objects.find(object => object.id === id);
    return object?.attributes['data-notale-name'] || object?.text?.trim().slice(0, 48) || object?.tag || '对象';
  };
  const seconds = (ms: number) => `${Number((ms / 1000).toFixed(3))} 秒`;
  $('animations').innerHTML = cues.map((cue, i) => {
    const a = cue.spec;
    const extent = Math.max(1000, ...cues.filter(other => other.spec.step === a.step && other.eventTarget === cue.eventTarget).map(other => other.end * 1.25));
    const origin = cue.eventTarget ? `点击「${objectLabel(cue.eventTarget)}」后` : '步骤开始后';
    return `<div class="animation-row ${a.id === editingAnimation ? 'is-selected' : ''}" data-cue-id="${a.id}">
      <div class="animation-row-heading"><button class="animation-grip" draggable="true" data-drag-animation="${a.id}" title="拖动调整顺序" aria-label="拖动调整顺序">⠿</button><button class="animation-object" data-edit-animation="${a.id}"><span class="animation-number">${i + 1}</span>${esc(objectLabel(a.target))}</button></div>
      <span class="animation-description">${esc(animationLabel('effect', a.effect))} · ${esc(s.steps?.[a.step]?.name ?? `步骤 ${a.step}`)} · ${esc(animationLabel('trigger', a.trigger))}</span>
      <div class="animation-time-label">${esc(origin)} ${seconds(cue.start)}–${seconds(cue.end)}</div>
      <button class="animation-track" data-extent="${extent}" data-edit-animation="${a.id}" aria-label="编辑${esc(objectLabel(a.target))}的${esc(animationLabel('effect', a.effect))}动画" title="${esc(origin)} ${seconds(cue.start)}–${seconds(cue.end)}"><span style="left:${cue.start / extent * 100}%;width:${(cue.end-cue.start) / extent * 100}%"><i aria-hidden="true"></i></span></button>
      <div class="animation-actions"><button data-preview-animation="${a.id}" title="预览此动画" aria-label="预览此动画">▷</button><button data-copy-animation="${a.id}" title="复制动画" aria-label="复制动画">⧉</button><button data-remove-animation="${a.id}" title="删除动画" aria-label="删除动画">×</button><span class="grow"></span><button data-up-animation="${a.id}" title="上移" aria-label="上移动画" ${i === 0 ? 'disabled' : ''}>↑</button><button data-down-animation="${a.id}" title="下移" aria-label="下移动画" ${i === cues.length - 1 ? 'disabled' : ''}>↓</button></div></div>`;
  }).join('') || '<p class="hint">选择画布对象，为它添加进入、强调或退出动画。</p>';
  $('timeline').innerHTML = cues.map(cue => `<button class="cue" data-edit-animation="${cue.spec.id}">${esc(objectLabel(cue.spec.target))} · ${esc(s.steps?.[cue.spec.step]?.name ?? `步骤 ${cue.spec.step}`)} · ${seconds(cue.start)}–${seconds(cue.end)}${cue.eventTarget ? ' · 点击触发' : ''}</button>`).join('');
  if (!s.animations.some((a) => a.id === editingAnimation)) editingAnimation = undefined;
  $('save-animation').toggleAttribute('disabled', !editingAnimation);
  $('animation-editing').textContent = editingAnimation
    ? `编辑第 ${s.animations.findIndex((a) => a.id === editingAnimation) + 1} 条动画`
    : '点击上方效果，添加动画';
  for (const el of document.querySelectorAll<HTMLElement>('[data-edit-animation]'))
    el.onclick = () => {
      const a = s.animations.find((a) => a.id === el.dataset.editAnimation)!;
      const tool = document.querySelector<HTMLButtonElement>('[data-tool="animation"]')!;
      if (tool.getAttribute('aria-pressed') !== 'true') tool.click();
      editingAnimation = a.id;
      selected = new Set([a.target]);
      animationSelectionKey = slideId + ':' + a.target;
      renderObjects();
      renderSelection();
      fillAnimation(a);
      renderAnimations();
    };
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-preview-animation]')) button.onclick = () => void previewSingleAnimation(s.animations.find(a=>a.id===button.dataset.previewAnimation)).catch(error);
  for (const handle of $('animations').querySelectorAll<HTMLElement>('[data-drag-animation]')) handle.ondragstart = event => {
    event.dataTransfer?.setData('application/notale-animation', handle.dataset.dragAnimation!);
    if(event.dataTransfer) event.dataTransfer.effectAllowed='move';
  };
  for (const row of $('animations').querySelectorAll<HTMLElement>('[data-cue-id]')) {
    row.ondragover = event => { if(event.dataTransfer?.types.includes('application/notale-animation')) {event.preventDefault(); row.classList.add('drag-target');} };
    row.ondragleave = () => row.classList.remove('drag-target');
    row.ondrop = event => {
      event.preventDefault(); row.classList.remove('drag-target');
      const id=event.dataTransfer?.getData('application/notale-animation');
      if(!id || id===row.dataset.cueId || !s.animations.some(a=>a.id===id))return;
      const ids=s.animations.map(a=>a.id).filter(a=>a!==id); ids.splice(ids.indexOf(row.dataset.cueId!),0,id);
      void commands([{type:'animation.reorder',slideId,ids}]).catch(error);
    };
  }
  const timingVersion = snapshot.version, timingDocument = snapshot.document.id, timingSlide = s.id;
  for (const track of $('animations').querySelectorAll<HTMLElement>('.animation-track')) {
    const cue = cues.find(cue => cue.spec.id === track.dataset.editAnimation)!;
    track.setAttribute('aria-description', '拖动调整延迟，拖动条末端调整时长。左右键调整延迟，Shift 加左右键调整时长；Alt 精调，Esc 取消拖动。');
    bindAnimationTiming(track, {
      animation: cue.spec, start: cue.start, extent: Number(track.dataset.extent),
      current: () => snapshot.document.id === timingDocument && snapshot.version === timingVersion && slideId === timingSlide,
      commit: animation => commands([{ type: 'animation.set', slideId: timingSlide, animation }]), error,
    });
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-copy-animation]'))
    el.onclick = () => {
      const a = s.animations.find((a) => a.id === el.dataset.copyAnimation)!,
        id = uuid(),
        ids = s.animations.map((a) => a.id);
      ids.splice(ids.indexOf(a.id) + 1, 0, id);
      void commands([
        { type: 'animation.set', slideId, animation: { ...a, id } },
        { type: 'animation.reorder', slideId, ids },
      ]).catch(error);
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-down-animation]'))
    el.onclick = () => {
      const ids = s.animations.map((a) => a.id),
        at = ids.indexOf(el.dataset.downAnimation!);
      if (at < ids.length - 1) {
        [ids[at], ids[at + 1]] = [ids[at + 1], ids[at]];
        void commands([{ type: 'animation.reorder', slideId, ids }]).catch(error);
      }
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-remove-animation]'))
    el.onclick = () =>
      void commands([{ type: 'animation.remove', slideId, id: el.dataset.removeAnimation }]).catch(
        error,
      );
  for (const el of document.querySelectorAll<HTMLElement>('[data-up-animation]'))
    el.onclick = () => {
      const ids = s.animations.map((a) => a.id),
        index = ids.indexOf(el.dataset.upAnimation!);
      if (index > 0) {
        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
        void commands([{ type: 'animation.reorder', slideId, ids }]).catch(error);
      }
    };
  if(restoreFocus){const focus=editingAnimation?$('animations').querySelector<HTMLButtonElement>(`[data-edit-animation="${editingAnimation}"].animation-object`):$('animations');focus?.focus({preventScroll:true});}
}
function setStep(next: number, animate = true, componentStep?: number) {
  step = Math.max(0, Math.min(max, next));
  set('step', step);
  $('step-label').textContent = `${step} / ${max}`;
  send('seek', { step, animate, ...(componentStep !== undefined ? { componentStep } : {}) });
}
function mode(play: boolean) {
  interacting = play;
  document.body.classList.toggle('interacting', play);
  document.querySelector<HTMLElement>('.tool-rail')!.inert = play;
  document.querySelector<HTMLElement>('.toolbar')!.inert = play;
  $('canvas-hint').textContent = play ? '操作页面中的控件，体验讲授互动' : '双击文字编辑 · Shift 多选';
  $('interact').setAttribute('aria-label', play ? '返回编辑' : '预览讲义');
  $('interact').setAttribute('aria-pressed', String(play));
  send('resize-mode', { reflow: $<HTMLInputElement>('text-reflow').checked });
  send('mode', { mode: play ? 'play' : 'edit' });
  setStep(play ? 0 : max, false, 0);
}
window.addEventListener('message', (e) => {
  if (
    e.source !== frame.contentWindow ||
    e.data?.source !== 'notale-slide' ||
    e.data.channel !== channel
  )
    return;
  const { type, data } = e.data;
  if (type === 'scene-inspect') {
    sceneRequests.get(data.requestId)?.(data);
    sceneRequests.delete(data.requestId);
  }
  if (type === 'native-chart-error') error(new Error(`原生图表：${data.error}`));
  if (type === 'native-chart-inspect') {
    nativeChartRequests.get(data.requestId)?.(data);
    nativeChartRequests.delete(data.requestId);
  }
  if(type==='gesture-active'&&data.runtimeId===frameRuntimeId&&data.slideId===slideId){canvasGesture=!!data.active;if(!canvasGesture){for(const done of gestureWaiters)done();gestureWaiters.clear();}}
  if(type==='editor-flushed'){flushWaiters.get(data.id)?.();flushWaiters.delete(data.id);}
  if(type==='context-dismiss')objectMenu.close();
  if(data?.runtimeId===frameRuntimeId&&data?.slideId===slideId){
    if(type==='text-session-start')textSession={sessionId:data.sessionId,target:data.target};
    if(type==='text-session-end'&&textSession?.sessionId===data.sessionId){textSession=undefined;if(menuContext?.text)objectMenu.close();void textIngress.flush().catch(error);}
    if(type==='text-draft'&&textSession?.sessionId===data.sessionId)textIngress.receive(data as TextDraft);
    if(type==='text-history')enqueueEdit({type:data.action},false);
    if(type==='text-context-state'&&menuContext&&menuContext.text?.sessionId===data.sessionId){menuContext.text=data;objectMenu.refresh(formatControls(menuContext));}
  }
  if(type==='vector-import'&&data.runtimeId===frameRuntimeId&&data.slideId===slideId)void commands([{type:'svg.import',slideId,html:data.html}]).catch(error);
  if(type==='vector-draft'&&data.runtimeId===frameRuntimeId&&data.slideId===slideId)vectorIngress.receive(data);
  if(type==='vector-state'&&data.runtimeId===frameRuntimeId&&data.slideId===slideId){if(data.objects){const ids=new Set(data.objects.map((o:any)=>o.id));if(data.rootId){ids.add(data.rootId);let added=true;while(added){added=false;for(const o of objects)if(o.parent&&ids.has(o.parent)&&!ids.has(o.id)){ids.add(o.id);added=true;}}}objects=[...objects.filter(o=>!ids.has(o.id)),...data.objects];}vectorUI.render(data);}
  if(type==='vector-export'){const url=URL.createObjectURL(new Blob([data.html],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='图形.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(type==='text-error')error(Error(data.message));
  if(type==='object-context' && data.slideId===slideId && data.runtimeId===frameRuntimeId && !interacting)openObjectMenu(data);
  if (type === 'edit-action' && data.slideId === slideId && !interacting)
    enqueueEdit(data.action, true);
  if (type === 'ready' && data.slideId === slideId) {
    frame.inert = false;
    canvasReady = true;
    frameRuntimeId = data.runtimeId;
    canvasLoading.ready();
    nativeMax = data.nativeMax ?? slide().nativeStepCount;
    teachingStepsUI.render();
    for (const done of readyWaiters) done();
    rects = data.objects;
    sourceScenes = data.scenes ?? [];
    max = data.max;
    $<HTMLInputElement>('step').max = String(max);
    mode(interacting);
    send('camera',{scale:editorShell.zoom()});
    if(renderedSlide?.id===slideId)send('author-update',{before:renderedSlide.html,after:slide().html,transforms:slide().transforms});
    const drafts=geometrySession.states(slideId);if(drafts.length)send('geometry-draft',{states:drafts});
    if(geometrySession.count)void geometrySession.drain().catch(error);
    sendSnapping();
    renderSelection();
  }
  if (type === 'select') {
    selectionScope=data.scope;
    changeSelection(Array.isArray(data.ids) ? data.ids : data.id ? [data.id] : []);
    rects = data.objects;
    renderObjects();
    renderSelection();
  }
  if (type === 'text')
    void commands([
      { type: 'element.patch', slideId, target: data.id, patch: { text: data.text } },
    ]).catch(error);
  if (type === 'connector-edit' && data.slideId === slideId && !interacting)
    void commands([
      { type: 'connector.set', slideId, connector: connectorSchema.parse(data.connector) },
    ]).catch(error);
  if (type === 'guide-edit') {
    const pageId = slideId,
      documentId = snapshot.document.id,
      id = data.id ?? uuid();
    guideEdits = guideEdits
      .then(async () => {
        await whenEditsIdle();
        await whenIdle();
        if (snapshot.document.id !== documentId || slideId !== pageId) return;
        const previous = slide().guides.find((g) => g.id === id);
        if (data.id && !previous && !data.create) return;
        const guides = slide().guides.filter((g) => g.id !== id);
        if (!data.remove)
          guides.push({
            id,
            axis: data.axis,
            position: data.delta !== undefined ? previous!.position + data.delta : data.position,
          });
        await commands([{ type: 'slide.update', slideId: pageId, patch: { guides } }]);
        await whenReady();
        if (slideId === pageId && !data.remove) send('guide-focus', { id });
      })
      .catch(error);
  }
  if(type==='camera-hand'&&!interacting)editorShell.hand(!!data.active);
  if(type==='camera-pan'&&!interacting)editorShell.pan(data.x,data.y);
  if (type === 'camera-wheel' && !interacting) editorShell.wheel(data.x,data.y,data.delta);
  if (type === 'geometry-commit' && data.slideId === slideId && data.runtimeId === frameRuntimeId && !interacting) {
    void geometrySession.enqueue(data as GeometryEdit).catch(error);
  }
  if (type === 'box-resize')
    void commands([
      { type: 'element.patch', slideId, target: data.id, patch: { style: data.style } },
      {
        type: 'element.transform',
        slideId,
        target: data.id,
        transform: { width: data.width, height: data.height, matrix: data.matrix },
      },
    ]).catch(error);
  if (type === 'transform')
    void commands([
      {
        type: 'elements.arrange',
        slideId,
        action: data.action ?? 'translate',
        angle: data.angle,
        factorX: data.factorX,
        factorY: data.factorY,
        anchor: data.anchor,
        rectangles: data.rectangles,
        dx: data.dx,
        dy: data.dy,
      },
    ]).catch(error);
  if (type === 'step') {
    step = data.step;
    max = data.max;
    $<HTMLInputElement>('step').max = String(max);
    set('step', step);
    $('step-label').textContent = `${step} / ${max}`;
  }
  if (type === 'edit-error') error(new Error(data.message));
  if (type === 'media-blocked')
    $('media-notice').textContent = '浏览器未允许自动播放，请使用媒体播放按钮。';
  if (type === 'measure') rects = data;
  if (type === 'capture') {
    const callback = captures.get(data.requestId);
    if (callback) {
      captures.delete(data.requestId);
      callback({
        rectangles: data.rectangles,
        computedStyles: data.computedStyles,
        ...(data.nativeChartTargets ? { nativeChartTargets: data.nativeChartTargets } : {}),
        ...(data.nativeChartStates ? { nativeChartStates: data.nativeChartStates } : {}),
        ...(data.componentStates ? { componentStates: data.componentStates } : {}),
        ...(data.canvasSceneStates ? { canvasSceneStates: data.canvasSceneStates } : {}),
      });
    }
  }
  if (
    type === 'navigate' &&
    data.slideId &&
    snapshot.document.slides.some((s) => s.id === data.slideId)
  ) {
    void showPage(data.slideId).catch(pageError);
  }
  if (type === 'navigate' && data.direction) setStep(step + data.direction);
});
let guideEdits: Promise<void> = Promise.resolve();
const snapKey = 'notale-editor-snapping';
function sendSnapping() {
  send('snapping', {
    enabled: $<HTMLInputElement>('snap-enabled').checked,
    visible: $<HTMLInputElement>('guides-visible').checked,
    rulers: $<HTMLInputElement>('rulers-visible').checked,
    grid: num('snap-grid'),
  });
}
for (const id of ['snap-enabled', 'guides-visible', 'snap-grid', 'rulers-visible'])
  $(id).addEventListener('change', () => {
    sendSnapping();
    try {
      localStorage.setItem(
        snapKey,
        JSON.stringify({
          enabled: $<HTMLInputElement>('snap-enabled').checked,
          visible: $<HTMLInputElement>('guides-visible').checked,
          rulers: $<HTMLInputElement>('rulers-visible').checked,
          grid: num('snap-grid'),
        }),
      );
    } catch {}
  });
try {
  const saved = JSON.parse(localStorage.getItem(snapKey) ?? 'null');
  if (saved) {
    $<HTMLInputElement>('snap-enabled').checked = saved.enabled !== false;
    $<HTMLInputElement>('guides-visible').checked = saved.visible !== false;
    $<HTMLInputElement>('rulers-visible').checked = saved.rulers === true;
    set('snap-grid', Math.max(0, Math.min(10000, Number(saved.grid) || 0)));
  }
} catch {}
function renderGuides() {
  $('guide-list').innerHTML = (slide().guides ?? [])
    .map(
      (g) => `<div class="guide-row" data-guide="${g.id}">
    <label>${g.axis === 'x' ? '垂直 X' : '水平 Y'}<input type="number" step="any" data-guide-position="${g.id}" value="${g.position}" aria-label="${g.axis.toUpperCase()} 参考线坐标" /></label>
    <button data-save-guide="${g.id}">更新</button><button data-remove-guide="${g.id}">删除</button></div>`,
    )
    .join('');
  for (const el of document.querySelectorAll<HTMLElement>('[data-save-guide]'))
    el.onclick = () => {
      const id = el.dataset.saveGuide!,
        input = document.querySelector<HTMLInputElement>(`[data-guide-position="${id}"]`)!;
      void commands([
        {
          type: 'slide.update',
          slideId,
          patch: {
            guides: slide().guides.map((g) =>
              g.id === id ? { ...g, position: Number(input.value) } : g,
            ),
          },
        },
      ]).catch(error);
    };
  for (const el of document.querySelectorAll<HTMLElement>('[data-remove-guide]'))
    el.onclick = () =>
      void commands([
        {
          type: 'slide.update',
          slideId,
          patch: { guides: slide().guides.filter((g) => g.id !== el.dataset.removeGuide) },
        },
      ]).catch(error);
}
on('add-guide', () =>
  commands([
    {
      type: 'slide.update',
      slideId,
      patch: {
        guides: [
          ...(slide().guides ?? []),
          { id: uuid(), axis: value('guide-axis'), position: num('guide-position') },
        ],
      },
    },
  ]),
);

for (const tab of document.querySelectorAll<HTMLElement>('[data-tab]'))
  tab.onclick = () => {
    for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]'))
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    for (const t of document.querySelectorAll('[data-tab]'))
      t.classList.toggle('active', t === tab);
    editorShell.selectionChanged(selected.size > 0);
  };
on('apply-text', () =>
  commands([
    { type: 'element.patch', slideId, target: current().id, patch: { text: value('object-text') } },
  ]),
);
on('apply-format', async () => {
  await geometrySession.barrier();
  const ids = ['tx', 'ty', 'rotation', 'scale', 'object-width', 'object-height'];
  const dirty = ids.filter(id => value(id) !== $<HTMLInputElement>(id).dataset.initial);
  if (!dirty.length) return;
  return commands([...selected].map(target => {
    const transform: Slide['transforms'][string] = { ...(slide().transforms[target] ?? { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }) };
    for (const id of dirty) {
      if (id === 'tx') transform.x = num(id);
      if (id === 'ty') transform.y = num(id);
      if (id === 'rotation') transform.rotate = num(id);
      if (id === 'scale') transform.scaleX = transform.scaleY = num(id);
      if (id === 'object-width') transform.width = value(id) ? num(id) : null;
      if (id === 'object-height') transform.height = value(id) ? num(id) : null;
    }
    return { type: 'element.transform', slideId, target, transform };
  }));
});
on('apply-advanced', () =>
  commands([
    {
      type: 'element.patch',
      slideId,
      target: current().id,
      patch: {
        style: JSON.parse(value('style-json')),
        attributes: JSON.parse(value('attrs-json')),
      },
    },
  ]),
);
on('bold', () => typographyUI.toggle('bold'));
on('italic', () => typographyUI.toggle('italic'));
on('lock', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.lock',
      slideId,
      target,
      locked: !objects.find((o) => o.id === target)!.locked,
    })),
  ),
);
function svgLayer(id: string) {
  const object = objects.find((o) => o.id === id);
  return (
    object &&
    isSvgLayer(
      object,
      objects.find((o) => o.id === object.parent),
    )
  );
}
async function changeLayer(action: 'front' | 'back' | 'forward' | 'backward') {
  await whenIdle();
  const targets = [...selected],
    pageId = slideId,
    documentId = snapshot.document.id,
    version = snapshot.version;
  if (!targets.length) return;
  const svg = targets.filter((id) => svgLayer(id)),
    html = targets.filter((id) => !svgLayer(id));
  if (
    html.some((id) => {
      const object = objects.find((o) => o.id === id)!;
      return (
        object.namespace === 'http://www.w3.org/2000/svg' &&
        (object.tag !== 'svg' ||
          objects.find((o) => o.id === object.parent)?.namespace === object.namespace)
      );
    })
  )
    throw new Error('请选择完整 SVG 图形或图形组合，文字片段和条件分支不能作为独立图层排序');
  const parentIds = new Set(html.map((id) => objects.find((object) => object.id === id)?.parent));
  const related = objects
    .filter((object) => parentIds.has(object.parent) || parentIds.has(object.id))
    .map((object) => object.id);
  const capture = html.length ? await captureSelection(related) : undefined;
  if (slideId !== pageId || snapshot.document.id !== documentId || snapshot.version !== version)
    throw new Error('页面在调整层级前已变化，请重试');
  const edits: Command[] = svg.length
    ? [{ type: 'elements.order', slideId: pageId, targets: svg, action }]
    : [];
  if (html.length)
    edits.push(...htmlLayerCommands(pageId, html, objects, capture!.computedStyles, action));
  if (!edits.length) return;
  return commands(edits);
}
on('front', () => changeLayer('front'));
on('back', () => changeLayer('back'));
$('objects').insertAdjacentHTML(
  'beforebegin',
  '<label>查找对象<input id="object-search" placeholder="名称、文字或类型"></label>',
);
$<HTMLInputElement>('object-search').oninput = renderObjects;
$('object-text').closest('label')!.insertAdjacentHTML(
  'beforebegin',
  '<label>对象名称<input id="object-name"></label><button id="save-object-name">保存名称</button><div class="inline"><button id="hide-objects">隐藏所选对象</button><button id="show-objects">显示所选对象</button></div>',
);
on('save-object-name', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { attributes: { 'data-notale-name': value('object-name') } },
    })),
  ),
);
on('hide-objects', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { visibility: 'hidden' } },
    })),
  ),
);
on('show-objects', () =>
  commands(
    [...selected].map((target) => ({
      type: 'element.patch',
      slideId,
      target,
      patch: { style: { visibility: 'visible' } },
    })),
  ),
);
on('layer-forward', () => changeLayer('forward'));
on('layer-backward', () => changeLayer('backward'));
on('group', () =>
  [...selected].every(id=>objects.find(o=>o.id===id)?.namespace==='http://www.w3.org/2000/svg')?send('vector-action',{action:'group'}):commands([{ type: 'group.set', slideId, id: uuid(), name: '组合', members: [...selected] }]),
);
on('ungroup', () =>
  selected.size===1&&objects.find(o=>selected.has(o.id))?.tag==='g'?send('vector-action',{action:'ungroup'}):commands(
    slide()
      .groups.filter((g) => g.members.some((id) => selected.has(id)))
      .map((g) => ({ type: 'group.remove', slideId, id: g.id })),
  ),
);
on('align-left', () => arrange('left'));
on('distribute', () => arrange('distribute-x'));

let sourceScenes: SourceScene[] = [];
let sceneSelection = '';
let sceneValues: Record<string, SceneScalar> | undefined;
let sceneCheckpoint: SceneCheckpoint | undefined;
type SceneInspection = {
  values?: Record<string, SceneScalar>;
  checkpoint?: SceneCheckpoint;
  error?: string;
};
const sceneRequests = new Map<string, (result: SceneInspection) => void>();
function chosenScene() {
  return sourceScenes.find((scene) => scene.id === value('scene-choice'));
}
function renderScene() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const candidates = canvasReady
    ? sourceScenes.filter((scene) => scene.targets.includes(target))
    : [];
  $('scene-panel').hidden = !candidates.length;
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}/${target}/${canvasReady}`;
  if (key === sceneSelection) return;
  sceneSelection = key;
  sceneValues = undefined;
  sceneCheckpoint = undefined;
  $('scene-choice').innerHTML = candidates
    .map((scene) => `<option value="${scene.id}">${esc(scene.name)}</option>`)
    .join('');
  fillScene();
}
function fillScene() {
  const scene = chosenScene();
  $<HTMLButtonElement>('select-scene-root').hidden = !scene?.root;
  sceneValues = undefined;
  sceneCheckpoint = undefined;
  $<HTMLButtonElement>('save-scene').disabled = true;
  $('scene-status').textContent = '读取当前互动状态后，可以保存本次采样和修改启动参数。';
  if (scene?.checkpoint)
    $('scene-status').textContent =
      '在画布中体验互动并调整树的数量或重新抽样，然后读取并保存完整场景状态。';
  $('save-scene').textContent = scene?.checkpoint ? '保存完整场景状态' : '保存场景参数';
  $('scene-parameters').innerHTML = (scene?.checkpoint ? [] : (scene?.parameters ?? []))
    .filter((p) => !p.readonly)
    .map((parameter) => {
      const saved =
        slide().scenes?.find((s) => s.id === scene!.id)?.values[parameter.key] ?? parameter.value;
      if (parameter.choices)
        return `<label>${esc(parameter.label)}<select data-scene-key="${esc(parameter.key)}">${parameter.choices.map((choice) => `<option value="${esc(choice.value)}" ${choice.value === saved ? 'selected' : ''}>${esc(choice.label)}</option>`).join('')}</select></label>`;
      const type =
        typeof parameter.value === 'number'
          ? 'number'
          : typeof parameter.value === 'boolean'
            ? 'checkbox'
            : 'text';
      return `<label>${esc(parameter.label === 'seed' ? '随机种子' : parameter.label)}<input data-scene-key="${esc(parameter.key)}" type="${type}" ${type === 'checkbox' ? (saved ? 'checked' : '') : `value="${esc(saved)}"`} ${type === 'number' ? `step="${parameter.control?.step ?? 'any'}" min="${parameter.control?.min ?? -1e9}" max="${parameter.control?.max ?? 1e9}"` : ''}/></label>`;
    })
    .join('');
}
$<HTMLSelectElement>('scene-choice').onchange = fillScene;
on('select-scene-root', () => {
  const root = chosenScene()?.root;
  if (root) {
    changeSelection([root]);
    renderSelection();
  }
});
on('read-scene', async () => {
  await whenReady();
  const scene = chosenScene(),
    key = sceneSelection;
  if (!scene) throw new Error('请先选择互动场景');
  const requestId = uuid();
  const result = await new Promise<SceneInspection>((resolve, reject) => {
    const timer = setTimeout(() => {
      sceneRequests.delete(requestId);
      reject(new Error('场景未响应'));
    }, 5000);
    sceneRequests.set(requestId, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    send('scene-inspect', { requestId, sceneId: scene.id });
  });
  if (key !== sceneSelection || chosenScene()?.id !== scene.id) return;
  if (result.error || !result.values) throw new Error(result.error ?? '无法读取场景');
  sceneValues = sceneValuesSchema.parse(result.values);
  if (scene.checkpoint) sceneCheckpoint = sceneCheckpointSchema.parse(result.checkpoint);
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[data-scene-key]',
  )) {
    const v = sceneValues[input.dataset.sceneKey!];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
  }
  $('scene-status').textContent = '已读取当前互动状态；保存后重新打开将使用这些参数。';
  if (sceneCheckpoint)
    $('scene-status').textContent =
      `已读取第 ${sceneCheckpoint.state.runCount} 次抽样、${sceneCheckpoint.state.m} 棵树及预测历史，保存后可继续互动。`;
  $<HTMLButtonElement>('save-scene').disabled = false;
});
on('save-scene', () => {
  const scene = chosenScene();
  if (!scene || !sceneValues) throw new Error('请先读取当前互动状态');
  if (scene.checkpoint) {
    if (!sceneCheckpoint) throw new Error('请先读取完整场景状态');
    return commands([
      { type: 'scene.checkpoint', slideId, sceneId: scene.id, checkpoint: sceneCheckpoint },
    ]);
  }
  const values: Record<string, SceneScalar> = {};
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[data-scene-key]',
  )) {
    const key = input.dataset.sceneKey!,
      parameter = scene.parameters.find((p) => p.key === key)!;
    if (
      (input instanceof HTMLSelectElement && input.selectedIndex < 0) ||
      (typeof parameter.value === 'number' && input.value.trim() === '')
    )
      throw new Error(`请为 ${parameter.label} 选择或输入有效值`);
    values[key] =
      typeof parameter.value === 'number'
        ? Number(input.value)
        : typeof parameter.value === 'boolean'
          ? input instanceof HTMLInputElement
            ? input.checked
            : input.value === 'true'
          : input.value;
  }
  return commands([
    { type: 'scene.set', slideId, sceneId: scene.id, values: sceneValuesSchema.parse(values) },
  ]);
});
on('reset-scene', () => {
  const scene = chosenScene();
  if (!scene) throw new Error('请先选择互动场景');
  return commands([{ type: 'scene.remove', slideId, sceneId: scene.id }]);
});

const nativeChartRequests = new Map<string, (result: NativeChartInspection) => void>();
$('native-chart-panel').insertAdjacentHTML(
  'beforeend',
  `<div id="native-chart-interaction" hidden>
    <label>学习率<select id="native-chart-value"><option value="1.0">1.0 过冲</option><option value="0.1">0.1 推荐</option><option value="0.02">0.02 保守</option></select></label>
    <button id="save-native-chart-state">保存互动选择</button>
    <label>按钮状态<select id="native-chart-appearance-state"><option value="active">选中</option><option value="inactive">未选中</option></select></label>
    <label>背景色<input id="native-chart-backgroundColor" /></label>
    <label>文字颜色<input id="native-chart-color-state" /></label>
    <label>边框颜色<input id="native-chart-borderColor" /></label>
    <label>字重<input id="native-chart-fontWeight" /></label>
    <button id="save-native-chart-appearance">保存状态样式</button>
  </div>`,
);
$('native-chart-panel').insertAdjacentHTML(
  'afterend',
  '<fieldset id="component-members" hidden><legend>互动组件</legend><label>编辑对象<select id="component-member"></select></label><button id="select-component-member">选择对象</button></fieldset>',
);
function currentComponent(): NativeChartInteraction | undefined {
  return (
    slide().nativeCharts?.[[...selected][0] ?? '']?.interaction ?? nativeChartInspection?.component
  );
}
function componentAdoption(): Command[] {
  const target = current().id;
  if (slide().nativeCharts?.[target]?.interaction) return [];
  const component =
    nativeChartInspection?.target === target ? nativeChartInspection.component : undefined;
  if (!component) throw new Error('请先读取当前组件');
  const { value, active, inactive } = component;
  return [{ type: 'native-chart.component', slideId, target, state: { value, active, inactive } }];
}
on('save-native-chart-state', () =>
  commands([
    ...componentAdoption(),
    {
      type: 'native-chart.state',
      slideId,
      target: current().id,
      value: value('native-chart-value'),
    },
  ]),
);
const appearanceInputs = {
  backgroundColor: 'native-chart-backgroundColor',
  color: 'native-chart-color-state',
  borderColor: 'native-chart-borderColor',
  fontWeight: 'native-chart-fontWeight',
} as const;
function fillComponentAppearance() {
  const state = value('native-chart-appearance-state') as 'active' | 'inactive';
  const appearance = currentComponent()?.[state];
  if (appearance)
    for (const [key, input] of Object.entries(appearanceInputs))
      set(input, appearance[key as keyof typeof appearance]);
}
$<HTMLSelectElement>('native-chart-appearance-state').onchange = fillComponentAppearance;
on('save-native-chart-appearance', () => {
  const state = value('native-chart-appearance-state') as 'active' | 'inactive';
  const before = currentComponent()?.[state];
  if (!before) throw new Error('请先读取当前组件');
  const patch: Record<string, string> = {};
  for (const [key, input] of Object.entries(appearanceInputs)) {
    const next = value(input).trim(),
      property = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    if (!CSS.supports(property, next))
      throw new Error(`无效的${$(input).closest('label')?.firstChild?.textContent ?? '样式'}`);
    if (next !== before[key as keyof typeof before]) patch[key] = next;
  }
  if (!Object.keys(patch).length) return;
  return commands([
    ...componentAdoption(),
    {
      type: 'native-chart.appearance',
      slideId,
      target: current().id,
      state,
      patch: nativeChartAppearancePatchSchema.parse(patch),
    },
  ]);
});
function renderComponentNavigation() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const entries = Object.entries(slide().nativeCharts ?? {}).filter(
    ([, chart]) => chart.interaction,
  );
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}`;
  if (key !== componentDiscoveryKey) {
    componentDiscoveryKey = key;
    componentDiscoveries.clear();
  }
  if (nativeChartSelection.startsWith(`${key}/`) && nativeChartInspection?.component)
    componentDiscoveries.set(nativeChartInspection.target, nativeChartInspection.component);
  for (const [id, component] of componentDiscoveries)
    if (!entries.some(([target]) => target === id))
      entries.push([id, { adapter: 'echarts', option: {}, interaction: component }]);
  const entry = entries.find(([, chart]) => {
    let id: string | undefined = target;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === chart.interaction!.root) return true;
      seen.add(id);
      id = objects.find((object) => object.id === id)?.parent;
    }
    return false;
  });
  $('component-members').hidden = !entry;
  if (!entry) return;
  const [id, chart] = entry,
    component = chart.interaction!;
  $('component-member').innerHTML = [
    [component.root, '整个组件'],
    [id, '图表'],
    ...Object.entries(component.controls).map(([value, id]) => [id, `按钮 ${value}`]),
    ...Object.entries(component.metrics).map(([key, id]) => [
      id,
      (
        {
          optM: '最佳轮数',
          minErr: '最低验证误差',
          overfit: '后期反弹',
          verdict: '结论',
        } as Record<string, string>
      )[key],
    ]),
  ]
    .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`)
    .join('');
  set(
    'component-member',
    [
      component.root,
      id,
      ...Object.values(component.controls),
      ...Object.values(component.metrics),
    ].includes(target)
      ? target
      : component.root,
  );
}
on('select-component-member', () => {
  changeSelection([value('component-member')]);
  renderObjects();
  renderSelection();
});
const componentDiscoveries = new Map<string, NativeChartInteraction>();
let componentDiscoveryKey = '';
let nativeChartInspection: NativeChartInspection | undefined;
let nativeChartSelection = '';
function renderNativeChart() {
  const target = selected.size === 1 ? [...selected][0] : '';
  const key = `${snapshot.document.id}/${slideId}/${snapshot.version}/${target}`;
  const available =
    !!target &&
    (rects.some((r) => r.id === target && r.nativeChart) || !!slide().nativeCharts?.[target]);
  $('native-chart-panel').hidden = !available;
  $('native-chart-interaction').hidden = !(
    slide().nativeCharts?.[target]?.interaction ||
    (key === nativeChartSelection && nativeChartInspection?.component)
  );
  if (key === nativeChartSelection) return;
  nativeChartSelection = key;
  nativeChartInspection = undefined;
  set('native-chart-value', slide().nativeCharts?.[target]?.interaction?.value ?? '0.1');
  fillComponentAppearance();
  $('native-chart-series').innerHTML = '';
  set('native-chart-option', JSON.stringify(slide().nativeCharts?.[target]?.option ?? {}, null, 2));
  $('native-chart-status').textContent = '读取图表后可编辑序列数据与样式。';
  $<HTMLButtonElement>('save-native-chart-series').disabled = true;
}
async function inspectNativeChart() {
  await whenReady();
  const target = current().id,
    key = nativeChartSelection,
    requestId = uuid();
  const result = await new Promise<NativeChartInspection>((resolve, reject) => {
    const timer = setTimeout(() => {
      nativeChartRequests.delete(requestId);
      reject(new Error('图表未响应'));
    }, 5000);
    nativeChartRequests.set(requestId, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    send('native-chart-inspect', { requestId, target });
  });
  if (key !== nativeChartSelection) return;
  if (!result.available || result.error) throw new Error(result.error ?? '图表实例不可用');
  nativeChartInspection = result;
  if (result.value) set('native-chart-value', result.value);
  $('native-chart-interaction').hidden =
    !result.component && !slide().nativeCharts?.[target]?.interaction;
  fillComponentAppearance();
  renderComponentNavigation();
  $('native-chart-series').innerHTML = result.series
    .map((s, i) => `<option value="${i}">${esc(s.name || `序列 ${i + 1}`)}</option>`)
    .join('');
  $('native-chart-status').textContent =
    `${result.series.length} 个序列；未固定的数据继续响应原页面互动。`;
  $<HTMLButtonElement>('save-native-chart-series').disabled = !result.series.length;
  fillNativeSeries();
}
function fillNativeSeries() {
  const index = num('native-chart-series'),
    series = nativeChartInspection?.series[index];
  if (!series) return;
  set('native-chart-name', series.name);
  set('native-chart-color', series.color);
  set('native-chart-width', series.width);
  set('native-chart-data', JSON.stringify(series.data, null, 2));
  $<HTMLInputElement>('native-chart-symbols').checked = series.showSymbol;
  $<HTMLInputElement>('native-chart-save-data').checked =
    slide().nativeCharts?.[current().id]?.option.series?.[index]?.data !== undefined;
}
on('inspect-native-chart', inspectNativeChart);
$<HTMLSelectElement>('native-chart-series').onchange = fillNativeSeries;
on('save-native-chart-series', () => {
  const target = current().id;
  if (!nativeChartInspection || nativeChartInspection.target !== target)
    throw new Error('请先读取当前图表');
  const index = num('native-chart-series');
  const option = structuredClone(slide().nativeCharts?.[target]?.option ?? {});
  option.series ??= [];
  while (option.series.length <= index) option.series.push({});
  const patch = option.series[index];
  patch.name = value('native-chart-name');
  patch.lineStyle = {
    ...patch.lineStyle,
    color: value('native-chart-color'),
    width: num('native-chart-width'),
  };
  patch.itemStyle = { ...patch.itemStyle, color: value('native-chart-color') };
  patch.showSymbol = $<HTMLInputElement>('native-chart-symbols').checked;
  if ($<HTMLInputElement>('native-chart-save-data').checked)
    patch.data = JSON.parse(value('native-chart-data'));
  else delete patch.data;
  return commands([
    { type: 'native-chart.set', slideId, target, option: nativeChartOptionSchema.parse(option) },
  ]);
});
on('save-native-chart-option', () =>
  commands([
    {
      type: 'native-chart.set',
      slideId,
      target: current().id,
      option: nativeChartOptionSchema.parse(JSON.parse(value('native-chart-option'))),
    },
  ]),
);
on('reset-native-chart', () =>
  commands([{ type: 'native-chart.remove', slideId, target: current().id }]),
);

on('save-binding', () => {
  const o = current();
  return commands([
    {
      type: 'binding.set',
      slideId,
      binding: {
        id: slide().bindings.find((b) => b.target === o.id)?.id ?? uuid(),
        target: o.id,
        label: o.attributes.id ?? o.tag,
        value:
          o.attributes.type === 'checkbox'
            ? value('binding-value') === 'true'
            : value('binding-value'),
        event: o.tag === 'select' ? 'change' : 'input',
      },
    },
  ]);
});
function fillAnimation(a: AnimationSpec) {
  set('effect', a.effect);
  showAnimationGroup(effectGroups.find(g=>g.effects.includes(a.effect))?.kind??'entrance');
  if(!$<HTMLSelectElement>('animation-step').querySelector(`option[value="${a.step}"]`))$('animation-step').append(new Option(`${a.step} · 单击步骤`,String(a.step)));
  set('animation-step', a.step);
  set('duration', a.duration / 1000);
  set('delay', a.delay / 1000);
  set('trigger', a.trigger);
  set('trigger-target', a.triggerTarget ?? '');
  set('dx', a.dx);
  set('dy', a.dy);
  set('easing', a.easing);
  set('animation-repeat',a.repeat ?? 1);
  $<HTMLInputElement>('animation-reverse').checked = a.autoReverse ?? false;
  set('effect-direction',a.effectDirection ?? 'left');
  animationPath.set(a.path ?? [{x:0,y:0},{x:a.dx,y:a.dy}]);
  set(
    'keyframes',
    JSON.stringify(
      a.keyframes ?? [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 1 },
      ],
      null,
      2,
    ),
  );
}
function readAnimation(id: string) {
  return {
    id,
    target: current().id,
    effect: value('effect'),
    step: num('animation-step'),
    duration: Math.round(num('duration') * 1000),
    delay: Math.round(num('delay') * 1000),
    trigger: value('trigger'),
    ...(value('trigger') === 'object' ? { triggerTarget: value('trigger-target') } : {}),
    dx: num('dx'),
    dy: num('dy'),
    easing: value('easing'),
    repeat: num('animation-repeat'),
    autoReverse: $<HTMLInputElement>('animation-reverse').checked,
    effectDirection: value('effect-direction'),
    ...(value('effect') === 'motion' ? {path:animationPath.get()} : {}),
    ...(value('effect') === 'custom' ? { keyframes: JSON.parse(value('keyframes')) } : {}),
  };
}
$('effect').insertAdjacentHTML('beforeend', Object.entries({'disappear':'消失','zoom-out':'缩小退出','wipe-in':'擦除','wipe-out':'擦除退出','split-in':'劈裂','split-out':'闭合','float-in':'浮入','bounce-in':'弹跳','custom':'自定义效果'}).map(([value,label])=>`<option value="${value}">${label}</option>`).join(''));
$('animation-settings').insertAdjacentHTML('beforeend', '<label>垂直位移<input id="dy" type="number" value="0"></label><label>缓动<select id="easing"><option value="ease-out">减速</option><option value="linear">线性</option><option value="ease">平滑</option><option value="ease-in">加速</option><option value="ease-in-out">加速后减速</option></select></label><details id="animation-custom" hidden><summary>自定义效果数据</summary><label>关键帧<textarea id="keyframes" rows="4">[{"opacity":0,"offset":0},{"opacity":1,"offset":1}]</textarea></label></details>');
const effectSymbol:Record<string,string>={'draw-stroke':'✎','appear':'◈','fade-in':'◌','fly-in':'↘','zoom-in':'⤢','float-in':'↑','bounce-in':'↟','wipe-in':'▥','split-in':'◧','pulse':'✦','spin':'⟳','disappear':'◇','fade-out':'◌','fly-out':'↗','zoom-out':'⤡','wipe-out':'▥','split-out':'◨','motion':'↝'};
$('animation-gallery').innerHTML = `<div class="animation-category-tabs" role="tablist" aria-label="动画效果分类">${effectGroups.map(g=>`<button role="tab" data-animation-category="${g.kind}" aria-selected="${g.kind==='entrance'}">${g.name}</button>`).join('')}</div>`+effectGroups.map(group=>`<section class="animation-effect-group ${group.kind}" ${group.kind==='entrance'?'':'hidden'}><div>${group.effects.map(effect=>`<button data-animation-effect="${effect}" title="${animationLabel('effect',effect)}"><span class="effect-symbol" aria-hidden="true">${effectSymbol[effect]}</span><span>${animationLabel('effect',effect)}</span></button>`).join('')}</div></section>`).join('');
$('animation-gallery').insertAdjacentHTML('afterbegin','<button id="clear-object-animations" title="移除所选对象的全部动画">无动画</button>');
on('clear-object-animations',()=>commands(slide().animations.filter(a=>selected.has(a.target)).map(a=>({type:'animation.remove',slideId,id:a.id}))));
for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-animation-category]'))tab.onclick=()=>showAnimationGroup(tab.dataset.animationCategory!);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-animation-effect]')) button.onclick=()=>void applyAnimationEffect(button.dataset.animationEffect!).catch(error);
$('animation-settings').insertAdjacentHTML('beforeend','<label>效果方向<select id="effect-direction"><option value="left">从左侧</option><option value="right">从右侧</option><option value="up">从上方</option><option value="down">从下方</option></select></label><div class="field-grid"><label>重复次数<input id="animation-repeat" type="number" min="1" max="20" step="1" value="1"></label><label class="animation-check"><input id="animation-reverse" type="checkbox">自动反向</label></div><details id="animation-path" hidden></details>');
const advancedAnimation=document.createElement('details');advancedAnimation.className='animation-advanced';advancedAnimation.innerHTML='<summary>更多效果选项</summary>';
for(const id of ['easing','animation-repeat','animation-reverse']) {
 const label=$(id).closest<HTMLElement>('label')!;advancedAnimation.append(label);
}
$('animation-settings').append(advancedAnimation);
$('effect').closest<HTMLElement>('label')!.hidden=true;
let animationUpdate: Promise<unknown> = Promise.resolve();
function saveAnimationFields() {
  renderAnimationFields();
  if (!editingAnimation) return;
  if (!$<HTMLFieldSetElement>('animation-settings').checkValidity()) return;
  // An object trigger is incomplete until its target is chosen; saving it would be rejected and pause the sync journal.
  if (value('trigger') === 'object' && !value('trigger-target')) return;
  let animation: ReturnType<typeof readAnimation>;
  try {animation=readAnimation(editingAnimation);} catch(e) {error(e);return;}
  const targetSlide=slideId, id=editingAnimation;
  animationUpdate=animationUpdate.catch(()=>{}).then(()=>commands([{type:'animation.set',slideId:targetSlide,animation} as Command])).then(()=>{if(slideId===targetSlide&&editingAnimation===id)return previewSingleAnimation();}).catch(error);
}
const animationPath=createAnimationPath($('animation-path'),saveAnimationFields);
animationPath.set([{x:0,y:0},{x:200,y:0}]);
for (const field of $('animation-settings').querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')) {
  if(field.closest('#animation-path'))continue;
  field.addEventListener('change',()=>{
    if(!field.reportValidity())return;
    if(field.id==='trigger') {
      const index=slide().animations.findIndex(a=>a.id===editingAnimation),previous=slide().animations[index-1];
      if(previous && ['with-previous','after-previous'].includes(value('trigger')))set('animation-step',previous.step);
      else if(previous && value('trigger')==='click')set('animation-step',Math.min(500,previous.step+1));
    }
    if(field.id==='effect-direction' && ['fly-in','fly-out','float-in'].includes(value('effect'))) {
      const distance=Math.max(Math.abs(num('dx')),Math.abs(num('dy')),120),d=value('effect-direction');
      set('dx',d==='left'?-distance:d==='right'?distance:0);set('dy',d==='up'?-distance:d==='down'?distance:0);
    }
    saveAnimationFields();
  });
}
on('add-animation', () => applyAnimationEffect(value('effect')));
on('save-animation', () => {if(editingAnimation)return commands([{type:'animation.set',slideId,animation:readAnimation(editingAnimation)}]);});
on('new-animation', () => {
  editingAnimation=undefined;
  resetAnimationDraft();
  renderAnimations();
  $('animation-gallery').scrollIntoView({block:'nearest'});
});
$('animations').tabIndex=0;
$('animations').addEventListener('keydown',event=>{
  const row=(event.target as HTMLElement).closest<HTMLElement>('[data-cue-id]');
  if(!row){if(['Delete','Backspace','ArrowUp','ArrowDown'].includes(event.key)||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();event.stopPropagation();}return;}
  let action:HTMLButtonElement|null=null;
  if(event.key==='Delete'||event.key==='Backspace')action=row.querySelector('[data-remove-animation]');
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d')action=row.querySelector('[data-copy-animation]');
  else if(['ArrowUp','ArrowDown'].includes(event.key)) {
    if(event.altKey)action=row.querySelector(event.key==='ArrowUp'?'[data-up-animation]':'[data-down-animation]');
    else action=(event.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling)?.querySelector<HTMLButtonElement>('.animation-object')??null;
    event.preventDefault();event.stopPropagation();
  }
  if(action){event.preventDefault();event.stopPropagation();action.click();}
});
on('preview-selected-animation', () => previewSingleAnimation());
on('stop-animation-preview', () => send('animation-preview-stop',{}));
on('preview-animation', () => previewOverlay.open());
on('interact', () => interacting ? mode(false) : previewOverlay.open());
on('step-prev', () => setStep(step - 1));
on('step-next', () => setStep(step + 1));
$<HTMLInputElement>('step').oninput = () => setStep(num('step'), false);
on('save-notes', () =>
  commands([{ type: 'slide.update', slideId, patch: { notes: value('notes') } }]),
);
on('copy-slide', () => {
  const id = uuid();
  return commands([{ type: 'slide.duplicate', slideId, newId: id }], true, id);
});
on('delete-slide', () => {
  const pages=normalPages(),at=pages.findIndex(s=>s.id===slideId),next=pages[at+1]??pages[at-1];
  return commands([{ type: 'slide.delete', slideId }], true, next?.id);
});
on('up-slide',()=>moveNormalPage(slideId,Math.max(0,normalPages().findIndex(page=>page.id===slideId)-1)));
on('down-slide',()=>moveNormalPage(slideId,Math.min(normalPages().length-1,normalPages().findIndex(page=>page.id===slideId)+1)));
on('add-slide', () => {
  const id = uuid();
  return commands(
    [
      {
        type: 'slide.insert',
        after: slideId,
        slide: {
          id,
          name: '新页面',
          sourcePath: `${id}.html`,
          html: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f7f9fc;font-family:system-ui}#stage{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center}</style></head><body><main id="stage">${template('text', '新页面')}</main></body></html>`,
        },
      },
    ],
    true,
    id,
  );
});
let uploadAction:
  | { kind: string; target?: string; poster?: boolean; documentId: string; slideId: string }
  | undefined;
function chooseMedia(kind: string, target?: string, poster = false) {
  uploadAction = { kind, target, poster, documentId: snapshot.document.id, slideId };
  $<HTMLInputElement>('media-file').accept = kind === 'image' ? 'image/*' : `${kind}/*`;
  $('media-file').click();
}
async function uploadAsset(bytes: Uint8Array, mime: string) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return api('/api/assets', { data: btoa(binary), mime: mime || 'application/octet-stream' });
}
// KaTeX HTML output needs one stylesheet (fonts are inlined). Reuse the lecture's
// own copy when the import brought one; otherwise store the bundled copy once.
async function insertEquation() {
  const existing = Object.keys(snapshot.document.assets).find((p) => p.endsWith('lib/katex.min.css')),
    path = existing ?? 'assets/lib/katex.min.css',
    href = '../'.repeat(slide().sourcePath.split('/').length - 1) + path.split('/').map(encodeURIComponent).join('/'),
    edits: unknown[] = [];
  if (!existing) {
    const response = await fetch('/katex.min.css');
    if (!response.ok) throw new Error('无法加载公式样式');
    edits.push({ type: 'asset.put', path, asset: await uploadAsset(new Uint8Array(await response.arrayBuffer()), 'text/css') });
  }
  edits.push({ type: 'element.insert', slideId, html: template('equation', DEFAULT_TEX, href) });
  return commands(edits);
}
function insertObject(kind: string, value?: string) {
  if (kind === 'connector') return createConnector();
  if (['image', 'video', 'audio'].includes(kind)) {
    chooseMedia(kind);
    return;
  }
  if (kind === 'equation') return insertEquation();
  return commands([{ type: 'element.insert', slideId, html: template(kind, value) }]);
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-insert]')) {
  button.addEventListener('click', () => Promise.resolve().then(() => insertObject(button.dataset.insert!, button.dataset.symbol)).catch(error));
}
$<HTMLInputElement>('media-file').onchange = () =>
  void (async () => {
    const input = $<HTMLInputElement>('media-file'),
      file = input.files?.[0],
      action = uploadAction;
    input.value = '';
    uploadAction = undefined;
    if (!file || !action) return;
    if (action.documentId !== snapshot.document.id || action.slideId !== slideId)
      throw new Error('页面已切换，请重新选择媒体');
    if (file.type && !file.type.startsWith(action.kind + '/'))
      throw new Error('文件类型与所选媒体类型不符');
    if(!action.target&&(file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg'))){await commands([{type:'svg.import',slideId,html:prepareSvgImport(await file.text())}]);return;}
    const asset = await uploadAsset(new Uint8Array(await file.arrayBuffer()), file.type),
      path = `media/${uuid()}/${file.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'media.bin'}`,
      src = '../'.repeat(slide().sourcePath.split('/').length - 1) + path.split('/').map(encodeURIComponent).join('/');
    await commands([
      { type: 'asset.put', path, asset },
      action.target
        ? {
            type: 'media.update',
            slideId,
            target: action.target,
            patch: action.poster ? { poster: src } : { src },
          }
        : { type: 'element.insert', slideId, html: template(action.kind, src) },
    ]);
  })().catch(error);
async function restore(
  version: number,
  after: HistoryPlan = { undo: [...undo], redo: [] },
  historyAction?: 'undo'|'redo',
) {
  await geometrySession.barrier();
  if (pending) throw new Error('请先处理待确认修改');
  await geometrySession.submit({
    kind: 'restore',
    inverseVersion:historyAction?version:undefined,historyAction,
    documentId: snapshot.document.id,
    request: { version, baseVersion: snapshot.version, mutationId: uuid() },
    after,
    slideId,
    selection: [...selected],
  });
}
async function undoEdit() {
  if(await geometrySession.undo())return;
  await geometrySession.barrier();
  if (!undo.length) return;
  await restore(undo.at(-1)!, { undo: undo.slice(0, -1), redo: [...redo] },'undo');
}
async function redoEdit() {
  if(await geometrySession.redo())return;
  await geometrySession.barrier();
  if (!redo.length) return;
  await restore(redo.at(-1)!, { undo: [...undo], redo: redo.slice(0, -1) },'redo');
}
on('undo', undoEdit);
on('redo', redoEdit);

on('export', async () => {
  await flushAuthor();
  location.href = `/api/documents/${snapshot.document.id}/export?version=${snapshot.version}`;
});
$<HTMLInputElement>('import').onchange = () =>
  void (async () => {
    const file = $<HTMLInputElement>('import').files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await api('/api/import', { data });
    await init(result.document.id);
  })().catch(error);
on('overview', () => document.body.classList.toggle('overview-mode'));
async function show(speaker = false) {
  const viewer=window.open('about:blank','_blank');
  try{await flushAuthor();const url=`/show.html?document=${snapshot.document.id}&version=${snapshot.version}&slide=${slideId}${speaker?'&speaker=1':''}`;if(viewer)viewer.location.href=url;else throw Error('请允许打开讲授窗口');}catch(e){viewer?.close();throw e;}
}
on('present', () => show());
on('speaker', () => show(true));
type QueuedEdit = {
  action: EditAction;
  documentId: string;
  slideId: string;
  ids: string[];
  focusCanvas: boolean;
};
const editQueue: QueuedEdit[] = [];
let editTimer: ReturnType<typeof setTimeout> | undefined,
  editingKeys = false;
const editWaiters = new Set<() => void>();
function whenEditsIdle(): Promise<void> {
  return editingKeys || editQueue.length
    ? new Promise((resolve) => editWaiters.add(resolve))
    : Promise.resolve();
}
function enqueueEdit(action: EditAction, focusCanvas = false) {
  if (
    !snapshot ||
    interacting ||
    !action ||
    ![
      'nudge',
      'copy',
      'cut',
      'paste',
      'duplicate',
      'delete',
      'undo',
      'redo',
      'clear',
      'select-all',
      'save',
    ].includes(action.type)
  )
    return;
  if (
    action.type === 'nudge' &&
    (!Number.isFinite(action.dx) ||
      !Number.isFinite(action.dy) ||
      Math.abs(action.dx) > 10 ||
      Math.abs(action.dy) > 10)
  )
    return;
  const item = {
    action,
    documentId: snapshot.document.id,
    slideId,
    ids: [...selected],
    focusCanvas,
  };
  const last = editQueue.at(-1);
  if (
    last?.action.type === 'nudge' &&
    action.type === 'nudge' &&
    last.documentId === item.documentId &&
    last.slideId === slideId &&
    JSON.stringify(last.ids) === JSON.stringify(item.ids)
  ) {
    last.action.dx += action.dx;
    last.action.dy += action.dy;
  } else editQueue.push(item);
  clearTimeout(editTimer);
  editTimer = setTimeout(() => void drainEdits(), action.type === 'nudge' ? 100 : 0);
}
async function drainEdits() {
  if (editingKeys) return;
  editingKeys = true;
  try {
    while (editQueue.length) {
      const nextAction = editQueue[0]?.action.type;
      if(nextAction==='undo'&&await textIngress.undo()){editQueue.shift();continue;}
      if(nextAction==='redo'&&await textIngress.redo()){editQueue.shift();continue;}
      await textIngress.flush();
      if(nextAction==='undo' && geometrySession.canUndo){editQueue.shift();await geometrySession.undo();continue;}
      if(nextAction==='redo' && geometrySession.canRedo){editQueue.shift();await geometrySession.redo();continue;}
      if(geometrySession.count)await geometrySession.barrier();
      await whenIdle();
      await whenReady();
      const item = editQueue.shift()!;
      if (item.documentId !== snapshot.document.id || item.slideId !== slideId)
        throw new Error('页面已切换，未执行剩余快捷键操作');
      if (pending) throw new Error('有待确认修改，请先重试保存');
      const action = item.action;
      if (['nudge', 'copy', 'cut', 'delete', 'duplicate'].includes(action.type)) {
        changeSelection(item.ids);
        renderObjects();
        renderSelection();
        if (!selected.size) continue;
      }
      if (['nudge', 'delete', 'cut'].includes(action.type)) {
        const byId = new Map(objects.map((o) => [o.id, o]));
        const ancestor = (parent: string, child: string) => {
          const seen = new Set<string>();
          let next = byId.get(child)?.parent;
          while (next && !seen.has(next)) {
            if (next === parent) return true;
            seen.add(next);
            next = byId.get(next)?.parent;
          }
          return false;
        };
        if (
          objects.some(
            (o) =>
              o.locked &&
              [...selected].some((id) => id === o.id || ancestor(o.id, id) || ancestor(id, o.id)),
          )
        )
          throw new Error('选区含锁定对象，请先解锁');
      }
      if (action.type === 'nudge') {
        if (!action.dx && !action.dy) continue;
        const captured = await captureSelection();
        if (!captured.rectangles.length) {
          connectorGeometryNotice();
          continue;
        }
        if (captured.rectangles.some((r) => !r.geometry))
          throw new Error('该对象的坐标变换暂不支持键盘微调');
        await commands([
          {
            type: 'elements.arrange',
            slideId,
            action: 'translate',
            rectangles: captured.rectangles,
            dx: action.dx,
            dy: action.dy,
          },
        ]);
      } else if (action.type === 'copy' || action.type === 'cut') await copySelection(action.type);
      else if (action.type === 'paste') await pasteSelection();
      else if (action.type === 'duplicate') {
        await copySelection('copy');
        await pasteSelection();
      } else if (action.type === 'delete')
        await commands(
          [...selected].map((target) => ({ type: 'element.delete', slideId, target })),
        );
      else if (action.type === 'undo') await undoEdit();
      else if (action.type === 'redo') await redoEdit();
      else if (action.type === 'save') mark();
      else {
        changeSelection(
          action.type === 'clear'
            ? []
            : objects
                .filter(
                  (o) =>
                    o.attributes.id !== 'stage' &&
                    !['defs', 'linearGradient', 'stop', 'aside'].includes(o.tag),
                )
                .map((o) => o.id),
        );
        renderObjects();
        renderSelection();
        if (action.type === 'clear') document.body.classList.remove('overview-mode');
      }
      for (const queued of editQueue)
        if (
          queued.documentId === item.documentId &&
          queued.slideId === item.slideId &&
          JSON.stringify(queued.ids) === JSON.stringify(item.ids)
        )
          queued.ids = [...selected];
      if (item.focusCanvas) {
        await whenReady();
        frame.focus();
        send('focus', {});
      }
    }
  } catch (e) {
    editQueue.length = 0;
    error(e);
    if (!pending) mark();
  } finally {
    editingKeys = false;
    for (const done of editWaiters) done();
    editWaiters.clear();
  }
}
document.addEventListener('keydown', (e) => {
  if (
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
  )
    return;
  const action = editShortcut(e);
  if (action?.type === 'paste' && !clipboard) return; // Native files when no internal object clipboard is active.
  if (action && !interacting) {
    e.preventDefault();
    enqueueEdit(action);
  }
});

const vectorIngress=createVectorIngress(geometrySession,()=>snapshot.document.id,()=>snapshot.version,error);

async function init(id?: string) {
  const docs = await api('/api/documents');
  $('documents').innerHTML = docs
    .map((d: { id: string; title: string }) => `<option value="${d.id}">${esc(d.title)}</option>`)
    .join('');
  const chosen = id ?? new URLSearchParams(location.search).get('document') ?? docs[0]?.id;
  if (!chosen) {
    $('empty').textContent = '尚无讲义。请使用导入脚本导入 HTML slides，或导入已有工程包。';
    $('save-status').textContent = '等待导入';
    return;
  }
  set('documents', chosen);
  await load(chosen);
}
$<HTMLSelectElement>('documents').onchange = () =>
  void load(value('documents')).catch((e) => {
    set('documents', snapshot.document.id);
    error(e);
  });
$('save-status').insertAdjacentHTML(
  'afterend',
  '<button id="retry-save" hidden>立即同步</button><button id="reload-head" hidden>保留草稿并重载</button><button id="export-draft" hidden>导出草稿</button>',
);
$('save-status').insertAdjacentHTML(
  'afterend',
  '<details id="recovery-panel" hidden><summary>待恢复修改</summary><div id="recovery-list"></div></details>',
);
let recoveryGeneration=0;
async function refreshRecoveries() {
  const generation=++recoveryGeneration;
  const panel = $('recovery-panel');
  if (!panel) return;
  try {
    const records=await geometrySession.retained();if(generation!==recoveryGeneration)return;
    const retained=new Set(records.map(e=>e.id));const legacy=journal.list();
    const entries=legacy.entries.filter(e=>!retained.has(e.entry.task.request.mutationId));const invalid=legacy.invalid;
    const recovery=records.filter(e=>e.state==='recovery');
    panel.hidden = entries.length + invalid.length + recovery.length === 0;
    panel.querySelector('summary')!.textContent =
      `待恢复修改（${entries.length + invalid.length + recovery.length}）`;
    const list = $('recovery-list');
    list.replaceChildren();
    for(const entry of recovery){
      const row=document.createElement('div');row.className='recovery-row';const label=document.createElement('p');label.textContent='已保留草稿 · '+(entry.error??'等待恢复');
      const download=document.createElement('button');download.textContent='导出完整草稿';download.onclick=()=>downloadRecovery(JSON.stringify({schema:'notale-sync-v1',operations:records.filter(e=>e.documentId===entry.documentId)},null,2));
      const recover=document.createElement('button');recover.textContent='打开恢复副本';recover.onclick=()=>{void (async()=>{const source=entry.edit?.sourceVersion??entry.task?.request.baseVersion??entry.draftTask?.request.baseVersion;if(!source)throw Error('请先导出草稿以保留操作');const edits=records.filter(e=>e.documentId===entry.documentId&&e.state==='recovery');const commands=edits.flatMap(e=>e.edit?.commands??(e.task?.kind!=='restore'?e.task?.request.commands??(e.draftTask?.kind!=="restore"?e.draftTask?.request.commands??[]:[]):[]));const copy=await api(`/api/documents/${entry.documentId}/sync-recovery`,{baseVersion:source,mutationId:entry.id,commands});window.open(`/?document=${copy.document.id}`,'_blank','noopener');})().catch(error);};row.append(label,recover,download);list.append(row);
    }
    for (const { key, entry } of entries) {
      const row = document.createElement('div');
      row.className = 'recovery-row';
      row.dataset.recovery = key;
      const label = document.createElement('p');
      label.textContent = `${entry.title} · ${entry.task.kind === 'restore' ? '恢复版本' : '编辑修改'} · v${entry.task.request.baseVersion} · ${new Date(entry.createdAt).toLocaleString()}`;
      row.append(label);
      const use = document.createElement('button');
      const own = pending && pendingRecordKey(pending) === key;
      use.textContent = own ? '当前待确认修改' : '继续恢复';
      use.disabled = !!own || busy || !!pending;
      use.dataset.recover = key;
      use.onclick = () =>
        void Promise.resolve()
          .then(async () => {
            if (busy || pending) throw new Error('请先处理当前待确认修改');
            const selected = journal.adopt(key);
            await load(selected.task.documentId);
          })
          .catch(error);
      const download = document.createElement('button');
      download.textContent = '导出修改';
      download.dataset.exportRecovery = key;
      download.onclick = () => downloadRecovery(JSON.stringify(entry, null, 2));
      row.append(use, download);
      list.append(row);
    }
    for (const item of invalid) {
      const row = document.createElement('div');
      row.className = 'recovery-row';
      const label = document.createElement('p');
      label.textContent = '恢复记录无法读取，原始数据仍保留在本机';
      const download = document.createElement('button');
      download.textContent = '导出原始记录';
      download.onclick = () => downloadRecovery(item.raw);
      row.append(label, download);
      list.append(row);
    }
  } catch (e) {
    error(e);
  }
}
$('restore').insertAdjacentHTML(
  'afterend',
  '<label class="button">导入待恢复修改<input id="import-recovery" type="file" accept=".json,application/json" hidden></label>',
);
$<HTMLInputElement>('import-recovery').onchange = () =>
  void Promise.resolve()
    .then(async () => {
      const input = $<HTMLInputElement>('import-recovery'),
        file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) throw new Error('恢复文件超过当前 50 MB 读取上限');
      const raw=await file.text();if(JSON.parse(raw).schema==='notale-sync-v1')await geometrySession.importDraft(raw);else journal.importFile(raw);
      refreshRecoveries();
      ($('recovery-panel') as HTMLDetailsElement).open = true;
    })
    .catch(error);
function downloadRecovery(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'notale-recovery.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document
  .querySelector('[data-panel="format"]')!
  .insertAdjacentHTML(
    'beforeend',
    `<fieldset id="media-panel" hidden><legend>媒体</legend><div class="inline"><button id="replace-media">替换文件</button><button id="replace-poster">替换视频封面</button></div><label>图片说明<input id="media-alt"></label><label>取景<select id="media-fit"><option value="contain">完整适应</option><option value="cover">裁切填充</option><option value="fill">拉伸</option><option value="none">原始尺寸</option><option value="scale-down">仅缩小</option></select></label><div class="field-grid"><label>水平焦点 %<input id="media-x" type="number" min="0" max="100" value="50"></label><label>垂直焦点 %<input id="media-y" type="number" min="0" max="100" value="50"></label>${['top', 'right', 'bottom', 'left'].map((key, i) => `<label>裁去${['上', '右', '下', '左'][i]}边 %<input id="crop-${key}" type="number" min="0" max="99" value="0"></label>`).join('')}</div><div id="media-playback"><div class="field-grid"><label>开始秒<input id="media-start" type="number" min="0" step=".1"></label><label>结束秒（空=片尾）<input id="media-end" type="number" min="0" step=".1"></label><label>音量<input id="media-volume" type="number" min="0" max="1" step=".1"></label><label>速度<input id="media-rate" type="number" min=".25" max="4" step=".25"></label><label>开始步骤（空=手动）<input id="media-step" type="number" min="0"></label></div><label><input id="media-muted" type="checkbox">静音</label><label><input id="media-loop" type="checkbox">循环选定区间</label><label><input id="media-controls" type="checkbox">显示播放控件</label></div><button id="save-media">保存媒体设置</button><p id="media-notice" role="status"></p></fieldset>`,
  );
function fillMedia(o: ObjectInfo) {
  const m = mediaSettingsSchema.parse(
    o.attributes['data-notale-media']
      ? JSON.parse(o.attributes['data-notale-media'])
      : {
          fit: o.style['object-fit'] ?? 'contain',
          controls: o.tag === 'img' || o.attributes.controls !== undefined,
          muted: o.attributes.muted !== undefined,
          loop: o.attributes.loop !== undefined,
        },
  );
  set('media-alt', o.attributes.alt ?? '');
  set('media-fit', m.fit);
  set('media-x', m.positionX);
  set('media-y', m.positionY);
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) set('crop-' + edge, m.crop[edge]);
  set('media-start', m.startAt);
  set('media-end', m.endAt);
  set('media-volume', m.volume);
  set('media-rate', m.rate);
  set('media-step', m.startStep);
  for (const key of ['muted', 'loop', 'controls'] as const)
    $<HTMLInputElement>('media-' + key).checked = m[key];
  $('media-playback').hidden = o.tag === 'img';
  $('replace-poster').hidden = o.tag !== 'video';
}
on('replace-media', () => {
  const o = current();
  chooseMedia(o.tag === 'img' ? 'image' : o.tag, o.id);
});
on('replace-poster', () => chooseMedia('image', current().id, true));
on('save-media', () =>
  commands([
    {
      type: 'media.update',
      slideId,
      target: current().id,
      patch: {
        alt: value('media-alt'),
        settings: {
          fit: value('media-fit'),
          positionX: num('media-x'),
          positionY: num('media-y'),
          crop: Object.fromEntries(
            ['top', 'right', 'bottom', 'left'].map((key) => [key, num('crop-' + key)]),
          ),
          startAt: num('media-start'),
          endAt: value('media-end') ? num('media-end') : null,
          volume: num('media-volume'),
          rate: num('media-rate'),
          startStep: value('media-step') ? num('media-step') : null,
          muted: $<HTMLInputElement>('media-muted').checked,
          loop: $<HTMLInputElement>('media-loop').checked,
          controls: $<HTMLInputElement>('media-controls').checked,
        },
      },
    },
  ]),
);
$('animations').insertAdjacentHTML(
  'beforebegin',
  '<div hidden><input id="step-map" value="[]"><button id="save-step-map">保存步骤编排</button></div>',
);
$('apply-advanced').insertAdjacentHTML(
  'afterend',
  '<label>富文本 HTML<textarea id="rich-text" rows="3"></textarea></label><button id="apply-rich-text">应用富文本</button><label>图表数据<textarea id="chart-data" rows="4"></textarea></label><button id="apply-chart">更新图表数据</button>',
);
$('apply-format').insertAdjacentHTML(
  'afterend',
  '<label>对齐基准<select id="arrange-reference"><option value="selection">选区</option><option value="slide">页面</option></select></label><div id="arrange-tools" class="inline"></div><div class="field-grid"><label>组旋转角度<input id="group-angle" type="number" value="15"></label><label>组缩放倍数<input id="group-factor" type="number" value="1.1"></label></div><button id="rotate-group">整体旋转</button><button id="scale-group">整体缩放</button>',
);
async function arrange(action: string) {
  const sourceDocument = snapshot.document, sourceSlide = slideId;
  const settings = { reference: value('arrange-reference'), angle: num('group-angle'), factor: num('group-factor') };
  const capture = await captureSelection();
  if (snapshot.document !== sourceDocument || slideId !== sourceSlide) throw new Error('页面或内容已变化，请在当前页重新操作');
  if (!capture.rectangles.length) {
    connectorGeometryNotice();
    return;
  }
  return commands([
    {
      type: 'elements.arrange',
      slideId,
      action,
      rectangles: capture.rectangles,
      ...settings,
    },
  ]);
}
for (const [action, label] of Object.entries({
  left: '左对齐',
  center: '水平居中',
  right: '右对齐',
  top: '顶部对齐',
  middle: '垂直居中',
  bottom: '底部对齐',
  'distribute-x': '水平分布',
  'distribute-y': '垂直分布',
})) {
  $('arrange-tools').insertAdjacentHTML(
    'beforeend',
    `<button id="arrange-${action}">${label}</button>`,
  );
  on(`arrange-${action}`, () => arrange(action));
}
on('rotate-group', () => arrange('rotate'));
on('scale-group', () => arrange('scale'));
document
  .querySelector('#global-master-mount')!
  .insertAdjacentHTML(
    'beforeend',
    '<hr><label>选择母版<select id="shared-layout"></select></label><div class="inline"><button id="apply-layout-all">应用全部页面</button></div><label>布局名称<input id="layout-name" value="页脚布局"></label><label>布局对象 HTML<textarea id="layout-html" rows="4"></textarea></label><label>布局 CSS<textarea id="layout-css" rows="3"></textarea></label><div class="inline"><button id="new-layout">新建页脚母版</button><button id="save-layout">更新母版</button><button id="edit-layout-canvas">画布编辑母版</button><button id="publish-layout-canvas">发布画布修改</button></div>',
  );
function fillLayout() {
  const layout = snapshot.document.layouts.find((l) => l.id === value('shared-layout'));
  set('layout-name', layout?.name ?? '页脚布局');
  set(
    'layout-html',
    layout?.html ??
      '<footer style="position:absolute;left:60px;right:60px;bottom:28px;font-size:20px;color:#466ddb;display:flex;justify-content:space-between"><span data-notale-field="title"></span><span data-notale-field="slide-number"></span></footer>',
  );
  set('layout-css', layout?.css ?? '');
}
$<HTMLSelectElement>('shared-layout').onchange = ()=>{fillLayout();layoutManager.render();};
on('new-layout', () =>
  commands([
    {
      type: 'layout.set',
      layout: {
        id: uuid(),
        name: value('layout-name'),
        html: value('layout-html'),
        css: value('layout-css'),
      },
    },
  ]),
);
on('save-layout', () => {
  const layout = snapshot.document.layouts.find((l) => l.id === value('shared-layout'));
  if (!layout) throw new Error('请先选择一个共享布局');
  return commands([
    {
      type: 'layout.set',
      layout: {
        ...layout,
        name: value('layout-name'),
        html: value('layout-html'),
        css: value('layout-css'),
      },
    },
  ]);
});
on('apply-layout-all', () =>
  commands(
    snapshot.document.slides
      .filter((s) => !s.layoutSourceId)
      .map((s) => ({
        type: 'slide.update',
        slideId: s.id,
        patch: { layoutId: value('shared-layout') || null },
      })),
  ),
);
on('edit-layout-canvas', () => layoutManager.edit(value('shared-layout')));
on('publish-layout-canvas', () => commands([{ type: 'layout.publish', slideId }]));

$('chart-data').insertAdjacentHTML(
  'beforebegin',
  '<label>图表类型<select id="chart-kind"><option value="bar">柱状图</option><option value="line">折线图</option><option value="area">面积图</option><option value="pie">饼图</option><option value="doughnut">环形图</option></select></label>',
);
$('apply-chart').insertAdjacentHTML(
  'beforebegin',
  `
  <div id="chart-style-controls">
    <label>图表标题<input id="chart-title"></label>
    <label>系列配色（逗号分隔）<input id="chart-colors"></label>
    <div class="field-grid">
      <label>字号<input id="chart-fontSize" type="number" min="10" max="24" value="16"></label>
      <label>数值小数位<input id="chart-valueDecimals" type="number" min="0" max="6" value="0"></label>
      <label>文字颜色<input id="chart-textColor" value="#273247"></label>
      <label>背景颜色<input id="chart-background" value="#ffffff"></label>
      <label>网格颜色<input id="chart-gridColor" value="#dce3ed"></label>
      <label>分类标签方向<select id="chart-labelAngle"><option value="0">水平换行</option><option value="-45">倾斜 45°</option><option value="-90">垂直</option></select></label>
      <label>标签间隔（0 为自动）<input id="chart-labelEvery" type="number" min="0" max="100" value="0"></label>
      <label>线宽<input id="chart-lineWidth" type="number" min="0.5" max="12" step="0.5" value="3"></label>
      <label>数据点半径<input id="chart-pointRadius" type="number" min="0" max="12" value="4"></label>
    </div>
    <label><input id="chart-showValues" type="checkbox" checked>显示可容纳的数值标签</label>
    <label><input id="chart-showLegend" type="checkbox" checked>显示图例</label>
    <label><input id="chart-showGrid" type="checkbox" checked>显示坐标网格</label>
    <button id="apply-chart-style">应用图表样式</button>
  </div>`,
);
on('apply-chart-style', () => {
  const o = current();
  if (!o.attributes['data-notale-chart']) throw new Error('请选择插入的图表 SVG 对象');
  const data = {
    ...JSON.parse(value('chart-data')),
    kind: value('chart-kind'),
    title: value('chart-title'),
    colors: value('chart-colors')
      .split(',')
      .map((c) => c.trim()),
  };
  for (const key of [
    'fontSize',
    'valueDecimals',
    'labelEvery',
    'labelAngle',
    'lineWidth',
    'pointRadius',
  ])
    data[key] = num(`chart-${key}`);
  for (const key of ['textColor', 'background', 'gridColor']) data[key] = value(`chart-${key}`);
  for (const key of ['showValues', 'showLegend', 'showGrid'])
    data[key] = $<HTMLInputElement>(`chart-${key}`).checked;
  return commands([{ type: 'chart.update', slideId, target: o.id, data }]);
});
$('apply-chart').insertAdjacentHTML(
  'afterend',
  '<hr><div class="field-grid"><label>行（从 1 开始）<input id="table-row" type="number" min="1" value="2"></label><label>列（从 1 开始）<input id="table-column" type="number" min="1" value="1"></label><label>合并行数<input id="table-rows" type="number" min="1" value="1"></label><label>合并列数<input id="table-columns" type="number" min="1" value="2"></label></div><div class="inline" id="table-tools"></div>',
);
function selectedTable() {
  let o = current();
  while (o.tag !== 'table' && o.parent) {
    const parent = objects.find((p) => p.id === o.parent);
    if (!parent) break;
    o = parent;
  }
  if (o.tag !== 'table') throw new Error('请选择表格或单元格');
  return o;
}
for (const [action, label] of Object.entries({
  'insert-row': '插入行',
  'delete-row': '删除行',
  'insert-column': '插入列',
  'delete-column': '删除列',
  merge: '合并单元格',
  unmerge: '取消合并',
})) {
  $('table-tools').insertAdjacentHTML(
    'beforeend',
    `<button id="table-${action}">${label}</button>`,
  );
  on(`table-${action}`, () =>
    commands([
      {
        type: 'table.edit',
        slideId,
        target: selectedTable().id,
        action,
        row: num('table-row') - 1,
        column: num('table-column') - 1,
        rowSpan: num('table-rows'),
        colSpan: num('table-columns'),
      },
    ]),
  );
}
on('save-step-map', () =>
  commands([{ type: 'slide.update', slideId, patch: { stepMap: JSON.parse(value('step-map')) } }]),
);
on('apply-rich-text', () =>
  commands([
    {
      type: 'element.patch',
      slideId,
      target: current().id,
      patch: { richText: value('rich-text') },
    },
  ]),
);
on('apply-chart', () => {
  const o = current();
  if (!o.attributes['data-notale-chart']) throw new Error('请选择插入的图表 SVG 对象');
  const data = { ...JSON.parse(value('chart-data')), kind: value('chart-kind') };
  return commands([{ type: 'chart.update', slideId, target: o.id, data }]);
});
on('export-draft',async()=>downloadRecovery(await geometrySession.exportDraft()));
on('retry-save', async () => {
  if(geometrySession.count) await geometrySession.retry();
  else if (pending) await transmit(pending);
});
on('reload-head', async () => {
  if (busy) throw new Error('正在保存，请等待当前请求结束');
  if (pending) journal.clear(pending);
  await geometrySession.abandon();
  pending = undefined;
  await load(snapshot.document.id);
});
try {
  migratedLegacy = journal.migrateLegacy();
} catch (e) {
  error(e);
}

window.addEventListener('storage', (event) => {
  if (isJournalKey(event.key)) refreshRecoveries();
});
window.addEventListener('beforeunload', (e) => {
  if (pending || busy || geometrySession.count || editingKeys || editQueue.length) {
    e.preventDefault();
    e.returnValue = '';
  }
});
$<HTMLInputElement>('text-reflow').onchange = () =>
  send('resize-mode', { reflow: $<HTMLInputElement>('text-reflow').checked });
const authoredComponents = createComponentInspector({
  slide,
  document: () => snapshot.document,
  capture: captureSelection,
  objects: () => objects,
  selected: () => [...selected],
  choose: (id) => {
    changeSelection([id]);
    renderObjects();
    renderSelection();
  },
  openPage: showPage,
  commands,
  preview: (id, state) => send('component-select', { id, state, animate: true }),
  error,
});
const teachingStepsUI = createStepInspector({
  slide,
  step: () => step,
  nativeMax: () => nativeMax,
  ready: () => canvasReady,
  whenReady,
  preview: (index, play) => {
    if (play) { void previewOverlay.open(index); return; }
    setStep(index, true, index);
  },
  commands,
  error,
});
const pageSettings=createPageSettings({document:()=>snapshot.document,current:()=>slideId,commands,editMaster:(id,pageId)=>layoutManager.edit(id,pageId)});
const layoutValuesUI = createLayoutValues({
  mount:pageSettings.mount,
  slide:()=>pageSettings.target()??slide(),
  document: () => snapshot.document,
  selected: () => [...selected],
  commands,
  uploadImage: async (file) => {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const asset = await uploadAsset(new Uint8Array(await file.arrayBuffer()), file.type);
    return {
      asset,
      path: `media/${uuid()}.${
        file.name
          .split('.')
          .at(-1)
          ?.replace(/[^a-z0-9]/gi, '') || 'img'
      }`,
    };
  },
  error,
});
const contextInspector = createContextInspector();
const typographyUI = createTypography({
  key: () => JSON.stringify([snapshot.document.id, snapshot.version, slideId, [...selected]]),
  ready: () => canvasReady,
  ids: () => [...selected],
  slideId: () => slideId,
  capture: captureSelection,
  commands,
});
on('apply-typography', () => typographyUI.apply());
on('reset-typography', () => typographyUI.reset());
const assetLibrary = createAssetLibrary({
  document: () => snapshot.document,
  slide,
  selection: () => objects.filter(o => selected.has(o.id)),
  insert: template,
  commands,
  error,
});
const pageThumbnails = createPageThumbnails();
const revealPreset = createRevealPreset({
  slide, objects: () => objects, selected: () => [...selected], commands, whenReady, error,
  choose: id => {changeSelection([id]);renderObjects();renderSelection();},
});
const linkInspector = createLinkInspector({document: () => snapshot.document, slide, objects: () => objects, selected: () => [...selected], commands, error});
const richEditor = createRichEditor({
  selected: () => selected.size === 1 ? objects.find(o => selected.has(o.id)) : undefined,
  key: () => JSON.stringify([snapshot.document.id,snapshot.version,slideId,[...selected]]),
  slideId: () => slideId, commands, capture: captureSelection,
});
createMediaIngress({
  enabled: () => !!snapshot && !interacting && !busy && !pending && !document.querySelector('dialog[open]'),
  pasteObjects: pasteSelection,
  svg:async source=>commands([{type:'svg.import',slideId,html:prepareSvgImport(source)}]),
  error,
  insert: async (files, point) => {
    const documentId=snapshot.document.id, revision=snapshot.version, targetSlide=slide();
    const bounds=frame.getBoundingClientRect();
    const x=point?Math.max(0,Math.min(snapshot.document.width-100,(point.x-bounds.left)*snapshot.document.width/bounds.width)):120;
    const y=point?Math.max(0,Math.min(snapshot.document.height-100,(point.y-bounds.top)*snapshot.document.height/bounds.height)):160;
    const edits: unknown[]=[];
    for(const [index,file] of files.entries()) {
      if(file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg')){edits.push({type:'svg.import',slideId:targetSlide.id,html:prepareSvgImport(await file.text(),x+index*24,y+index*24)});continue;}
      const asset=await uploadAsset(new Uint8Array(await file.arrayBuffer()),file.type);
      const path=`media/${uuid()}/${file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,120)||'media.bin'}`;
      const src='../'.repeat(targetSlide.sourcePath.split('/').length-1)+path.split('/').map(encodeURIComponent).join('/');
      const kind=file.type.startsWith('image/')?'image':file.type.split('/')[0];
      const html=template(kind,src).replace('left:120px;top:160px;',`left:${x+index*24}px;top:${y+index*24}px;`);
      edits.push({type:'asset.put',path,asset},{type:'element.insert',slideId:targetSlide.id,html});
    }
    if(documentId!==snapshot.document.id||revision!==snapshot.version||targetSlide.id!==slideId)
      throw new Error('上传期间页面或版本已变化，请在目标页重新插入');
    await commands(edits);
  },
});
const imageCrop=createImageCrop({selected:()=>selected.size===1?objects.find(o=>selected.has(o.id)):undefined,key:()=>JSON.stringify([snapshot.document.id,snapshot.version,slideId,[...selected]]),slideId:()=>slideId,preview:()=>frame.src,capture:captureSelection,commands});
const layoutManager=createLayoutManager({mount:$('global-master-mount'),document:()=>snapshot.document,slide,commands,show:async id=>{await showPage(id);editorShell.inspect('format');},error});
const tableInspector=createTableInspector({objects:()=>objects,selection:()=>[...selected],select:id=>{changeSelection([id]);renderObjects();renderSelection();},slideId:()=>slideId,commands,error});
function toHex(color: string | undefined) {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : undefined;
}
for (const [id, property] of [['object-fill', 'fill'], ['object-stroke', 'stroke'], ['object-accent', '--accent']] as const)
  $<HTMLInputElement>(id).onchange = () =>
    commands([{ type: 'element.patch', slideId, target: current().id, patch: { style: { [property]: value(id) } } }]).catch(error);
on('layout-item-duplicate', () => commands([{ type: 'element.duplicate', slideId, target: current().id }]));
on('layout-item-delete', () => commands([{ type: 'element.delete', slideId, target: current().id }]));
const equationEditor = createEquationEditor({ objects: () => objects, selection: () => [...selected], slideId: () => slideId, commands, error });
const chartEditor=createChartEditor({objects:()=>objects,selection:()=>[...selected],key:()=>JSON.stringify([snapshot.document.id,snapshot.version,slideId,[...selected]]),slideId:()=>slideId,commands,error});
pageSettings.bindValues(()=>layoutValuesUI.render(),()=>layoutValuesUI.reset());
const previewOverlay = createPreviewOverlay({
  prepare: async () => {
    await initialized; await flushAuthor(); await whenIdle();
    await whenReady();
    if (pending) throw new Error('修改尚未保存，请先重试保存后再预览');
    return { snapshot: structuredClone(snapshot), slideId };
  },
  present: () => $('present').click(), error,
});
installDockIcons();
on('dock-add-page', () => $('add-slide').click());
on('dock-delete-page', () => $('delete-slide').click());
for (const [id, delta] of [['dock-previous-page', -1], ['dock-next-page', 1]] as const)
  on(id, () => { const pages = normalPages(), at = pages.findIndex(page => page.id === slideId); if (pages[at + delta]) return showPage(pages[at + delta].id); });
const canvasLoading = createCanvasLoading(async () => { await whenIdle(); await render(); }, pageError);
documentUI=createDocumentUI({document:()=>snapshot.document,version:()=>snapshot.version,commands,load,history:()=>api(`/api/documents/${snapshot.document.id}/history`),restore,flush:flushAuthor,error});
applyFeatureAvailability();
const vectorUI=createVectorInspector((action,data={})=>send('vector-action',{action,...data}));
const initialized = init();
void initialized.catch(error);
// A small stable surface for host integration and browser acceptance tests.
Object.assign(window, {
  NotaleWorkbench: {
    commands,
    getSyncState:()=>({pending:geometrySession.count,status:geometrySession.status,blocked:geometrySession.blocked}),
    getSnapshot: () => snapshot,
    getPending: () => (pending ? structuredClone(pending) : undefined),
    select: (id: string) => {
      changeSelection([id]);
      renderObjects();
      renderSelection();
    },
    getObjects: () => objects,
    getSelection: () => [...selected],
    whenEditsIdle,
    selectMany: (ids: string[]) => {
      changeSelection(ids);
      renderObjects();
      renderSelection();
    },
    copySelection,
    pasteSelection,
    captureSelection,
    whenReady,
    showSlide: showPage,
  },
});

async function createConnector() {
  const ids = [...selected].filter((id) => !(slide().connectors ?? []).some((c) => c.id === id));
  if (ids.length > 2) throw new Error('请选择最多两个需要连接的对象');
  const id = uuid();
  await commands([
    {
      type: 'connector.set',
      slideId,
      connector: connectorSchema.parse({
        id,
        start: ids[0]
          ? { target: ids[0] }
          : { point: { x: snapshot.document.width * 0.35, y: snapshot.document.height * 0.5 } },
        end: ids[1]
          ? { target: ids[1] }
          : { point: { x: snapshot.document.width * 0.65, y: snapshot.document.height * 0.5 } },
      }),
    },
  ]);
  changeSelection([id]);
  renderSelection();
}
function renderConnector() {
  const c =
    selected.size === 1 ? (slide().connectors ?? []).find((c) => selected.has(c.id)) : undefined;
  $('connector-panel').hidden = !c;
  if (!c) return;
  const options = objects
    .filter(
      (o) => o.attributes.id !== 'stage' && !(slide().connectors ?? []).some((c) => c.id === o.id),
    )
    .map(
      (o) =>
        `<option value="${o.id}">${esc(o.tag + ' ' + (o.text.trim() || o.attributes.id || '').slice(0, 28))}</option>`,
    )
    .join('');
  for (const side of ['start', 'end'] as const) {
    $('connector-' + side).innerHTML = '<option value="">自由端点</option>' + options;
    set('connector-' + side, c[side].target ?? '');
    set('connector-' + side + '-x', c[side].point?.x ?? snapshot.document.width / 2);
    set('connector-' + side + '-y', c[side].point?.y ?? snapshot.document.height / 2);
    connectorEndpointFields(side);
    set('connector-' + side + '-anchor', c[side].anchor);
    $<HTMLInputElement>('connector-' + side + '-arrow').checked =
      side === 'start' ? c.startArrow : c.endArrow;
  }
  set('connector-kind', c.kind);
  set('connector-color', c.color);
  set('connector-width', c.width);
  set('connector-dash', c.dash);
}
function connectorEndpointFields(side: 'start' | 'end') {
  const free = !value('connector-' + side);
  $('connector-' + side + '-point').hidden = !free;
  $<HTMLSelectElement>('connector-' + side + '-anchor').disabled = free;
}
for (const side of ['start', 'end'] as const)
  $('connector-' + side).addEventListener('change', () => connectorEndpointFields(side));
function connectorEndpointValue(side: 'start' | 'end') {
  const target = value('connector-' + side);
  return target
    ? { target, anchor: value('connector-' + side + '-anchor') }
    : { point: { x: num('connector-' + side + '-x'), y: num('connector-' + side + '-y') } };
}
on('save-connector', () => {
  const c = (slide().connectors ?? []).find((c) => selected.has(c.id));
  if (!c) throw new Error('请选择连接线');
  return commands([
    {
      type: 'connector.set',
      slideId,
      connector: {
        ...c,
        start: connectorEndpointValue('start'),
        end: connectorEndpointValue('end'),
        kind: value('connector-kind'),
        color: value('connector-color'),
        width: num('connector-width'),
        dash: value('connector-dash'),
        startArrow: $<HTMLInputElement>('connector-start-arrow').checked,
        endArrow: $<HTMLInputElement>('connector-end-arrow').checked,
      },
    },
  ]);
});

function connectorGeometryNotice() {
  $('toast').textContent = '连接线会跟随端点，请移动或调整端点对象';
  $('toast').hidden = false;
  setTimeout(() => ($('toast').hidden = true), 5000);
}
