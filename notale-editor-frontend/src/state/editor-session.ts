import type {KeyboardRecovery} from './keyboard-queue';
import type {SettingSource,HistoryRevision} from './document-settings';
import type {LayerState} from './layers';
import type {GeometryFieldsState,GeometryFieldEdit} from './geometry-fields';
import {emptyInspector,type InspectorSelection,type TextFieldState,type BindingFieldState,type NameFieldState} from './inspector';
import {initialSidebar,type SidebarState} from './sidebar-state';
import type {Snapshot} from '@notale/editor/browser';

/** Ephemeral editor state. Author documents are immutable references from EditorKernel. */
export interface SaveIndicator {label:string;detail:string;state:'saved'|'busy'|'local'|'paused'|'failed';}
export interface EditorSessionState {
  emptyMessage:string|null;
  headerMenu?:'import'|'export';
  documentDialog?:'theme'|'history'|'recovery';
  layers?:LayerState;
  objectQuery:string;
  selectionScope?:string;
  steps:{current:number;max:number;nativeMax:number};
  inspector:InspectorSelection;
  geometryFields?:GeometryFieldsState;
  proportional:boolean;
  textReflow:boolean;
  textField?:TextFieldState;
  bindingField?:BindingFieldState;
  nameField?:NameFieldState;
  sidebar:SidebarState;
  busy: boolean;
  documents: readonly {id:string;title:string}[];
  catalogueNotice: string;
  switchingDocument: boolean;
  save: SaveIndicator;
  canUndo: boolean;
  canRedo: boolean;
  document?: Snapshot;
  activePageId: string;
  selectedIds: readonly string[];
  canvas: 'loading' | 'ready' | 'failed';
  pageQuery: string;
  overview: boolean;
  overviewPage: number;
}
export class EditorSession {
  private state: EditorSessionState = {emptyMessage:'正在加载讲义…',objectQuery:'',steps:{current:0,max:0,nativeMax:0},proportional:true,textReflow:true,inspector:emptyInspector,sidebar:initialSidebar,busy:false,documents:[],catalogueNotice:'',switchingDocument:false,save:{label:'连接中',detail:'正在连接编辑服务',state:'busy'},canUndo:false,canRedo:false,activePageId:'',selectedIds:[],canvas:'loading',pageQuery:'',overview:false,overviewPage:0};
  // These are views of the subscribed state, not a second mutable workbench session.
  get snapshot(): Snapshot {return this.state.document!;}
  get pageId() {return this.state.activePageId;}
  get selectionScope() {return this.state.selectionScope;}
  get canvasStep() {return this.state.steps.current;}
  get canvasMax() {return this.state.steps.max;}
  get nativeMax() {return this.state.steps.nativeMax;}
  seekStep(current:number) {this.setStepRange(this.canvasMax,undefined,current);}
  setStepRange(max:number,nativeMax=this.nativeMax,current=this.canvasStep) {
    const limit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(500,Math.trunc(value))):0;
    const steps={current:Math.min(limit(current),limit(max)),max:limit(max),nativeMax:limit(nativeMax)};
    if(Object.entries(steps).every(([key,value])=>this.state.steps[key as keyof typeof steps]===value))return;
    this.update({steps});
  }
  get canvasReady() {return this.state.canvas==='ready';}
  private selectionIds: readonly string[] | undefined;
  private selectionView: ReadonlySet<string> = new Set();
  get selection(): ReadonlySet<string> {
    if(this.selectionIds!==this.state.selectedIds){this.selectionIds=this.state.selectedIds;this.selectionView=new Set(this.selectionIds);}
    return this.selectionView;
  }
  select(ids: Iterable<string>) {
    const selectedIds=[...new Set(ids)];
    if(selectedIds.length===this.state.selectedIds.length&&selectedIds.every((id,i)=>id===this.state.selectedIds[i]))return;
    this.update({selectedIds});
  }
  openPage(activePageId: string) {
    this.update({activePageId,layers:undefined,selectedIds:[],selectionScope:undefined,steps:{current:0,max:0,nativeMax:0},canvas:'loading',inspector:emptyInspector,textField:undefined,bindingField:undefined,nameField:undefined,geometryFields:undefined});
  }
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialSession;
  subscribe = (listener: () => void) => {this.listeners.add(listener);return () => {this.listeners.delete(listener);};};
  update(patch: Partial<EditorSessionState>) {
    if(patch.document&&patch.document.document.id!==this.state.document?.document.id){
      patch={pageQuery:'',objectQuery:'',overview:false,overviewPage:0,...patch};
    }
    const doc=(patch.document??this.state.document)?.document;
    if(doc){const documents=patch.documents??this.state.documents,entry=documents.find(item=>item.id===doc.id);
      if(!entry||entry.title!==doc.title)patch={...patch,documents:entry?documents.map(item=>item.id===doc.id?{id:doc.id,title:doc.title}:item):[{id:doc.id,title:doc.title},...documents]};
    }
    if(Object.entries(patch).every(([key,value])=>this.state[key as keyof EditorSessionState]===value))return;
    this.state = {...this.state,...patch};
    for(const listener of this.listeners)listener();
  }
}
const initialSession: EditorSessionState = {emptyMessage:'正在加载讲义…',objectQuery:'',steps:{current:0,max:0,nativeMax:0},proportional:true,textReflow:true,inspector:emptyInspector,sidebar:initialSidebar,busy:false,documents:[],catalogueNotice:'',switchingDocument:false,save:{label:'连接中',detail:'正在连接编辑服务',state:'busy'},canUndo:false,canRedo:false,activePageId:'',selectedIds:[],canvas:'loading',pageQuery:'',overview:false,overviewPage:0};
/** A stable React subscription endpoint; the attached session remains the sole state owner. */
export class EditorSessionChannel {
 private current=new EditorSession();
 private listeners=new Set<()=>void>();
 private detach:()=>void=()=>{};
 private notify=()=>{for(const listener of this.listeners)listener();};
 private subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private getSnapshot=()=>this.current.getSnapshot();
 private getServerSnapshot=()=>initialSession;
 readonly view:EditorSession;
 constructor(){
  this.detach=this.current.subscribe(this.notify);
  this.view=new Proxy(this.current,{get:(_target,key)=>{
   if(key==='subscribe')return this.subscribe;
   if(key==='getSnapshot')return this.getSnapshot;
   if(key==='getServerSnapshot')return this.getServerSnapshot;
   const value=Reflect.get(this.current,key,this.current);
   return typeof value==='function'?value.bind(this.current):value;
  }});
 }
 attach(session:EditorSession){
  this.detach();this.current=session;this.detach=session.subscribe(this.notify);this.notify();
  return ()=>{
   if(this.current!==session)return;
   this.detach();this.current=new EditorSession();this.detach=this.current.subscribe(this.notify);this.notify();
  };
 }
}
const sessionChannel=new EditorSessionChannel();
export const editorSession=sessionChannel.view;
export function bindEditorSession(signal:AbortSignal){
 if(signal.aborted)throw Error('编辑会话已关闭');
 const session=new EditorSession(),detach=sessionChannel.attach(session);
 signal.addEventListener('abort',detach,{once:true});
 return session;
}

// Explicit commands cross from React into the application coordinator; components never write DOM.
export const editorActions: {
  keyboardRecoveries:()=>Promise<KeyboardRecovery[]>;
  dismissKeyboardRecovery:(id:string)=>Promise<void>;
  inspectKeyboardRecovery:(record:KeyboardRecovery)=>Promise<void>;
  importMedia:(file:File)=>Promise<void>;
  selectionTool: (action:string) => Promise<unknown>;
  toggleObjectLock: () => Promise<unknown>;
  saveTheme:(source:SettingSource,value:string)=>Promise<void>;
  saveDeckSize:(source:SettingSource,value:string)=>Promise<void>;
  loadHistory:(documentId:string)=>Promise<HistoryRevision[]>;
  restoreHistory:(documentId:string,version:number)=>Promise<void>;
  selectLayer:(source:Pick<LayerState,'documentId'|'pageId'>,id:string,toggle:boolean)=>void;
  seekStep: (next:number,animate?:boolean) => void;
  editGeometry: (edit:GeometryFieldEdit) => Promise<void>;
  setTextReflow: (enabled:boolean) => void;
  saveObjectName: (field:NameFieldState,value:string) => Promise<void>;
  hideObjects: () => Promise<unknown>;
  showObjects: () => Promise<unknown>;
  saveBinding: (field:BindingFieldState,value:string) => Promise<void>;
  replaceText: (field:TextFieldState,value:string) => Promise<void>;
  renameDocument: (source:{id:string;title:string},title:string) => Promise<void>;
  openHistory: () => Promise<void>;
  openRecovery: () => void;
  loadDocument: (id:string) => Promise<void>;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
  present: (speaker?:boolean,fromBeginning?:boolean) => Promise<void>;
  addPage: () => unknown;
  copyPage: () => unknown;
  deletePage: () => unknown;
  previousPageOrder: () => unknown;
  nextPageOrder: () => unknown;
  showPage: (id:string) => Promise<void>;
  movePage: (id:string,index:number) => Promise<unknown>;
  reportError: (error:unknown) => void;
  pagesCommitted: () => void;
} = {keyboardRecoveries:async()=>[],dismissKeyboardRecovery:async()=>{},inspectKeyboardRecovery:async()=>{},importMedia:async()=>{},selectionTool:async()=>{},toggleObjectLock:async()=>{},saveTheme:async()=>{},saveDeckSize:async()=>{},loadHistory:async()=>[],restoreHistory:async()=>{},selectLayer:()=>{},seekStep:()=>{},editGeometry:async()=>{},setTextReflow:()=>{},saveObjectName:async()=>{},hideObjects:async()=>{},showObjects:async()=>{},saveBinding:async()=>{},replaceText:async()=>{},renameDocument:async()=>{},openHistory:async()=>{},openRecovery:()=>{},loadDocument:async()=>{},undo:async()=>{},redo:async()=>{},present:async()=>{},addPage:()=>{},copyPage:()=>{},deletePage:()=>{},previousPageOrder:()=>{},nextPageOrder:()=>{},showPage:async()=>{},movePage:async()=>{},reportError:()=>{},pagesCommitted:()=>{}};
