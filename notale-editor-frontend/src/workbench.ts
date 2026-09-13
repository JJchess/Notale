import {waitForPrintPages} from './print-readiness';
import {assetBase64} from './asset-encoding';
import {coalescedRefresh} from './state/coalesced-refresh';
import {AuthorObjects,type AuthorObject} from './canvas/author-objects';
import {KeyboardQueue,type KeyboardIntent} from './state/keyboard-queue';
import {requestMediaFile} from './state/media-picker';
import {bindDocumentIO} from './state/document-io';
import {importDocument} from './document-transfer';
import {bindNotifications} from './state/notifications';
import {createSmartDiagram} from './state/smart-diagram';
import {bindInsertionDrop} from './state/insertion-drop';
import {createSourceEditor} from './state/source-editor';
import {bindSaveRecovery} from './state/save-recovery-actions';
import {bindArrangement,arrangementSettings} from './state/arrangement';
import {createConnectorInspector} from './state/connector-inspector';
import {AcceptedOperations} from './state/accepted-operations';
import {createComponentNavigation} from './state/component-navigation';
import {captureLayerPlan,layerPlanCommands} from './state/layer-commands';
import {assertSelectionEditable,deleteSelectionCommands,groupingPlan} from './state/selection-commands';
import {UiTasks} from './lifecycle/ui-tasks';
import {bindNotesEditor} from './state/notes-editor';
import {bindAnimationControls} from './state/animation-controls';
import {AnimationSelection} from './state/animation-selection';
import {bindAnimationForm,animationTriggerLabels} from './state/animation-form';
import {animationDraftFields,editAnimationField,AnimationDraft,type AnimationField} from './state/animation-draft';
import {bindAnimationGallery,animationEffectGroups as effectGroups,animationEffectLabels} from './state/animation-gallery';
import {bindAnimationList} from './state/animation-list';
import {createTextLinkDialog} from './state/text-link-dialog';
import {SessionShutdown} from './state/session-shutdown';
import {closingSessions} from './state/closing-sessions';
import {viewSettings,bindGuideActions} from './state/view-settings';
import {bindDocumentSettings} from './state/document-settings';
import {layerRows} from './state/layers';
import {CanvasController} from './canvas/controller.js';
import {bindEditorSession,editorActions as publicEditorActions} from './state/editor-session.js';
import {scopeActions} from './state/action-scope';
import {CanvasResources} from './canvas/resources.js';
import {AuthorCanvasController} from './canvas/author-controller';
import { EditorKernel } from './editor-kernel.js';
import { applyAuthorChanges, type AuthorChangesPage, type SyncAcknowledgement } from '@notale/editor/browser';
import {selectionBounds,geometryCommand,selectionUnits,alignmentCommands} from './object-geometry.js';
import {animationOrderCommands,hasTeachingStructure,sequenceAnimations} from './animation-authoring.js';
import {createTemplateLibrary} from './template-library.js';
import {createEchartsEditor} from './echarts-editor.js';
import type {ChartAuthoring} from '@notale/editor/browser';
import {prepareSvgImport} from './vector-import.js';
import {createVectorIngress} from './vector-ingress.js';
import {createVectorInspector} from './vector-inspector.js';
import {bindRecovery} from './state/recovery';
import {createTextIngress, type TextDraft} from './text-ingress.js';
import { createAnimationPath } from './animation-path.js';
import { createObjectMenu, type ObjectMenuItem, type FormatControl } from './object-menu.js';
import { GeometrySession, type GeometryEdit } from './geometry-session.js';
import {previewActions} from './state/preview-session';
import { createPageSettings } from './page-settings.js';
import { renderSelectionTools } from './selection-tools.js';
import { createCanvasLoading } from './canvas/loading-controller';
import { createChartEditor } from './chart-editor.js';
import { createTableInspector } from './table-inspector.js';
import { createLayoutManager } from './layout-manager.js';
import { createImageCrop } from './image-crop.js';
import { createMediaIngress } from './media-ingress.js';
import { createRichEditor } from './rich-editor.js';
import { createLinkInspector } from './link-inspector.js';
import { createRevealPreset } from './reveal-preset.js';
import { createPageThumbnails } from './canvas/page-thumbnails.js';
import { createAssetLibrary } from './asset-library.js';
import { createTypography } from './typography.js';
import { createContextInspector } from './context-inspector.js';
import { createEditorShell } from './editor-shell.js';
import { timeline } from '@notale/editor/browser';
import { createLayoutValues } from './layout-values.js';
import { createStepInspector } from './step-inspector.js';
import { createComponentInspector } from './component-inspector.js';
import type { SourceScene } from '@notale/editor/browser';
import {createSceneInspector,type SceneInspection} from './state/scene-inspector';
import {createNativeChartInspector} from './state/native-chart-inspector';
import type { NativeChartInspection } from '@notale/editor/browser';
import { connectorSchema } from '@notale/editor/browser';
import { trackPreviewLease } from './canvas/resource-lease';
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
import {createMediaInspector} from './state/media-inspector';
import type { Snapshot, Slide, Command, AnimationSpec } from '@notale/editor/browser';
import { template, DEFAULT_TEX } from './templates.js';
import { createEquationEditor } from './equation-editor.js';
import { createCodeEditor } from './code-editor.js';
import {bindInsertActions} from './state/insert-actions';
import { createAppearanceInspector, toHex } from './appearance-inspector.js';
import { createThemePanel } from './theme-panel.js';
import { createFindReplace } from './find-replace.js';
import { createPageBackground } from './page-background.js';
import { createCommentsPanel } from './comments-panel.js';
import { setSaveStatus, showSaveStatus, PHASES } from './save-status.js';
let mounted:symbol|undefined;
export function mountWorkbench(){
  if(mounted)return;
  const identity=Symbol('workbench');mounted=identity;
  const workbenchEvents=new AbortController();
  let release=()=>workbenchEvents.abort();
  try {
  const editorSession=bindEditorSession(workbenchEvents.signal);
  const editorActions=scopeActions(publicEditorActions,workbenchEvents.signal);
  const uiTasks=new UiTasks(workbenchEvents.signal);
  let previewLease:ReturnType<typeof trackPreviewLease>|undefined;
  window.addEventListener('pagehide',()=>previewLease?.stop(), {signal:workbenchEvents.signal});
type ObjectInfo = AuthorObject;
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
const notices=bindNotifications();
const animationDraft=new AnimationDraft();
const value = (id:AnimationField) => animationDraft.get(id);
const num = (id:AnimationField) => Number(value(id));
let paintingAuthor=false;
const set=(id:AnimationField,value:unknown)=>{if(!paintingAuthor||animationDraft.focused!==id)animationDraft.set(id,value);};
const esc = (s: unknown) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const uuid = () => crypto.randomUUID();
let objects: ObjectInfo[] = [],
  rects: Rect[] = [],
  channel = '';
let undo: number[] = [],
  redo: number[] = [];
const isBusy=()=>editorSession.getSnapshot().busy;
const idleWaiters = new Set<() => void>();
function assertWorkbenchOpen(){if(workbenchEvents.signal.aborted)throw Error('编辑器已关闭，无法接收新操作');}
async function whenIdle() {
  assertWorkbenchOpen();
  if (isBusy()) await new Promise<void>((resolve) => idleWaiters.add(resolve));
  assertWorkbenchOpen();
}
function releaseBusy() {
  if(!workbenchEvents.signal.aborted)editorSession.update({busy:false});
  for (const done of idleWaiters) done();
  idleWaiters.clear();
}
let pending: Pending | undefined;
let pendingConflict = false;
let echartsUI:ReturnType<typeof createEchartsEditor>|undefined;
type Capture = {
  textReflowTargets?:string[];
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
function whenReady(){return canvasController.whenReady();}
let clipboard:
  | { documentId: string; source: Slide; targets: string[]; mode: 'copy' | 'cut'; capture: Capture }
  | undefined;
async function captureSelection(ids = [...editorSession.selection]): Promise<Capture> {
  const documentId=editorSession.snapshot.document.id,pageId=editorSession.pageId;
  await whenReady();
  assertWorkbenchOpen();
  if(documentId!==editorSession.snapshot.document.id||pageId!==editorSession.pageId)throw Error('页面已切换，请在当前页面重试');
  if (!ids.length) return Promise.reject(new Error('请先选择对象'));
  return canvasController.request<Capture>('capture',{ids});
}

let clipboardCapture: Promise<void> | undefined;
function copySelection(mode: 'copy' | 'cut') {
  assertWorkbenchOpen();
  const originDocument=editorSession.snapshot.document.id,originPage=editorSession.pageId;
  const assertSource=()=>{assertWorkbenchOpen();if(editorSession.snapshot.document.id!==originDocument||editorSession.pageId!==originPage)throw Error('页面已切换，请重新复制对象');};
  const task = (async () => {
    await kernel.flush();await textIngress.flush();await vectorIngress.flush();
    await echartsUI?.flush();
    assertSource();
    const ids = [...editorSession.selection],
      source = structuredClone(slide()),
      documentId = editorSession.snapshot.document.id;
    for(const state of geometrySession.states(source.id))if(state.chart)source.nativeCharts[state.id]=structuredClone(state.chart);
    const capture = await captureSelection(ids);
    assertSource();
    clipboard = { documentId, source, targets: ids, mode, capture };
  })();
  clipboardCapture = task;
  return task.finally(() => {
    if (clipboardCapture === task) clipboardCapture = undefined;
  });
}
async function pasteSelection() {
  assertWorkbenchOpen();
  const originDocument=editorSession.snapshot.document.id,originPage=editorSession.pageId;
  const assertSource=()=>{assertWorkbenchOpen();if(editorSession.snapshot.document.id!==originDocument||editorSession.pageId!==originPage)throw Error('页面已切换，请重新粘贴对象');};
  await clipboardCapture;
  assertSource();
  if (!clipboard) throw new Error('剪贴板中没有对象');
  if (clipboard.documentId !== editorSession.snapshot.document.id)
    throw new Error('跨讲义请使用工程导入；当前剪贴板属于另一份讲义');
  const beforeIds = new Set(objects.map((o) => o.id));
  await commands([
    {
      type: 'elements.transfer',
      slideId:editorSession.pageId,
      sourceSlideId: clipboard.source.id,
      sourceSnapshot: clipboard.source,
      targets: clipboard.targets,
      mode: clipboard.mode,
      rectangles:clipboard.capture.rectangles,
      computedStyles:clipboard.capture.computedStyles,
      nativeChartTargets:clipboard.capture.nativeChartTargets,
      nativeChartStates:clipboard.capture.nativeChartStates,
      canvasSceneStates:clipboard.capture.canvasSceneStates,
      componentStates:clipboard.capture.componentStates,
    },
  ]);
  assertSource();
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
const canvasController=new CanvasController($('canvas-host'));
release=()=>canvasController.dispose();
canvasController.onDispose(()=>{if(mounted===identity)mounted=undefined;});
canvasController.onDispose(()=>{workbenchEvents.abort();for(const done of idleWaiters)done();idleWaiters.clear();previewLease?.stop();previewLease=undefined;});
let frame=canvasController.frame;
const editorShell = createEditorShell(scale=>send('camera',{scale}));
canvasController.onDispose(()=>editorShell.dispose());
const geometrySession: GeometrySession = new GeometrySession({
  task: edit => ({kernel:{protocol:2},documentId:editorSession.snapshot.document.id,slideId:edit.slideId,selection:[...editorSession.selection],request:{baseVersion:edit.sourceVersion??editorSession.snapshot.version,mutationId:edit.id,commands:edit.commands},after:{undo:[...undo],redo:[]}}),
  submit: task => transmit(task),
  snapshot:()=>kernel.confirmed,
  recovered:task=>{kernel.recover(task.request.mutationId);journal.clear(task);if(pending?.request.mutationId===task.request.mutationId)pending=undefined;},
  confirm:(task,version)=>{mutationVersions.set(task.request.mutationId,version);void pullAuthorChanges().then(()=>{if(!workbenchEvents.signal.aborted)kernel.acknowledge(task.request.mutationId,version);}).catch(error);const plan=nextHistory(task,version);undo=plan.undo;redo=plan.redo;sessionStorage.setItem(historyKey(task.documentId),JSON.stringify({version:Math.max(version,editorSession.snapshot.version),...plan}));mark();},
  remote: async()=>{if(!isBusy()&&!canvasGesture&&!textSession&&editorSession.snapshot){await pullAuthorChanges();if(!workbenchEvents.signal.aborted)kernel.refresh(true);}},
  paint: states => {const chartStates=states.filter(s=>s.chart);if(chartStates.length){const charts={...slide().nativeCharts};for(const state of chartStates){charts[state.id]=state.chart!;if(editorSession.selection.has(state.id)&&state.chart?.authoring)echartsUI?.restore(state.chart.authoring);}send('charts-update',{charts});}send('geometry-draft',{states:states.filter(s=>!s.chart)});},
  changed: () => {if(editorSession.snapshot){kernel.refresh();mark();}},error,
});
const kernel: EditorKernel = new EditorKernel({
  operations:()=>geometrySession.operations(),owner:()=>geometrySession.ownerId,
  stage:task=>geometrySession.stageText(task),finalize:id=>geometrySession.finalizeText(id),
  retainPreparation:(task,cause)=>geometrySession.retainPreparation(task,cause),
  enqueue:task=>geometrySession.enqueueTask(task),cancel:id=>geometrySession.cancelOperation(id),
  prepare:request=>api('/api/documents/'+editorSession.snapshot.document.id+'/prepare',request),
  barrier:async()=>{await geometrySession.barrier();await pullAuthorChanges();},
  changed:(next,previous,paint)=>{
    if(workbenchEvents.signal.aborted)return;
    editorSession.update({document:next});
    if(paint&&editorSession.canvasReady&&previous?.document.id===next.document.id){
      if(!next.document.slides.some(s=>s.id===editorSession.pageId)){void render('page-removed').catch(error);return;}
      const old=previous.document.slides.find(s=>s.id===editorSession.pageId);
      refreshAuthorObjects();
      if(old)void authorCanvas.update(old).catch(error);
      renderObjects();paintingAuthor=true;try{renderSelection(false);}finally{paintingAuthor=false;}
    }
  },
  preview:cmds=>{authorCanvas.preview(cmds);mark();},error,
});
const refreshAuthorChanges=coalescedRefresh(async(id)=>{
  if(workbenchEvents.signal.aborted||kernel.confirmed.document.id!==id)return;
  while(true){
    const page:AuthorChangesPage=await api('/api/documents/'+id+'/changes?after='+kernel.confirmed.version);
    if(workbenchEvents.signal.aborted||kernel.confirmed.document.id!==id)return;
    for(const change of page.changes)kernel.accept(change);
    if(!page.hasMore)break;
  }
});
async function pullAuthorChanges(){
  if(workbenchEvents.signal.aborted)return;
  return refreshAuthorChanges(kernel.confirmed.document.id);
}

const authorObjects = new AuthorObjects();
canvasController.onDispose(()=>authorObjects.clear());
function refreshAuthorObjects(){
  objects=authorObjects.read(editorSession.snapshot.document.id,slide(),objects);
  const available=new Set(objects.map(object=>object.id));
  editorSession.select([...editorSession.selection].filter(id=>available.has(id)));
}
let textSession:{sessionId:string;target:string;sequence?:number}|undefined;
const textIngress=createTextIngress({queue:geometrySession,documentId:()=>editorSession.snapshot.document.id,version:()=>editorSession.snapshot.version,error,confirm:data=>send('text-confirm',data)});

function normalPages() { return editorSession.snapshot.document.slides.filter(page=>!page.layoutSourceId); }
function moveNormalPage(id:string,index:number) {
  if(!normalPages().some(page=>page.id===id))throw new Error('请在普通页面列表中排序');
  const remaining=editorSession.snapshot.document.slides.filter(page=>page.id!==id),ordinary=remaining.filter(page=>!page.layoutSourceId);
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
  if(workbenchEvents.signal.aborted)return;
  notices.show(e instanceof Error?e.message:String(e));
  if(editorSession.snapshot)mark();
}
function slide(): Slide {
  return editorSession.snapshot.document.slides.find((s) => s.id === editorSession.pageId)!;
}
function send(type: string, data: unknown) {
  canvasController.send(type,data);
}
function current() {
  const id = [...editorSession.selection][0];
  if (!id) throw new Error('请先选择一个对象');
  return objects.find((o) => o.id === id)!;
}
function changeSelection(ids: string[], operation: 'replace' | 'add' | 'toggle' = 'replace') {
  if(kernel.editing)void kernel.flush().catch(error);
  editorSession.select(
    selectIds(
      [...editorSession.selection],
      ids,
      objects.filter((o) => o.attributes.id !== 'stage'),
      editorSession.selectionScope?[]:slide().groups,
      operation,
    ),
  );
}
function refreshPendingControls() {
  saveRecovery.update({scope:editorSession.getSnapshot().document?.document.id??'',visible:geometrySession.blocked,busy:isBusy()});
}
function mark() {
  if(workbenchEvents.signal.aborted)return;
  refreshPendingControls();
  showSaveStatus({ editing: kernel.editing, journal: geometrySession.status, busy:isBusy(), version: editorSession.snapshot.version });
  editorSession.update({canUndo:kernel.canUndo||textIngress.canUndo||undo.some(v=>!kernel.handlesVersion(v)),canRedo:kernel.canRedo||textIngress.canRedo||!!redo.length});
  refreshRecoveries();
}
const authorCanvas=new AuthorCanvasController(canvasController,{
  snapshot:()=>editorSession.snapshot,confirmed:()=>kernel.confirmed,pageId:()=>editorSession.pageId,
  preview:(id,version)=>api('/api/documents/'+id+'/preview?version='+version),
  painted:(document,base,paths,animationsChanged)=>{pageThumbnails.patch(document,base,paths);if(base)assetLibrary.update(new URL(slide().sourcePath,base).href,slide().sourcePath);if(animationsChanged){renderAnimations();teachingStepsUI.render();}mark();},
  refreshed:(previews,snapshot)=>{pageThumbnails.update(previews.slides,snapshot.document,previews);pageThumbnails.patch(editorSession.snapshot.document,authorCanvas.assetBase);},
  pageRemoved:()=>render('page-removed'),
});

async function flushTextEditor(){await canvasController.flushEditor();await textIngress.flush();await vectorIngress.flush();}
function paintChartModels(){
  const charts=structuredClone(slide().nativeCharts);
  for(const state of geometrySession.states(editorSession.pageId))if(state.chart)charts[state.id]=state.chart;
  send('charts-update',{charts});const id=[...editorSession.selection][0];if(charts[id]?.authoring)echartsUI?.restore(charts[id].authoring!);
}
async function flushAuthor(){await kernel.flush();await propertyEdits;await echartsUI?.flush();await whenReady();await flushTextEditor();await whenEditsIdle();await geometrySession.barrier();await geometrySession.pull();}
async function flushDocument(){const documentId=editorSession.snapshot.document.id;await notesEditor.flush();await flushAuthor();assertWorkbenchOpen();if(editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换，请重试当前操作');}
const mutationVersions=new Map<string,number>();
const historyKey = (id: string) => `notale-editor-history-v2:${id}`;
function nextHistory(task:Pending,version:number):HistoryPlan {
  if(task.kernel&&task.historyAction){const target=task.inverseMutationId?mutationVersions.get(task.inverseMutationId):task.inverseVersion;
    return task.historyAction==='undo'?{undo:undo.filter(v=>v!==target),redo:[...redo.filter(v=>v!==version),version]}:{undo:[...undo.filter(v=>v!==version),version],redo:redo.filter(v=>v!==target)};
  }
  const old=validHistory(task.after)?task.after:{undo:[...undo],redo:[...redo]};
  const add=(values:number[])=>values.includes(version)?[...values]:[...values,version];
  return task.historyAction==='undo'?{undo:old.undo,redo:add(old.redo)}:task.historyAction==='redo'?{undo:add(old.undo),redo:old.redo}:{undo:add(undo),redo:[]};
}
async function transmit(task: Pending) {
  await initialized;
  await whenIdle();
  editorSession.update({busy:true});
  pending = task;
  pendingConflict = false;
  refreshPendingControls();
  setSaveStatus(task.kind === 'restore' ? PHASES.restoring : PHASES.saving);
  try {
    if(!task.kernel)journal.put(task,editorSession.snapshot.document.title);
    refreshRecoveries();
    const request=task.inverseMutationId?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],inverseMutationId:task.inverseMutationId}
      :task.inverseVersion?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],inverseVersion:task.inverseVersion}
      :task.kind==='restore'?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],restoreVersion:task.request.version}
      :task.geometry?{...task.request,geometry:true}:task.request;
    let acknowledged:Snapshot;
    if(task.kernel){
      const reply:SyncAcknowledgement=await api('/api/documents/'+task.documentId+'/sync/v2',{...request,...(task.kernel.dependencies?.length?{dependencies:task.kernel.dependencies}:{})});
      if(workbenchEvents.signal.aborted){journal.clear(task);return reply.committedVersion;}
      if(reply.change.fromVersion===kernel.confirmed.version)kernel.accept(reply.change);
      if(kernel.confirmed.version<reply.committedVersion)await pullAuthorChanges();
      acknowledged={...kernel.confirmed,version:reply.committedVersion};
    }else{
      acknowledged=await api('/api/documents/'+task.documentId+'/sync',request);
      if(workbenchEvents.signal.aborted){journal.clear(task);return acknowledged.version;}
      if(acknowledged.version>kernel.confirmed.version)kernel.resetBase(acknowledged);
    }
    if(workbenchEvents.signal.aborted){journal.clear(task);return acknowledged.version;}
    const result=kernel.confirmed;
    const confirmedVersion=acknowledged.version;mutationVersions.set(task.request.mutationId,confirmedVersion);
    const advanced=false;
    const geometryOnly=!!task.geometry || geometrySession.has(task.request.mutationId);
    const foreign=!await geometrySession.ownsHistory(task);
    if(workbenchEvents.signal.aborted){journal.clear(task);return confirmedVersion;}
    const plan=foreign?{undo:[...undo],redo:[...redo]}:nextHistory(task,confirmedVersion);
    sessionStorage.setItem(
      historyKey(task.documentId),
      JSON.stringify({ version: result.version, ...plan }),
    );
    journal.clear(task);
    pending=undefined;
    undo=[...plan.undo];redo=[...plan.redo];
    kernel.acknowledge(task.request.mutationId,confirmedVersion);
    if(task.textEdit&&editorSession.canvasReady&&task.slideId===editorSession.pageId){
      const doc=new DOMParser().parseFromString(slide().html,'text/html'),node=doc.querySelector<HTMLElement>('[data-notale-id="'+CSS.escape(task.textEdit.target)+'"]');
      if(node)send('text-confirm',{...task.textEdit,html:node.innerHTML});
    }
    if(editorSession.canvasReady)send('geometry-confirm',{mutationId:task.request.mutationId,version:result.version,transforms:slide().transforms});
    if(task.kernel?.prepared&&editorSession.canvasReady&&task.slideId===editorSession.pageId){
      await authorCanvas.refreshRuntime(result,task.slideId);
    }
    if (advanced) {
      notices.show('这批修改已确认，已载入其他窗口的较新版本');
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
const acceptedCommands=new AcceptedOperations();
function commands(cmds: unknown[], remember = true, focusSlide?: string) {return acceptedCommands.run(()=>executeCommands(structuredClone(cmds),remember,focusSlide));}
async function executeCommands(cmds: unknown[], remember = true, focusSlide?: string) {
  assertWorkbenchOpen();
  if(!cmds.length)return;
  if(!editorSession.getSnapshot().document){await initialized;assertWorkbenchOpen();}
  const navigation=pageNavigation,documentId=editorSession.snapshot.document.id;
  const mayFocus=()=>!workbenchEvents.signal.aborted&&navigation===pageNavigation&&editorSession.snapshot.document.id===documentId;
  await kernel.executeAfter(cmds as Command[],async()=>{
    if(textSession){await flushTextEditor();send('text-end',{});}
    await textIngress.flush();
  },focusSlide);
  if(focusSlide&&focusSlide!==editorSession.pageId&&mayFocus()){await geometrySession.barrier();if(mayFocus())await showPage(focusSlide);}
}

function selectDocument(document: Snapshot['document']) {
  const documents=editorSession.getSnapshot().documents;
  const entry={id:document.id,title:document.title};
  editorSession.update({documents:documents.some(item=>item.id===document.id)?documents.map(item=>item.id===document.id?entry:item):[entry,...documents]});
}
async function load(id: string) {
  assertWorkbenchOpen();
  await kernel.flush();
  await propertyEdits;
  if(textSession){await flushTextEditor();send("text-end",{});textSession=undefined;}
  await clipboardCapture?.catch(() => undefined);
  await geometrySession.barrier();
  assertWorkbenchOpen();
  if (isBusy()) throw new Error('正在保存或载入，请稍后切换讲义');
  editorSession.update({busy:true});
  refreshPendingControls();
  setSaveStatus(PHASES.loading);
  try {
    let entry = journal.own(id);
    if (!entry && migratedLegacy?.task.documentId === id) {
      entry = journal.adopt(pendingRecordKey(migratedLegacy.task));
      migratedLegacy = undefined;
    }
    const result: Snapshot = await api(`/api/documents/${id}`);
    assertWorkbenchOpen();
    pending = undefined;
    pendingConflict = false;
    canvasController.suspend();authorCanvas.resetDocument();kernel.load(result);editorSession.update({document:kernel.current,canvas:'loading'});
    await geometrySession.load(id);assertWorkbenchOpen();kernel.refresh();
    await geometrySession.checkpoint(editorSession.snapshot);
    assertWorkbenchOpen();
    selectDocument(editorSession.snapshot.document);
    editorSession.openPage(geometrySession.firstSlide ?? normalPages()[0]?.id ?? editorSession.snapshot.document.slides[0].id);
    undo = [];
    redo = [];
    try {
      const stored = JSON.parse(sessionStorage.getItem(historyKey(id)) ?? 'null');
      if (stored?.version <= editorSession.snapshot.version && validHistory(stored)) {
        undo = stored.undo;
        redo = stored.redo;
      }
    } catch {}
    history.replaceState(null, '', `?document=${id}`);
    await render();
  } finally {
    releaseBusy();
    if (editorSession.snapshot) mark();
  }
}

class SupersededPage extends Error {}
function pageError(e: unknown) {
  if (!(e instanceof SupersededPage)) error(e);
}
let pageNavigation=0;
async function showPage(id: string) {
  const navigation=++pageNavigation;
  try {
  await kernel.flush();
  await propertyEdits;
  if(textSession){await flushTextEditor();send("text-end",{});textSession=undefined;}
  await geometrySession.whenLocallySaved();
  await initialized;
  await clipboardCapture?.catch(() => undefined);
  const documentId=editorSession.snapshot.document.id;
  if (!editorSession.snapshot.document.slides.some((s) => s.id === id)) throw new Error('页面不存在');
  // New pages are projected before their server resource URL exists. Existing
  // pages keep the cached navigation path and never wait for unrelated saves.
  if(!kernel.confirmed.document.slides.some(page=>page.id===id))await geometrySession.barrier();
  assertWorkbenchOpen();
  if(editorSession.snapshot.document.id!==documentId)throw new SupersededPage('文档已切换');
  if(!kernel.confirmed.document.slides.some(page=>page.id===id))throw new Error('新页面尚未同步，请保存后重试');
  if (navigation !== pageNavigation) throw new SupersededPage();
  if(editorSession.pageId===id&&editorSession.canvasReady)return;
  editorSession.openPage(id);
  await render();
  if (navigation !== pageNavigation || editorSession.pageId !== id) throw new SupersededPage('页面切换已被后续请求替代');
  await whenReady();
  if (navigation !== pageNavigation || editorSession.pageId !== id) throw new SupersededPage('页面切换已被后续请求替代');
  } catch(cause) {
    if(navigation!==pageNavigation)throw new SupersededPage();
    throw cause;
  }
}

type MenuContext={contextId:string;slideId:string;runtimeId:string;x:number;y:number;width:number;ids:string[];info:{id:string;tag:string;editableText:boolean;locked:boolean;styles:Record<string,string>}[];text?:{sessionId:string;target:string;selectionToken:number;selectedText:string;selectedHtml:string;collapsed:boolean;styles:Record<string,string>;mixed:string[]}};
let menuContext:MenuContext|undefined;
const objectMenu=createObjectMenu(()=>send(textSession?'text-refocus':'focus',{}),error);
canvasController.onDispose(()=>objectMenu.dispose());
function formatControls(ctx:MenuContext):FormatControl[]{
 const info=ctx.info,styles=ctx.text?.styles??info[0]?.styles??{},mixed=ctx.text?.mixed??Object.keys(styles).filter(k=>info.some(o=>o.styles[k]!==styles[k]));
 const disabled=info.some(o=>o.locked);
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
 if(info.length===1&&['rect','circle','ellipse','path','polygon','line','polyline'].includes(info[0].tag))return (['fill','stroke','stroke-width'] as const).map(id=>({id,label:({fill:'填充颜色',stroke:'描边颜色','stroke-width':'描边宽度'})[id],kind:id==='stroke-width'?'number':'color',value:id==='stroke-width'?String(parseFloat(styles[id])||1):color(styles[id]??''),min:0,max:100,disabled,run:(v:string)=>commands([{type:'element.patch',slideId:editorSession.pageId,target:ctx.ids[0],patch:{style:{[id]:v}}}])}));
 return [];
}
function openObjectMenu(data:MenuContext) {
 if(!data.ids?.length||![data.x,data.y,data.width].every(Number.isFinite)||data.width<=0)return;
 changeSelection(data.ids);menuContext=data;
 const documentId=editorSession.snapshot.document.id,valid=()=>documentId===editorSession.snapshot.document.id&&data.slideId===editorSession.pageId&&data.runtimeId===frameRuntimeId&&menuContext?.contextId===data.contextId&&(!data.text?JSON.stringify([...editorSession.selection])===JSON.stringify(data.ids):data.text.sessionId===textSession?.sessionId);
 const blocked=false,locked=data.info.some(o=>o.locked),mod=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
 const edit=(label:string,type:'copy'|'cut'|'paste'|'duplicate'|'delete',key:string,disabled=false,separator=false):ObjectMenuItem=>({id:type,label,icon:type,shortcut:key,disabled:blocked||disabled,separator,danger:type==='delete',run:()=>enqueueEdit({type},true)});
 let items:ObjectMenuItem[];
 if(data.text){
  const replace=(text:string,selectionToken:number)=>{if(valid())send('text-replace',{sessionId:data.text!.sessionId,selectionToken,text});};
  const write=()=>{const t=data.text!;if(navigator.clipboard.write&&window.ClipboardItem)return navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([t.selectedText],{type:'text/plain'}),'text/html':new Blob([t.selectedHtml],{type:'text/html'})})]);return navigator.clipboard.writeText(t.selectedText);};
  items=[{id:'cut',label:'剪切',icon:'cut',shortcut:mod+' X',disabled:data.text.collapsed||locked,run:async()=>{const token=data.text!.selectionToken;await write();replace('',token);}},{id:'copy',label:'复制',icon:'copy',shortcut:mod+' C',disabled:data.text.collapsed,run:write},{id:'paste',label:'粘贴',icon:'paste',shortcut:mod+' V',disabled:locked,run:async()=>{const token=data.text!.selectionToken;const text=await navigator.clipboard.readText();replace(text,token);}},{id:'select-all',label:'全选文字',shortcut:mod+' A',separator:true,run:()=>send('text-select-all',{})},{id:'clear-format',label:'清除格式',icon:'clear',disabled:locked,run:()=>send('text-format',{sessionId:data.text!.sessionId,selectionToken:data.text!.selectionToken,property:'clear',value:''})},{id:'text-link',label:'链接…',icon:'link',disabled:locked||data.text.collapsed,run:()=>openTextLink(data)},{id:'end-text',label:'结束文字编辑',separator:true,run:()=>send('text-end',{})},{id:'format',label:'文字设置',icon:'format',run:()=>editorShell.inspect('format')}];
 }else{
  const groups=slide().groups.filter(g=>g.members.some(id=>data.ids.includes(id)));
  const contextUnits=selectionUnits(data.ids.map(id=>({id})),editorSession.selectionScope?[]:slide().groups).length;
  const svgSelection=data.ids.length>0&&data.ids.every(id=>objects.find(object=>object.id===id)?.namespace==='http://www.w3.org/2000/svg');
  items=[edit('剪切','cut',mod+' X',locked),edit('复制','copy',mod+' C'),edit('粘贴','paste',mod+' V',!clipboard||clipboard.documentId!==documentId),edit('创建副本','duplicate',mod+' D'),
   ...(svgSelection?[{id:'vector-edit',label:'编辑图形',icon:'format',disabled:locked,children:[{label:'编辑顶点',disabled:data.info.length!==1||!['path','rect','circle','ellipse','line','polyline','polygon'].includes(data.info[0].tag),run:()=>send('vector-action',{action:'nodes'})},{label:'编辑文字',disabled:data.info.length!==1||!['text','tspan','textPath'].includes(data.info[0].tag),run:()=>send('vector-action',{action:'text'})},{label:'图形格式',run:()=>editorShell.inspect('format')},{label:'导出 SVG',run:()=>send('vector-action',{action:'export'})}]}]:[]),
   {id:'arrange',label:'排列',icon:'layers',separator:true,disabled:locked||blocked,children:([{action:'front',label:'置于顶层'},{action:'forward',label:'上移一层'},{action:'backward',label:'下移一层'},{action:'back',label:'置于底层'}] as const).map(i=>({id:i.action,label:i.label,run:()=>{if(valid())return changeLayer(i.action);}}))},
   {id:'alignment',label:contextUnits===1?'对齐到页面':'对齐与分布',disabled:locked||blocked,children:Object.entries({left:'左对齐',center:'水平居中',right:'右对齐',top:'顶部对齐',middle:'垂直居中',bottom:'底部对齐','distribute-x':'水平分布','distribute-y':'垂直分布'}).map(([action,label])=>({id:action,label,disabled:action.startsWith('distribute')&&contextUnits<3,run:()=>{if(valid())return arrange(action);}}))},
   ...(data.ids.length>1?[{id:'group',label:'组合',icon:'group',disabled:locked||blocked,run:()=>groupSelection()}]:[]),
   ...(svgSelection&&data.info[0].tag==='g'?[{id:'svg-ungroup',label:'取消组合',icon:'group',disabled:locked||blocked,run:()=>ungroupSelection()}]:[]),
   ...(groups.length?[{id:'ungroup',label:'取消组合',icon:'group',disabled:locked||blocked,run:()=>ungroupSelection()}]:[]),
   {id:'lock',label:locked?'解锁':'锁定',icon:'lock',disabled:blocked||(locked&&!data.ids.some(id=>objects.find(o=>o.id===id)?.locked)),reason:locked&&!data.ids.some(id=>objects.find(o=>o.id===id)?.locked)?'请先解锁父级对象':undefined,run:()=>commands(data.ids.map(target=>({type:'element.lock',slideId:editorSession.pageId,target,locked:!locked})))},
   ...(data.info.length===1&&data.info[0].editableText?[{id:'edit-text',label:'编辑文字',icon:'format',separator:true,disabled:locked,run:()=>send('text-start',{target:data.ids[0]})}]:[]),
   {id:'animation',label:'动画…',icon:'animation',run:()=>editorShell.inspect('animation')},
   {id:'format',label:'设置对象格式',icon:'format',run:()=>editorShell.inspect('format')},edit('删除','delete','Delete',locked,true)];
 }
 if(!data.text&&data.ids.length===1&&slide().nativeCharts[data.ids[0]]?.authoring)items.unshift(
 {id:'chart-data',label:'编辑图表数据',icon:'format',disabled:locked,run:async()=>{await echartsUI?.render();await echartsUI?.openData();}},
 {id:'chart-type',label:'更改图表类型',disabled:locked,run:async()=>{await echartsUI?.render();echartsUI?.changeType();}},
 {id:'chart-format',label:'设置图表格式',separator:true,run:()=>editorShell.inspect('format')});
 const rect=frame.getBoundingClientRect(),scale=rect.width/data.width;
 objectMenu.open(rect.left+data.x*scale,rect.top+data.y*scale,items,formatControls(data),valid);
}
const textLinkDialog=createTextLinkDialog();
canvasController.onDispose(()=>textLinkDialog.dispose());
function openTextLink(ctx:MenuContext){
 const text=ctx.text;if(!text)return;
 const documentAtOpen=editorSession.snapshot.document.id,pageAtOpen=editorSession.pageId;
 textLinkDialog.open(value=>{
  assertWorkbenchOpen();
  if(editorSession.snapshot.document.id!==documentAtOpen||editorSession.pageId!==pageAtOpen||text.sessionId!==textSession?.sessionId)throw Error('文字编辑位置已变化，请重新打开链接设置');
  if(objects.find(object=>object.id===textSession?.target)?.locked)throw Error('对象已锁定');
  send('text-format',{sessionId:text.sessionId,selectionToken:text.selectionToken,property:'link',value});
 });
}

let canvasGesture=false;const gestureWaiters=new Set<()=>void>();
let frameRuntimeId = '';
let renderGeneration = 0;
canvasController.onDispose(()=>{renderGeneration++;canvasGesture=false;for(const done of gestureWaiters)done();gestureWaiters.clear();});
const canvasResources=new CanvasResources<ObjectInfo[]>(api);
canvasController.onDispose(()=>canvasResources.dispose());
let navigationLeaseChannel='';
function pagePreview(){return canvasResources.getPreview(editorSession.snapshot.document.id,editorSession.snapshot.version);}
function pageObjects(id:string){return canvasResources.getObjects(editorSession.snapshot.document.id,editorSession.snapshot.version,id);}

editorActions.showPage=id=>{editorSession.update({overview:false});return showPage(id);};
editorActions.movePage=moveNormalPage;
editorActions.reportError=pageError;
editorActions.pagesCommitted=()=>{
  if(!editorSession.snapshot)return;
  if(previewSlides.length){pageThumbnails.update(previewSlides,kernel.confirmed.document);pageThumbnails.patch(editorSession.snapshot.document,authorCanvas.assetBase);}
};

async function render(reason: 'navigation'|'page-removed'|'source-script'|'runtime-recovery' = 'navigation') {
  assertWorkbenchOpen();
  (window as any).__notaleMounts??=[];(window as any).__notaleMounts.push({reason,slideId:editorSession.pageId,at:performance.now()});
  if(canvasGesture)await new Promise<void>(resolve=>gestureWaiters.add(resolve));
  assertWorkbenchOpen();
  objectMenu.close();textSession=undefined;authorCanvas.beginPage();
  const generation = ++renderGeneration;
  canvasLoading.start();
  editorSession.update({canvas:'loading'});
  channel = '';
  canvasController.suspend();
  if (!editorSession.snapshot.document.slides.some((s) => s.id === editorSession.pageId))
    editorSession.openPage(normalPages()[0]?.id ?? editorSession.snapshot.document.slides[0].id);
  const s = slide();
  const pages=normalPages();


  

  
  editorShell.render(editorSession.snapshot.document.width,editorSession.snapshot.document.height);
  const [nextObjects, previews] = await Promise.all([
    pageObjects(editorSession.pageId),
    pagePreview(),
  ]);
  if (workbenchEvents.signal.aborted || generation !== renderGeneration) return;
  objects = nextObjects;refreshAuthorObjects();
  editorSession.select([...editorSession.selection].filter((id) => objects.some((o) => o.id === id)));
  renderObjects();
  if (workbenchEvents.signal.aborted || generation !== renderGeneration) return;
  if(navigationLeaseChannel !== previews.channel || !previewLease){
    previewLease?.stop();
    previewLease = trackPreviewLease(editorSession.snapshot.document.id, previews);
    navigationLeaseChannel = previews.channel;
  }
  previewSlides = previews.slides;
  pageThumbnails.update(previews.slides, kernel.confirmed.document,previews);
  pageThumbnails.patch(editorSession.snapshot.document,authorCanvas.assetBase);
  channel = previews.channel;
  frame = canvasController.activate({documentId:editorSession.snapshot.document.id,version:editorSession.snapshot.version,pageId:editorSession.pageId,url:previews.slides.find(p=>p.id===editorSession.pageId)!.url,channel},reason!=='navigation').frame;
  authorCanvas.seed(kernel.confirmed,kernel.confirmed.document.slides.find(page=>page.id===s.id)??s,frame.src);
  assetLibrary.update(frame.src, s.sourcePath);
  const neighbor=pages[pages.findIndex(page=>page.id===s.id)+1];
  const navigationDocumentId=editorSession.snapshot.document.id,navigationVersion=editorSession.snapshot.version;
  if(neighbor)uiTasks.schedule(()=>{
    if(generation!==renderGeneration||editorSession.snapshot.document.id!==navigationDocumentId||editorSession.snapshot.version!==navigationVersion)return;
    void pageObjects(neighbor.id).catch(()=>undefined);
    const source=previews.slides.find(page=>page.id===neighbor.id);
    if(source)canvasController.preload({documentId:navigationDocumentId,version:navigationVersion,pageId:neighbor.id,url:source.url,channel:previews.channel});
  },500);
  editorSession.update({emptyMessage:null});
  renderAnimations();
  teachingStepsUI.render();
  renderSelection();
  mark();
  layoutValuesUI.render();
  layoutManager.render();
}
function renderObjects() {
  const layers={documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,rows:layerRows(objects)};
  if(JSON.stringify(layers)!==JSON.stringify(editorSession.getSnapshot().layers))editorSession.update({layers});
  animationForm.update({targets:objects.map(o=>({value:o.id,label:o.tag+' '+(o.text.trim()||o.attributes.id||'').slice(0,30)}))});
}
let inspectedSelectionKey = '';
let selectionFieldsKey = '';
function renderSelection(autoInspect = true) {
  syncAnimationSelection();
  const nextSelectionKey=JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,[...editorSession.selection].sort()]);
  const selectionChanged=nextSelectionKey!==inspectedSelectionKey;
  inspectedSelectionKey=nextSelectionKey;
  if(autoInspect&&selectionChanged&&editorSession.selection.size)editorShell.inspect('format');
  renderSelectionTools(objects, editorSession.selection, slide().groups, editorSession.canvasReady);
  chartEditor.render();
  appearanceInspector.render();
  themePanel.render();
  pageBackground.render();
  commentsPanel.render();
  equationEditor.render();
  codeEditor.render();
  tableInspector.render();
  imageCrop.render();
  richEditor.render();
  linkInspector.render();
  revealPreset.render();
  assetLibrary.selection();
  smartDiagram.render();
  authoredComponents.render();
  renderComponentNavigation();
  if (editorSession.canvasReady) send('select', { ids: [...editorSession.selection] });
  const hasSelection = editorSession.selection.size > 0;
  const units=selectionUnits([...editorSession.selection].map(id=>({id})),editorSession.selectionScope?[]:slide().groups).length;
  arrangement.update({scope:arrangementScope(),units,disabled:!editorSession.canvasReady||!hasSelection||[...editorSession.selection].some(id=>objects.find(o=>o.id===id)?.locked)});
  renderConnector();
  renderNativeChart();
  void echartsUI?.render();
  renderScene();
  sourceEditor.render();
  mediaInspector.render();
  contextInspector.render(objects, [...editorSession.selection]);
  if (!editorSession.selection.size) {
    selectionFieldsKey = '';
    editorSession.update({bindingField:undefined,nameField:undefined,geometryFields:undefined});
    typographyUI.render();
    return;
  }
  const o = current(),
    t = slide().transforms[o.id] ?? { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };

  const binding = slide().bindings.find((b) => b.target === o.id),
    bindingValue = String(
      binding?.value ?? rects.find((r) => r.id === o.id)?.value ?? o.attributes.value ?? '',
    ),
    fieldsKey = JSON.stringify([editorSession.snapshot.document.id, editorSession.snapshot.version, editorSession.pageId, [...editorSession.selection], o, t, binding]);
  // A runtime-ready or repeated selection notification must not overwrite an
  // unfinished form when its authored source has not changed.
  const targets=[...editorSession.selection],chosen=objects.filter(object=>editorSession.selection.has(object.id));
  const nameField={key:JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,targets]),documentId:editorSession.snapshot.document.id,slideId:editorSession.pageId,targets,before:Object.fromEntries(chosen.map(object=>[object.id,object.attributes['data-notale-name']??''])),value:o.attributes['data-notale-name']??'',editable:!chosen.some(object=>object.locked)};
  if(JSON.stringify(nameField)!==JSON.stringify(editorSession.getSnapshot().nameField))editorSession.update({nameField});
  const checkbox=o.attributes.type==='checkbox';
  const field=editorSession.selection.size===1&&['input','select','textarea'].includes(o.tag)?{key:JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,o.id]),documentId:editorSession.snapshot.document.id,slideId:editorSession.pageId,target:o.id,value:checkbox?String(binding?.value??(o.attributes.checked!==undefined)):bindingValue,editable:!o.locked,before:JSON.stringify(binding??null),checkbox}:undefined;
  if(JSON.stringify(field)!==JSON.stringify(editorSession.getSnapshot().bindingField))editorSession.update({bindingField:field});
  renderGeometryFields();
  if (fieldsKey === selectionFieldsKey) {
    typographyUI.render();
    return;
  }
  selectionFieldsKey = fieldsKey;
  renderGeometryFields();
  typographyUI.render();
}
const animationSelection=new AnimationSelection();
let animationFieldsKey = '';
const animationGallery=bindAnimationGallery();
canvasController.onDispose(()=>animationGallery.dispose());
function showAnimationGroup(kind:string){animationGallery.group(kind);}
function resetAnimationDraft() {
  const next=Math.min(500,Math.max(0,...slide().animations.map(a=>a.step))+1);
  set('animation-step',next);set('trigger','click');set('duration',.6);set('delay',0);
  set('animation-repeat',1);animationDraft.reverse=false;
  set('dx',-120);set('dy',0);set('easing','ease-out');set('effect-direction','left');
  animationPath.set([{x:0,y:0},{x:200,y:0}]);
}
function syncAnimationSelection() {
  if(!animationSelection.sync(editorSession.snapshot.document.id,editorSession.pageId,[...editorSession.selection],slide().animations))return;
  if (animationSelection.selected) fillAnimation(slide().animations.find(a => a.id === animationSelection.selected)!);
  else resetAnimationDraft();
  renderAnimations();
}
async function previewSingleAnimation(spec?: AnimationSpec, batch?: AnimationSpec[]) {
  const currentSlide = editorSession.pageId;
  await whenReady();
  if (currentSlide !== editorSession.pageId) return;
  const a = spec ?? slide().animations.find(a => a.id === animationSelection.selected) ?? (editorSession.selection.size>1?slide().animations.find(a=>editorSession.selection.has(a.target)):undefined);
  if (!a) throw Error('请先选择一条动画');
  send('animation-preview', { animations:batch?.length?batch:!spec&&editorSession.selection.size>1?slide().animations.filter(item=>editorSession.selection.has(item.target)):[a] });
}
async function applyAnimationEffect(effect: string) {
  if (!editorSession.selection.size) throw Error('请先选择画布对象');
  if(effect==='draw-stroke'&&[...editorSession.selection].some(id=>!['path','line','polyline','polygon','rect','circle','ellipse','svg','g'].includes(objects.find(o=>o.id===id)?.tag??'')))throw Error('描边绘制适用于矢量图形');
  set('effect', effect);
  if(['appear','disappear'].includes(effect))set('duration',0);
  else if(num('duration')===0)set('duration',.6);
  const edits: Command[] = [];
  let first: string | undefined;
  const batch=sequenceAnimations(readAnimation(uuid()) as AnimationSpec,[...editorSession.selection],animationControls.sequence,uuid);
  for (const proposed of batch) {
    const old = slide().animations.find(a => a.id === animationSelection.selected && a.target === proposed.target);
    const id = old?.id ?? proposed.id; first ??= id;
    edits.push({type:'animation.set', slideId:editorSession.pageId, animation:{...proposed,id}});
  }
  const sourceDocument=editorSession.snapshot.document.id,sourcePage=editorSession.pageId,sourceSelection=[...editorSession.selection].join(':');
  animationSelection.selected = first;
  await commands(edits);
  if(editorSession.snapshot.document.id!==sourceDocument||editorSession.pageId!==sourcePage||[...editorSession.selection].join(':')!==sourceSelection)return;
  animationSelection.selected=first;
  const selectedAnimation=slide().animations.find(animation=>animation.id===first);
  if(selectedAnimation)fillAnimation(selectedAnimation);
  renderAnimations();
  await previewSingleAnimation(batch[0],batch);
}

function animationLabel(id:string,v:string){return (id==='effect'?animationEffectLabels:(animationTriggerLabels as Record<string,string>))[v]??v;}
const animationControls=bindAnimationControls({newDraft:()=>{animationSelection.selected=undefined;resetAnimationDraft();renderAnimations();$('animation-gallery').scrollIntoView({block:'nearest'});},preview:()=>previewSingleAnimation(),stop:()=>send('animation-preview-stop',{}),present:()=>previewActions.open(),error});
canvasController.onDispose(()=>animationControls.dispose());
const animationForm=bindAnimationForm(animationDraft,changeAnimationField,()=>{void animationUpdate.then(()=>{if(!workbenchEvents.signal.aborted)renderAnimations();});});
canvasController.onDispose(()=>animationForm.dispose());
const animationList=bindAnimationList();
canvasController.onDispose(()=>animationList.dispose());
function renderAnimations() {
  const restoreFocus=animationList.focused;
  const s = slide();
  if(restoreFocus&&!s.animations.some(a=>a.id===animationSelection.selected)){const fallback=s.animations.find(a=>editorSession.selection.has(a.target));if(fallback)animationSelection.selected=fallback.id;}
  const chosen = s.animations.find(a => a.id === animationSelection.selected);
  if(chosen && JSON.stringify(chosen)!==animationFieldsKey){
    if(!animationDraft.formFocused){fillAnimation(chosen);animationFieldsKey=JSON.stringify(chosen);}
    else if(animationDraft.get('effect')===chosen.effect){
      for(const [id,value] of Object.entries(animationDraftFields(chosen)))if(id!==animationDraft.focused)animationDraft.set(id as AnimationField,value);
      animationDraft.reverse=chosen.autoReverse??false;
    }
  }
  const galleryDocument=editorSession.snapshot.document.id,galleryPage=editorSession.pageId,gallerySelection=[...editorSession.selection].join(':');
  const galleryCurrent=()=>{if(workbenchEvents.signal.aborted||editorSession.snapshot.document.id!==galleryDocument||editorSession.pageId!==galleryPage||[...editorSession.selection].join(':')!==gallerySelection)throw Error('动画选区已变化，请重新选择');};
  animationGallery.update({enabled:!!editorSession.selection.size,selected:chosen?.effect,clearable:s.animations.some(a=>editorSession.selection.has(a.target)),apply:effect=>{galleryCurrent();return applyAnimationEffect(effect);},clear:()=>{galleryCurrent();return commands(slide().animations.filter(a=>editorSession.selection.has(a.target)).map(a=>({type:'animation.remove',slideId:galleryPage,id:a.id})));}});


  animationControls.update({target:editorSession.selection.size ? `${editorSession.selection.size > 1 ? `已选 ${editorSession.selection.size} 个对象` : (objects.find(o=>editorSession.selection.has(o.id))?.text?.trim().slice(0,30) || '已选对象')}` : '选择对象，添加动画',status:chosen?`编辑第 ${s.animations.findIndex(a=>a.id===animationSelection.selected)+1} 条动画`:'点击上方效果，添加动画',enabled:!!editorSession.selection.size,previewable:!!chosen||(editorSession.selection.size>1&&s.animations.some(a=>editorSession.selection.has(a.target))),multiple:editorSession.selection.size>1});
  const oldStep=value('animation-step');
  const lastStep=Math.min(500,Math.max(1,editorSession.canvasMax,...s.animations.map(a=>a.step),Number(oldStep)||0)+1);
  animationForm.update({scope:JSON.stringify([galleryDocument,galleryPage,animationSelection.selected,gallerySelection]),disabled:!chosen||objects.some(o=>editorSession.selection.has(o.id)&&o.locked),steps:Array.from({length:lastStep+1},(_,i)=>({value:String(i),label:i===0?'随页面出现':`${i} · ${s.steps?.[i]?.name??'单击步骤'}`}))});
  const cues = timeline(s);
  const objectLabel = (id: string) => {
    const object = objects.find(object => object.id === id);
    return object?.attributes['data-notale-name'] || object?.text?.trim().slice(0, 48) || object?.tag || '对象';
  };
  const seconds = (ms: number) => `${Number((ms / 1000).toFixed(3))} 秒`;
  const timingAnimations=JSON.stringify(s.animations),timingDocument=editorSession.snapshot.document.id;
  const current=()=>!workbenchEvents.signal.aborted&&editorSession.snapshot.document.id===timingDocument&&editorSession.pageId===s.id&&JSON.stringify(slide().animations)===timingAnimations;
  const ordered=(ids:string[])=>commands(animationOrderCommands(s,ids.map(id=>s.animations.find(a=>a.id===id)!)));
  const checkStep=(id:string,target:string)=>{if(hasTeachingStructure(s)&&s.animations.find(a=>a.id===id)?.step!==s.animations.find(a=>a.id===target)?.step)throw Error('请通过动画的“步骤”选项移动到其他讲授步骤');};
  animationList.update({scope:JSON.stringify([timingDocument,s.id,timingAnimations]),current,error,
    rows:cues.map((cue,i)=>{const a=cue.spec;const label=objectLabel(a.target),step=s.steps?.[a.step]?.name??`步骤 ${a.step}`,times=`${seconds(cue.start)}–${seconds(cue.end)}`;return {id:a.id,animation:a,label,description:`${animationLabel('effect',a.effect)} · ${step} · ${animationLabel('trigger',a.trigger)}`,timing:`${cue.eventTarget?`点击「${objectLabel(cue.eventTarget)}」后`:'步骤开始后'} ${times}`,summary:`${label} · ${step} · ${times}${cue.eventTarget?' · 点击触发':''}`,selected:a.id===animationSelection.selected,start:cue.start,end:cue.end,extent:Math.max(1000,...cues.filter(other=>other.spec.step===a.step&&other.eventTarget===cue.eventTarget).map(other=>other.end*1.25)),up:i>0&&(!hasTeachingStructure(s)||cues[i-1].spec.step===a.step),down:i<cues.length-1&&(!hasTeachingStructure(s)||cues[i+1].spec.step===a.step)};}),
    edit:id=>{const a=s.animations.find(a=>a.id===id);if(!a)return;editorShell.inspect('animation');animationSelection.selected=id;editorSession.select([a.target]);animationSelection.select(id,editorSession.snapshot.document.id,editorSession.pageId,[a.target]);renderObjects();renderSelection(false);fillAnimation(a);renderAnimations();},
    preview:id=>previewSingleAnimation(s.animations.find(a=>a.id===id)),
    copy:id=>{const a=s.animations.find(a=>a.id===id);if(!a)return;const copyId=uuid(),ids=s.animations.map(a=>a.id);ids.splice(ids.indexOf(id)+1,0,copyId);return commands([{type:'animation.set',slideId:s.id,animation:{...a,id:copyId}},{type:'animation.reorder',slideId:s.id,ids}]);},
    remove:id=>commands([{type:'animation.remove',slideId:s.id,id}]),
    move:(id,direction)=>{const ids=s.animations.map(a=>a.id),at=ids.indexOf(id),to=at+direction;if(at<0||to<0||to>=ids.length)return;checkStep(id,ids[to]);[ids[at],ids[to]]=[ids[to],ids[at]];return ordered(ids);},
    drop:(id,target)=>{if(!s.animations.some(a=>a.id===id)||!s.animations.some(a=>a.id===target))return;checkStep(id,target);const ids=s.animations.map(a=>a.id).filter(a=>a!==id);ids.splice(ids.indexOf(target),0,id);return ordered(ids);},
    commit:animation=>commands([{type:'animation.set',slideId:s.id,animation}]),
  });

}
function setStep(next: number, animate = true, componentStep?: number) {
  editorSession.seekStep(next);
  send('seek', { step:editorSession.canvasStep, animate, ...(componentStep !== undefined ? { componentStep } : {}) });
}
function initializeEditCanvas() {
  send('resize-mode', { reflow: editorSession.getSnapshot().textReflow });
  send('mode', { mode:'edit' });
  setStep(editorSession.canvasMax, false, 0);
}
canvasController.subscribe((e) => {
  if(e.data.channel!==channel)return;
  const { type, data } = e.data;
  if(type==='runtime-reload-required'&&data.runtimeId===frameRuntimeId&&data.slideId===editorSession.pageId)void kernel.flush().then(()=>geometrySession.barrier()).then(()=>render(data.reason==='source-script'?'source-script':'runtime-recovery')).catch(error);
  echartsUI?.receive(type,data);
  if (type === 'native-chart-error') error(new Error(`原生图表：${data.error}`));
  if(type==='gesture-active'&&data.runtimeId===frameRuntimeId&&data.slideId===editorSession.pageId){canvasGesture=!!data.active;if(!canvasGesture){for(const done of gestureWaiters)done();gestureWaiters.clear();}}
  if(type==='context-dismiss')objectMenu.close();
  if(data?.runtimeId===frameRuntimeId&&data?.slideId===editorSession.pageId){
    if(type==='text-session-start')textSession={sessionId:data.sessionId,target:data.target};
    if(type==='text-session-end'&&textSession?.sessionId===data.sessionId){textSession=undefined;if(menuContext?.text)objectMenu.close();void textIngress.flush().catch(error);}
    if(type==='text-draft'&&textSession&&textSession.sessionId===data.sessionId){textSession.sequence=data.sequence;textIngress.receive(data as TextDraft);}
    if(type==='text-history')enqueueEdit({type:data.action},false);
    if(type==='text-context-state'&&menuContext&&menuContext.text?.sessionId===data.sessionId){menuContext.text=data;objectMenu.refresh(formatControls(menuContext));}
  }
  if(type==='vector-import'&&data.runtimeId===frameRuntimeId&&data.slideId===editorSession.pageId)void commands([{type:'svg.import',slideId:editorSession.pageId,html:data.html}]).catch(error);
  if(type==='vector-draft'&&data.runtimeId===frameRuntimeId&&data.slideId===editorSession.pageId)vectorIngress.receive(data);
  if(type==='vector-state'&&data.runtimeId===frameRuntimeId&&data.slideId===editorSession.pageId){if(data.objects){const ids=new Set(data.objects.map((o:any)=>o.id));if(data.rootId){ids.add(data.rootId);let added=true;while(added){added=false;for(const o of objects)if(o.parent&&ids.has(o.parent)&&!ids.has(o.id)){ids.add(o.id);added=true;}}}objects=[...objects.filter(o=>!ids.has(o.id)),...data.objects];}vectorUI.render(data);}
  if(type==='vector-export'){const url=URL.createObjectURL(new Blob([data.html],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='图形.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(type==='text-error')error(Error(data.message));
  if(type==='object-context' && data.slideId===editorSession.pageId && data.runtimeId===frameRuntimeId)openObjectMenu(data);
  if (type === 'edit-action' && data.slideId === editorSession.pageId)
    enqueueEdit(data.action, true);
  if (type === 'ready' && data.slideId === editorSession.pageId) {
    frame.inert = false;
    frameRuntimeId = data.runtimeId;
    canvasLoading.ready();
    editorSession.update({canvas:'ready'});
    editorSession.setStepRange(data.max,data.nativeMax ?? slide().nativeStepCount);
    teachingStepsUI.render();
    rects = data.objects;
    sourceScenes = data.scenes ?? [];
    initializeEditCanvas();
    send('camera',{scale:editorShell.zoom()});
    void authorCanvas.update().catch(error);
    const drafts=geometrySession.states(editorSession.pageId);if(drafts.length)send('geometry-draft',{states:drafts});
    if(geometrySession.count)void geometrySession.drain().catch(error);
    sendSnapping();
    renderSelection();
  }
  if (type === 'select') {
    editorSession.update({selectionScope:typeof data.scope==='string'?data.scope:undefined});
    changeSelection(Array.isArray(data.ids) ? data.ids : data.id ? [data.id] : []);
    rects = data.objects;
    renderObjects();
    renderSelection();
  }
  if (type === 'text')
    void commands([
      { type: 'element.patch', slideId:editorSession.pageId, target: data.id, patch: { text: data.text } },
    ]).catch(error);
  if (type === 'connector-edit' && data.slideId === editorSession.pageId)
    void commands([
      { type: 'connector.set', slideId:editorSession.pageId, connector: connectorSchema.parse(data.connector) },
    ]).catch(error);
  if (type === 'guide-edit') {
    const pageId = editorSession.pageId,
      documentId = editorSession.snapshot.document.id,
      id = data.id ?? uuid();
    guideEdits = guideEdits
      .then(async () => {
        await whenEditsIdle();
        await whenIdle();
        if (editorSession.snapshot.document.id !== documentId || editorSession.pageId !== pageId) return;
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
        if (editorSession.pageId === pageId && !data.remove) send('guide-focus', { id });
      })
      .catch(error);
  }
  if(type==='camera-hand')editorShell.hand(!!data.active);
  if(type==='camera-pan')editorShell.pan(data.x,data.y);
  if (type === 'camera-wheel') editorShell.wheel(data.x,data.y,data.delta);
  if (type === 'geometry-commit' && data.slideId === editorSession.pageId && data.runtimeId === frameRuntimeId) {
    void geometrySession.enqueue(data as GeometryEdit).catch(error);
  }
  if (type === 'box-resize')
    void commands([
      { type: 'element.patch', slideId:editorSession.pageId, target: data.id, patch: { style: data.style } },
      {
        type: 'element.transform',
        slideId:editorSession.pageId,
        target: data.id,
        transform: { width: data.width, height: data.height, matrix: data.matrix },
      },
    ]).catch(error);
  if (type === 'transform')
    void commands([
      {
        type: 'elements.arrange',
        slideId:editorSession.pageId,
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
  if (type === 'step') editorSession.setStepRange(data.max,undefined,data.step);
  if (type === 'edit-error') error(new Error(data.message));
  if (type === 'media-blocked')
    mediaInspector.notice('浏览器未允许自动播放，请使用媒体播放按钮。');
  if (type === 'measure') {rects = data;renderGeometryFields();}
  if (
    type === 'navigate' &&
    data.slideId &&
    editorSession.snapshot.document.slides.some((s) => s.id === data.slideId)
  ) {
    void showPage(data.slideId).catch(pageError);
  }
  if (type === 'navigate' && data.direction) setStep(editorSession.canvasStep + data.direction);
});
let guideEdits: Promise<void> = Promise.resolve();
function sendSnapping() {send('snapping',viewSettings.getSnapshot());}
viewSettings.restore();
canvasController.onDispose(viewSettings.subscribe(sendSnapping));
bindGuideActions({source:()=>({documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId}),guides:()=>slide().guides??[],commands});

editorActions.replaceText=async(field,text)=>{
  const object=objects.find(object=>object.id===field.target);
  if(editorSession.snapshot.document.id!==field.documentId||editorSession.pageId!==field.slideId||editorSession.selection.size!==1||!editorSession.selection.has(field.target)||!object||object.locked||!editorSession.getSnapshot().inspector.text)throw Error('对象已变化，请重新选择后编辑');
  if(object.text!==field.value)throw Error('文字已变化，输入已保留，请核对后重新编辑');
  if(text!==field.value)await commands([{type:'element.patch',slideId:field.slideId,target:field.target,patch:{text}}]);
};
let propertyEdits:Promise<unknown>=Promise.resolve();
editorActions.editGeometry=edit=>{
 const {source,field,value:amount,proportional}=edit,ids=source.ids,pageId=source.slideId,documentId=source.documentId;
 if(!Number.isFinite(amount))return Promise.reject(Error('请输入有效数值'));
 const task=propertyEdits.catch(()=>{}).then(async()=>{
  // Geometry commands project locally; capture after local gesture staging, not network acknowledgement.
  await kernel.flush();
  if(documentId!==editorSession.snapshot.document.id||pageId!==editorSession.pageId)throw Error('页面已变化，请重新选择后编辑');
  if(ids.some(id=>!objects.some(object=>object.id===id&&!object.locked)))throw Error('对象不存在或已锁定');
  const capture=await captureSelection(ids),first=slide().transforms[ids[0]],matrix=first?.matrix;
  const rotation=ids.length>1?0:matrix?Math.atan2(matrix[1],matrix[0])*180/Math.PI:first?.rotate??0;
  const reflow=ids.length===1&&capture.textReflowTargets?.includes(ids[0])&&editorSession.getSnapshot().textReflow;
  if(reflow&&(field==='object-width'||field==='object-height')){
    send('object-box-size',{target:ids[0],field,value:amount,proportional});await captureSelection(ids);await geometrySession.whenLocallySaved();
  }else await commands([geometryCommand(pageId,capture.rectangles,field,amount,proportional,rotation)]);
 });
 propertyEdits=task.catch(()=>{});return task;
};
function renderGeometryFields(){
 const box=selectionBounds(rects.filter(r=>editorSession.selection.has(r.id)));
 if(!box){editorSession.update({geometryFields:undefined});return;}
 const ids=[...editorSession.selection],first=slide().transforms[ids[0]],matrix=first?.matrix;
 const rotation=ids.length>1?0:matrix?Math.atan2(matrix[1],matrix[0])*180/Math.PI:first?.rotate??0;
 const round=(value:number)=>Math.round(value*100)/100;
 const geometryFields={key:JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,ids]),documentId:editorSession.snapshot.document.id,slideId:editorSession.pageId,ids,editable:ids.every(id=>objects.some(object=>object.id===id&&!object.locked))&&!ids.some(id=>slide().connectors.some(c=>c.id===id)),values:{tx:round(box.x),ty:round(box.y),'object-width':round(box.width),'object-height':round(box.height),rotation:round(rotation),scale:1}};
 if(JSON.stringify(geometryFields)!==JSON.stringify(editorSession.getSnapshot().geometryFields))editorSession.update({geometryFields});
}
editorActions.toggleObjectLock = () =>
  commands(
    [...editorSession.selection].map((target) => ({
      type: 'element.lock',
      slideId:editorSession.pageId,
      target,
      locked: !objects.find((o) => o.id === target)?.locked,
    })),
  );
async function changeLayer(action: 'front' | 'back' | 'forward' | 'backward') {
  const sourceSelection=arrangementScope();
  await kernel.flush();
  await geometrySession.whenLocallySaved();
  if(arrangementScope()!==sourceSelection)throw new Error('选区已变化，请重新调整层级');
  const targets = [...editorSession.selection],
    pageId = editorSession.pageId,
    documentId = editorSession.snapshot.document.id,
    source = arrangementSource();
  if (!targets.length) return;
  const plan=captureLayerPlan(pageId,targets,objects,action);
  const capture=plan.captureIds.length?await captureSelection(plan.captureIds):undefined;
  if (editorSession.pageId !== pageId || editorSession.snapshot.document.id !== documentId || arrangementSource() !== source || arrangementScope()!==sourceSelection)
    throw new Error('页面或选区在调整层级前已变化，请重试');
  const edits=layerPlanCommands(plan,capture?.computedStyles);
  if (!edits.length) return;
  return commands(edits);
}
editorActions.selectLayer=(source,id,toggle)=>{
  if(source.documentId!==editorSession.snapshot.document.id||source.pageId!==editorSession.pageId||!objects.some(object=>object.id===id))return;
  changeSelection([id],toggle?'toggle':'replace');renderSelection(false);
};
editorActions.saveObjectName=async(field,name)=>{
  if(editorSession.snapshot.document.id!==field.documentId||editorSession.pageId!==field.slideId||editorSession.selection.size!==field.targets.length||!field.targets.every(id=>editorSession.selection.has(id)))throw Error('选区已变化，请重新选择后编辑');
  const chosen=field.targets.map(id=>objects.find(object=>object.id===id));
  if(chosen.some(object=>!object||object.locked))throw Error('对象不存在或已锁定');
  if(chosen.some(object=>(object!.attributes['data-notale-name']??'')!==field.before[object!.id]))throw Error('对象名称已变化，输入已保留，请核对后重新编辑');
  await commands(field.targets.map(target=>({type:'element.patch',slideId:field.slideId,target,patch:{attributes:{'data-notale-name':name}}})));
};
editorActions.hideObjects = () =>
  commands(
    [...editorSession.selection].map((target) => ({
      type: 'element.patch',
      slideId:editorSession.pageId,
      target,
      patch: { style: { visibility: 'hidden' } },
    })),
  );
editorActions.showObjects = () =>
  commands(
    [...editorSession.selection].map((target) => ({
      type: 'element.patch',
      slideId:editorSession.pageId,
      target,
      patch: { style: { visibility: 'visible' } },
    })),
  );
function runGrouping(action:'group'|'ungroup'){
 const plan=groupingPlan(action,slide(),[...editorSession.selection],objects,uuid);
 return plan.kind==='canvas'?send('vector-action',{action:plan.action}):commands(plan.commands);
}
function groupSelection(){return runGrouping('group');}
function ungroupSelection(){return runGrouping('ungroup');}
canvasController.onDispose(()=>renderSelectionTools([],new Set(),[],false));
editorActions.selectionTool=async action=>{assertWorkbenchOpen();if(action==='group')return groupSelection();if(action==='ungroup')return ungroupSelection();if(action==='align-left')return arrange('left');if(action==='distribute')return arrange('distribute-x');};

let sourceScenes: SourceScene[] = [];
const sceneInspector=createSceneInspector({
 source:()=>({documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,runtimeId:frameRuntimeId,target:editorSession.selection.size===1?[...editorSession.selection][0]:'',ready:editorSession.canvasReady,scenes:sourceScenes,saved:slide().scenes??[]}),
 inspect:async sceneId=>{await whenReady();return canvasController.request<SceneInspection>('scene-inspect',{sceneId});},
 commands,select:id=>{changeSelection([id]);renderSelection();},
});
canvasController.onDispose(()=>sceneInspector.dispose());
function renderScene(){sceneInspector.render();}

const componentNavigation=createComponentNavigation({
 source:()=>{
  const scope=JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,editorSession.snapshot.version]);
  const inspection=nativeChartInspector.inspection;
  return {scope,target:editorSession.selection.size===1?[...editorSession.selection][0]:'',objects,
   components:Object.entries(slide().nativeCharts??{}).flatMap(([id,chart])=>chart.interaction?[{id,component:chart.interaction}]:[]),
   discovered:inspection?.component?{id:inspection.target,component:inspection.component}:undefined};
 },select:id=>{changeSelection([id]);renderObjects();renderSelection();},
});
canvasController.onDispose(()=>componentNavigation.dispose());
function renderComponentNavigation(){componentNavigation.render();}
const nativeChartInspector=createNativeChartInspector({
 source:()=>{const target=editorSession.selection.size===1?[...editorSession.selection][0]:'';return {documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,target,runtimeId:frameRuntimeId,available:editorSession.canvasReady&&!!target&&(rects.some(r=>r.id===target&&r.nativeChart)||!!slide().nativeCharts?.[target]),chart:slide().nativeCharts?.[target]};},
 inspect:async target=>{await whenReady();return canvasController.request<NativeChartInspection>('native-chart-inspect',{target});},
 commands,discovered:()=>renderComponentNavigation(),supports:(property,value)=>CSS.supports(property,value),
});
canvasController.onDispose(()=>nativeChartInspector.dispose());
function renderNativeChart(){nativeChartInspector.render();}
function inspectNativeChart(){return nativeChartInspector.inspect();}

editorActions.saveBinding=async(field,value)=>{
  const object=objects.find(object=>object.id===field.target);
  if(editorSession.snapshot.document.id!==field.documentId||editorSession.pageId!==field.slideId||editorSession.selection.size!==1||!editorSession.selection.has(field.target)||!object||object.locked||!['input','select','textarea'].includes(object.tag))throw Error('对象已变化，请重新选择后编辑');
  const binding=slide().bindings.find(binding=>binding.target===field.target);
  if(JSON.stringify(binding??null)!==field.before)throw Error('互动初始值已变化，输入已保留，请核对后重新编辑');
  await commands([{type:'binding.set',slideId:field.slideId,binding:{id:binding?.id??uuid(),target:field.target,label:object.attributes.id??object.tag,value:object.attributes.type==='checkbox'?value==='true':value,event:object.tag==='select'?'change':'input'}}]);
};

function fillAnimation(a: AnimationSpec) {
  for(const [id,value] of Object.entries(animationDraftFields(a)))set(id as AnimationField,value);
  showAnimationGroup(effectGroups.find(g=>g.effects.includes(a.effect))?.kind??'entrance');
  animationDraft.reverse=a.autoReverse??false;
  animationPath.set(a.path??[{x:0,y:0},{x:a.dx,y:a.dy}]);
}

function readAnimation(id: string) {
 return animationDraft.read(id,current().id,animationPath.get(),slide().animations.find(a=>a.id===id)?.chartStateId);
}

let animationUpdate: Promise<unknown> = Promise.resolve();
function saveAnimationFields(field:string,reflow=false) {
  if (!animationSelection.selected) return;
  // An object trigger is incomplete until its target is chosen; saving it would be rejected and pause the sync journal.
  if (value('trigger') === 'object' && !value('trigger-target')) return;
  let animation: ReturnType<typeof readAnimation>;
  try {animation=readAnimation(animationSelection.selected);} catch(e) {error(e);return;}
  const targetDocument=editorSession.snapshot.document.id,targetSlide=editorSession.pageId, id=animationSelection.selected;
  animationUpdate=animationUpdate.catch(()=>{}).then(()=>{
    if(editorSession.snapshot.document.id!==targetDocument)throw Error('讲义已切换，动画修改未提交');
    const source=editorSession.snapshot.document.slides.find(s=>s.id===targetSlide);
    const current=source?.animations.find(a=>a.id===id);
    if(!source||!current)throw Error('动画已删除，修改未提交');
    const next=editAnimationField(current,animation,field);
    return commands(reflow&&!hasTeachingStructure(source)?animationOrderCommands(source,source.animations.map(a=>a.id===id?next:a)):[{type:'animation.set',slideId:targetSlide,animation:next} as Command]);
  }).then(()=>{if(editorSession.pageId===targetSlide&&animationSelection.selected===id)return previewSingleAnimation();}).catch(error);
}
const animationPath=createAnimationPath(()=>saveAnimationFields('path'));
canvasController.onDispose(()=>animationPath.dispose());
animationPath.set([{x:0,y:0},{x:200,y:0}]);
function changeAnimationField(id:string){
    if(id==='trigger') {
      const index=slide().animations.findIndex(a=>a.id===animationSelection.selected),previous=slide().animations[index-1];
      if(previous && ['with-previous','after-previous'].includes(value('trigger')))set('animation-step',previous.step);
      else if(previous && value('trigger')==='click')set('animation-step',Math.min(500,previous.step+1));
    }
    if(id==='effect-direction' && ['fly-in','fly-out','float-in'].includes(value('effect'))) {
      const distance=Math.max(Math.abs(num('dx')),Math.abs(num('dy')),120),d=value('effect-direction');
      set('dx',d==='left'?-distance:d==='right'?distance:0);set('dy',d==='up'?-distance:d==='down'?distance:0);
    }
    saveAnimationFields(id,id==='trigger');
}
editorActions.seekStep=(next,animate=true)=>{if(editorSession.canvasReady)setStep(next,animate);};

editorActions.copyPage = () => {
  const id=uuid(),source=slide(),notes=notesEditor.value(source.id);
  const batch:Command[]=[{type:'slide.duplicate',slideId:source.id,newId:id}];
  if(notes!==source.notes)batch.push({type:'slide.update',slideId:id,patch:{notes}});
  return commands(batch,true,id);
};
editorActions.deletePage = () => {
  const pages=normalPages(),at=pages.findIndex(s=>s.id===editorSession.pageId),next=pages[at+1]??pages[at-1];
  return commands([{ type: 'slide.delete', slideId:editorSession.pageId }], true, next?.id);
};
editorActions.previousPageOrder = ()=>moveNormalPage(editorSession.pageId,Math.max(0,normalPages().findIndex(page=>page.id===editorSession.pageId)-1));
editorActions.nextPageOrder = ()=>moveNormalPage(editorSession.pageId,Math.min(normalPages().length-1,normalPages().findIndex(page=>page.id===editorSession.pageId)+1));
editorActions.addPage = () => {
  const id = uuid();
  return commands(
    [
      {
        type: 'slide.insert',
        after: editorSession.pageId,
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
};
let uploadAction:
  | { kind: string; target?: string; before?: string; poster?: boolean; documentId: string; slideId: string; point?: { x: number; y: number } }
  | undefined;
function chooseMedia(kind: string, target?: string, poster = false, point?: { x: number; y: number }) {
  uploadAction = { kind, target, before: target ? objects.find(object=>object.id===target)?.attributes[poster?'poster':'src']??'' : undefined, poster, documentId: editorSession.snapshot.document.id, slideId:editorSession.pageId, point };
  requestMediaFile(kind);
}
async function uploadAsset(bytes: Uint8Array, mime: string) {
  const data = await assetBase64(bytes);
  assertWorkbenchOpen();
  return api('/api/assets', { data, mime: mime || 'application/octet-stream' });
}
// KaTeX HTML output needs one stylesheet (fonts are inlined). Reuse the lecture's
// own copy when the import brought one; otherwise store the bundled copy once.
async function insertEquation(client?: { x: number; y: number }) {
  const existing = Object.keys(editorSession.snapshot.document.assets).find((p) => p.endsWith('lib/katex.min.css')),
    path = existing ?? 'assets/lib/katex.min.css',
    href = '../'.repeat(slide().sourcePath.split('/').length - 1) + path.split('/').map(encodeURIComponent).join('/'),
    edits: unknown[] = [];
  if (!existing) {
    const response = await fetch('/katex.min.css');
    if (!response.ok) throw new Error('无法加载公式样式');
    edits.push({ type: 'asset.put', path, asset: await uploadAsset(new Uint8Array(await response.arrayBuffer()), 'text/css') });
  }
  edits.push({ type: 'element.insert', slideId:editorSession.pageId, html: placed(template('equation', DEFAULT_TEX, href), 'equation', client) });
  return commands(edits);
}
// New objects land in the middle of what the author is looking at, each one offset from
// the last so repeats do not hide under each other. PowerPoint centres in the view;
// dragging an entry from the panel drops at the pointer, as in Figma.
const NOMINAL: Record<string, [number, number]> = {
  text: [600, 60], 'vertical-text': [100, 420], symbol: [120, 80], wordart: [420, 90], date: [420, 60],
  code: [720, 130], shape: [300, 160], icon: [160, 160], line: [400, 80], table: [650, 170],
  chart: [680, 400], equation: [320, 110], image: [500, 320], video: [600, 340], audio: [600, 60],
  'smart:process': [1100, 190], 'smart:list': [820, 250], 'smart:cycle': [640, 640],
};
let insertRun = { slide: '', count: 0 };
function documentPoint(client?: { x: number; y: number }) {
  const bounds = frame.getBoundingClientRect(),
    view = $('canvas-viewport').getBoundingClientRect(),
    scale = bounds.width / editorSession.snapshot.document.width || 1;
  const at = client ?? {
    x: (Math.max(bounds.left, view.left) + Math.min(bounds.right, view.right)) / 2,
    y: (Math.max(bounds.top, view.top) + Math.min(bounds.bottom, view.bottom)) / 2,
  };
  return { x: (at.x - bounds.left) / scale, y: (at.y - bounds.top) / scale };
}
function placement(kind: string, client?: { x: number; y: number }, dimensions?: [number, number]) {
  const { x, y } = documentPoint(client);
  if (insertRun.slide !== editorSession.pageId) insertRun = { slide: editorSession.pageId, count: 0 };
  const stagger = client ? 0 : (insertRun.count++ % 5) * 24;
  const [w, h] = dimensions ?? NOMINAL[kind] ?? NOMINAL[kind.split(':')[0]] ?? [220, 140];
  return mediaPosition(x,y,w,h,stagger);
}
function mediaPosition(x:number,y:number,w:number,h:number,stagger=0) {
  const clamp = (v: number, max: number) => Math.round(Math.max(0, Math.min(max - 40, v)));
  // New objects go on top of existing page content, as in PowerPoint and Figma; the
  // layer controls move them afterwards.
  return `left:${clamp(x - w / 2 + stagger, editorSession.snapshot.document.width)}px;top:${clamp(y - h / 2 + stagger, editorSession.snapshot.document.height)}px;z-index:50;`;
}
const placed = (html: string, kind: string, client?: { x: number; y: number }) =>
  html.replace('left:120px;top:160px;', placement(kind, client));
function insertObject(kind: string, value?: string, client?: { x: number; y: number }) {
  if (kind === 'connector') return createConnector();
  if (['image', 'video', 'audio'].includes(kind)) {
    chooseMedia(kind, undefined, false, client);
    return;
  }
  if (kind === 'equation') return insertEquation(client);
  if(kind==='chart')return echartsUI?.openGallery();
  return commands([{ type: 'element.insert', slideId:editorSession.pageId, html: placed(template(kind, value), kind, client) }]);
}
// Dragging an entry onto the canvas drops the object where the pointer released. The
// slide runs in an isolated frame, so a surface above it receives the drag, the same
// way file drops are handled.
const insertionDrop=bindInsertionDrop({scope:()=>JSON.stringify([editorSession.getSnapshot().document?.document.id,editorSession.pageId]),bounds:()=>$('canvas-viewport').getBoundingClientRect(),insert:async(kind,value,point)=>insertObject(kind,value,point),error});
const insertActions=bindInsertActions({insert:async(kind,value)=>insertObject(kind,value),drag:insertionDrop.show,error});
canvasController.onDispose(()=>{insertActions.dispose();insertionDrop.dispose();});
editorActions.importMedia=async file=>{
    const action=uploadAction;
    uploadAction=undefined;
    if(!action)return;
    const assertSource=()=>{assertWorkbenchOpen();if(action.documentId!==editorSession.snapshot.document.id||action.slideId!==editorSession.pageId)throw Error('页面已切换，请重新选择媒体');if(action.target){const object=objects.find(object=>object.id===action.target);if(!object||object.locked)throw Error('媒体对象不存在或已锁定，请重新选择');if((object.attributes[action.poster?'poster':'src']??'')!==action.before)throw Error('目标媒体已变化，未覆盖新的内容，请重新选择文件');}};
    assertSource();
    if(file.type&&!file.type.startsWith(action.kind+'/'))throw Error('文件类型与所选媒体类型不符');
    if(!action.target&&(file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg'))){
      const source=await file.text();assertSource();
      await commands([{type:'svg.import',slideId:action.slideId,html:prepareSvgImport(source,120,160,(w,h)=>placement('image',action.point,[w,h]))}]);return;
    }
    const bytes=new Uint8Array(await file.arrayBuffer());assertSource();
    const asset=await uploadAsset(bytes,file.type);assertSource();
    const path=`media/${uuid()}/${file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,120)||'media.bin'}`;
    const src='../'.repeat(slide().sourcePath.split('/').length-1)+path.split('/').map(encodeURIComponent).join('/');
    await commands([
      {type:'asset.put',path,asset},
      action.target?{type:'media.update',slideId:action.slideId,target:action.target,patch:action.poster?{poster:src}:{src}}
        :{type:'element.insert',slideId:action.slideId,html:placed(template(action.kind,src),action.kind,action.point)},
    ]);
};
async function restore(
  version: number,
  after: HistoryPlan = { undo: [...undo], redo: [] },
  historyAction?: 'undo'|'redo',
) {
  await kernel.flush();
  await geometrySession.barrier();
  if (pending) throw new Error('请先处理待确认修改');
  await geometrySession.submit({
    kind: 'restore',
    inverseVersion:historyAction?version:undefined,historyAction,
    documentId: editorSession.snapshot.document.id,
    request: { version, baseVersion: editorSession.snapshot.version, mutationId: uuid() },
    after,
    slideId:editorSession.pageId,
    selection: [...editorSession.selection],
  });
}
function confirmLocalTextHistory(){if(textSession?.sequence!==undefined){const node=new DOMParser().parseFromString(slide().html,'text/html').querySelector('[data-notale-id="'+CSS.escape(textSession.target)+'"]');if(node)send('text-confirm',{...textSession,html:node.innerHTML});}}
async function undoEdit() {
  await textIngress.flush();
  if(await kernel.undo()){confirmLocalTextHistory();return;}
  undo=undo.filter(v=>!kernel.handlesVersion(v));
  if(await geometrySession.undo())return;
  await geometrySession.barrier();
  if (!undo.length) return;
  await restore(undo.at(-1)!, { undo: undo.slice(0, -1), redo: [...redo] },'undo');
}
async function redoEdit() {
  if(await kernel.redo()){confirmLocalTextHistory();return;}
  if(await geometrySession.redo())return;
  await geometrySession.barrier();
  if (!redo.length) return;
  await restore(redo.at(-1)!, { undo: [...undo], redo: redo.slice(0, -1) },'redo');
}
editorActions.undo=undoEdit;
editorActions.redo=redoEdit;

let previewSlides: { id: string; url: string }[] = [];
// PDF goes through the browser's own print pipeline: one page per slide at the deck's
// size, printed from a plain sheet of frames. PowerPoint's export is a single file with
// one slide per page; the print dialog's "Save as PDF" produces the same thing without
// putting a headless browser in the backend.
async function printDocument(){
  const documentId=editorSession.snapshot.document.id;
  const sheet=window.open('', '_blank');
  if(!sheet)throw Error('请允许打开新窗口以导出 PDF');
  let lease:ReturnType<typeof trackPreviewLease>|undefined;const timers=new Set<ReturnType<typeof setTimeout>>();
  const wait=(duration:number)=>new Promise<void>(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve();},duration);timers.add(timer);});
  try{
  await flushDocument();
  if(workbenchEvents.signal.aborted||editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换，请重新导出');
  const exported=editorSession.snapshot;
  const preview=await canvasResources.getPreview(documentId,exported.version);
  if(workbenchEvents.signal.aborted||sheet.closed)throw Error('导出窗口或编辑会话已关闭');
  lease=trackPreviewLease(documentId,preview);
  const pages = exported.document.slides.filter((s) => !s.hidden&&!s.layoutSourceId);
  const frames = pages.map((page) => preview.slides.find((preview) => preview.id === page.id)?.url).filter((url): url is string => !!url);
  if (frames.length !== pages.length) throw new Error('请等待页面预览就绪后再导出 PDF');
  const { width, height } = exported.document;
  sheet.document.write(
    `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(exported.document.title)}</title><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;padding:0;background:#fff}.print-page{width:${width}px;height:${height}px;overflow:hidden;break-after:page}.print-page:last-child{break-after:auto}iframe{width:${width}px;height:${height}px;border:0;display:block}#print-hint{position:fixed;inset:auto 16px 16px auto;padding:10px 14px;border-radius:8px;background:#263449;color:#fff;font:14px system-ui}</style></head><body><div id="print-hint">正在准备 ${frames.length} 页…</div>${frames
      .map((url) => `<div class="print-page"><iframe src="${esc(url)}" title="讲义页面"></iframe></div>`)
      .join('')}</body></html>`,
  );
  sheet.document.close();
  await waitForPrintPages(sheet,[...sheet.document.querySelectorAll('iframe')].map((frame,index)=>({frame,slideId:pages[index].id})),preview.channel,workbenchEvents.signal);
  await wait(600);
  sheet.document.getElementById('print-hint')?.remove();
  sheet.focus();
  if(workbenchEvents.signal.aborted||sheet.closed)throw Error('导出窗口或编辑会话已关闭');
  sheet.print();
  }catch(cause){sheet.close();throw cause;}finally{lease?.stop();for(const timer of timers)clearTimeout(timer);}
}
const documentIO=bindDocumentIO({documentId:()=>editorSession.getSnapshot().document?.document.id??'',importFile:(file,kind,active)=>importDocument(file,kind,{api,upload:uploadAsset,active}),open:id=>init(id),notice:message=>notices.show(message),exportFile:async kind=>{
 if(kind==='pdf')return printDocument();
 const documentId=editorSession.snapshot.document.id;await flushDocument();
 if(workbenchEvents.signal.aborted||editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换，请重新导出');
 location.href=`/api/documents/${documentId}/export?version=${editorSession.snapshot.version}`;
}});
canvasController.onDispose(()=>documentIO.dispose());
async function show(speaker = false,fromBeginning=false) {
  const documentId=editorSession.snapshot.document.id;
  const slideId=fromBeginning?normalPages()[0]?.id:editorSession.pageId;
  const viewer=window.open('about:blank','_blank');
  try {
    if(!viewer)throw Error('请允许打开讲授窗口');
    await flushDocument();
    assertWorkbenchOpen();
    if(viewer.closed)return;
    if(editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换，请重新开始放映');
    if(!slideId||!editorSession.snapshot.document.slides.some(page=>page.id===slideId))throw Error('放映起始页已被删除，请重新选择页面');
    const query=new URLSearchParams({document:documentId,version:String(editorSession.snapshot.version),slide:slideId});
    if(speaker)query.set('speaker','1');
    viewer.location.href=`/present?${query}`;
  } catch(cause) {viewer?.close();throw cause;}
}

editorActions.present=show;
const notesEditor=bindNotesEditor({snapshot:()=>editorSession.getSnapshot().document,pageId:()=>editorSession.pageId,subscribe:editorSession.subscribe,commands,canAutosave:()=>!textSession,present:()=>show(true)});
canvasController.onDispose(()=>notesEditor.dispose());
editorActions.keyboardRecoveries=()=>geometrySession.keyboardRecoveries();
editorActions.dismissKeyboardRecovery=id=>geometrySession.dismissKeyboard(id);
editorActions.inspectKeyboardRecovery=async record=>{
 if(editorSession.snapshot.document.id!==record.intent.documentId)await load(record.intent.documentId);
 await showPage(record.intent.slideId);assertWorkbenchOpen();
 changeSelection(record.intent.ids.filter(id=>objects.some(object=>object.id===id)));renderObjects();renderSelection();
 editorSession.update({documentDialog:undefined});
};
const keyboardQueue=new KeyboardQueue({
 retain:records=>geometrySession.retainKeyboard(records),
 prepare:async()=>{await textIngress.flush();await whenReady();},
 execute:executeKeyboardIntent,
 error:cause=>{error(cause);if(!pending)mark();},
},workbenchEvents.signal);
function whenEditsIdle(){return keyboardQueue.whenIdle();}
function enqueueEdit(action:EditAction,focusCanvas=false){
 if(!editorSession.snapshot||!action)return;
 keyboardQueue.enqueue({action,documentId:editorSession.snapshot.document.id,slideId:editorSession.pageId,ids:[...editorSession.selection],focusCanvas});
}
async function executeKeyboardIntent(item:KeyboardIntent,effectsComplete:(selection?:readonly string[])=>void):Promise<readonly string[]|undefined>{
      assertWorkbenchOpen();
      if (item.documentId !== editorSession.snapshot.document.id || item.slideId !== editorSession.pageId)
        throw new Error('页面已切换，未执行剩余快捷键操作');
      const action = item.action;
      if (['nudge', 'copy', 'cut', 'delete', 'duplicate','group','ungroup','front','back','forward','backward'].includes(action.type)) {
        changeSelection(item.ids);
        renderObjects();
        renderSelection();
        if (!editorSession.selection.size) return;
      }
      if (['nudge', 'delete', 'cut','group','ungroup','front','back','forward','backward'].includes(action.type)) {
        assertSelectionEditable([...editorSession.selection],objects);
      }
      if (action.type === 'nudge') {
        if (!action.dx && !action.dy) return;
        const captured = await captureSelection();
        assertWorkbenchOpen();
        if(item.documentId!==editorSession.snapshot.document.id||item.slideId!==editorSession.pageId)throw Error('页面已切换，请重新移动对象');
        if (!captured.rectangles.length) {
          connectorGeometryNotice();
          return;
        }
        if (captured.rectangles.some((r) => !r.geometry))
          throw new Error('该对象的坐标变换暂不支持键盘微调');
        await commands([
          {
            type: 'elements.arrange',
            slideId:editorSession.pageId,
            action: 'translate',
            rectangles: captured.rectangles,
            dx: action.dx,
            dy: action.dy,
          },
        ]);
      } else if(action.type==='group'){
        if(editorSession.selection.size>=2)await groupSelection();
      } else if(action.type==='ungroup')await ungroupSelection();
      else if(action.type==='front'||action.type==='back'||action.type==='forward'||action.type==='backward')await changeLayer(action.type);
      else if (action.type === 'copy' || action.type === 'cut') await copySelection(action.type);
      else if (action.type === 'paste') await pasteSelection();
      else if (action.type === 'duplicate') {
        await copySelection('copy');
        await pasteSelection();
      } else if (action.type === 'delete')
        await commands(deleteSelectionCommands(item.slideId,item.ids,objects));
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
        if (action.type === 'clear') editorSession.update({overview:false});
      }
      effectsComplete([...editorSession.selection]);
      if (item.focusCanvas) {
        await whenReady();
        frame.focus();
        send('focus', {});
      }
      return [...editorSession.selection];
}
// A surface with a text cursor keeps the browser's own undo. Colour swatches, sliders,
// spinners and menus carry no text history, so Ctrl+Z with one of them focused must undo
// the document instead of doing nothing — the same as PowerPoint and Figma. Other
// shortcuts stay out of every field, where they would fight with editing.
const TEXT_ENTRY = new Set(['text', 'search', 'url', 'email', 'tel', 'password', '']);
function keepsNativeUndo(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target instanceof HTMLInputElement && !target.hasAttribute('data-editor-number') && TEXT_ENTRY.has(target.type);
}
document.addEventListener('keydown', (e) => {
  if(e.defaultPrevented)return;
  if((e.target as Element)?.closest?.('#chart-data-dock')){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void(e.shiftKey?redoEdit():undoEdit()).catch(error);}return;}
  const action = editShortcut(e);
  if (!action) return;
  if((e.target as Element)?.closest?.('#animations')&&!['undo','redo'].includes(action.type))return;
  const inField =
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
  if (inField && (!['undo', 'redo'].includes(action.type) || keepsNativeUndo(e.target))) return;
  if (action.type === 'paste' && !clipboard) return; // Native files when no internal object clipboard is active.
  e.preventDefault();
  enqueueEdit(action);
}, {signal:workbenchEvents.signal});

const vectorIngress=createVectorIngress(geometrySession,()=>editorSession.snapshot.document.id,()=>editorSession.snapshot.version,error);

async function init(id?: string) {
  assertWorkbenchOpen();
  const chosen = id ?? new URLSearchParams(location.search).get('document');
  const populate = (docs: {id:string;title:string}[]) => {
    if(workbenchEvents.signal.aborted)return;
    // Preserve a document opened or created while the catalogue was loading.
    const current = editorSession.snapshot?.document;
    if(current && !docs.some(d=>d.id===current.id))docs=[current,...docs];
    editorSession.update({documents:docs,catalogueNotice:''});
  };
  if(chosen){
    // The catalogue is auxiliary; it must never delay opening an explicit document.
    await load(chosen);
    assertWorkbenchOpen();
    void api('/api/documents').then(populate).catch(()=>{
      if(workbenchEvents.signal.aborted)return;
      editorSession.update({catalogueNotice:'讲义列表暂时不可用，当前讲义可继续编辑'});
    });
    return;
  }
  const docs = await api('/api/documents');
  assertWorkbenchOpen();
  populate(docs);
  if (!docs[0]?.id) {
    editorSession.update({emptyMessage:'尚无讲义。请导入已有工程或 PowerPoint 文件。'});
    setSaveStatus(PHASES.waitingImport);
    return;
  }
  await load(docs[0].id);
}
editorActions.loadDocument=load;
let recoveryController:ReturnType<typeof bindRecovery>|undefined;
async function refreshRecoveries(){await recoveryController?.refresh();}
function downloadRecovery(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'notale-recovery.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const mediaInspector=createMediaInspector({source:()=>{const object=editorSession.selection.size===1?objects.find(object=>editorSession.selection.has(object.id)&&['img','video','audio'].includes(object.tag)):undefined;return {documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,object};},commands,replace:(object,poster)=>chooseMedia(poster||object.tag==='img'?'image':object.tag,object.id,poster)});
canvasController.onDispose(()=>mediaInspector.dispose());
const sourceEditor=createSourceEditor({source:()=>{const object=editorSession.selection.size===1?objects.find(object=>editorSession.selection.has(object.id)):undefined;return {documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,target:object?.id??'',style:object?.style??{},attributes:object?.attributes??{},html:object?.html??'',disabled:!object||!!object.locked||slide().connectors.some(c=>c.id===object.id)};},commands});
canvasController.onDispose(()=>sourceEditor.dispose());
async function arrange(action: string) {
  const sourceDocument = arrangementSource(), sourceSlide = editorSession.pageId, sourceSelection=arrangementScope();
  assertSelectionEditable([...editorSession.selection],objects);
  const settings = arrangementSettings(action);
  const capture = await captureSelection();
  if (arrangementSource() !== sourceDocument || editorSession.pageId !== sourceSlide || arrangementScope()!==sourceSelection) throw new Error('页面、选区或内容已变化，请在当前页重新操作');
  if (!capture.rectangles.length) {
    connectorGeometryNotice();
    return;
  }
  if(!['rotate','scale','translate'].includes(action)){
    const edits=alignmentCommands(editorSession.pageId,capture.rectangles,editorSession.selectionScope?[]:slide().groups,action,settings.reference,editorSession.snapshot.document.width,editorSession.snapshot.document.height);
    if(edits.length)return commands(edits);
    return;
  }
  return commands([
    {
      type: 'elements.arrange',
      slideId:editorSession.pageId,
      action,
      rectangles: capture.rectangles,
      ...settings,
    },
  ]);
}
function arrangementSource(){const doc=editorSession.snapshot.document,page=slide();return JSON.stringify([doc.id,doc.width,doc.height,doc.theme,doc.layouts.find(layout=>layout.id===page.layoutId),page]);}
function arrangementScope(){return JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,[...editorSession.selection].sort()]);}
const arrangement=bindArrangement({scope:arrangementScope,arrange,layer:changeLayer});
canvasController.onDispose(()=>arrangement.dispose());

const saveRecovery=bindSaveRecovery({
 scope:()=>editorSession.getSnapshot().document?.document.id??'',
 export:async()=>downloadRecovery(await geometrySession.exportDraft()),
 retry:async()=>{if(geometrySession.count)await geometrySession.retry();else if(pending)await transmit(pending);},
 reload:async()=>{if(isBusy())throw Error('正在保存，请等待当前请求结束');const documentId=editorSession.snapshot.document.id;if(pending)journal.clear(pending);await geometrySession.abandon();pending=undefined;if(editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换');await load(documentId);},
});
canvasController.onDispose(()=>saveRecovery.dispose());

try {
  migratedLegacy = journal.migrateLegacy();
} catch (e) {
  error(e);
}

window.addEventListener('storage', (event) => {
  if (isJournalKey(event.key)) refreshRecoveries();
}, {signal:workbenchEvents.signal});
window.addEventListener('beforeunload', (e) => {
  if (pending || isBusy() || geometrySession.count || keyboardQueue.pending) {
    e.preventDefault();
    e.returnValue = '';
  }
}, {signal:workbenchEvents.signal});
editorActions.setTextReflow=enabled=>{editorSession.update({textReflow:enabled});send('resize-mode',{reflow:enabled});};
const authoredComponents = createComponentInspector({
  slide,
  document: () => editorSession.snapshot.document,
  capture: captureSelection,
  objects: () => objects,
  selected: () => [...editorSession.selection],
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
canvasController.onDispose(()=>authoredComponents.dispose());
const teachingStepsUI = createStepInspector({
  scope:()=>JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId]),
  chooseAnimationStep:index=>{if(!animationSelection.selected)animationDraft.set('animation-step',index);},
  slide,
  step: () => editorSession.canvasStep,
  nativeMax: () => editorSession.nativeMax,
  ready: () => editorSession.canvasReady,
  whenReady,
  preview: (index, play) => {
    if (play) { void previewActions.open(index); return; }
    setStep(index, true, index);
  },
  commands,
});
canvasController.onDispose(()=>teachingStepsUI.dispose());
const pageSettings=createPageSettings({document:()=>editorSession.snapshot.document,current:()=>editorSession.pageId,commands,editMaster:(id,pageId)=>layoutManager.edit(id,pageId)});
const layoutValuesUI = createLayoutValues({
  slide:()=>pageSettings.target()??slide(),
  document: () => editorSession.snapshot.document,
  selected: () => [...editorSession.selection],
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

});
const contextInspector = createContextInspector();
const typographyUI = createTypography({
  documentId:()=>editorSession.snapshot.document.id,enabled:()=>editorSession.getSnapshot().inspector.typography,
  key: () => JSON.stringify([editorSession.snapshot.document.id, editorSession.snapshot.version, kernel.revision, editorSession.pageId, [...editorSession.selection]]),
  ready: () => editorSession.canvasReady,
  ids: () => [...editorSession.selection],
  objects: () => objects,
  slideId: () => editorSession.pageId,
  capture: captureSelection,
  commands,preview:(key,cmds)=>kernel.preview(key,cmds),commit:(key,cmds)=>kernel.commit(key,cmds),cancel:key=>kernel.cancel(key),error,
});
canvasController.onDispose(()=>typographyUI.disposeCapture());
const assetLibrary = createAssetLibrary({
  document: () => editorSession.snapshot.document,
  slide,
  selection: () => objects.filter(o => editorSession.selection.has(o.id)),
  insert: (kind,src)=>placed(template(kind,src),kind),
  commands,
  error,
});
canvasController.onDispose(()=>assetLibrary.dispose());
const pageThumbnails = createPageThumbnails({overview:()=>editorSession.getSnapshot().overview});
canvasController.onDispose(()=>pageThumbnails.dispose());
const revealPreset = createRevealPreset({
  documentId:()=>editorSession.snapshot.document.id,slide, objects: () => objects, selected: () => [...editorSession.selection], commands, whenReady, error,
  choose: id => {changeSelection([id]);renderObjects();renderSelection();},
});
canvasController.onDispose(()=>revealPreset.dispose());
const linkInspector = createLinkInspector({document: () => editorSession.snapshot.document, slide, objects: () => objects, selected: () => [...editorSession.selection], commands});
canvasController.onDispose(()=>linkInspector.dispose());
const richEditor = createRichEditor({
  selected: () => editorSession.selection.size === 1 ? objects.find(o => editorSession.selection.has(o.id)) : undefined,
  key: () => JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,[...editorSession.selection]]),
  slideId: () => editorSession.pageId, commands, capture: captureSelection,
});
canvasController.onDispose(()=>richEditor.dispose());
const mediaIngress=createMediaIngress({
  enabled: () => !workbenchEvents.signal.aborted && !!editorSession.snapshot && !isBusy() && !pending && !document.querySelector('dialog[open]'),
  pasteObjects: pasteSelection,
  svg:async source=>commands([{type:'svg.import',slideId:editorSession.pageId,html:prepareSvgImport(source,120,160,(w,h)=>placement('image',undefined,[w,h]))}]),
  error,
  insert: async (files, point) => {
    const documentId=editorSession.snapshot.document.id, targetSlide=slide();
    const assertDestination=()=>{assertWorkbenchOpen();if(documentId!==editorSession.snapshot.document.id||targetSlide.id!==editorSession.pageId||slide().sourcePath!==targetSlide.sourcePath)throw new Error('上传期间目标页面已变化，请在目标页重新插入');};
    const {x,y}=documentPoint(point);
    const edits: unknown[]=[];
    for(const [index,file] of files.entries()) {
      assertDestination();
      if(file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg')){edits.push({type:'svg.import',slideId:targetSlide.id,html:prepareSvgImport(await file.text(),120,160,(w,h)=>mediaPosition(x,y,w,h,index*24))});continue;}
      const bytes=new Uint8Array(await file.arrayBuffer());
      assertDestination();
      const asset=await uploadAsset(bytes,file.type);
      assertDestination();
      const path=`media/${uuid()}/${file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,120)||'media.bin'}`;
      const src='../'.repeat(targetSlide.sourcePath.split('/').length-1)+path.split('/').map(encodeURIComponent).join('/');
      const kind=file.type.startsWith('image/')?'image':file.type.split('/')[0];
      const [w,h]=NOMINAL[kind]??NOMINAL.image;
      const html=template(kind,src).replace('left:120px;top:160px;',mediaPosition(x,y,w,h,index*24));
      edits.push({type:'asset.put',path,asset},{type:'element.insert',slideId:targetSlide.id,html});
    }
    assertDestination();
    await commands(edits);
  },
});
canvasController.onDispose(()=>mediaIngress.dispose());
const imageCrop=createImageCrop({selected:()=>editorSession.selection.size===1?objects.find(o=>editorSession.selection.has(o.id)):undefined,key:()=>JSON.stringify([editorSession.snapshot.document.id,editorSession.pageId,[...editorSession.selection]]),slideId:()=>editorSession.pageId,preview:()=>frame.src,capture:captureSelection,commands});
canvasController.onDispose(()=>imageCrop.dispose());
const layoutManager=createLayoutManager({document:()=>editorSession.snapshot.document,slide,commands,show:async id=>{await showPage(id);editorShell.inspect('format');}});
const unsubscribeLayouts=editorSession.subscribe(()=>{if(editorSession.getSnapshot().document&&editorSession.snapshot.document.slides.some(page=>page.id===editorSession.pageId))layoutManager.render();});
canvasController.onDispose(()=>{unsubscribeLayouts();layoutManager.dispose();});
const tableInspector=createTableInspector({documentId:()=>editorSession.snapshot.document.id,objects:()=>objects,selection:()=>[...editorSession.selection],select:id=>{changeSelection([id]);renderObjects();renderSelection();},slideId:()=>editorSession.pageId,commands});
canvasController.onDispose(()=>tableInspector.dispose());
const themePanel = createThemePanel({ document: () => editorSession.snapshot.document, commands });
canvasController.onDispose(()=>themePanel.dispose());
const pageBackground = createPageBackground({ document: () => editorSession.snapshot.document, slide, commands });
canvasController.onDispose(()=>pageBackground.dispose());
const commentsPanel = createCommentsPanel({
  document: () => editorSession.snapshot.document,
  slideId: () => editorSession.pageId,
  objects: () => objects,
  selected: () => [...editorSession.selection],
  commands,
  show: showPage,
  select: (id) => { changeSelection([id]); renderObjects(); renderSelection(); },
  uuid,
});
canvasController.onDispose(()=>commentsPanel.dispose());
const findReplace = createFindReplace({
  document: () => editorSession.snapshot.document,
  commands,
  show: showPage,
  select: (id) => { changeSelection([id]); renderObjects(); renderSelection(); },

});
canvasController.onDispose(()=>findReplace.dispose());
// Ctrl/Cmd+H opens replace, the PowerPoint shortcut; the pages panel has a button too.
document.addEventListener('keydown', (event) => {
  if(event.defaultPrevented)return;
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'h') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select'))) return;
  event.preventDefault();
  findReplace.open();
}, {signal:workbenchEvents.signal});
const appearanceInspector = createAppearanceInspector({
  documentId:()=>editorSession.snapshot.document.id,
  objects: () => objects,
  selected: () => [...editorSession.selection],
  key: () => JSON.stringify([editorSession.snapshot.document.id, editorSession.snapshot.version, kernel.revision, editorSession.pageId, [...editorSession.selection]]),
  slideId: () => editorSession.pageId,
  commands,
  preview:(key,cmds)=>kernel.preview(key,cmds),commit:(key,cmds)=>kernel.commit(key,cmds),cancel:key=>kernel.cancel(key),
  capture: captureSelection,
  error,
});
canvasController.onDispose(()=>appearanceInspector.disposeCapture());
const smartDiagram=createSmartDiagram({source:()=>({documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,objects,selection:[...editorSession.selection]}),commands});
canvasController.onDispose(()=>smartDiagram.dispose());
canvasController.onDispose(()=>notices.dispose());
const equationEditor = createEquationEditor({ documentId:()=>editorSession.snapshot.document.id,objects: () => objects, selection: () => [...editorSession.selection], slideId: () => editorSession.pageId, commands });
canvasController.onDispose(()=>equationEditor.dispose());
const codeEditor = createCodeEditor({ documentId:()=>editorSession.snapshot.document.id, objects: () => objects, selection: () => [...editorSession.selection], slideId: () => editorSession.pageId, commands });
canvasController.onDispose(()=>codeEditor.dispose());
const chartEditor=createChartEditor({documentId:()=>editorSession.snapshot.document.id,objects:()=>objects,selection:()=>[...editorSession.selection],slideId:()=>editorSession.pageId,commands});
canvasController.onDispose(()=>chartEditor.dispose());
echartsUI=createEchartsEditor({documentId:()=>editorSession.snapshot.document.id,slide,selection:()=>[...editorSession.selection],locked:()=>[...editorSession.selection].some(id=>objects.find(o=>o.id===id)?.locked),
  inspect:async()=>{const id=[...editorSession.selection][0];if(!rects.some(r=>r.id===id&&r.nativeChart))return {target:id,available:false,series:[]};return await inspectNativeChart()??{target:id,available:false,series:[]};},
  send,select:id=>{changeSelection([id]);renderObjects();renderSelection();},format:()=>editorShell.inspect('format'),commands,error,step:()=>editorSession.canvasStep,setStep,
  commit:async({id,documentId,slideId:pageId,target,before,after})=>{
    if(editorSession.snapshot.document.id!==documentId)throw Error('讲义已切换，图表草稿已保留');
    if(await geometrySession.retainOperation(id))return;
    const chart=editorSession.snapshot.document.slides.find(s=>s.id===pageId)!.nativeCharts[target]??{adapter:'echarts' as const,option:{}};
    await geometrySession.enqueue({id,slideId:pageId,runtimeId:'chart',sequence:Date.now(),commands:[{type:'native-chart.edit',slideId:pageId,target,model:after,before}],before:[{id:target,style:null,chart:{...chart,authoring:before}}],after:[{id:target,style:null,chart:{...chart,authoring:after}}],chart:true});
  },
});
pageSettings.bindValues(()=>layoutValuesUI.render(),()=>layoutValuesUI.reset());
const previewRegistrations=scopeActions(previewActions,workbenchEvents.signal);
previewRegistrations.prepare=async () => {
    await initialized; await echartsUI?.flush();
    if(!geometrySession.onlyChartEdits){await flushAuthor();await whenIdle();}
    await whenReady();
    const frozen=structuredClone(editorSession.snapshot);
    for(const page of frozen.document.slides)for(const state of geometrySession.states(page.id))if(state.chart)page.nativeCharts[state.id]=structuredClone(state.chart);
    return { snapshot: frozen, slideId:editorSession.pageId };
};
previewRegistrations.present=()=>{void editorActions.present().catch(error);};
previewRegistrations.error=error;
const canvasLoading = createCanvasLoading(async () => { await whenIdle(); await render(); }, pageError);
canvasController.onDispose(()=>canvasLoading.dispose());
const documentSettings=bindDocumentSettings({signal:workbenchEvents.signal,document:()=>editorSession.snapshot.document,commands,history:()=>api(`/api/documents/${editorSession.snapshot.document.id}/history`),restore,flush:flushDocument});
canvasController.onDispose(()=>documentSettings.dispose());
recoveryController=bindRecovery({retained:()=>geometrySession.retained(),journal,pending:()=>pending,busy:isBusy,load,importDraft:raw=>geometrySession.importDraft(raw),copy:async(id,request)=>{const result=await api(`/api/documents/${id}/sync-recovery`,request);return result.document.id;},open:id=>{window.open(`/?document=${id}`,'_blank','noopener');}});
canvasController.onDispose(()=>recoveryController?.dispose());
canvasController.onDispose(()=>echartsUI?.dispose());
const shutdown = new SessionShutdown([
  {name:'keyboard',seal:()=>keyboardQueue.seal()},
  {name:'kernel',seal:()=>kernel.seal()},
  {name:'text',seal:()=>textIngress.seal()},
  {name:'vector',seal:()=>vectorIngress.seal()},
  {name:'charts',seal:async()=>{await echartsUI?.seal();}},
], geometrySession);
canvasController.onDispose(()=>{
  closingSessions.retain(shutdown,editorSession.getSnapshot().document?.document.title??'讲义');
});
editorActions.openRecovery=()=>editorSession.update({documentDialog:'recovery'});
const vectorUI=createVectorInspector({scope:()=>JSON.stringify([editorSession.getSnapshot().document?.document.id,editorSession.pageId,frameRuntimeId]),send:(action,data={})=>send('vector-action',{action,...data})});
canvasController.onDispose(()=>vectorUI.dispose());
const templateLibrary=createTemplateLibrary({ready:()=>initialized,snapshot:()=>editorSession.snapshot,slide,commands,upload:uploadAsset,error,selectInstance:instance=>{
  const root=objects.find(o=>o.attributes['data-template-instance']===instance);if(!root)return;
  const members=objects.filter(o=>o.parent===root.id&&o.tag!=='style').map(o=>o.id);
  changeSelection(members);renderObjects();renderSelection();
}});
canvasController.onDispose(()=>templateLibrary.dispose());
const initialized = init();
void initialized.catch(error);
// A small stable surface for host integration and browser acceptance tests.
Object.assign(window, {
  NotaleWorkbench: {
    mount:mountWorkbench,
    commands,
    dispose:()=>canvasController.dispose(),
    getSyncState:()=>({pending:geometrySession.count,status:geometrySession.status,blocked:geometrySession.blocked}),
    getSnapshot: () => editorSession.snapshot ? kernel.current : undefined,
  getConfirmedSnapshot:()=>kernel.confirmed,
  whenSynchronized:async()=>{await acceptedCommands.whenIdle();await kernel.whenIdle();await kernel.flush();await kernel.whenIdle();await geometrySession.whenLocallySaved();await geometrySession.barrier();},
    getPending: () => (pending ? structuredClone(pending) : undefined),
    select: (id: string) => {
      assertWorkbenchOpen();
      changeSelection([id]);
      renderObjects();
      renderSelection();
    },
    getObjects: () => objects,
    getSelection: () => [...editorSession.selection],
    whenEditsIdle,
    selectMany: (ids: string[]) => {
      assertWorkbenchOpen();
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
  const ids = [...editorSession.selection].filter((id) => !(slide().connectors ?? []).some((c) => c.id === id));
  if (ids.length > 2) throw new Error('请选择最多两个需要连接的对象');
  const id = uuid();
  await commands([
    {
      type: 'connector.set',
      slideId:editorSession.pageId,
      connector: connectorSchema.parse({
        id,
        start: ids[0]
          ? { target: ids[0] }
          : { point: { x: editorSession.snapshot.document.width * 0.35, y: editorSession.snapshot.document.height * 0.5 } },
        end: ids[1]
          ? { target: ids[1] }
          : { point: { x: editorSession.snapshot.document.width * 0.65, y: editorSession.snapshot.document.height * 0.5 } },
      }),
    },
  ]);
  changeSelection([id]);
  renderSelection();
}
const connectorInspector=createConnectorInspector({source:()=>({documentId:editorSession.snapshot.document.id,pageId:editorSession.pageId,width:editorSession.snapshot.document.width,height:editorSession.snapshot.document.height,connector:editorSession.selection.size===1?slide().connectors.find(c=>editorSession.selection.has(c.id)):undefined,options:objects.filter(o=>o.attributes.id!=='stage'&&!slide().connectors.some(c=>c.id===o.id)).map(o=>({value:o.id,label:o.tag+' '+(o.text.trim()||o.attributes.id||'').slice(0,28)}))}),commands});
canvasController.onDispose(()=>connectorInspector.dispose());
function renderConnector(){connectorInspector.render();}

function connectorGeometryNotice() {
  notices.show('连接线会跟随端点，请移动或调整端点对象',5000);
}

return {dispose:()=>canvasController.dispose()};
  } catch(cause) {release();if(mounted===identity)mounted=undefined;throw cause;}
}
