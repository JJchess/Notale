import {CODE_FILES,type CodeFile,type CodeSources,type CodeLessonDescriptor} from '@notale/editor/browser';

export interface CoursePreview {sourceRevision:string;runtimeRevision:string;initialStep:unknown}
export interface CourseBase {lesson:CodeLessonDescriptor;sources:CodeSources}
export interface CourseDraft {sources:CodeSources;revision:string;baseSources?:CodeSources;sequence?:number;updatedAt:number}
export const sameSources=(a:CodeSources,b:CodeSources)=>CODE_FILES.every(f=>a[f]===b[f]);
export interface CourseConflict extends CourseBase {files:CodeFile[]}
export function mergeCourseSources(base:CodeSources|undefined,local:CodeSources,remote:CodeSources){
  const sources={...local},files:CodeFile[]=[];
  for(const f of CODE_FILES){
    if(local[f]===remote[f])continue;
    if(base&&local[f]===base[f])sources[f]=remote[f];
    else if(!base||remote[f]!==base[f])files.push(f);
  }
  return {sources,files};
}

/** One writer, one latest pending snapshot; no timer can overwrite a newer draft. */
export class CourseDraftWriter {
  private pending?:CourseDraft;private task?:Promise<void>;private debounce?:ReturnType<typeof setTimeout>;private maximum?:ReturnType<typeof setTimeout>;
  constructor(private write:(draft:CourseDraft)=>Promise<void>,private failure:(e:unknown)=>void){}
  schedule(draft:CourseDraft){this.pending=draft;clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.background(),300);this.maximum??=setTimeout(()=>this.background(),2000);}
  private background(){void this.flush().catch(this.failure);}
  async flush():Promise<void>{
    clearTimeout(this.debounce);clearTimeout(this.maximum);this.debounce=this.maximum=undefined;
    if(this.task){await this.task;if(this.pending)return this.flush();return;}
    const drain=async()=>{while(this.pending){const draft=this.pending;this.pending=undefined;try{await this.write(draft);}catch(e){this.pending??=draft;throw e;}}};
    this.task=drain();try{await this.task;}finally{this.task=undefined;}
  }
}
interface SessionState extends CourseBase {
  revision:number;ready:boolean;saving:boolean;error:string;storageError:string;
  conflict?:CourseConflict;saved:boolean;
}
interface SaveRequest {sources:CodeSources;preview?:CoursePreview}
export interface CourseSessionIO {
  readDraft:()=>Promise<CourseDraft|undefined>;writeDraft:(draft:CourseDraft)=>Promise<void>;
  save:(base:CourseBase,sources:CodeSources,preview?:CoursePreview)=>Promise<CodeLessonDescriptor>;
  read:()=>Promise<CourseBase>;
}
export class CourseSession {
  private value:SessionState;private listeners=new Set<()=>void>();private baseSources:CodeSources|undefined;
  private pending?:SaveRequest;private current?:SaveRequest;private savingTask?:Promise<void>;
  readonly writer:CourseDraftWriter;readonly initialized:Promise<void>;
  constructor(base:CourseBase,private io:CourseSessionIO){
    this.value={...base,sources:{...base.sources},revision:0,ready:false,saving:false,error:'',storageError:'',saved:false};this.baseSources={...base.sources};
    this.writer=new CourseDraftWriter(d=>this.io.writeDraft(d),e=>this.emit({storageError:'本机草稿保存失败：'+message(e)}));
    this.initialized=this.initialize();
  }
  getSnapshot=()=>this.value;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  get dirty(){return !this.baseSources||!sameSources(this.value.sources,this.baseSources);}
  get canSave(){return this.dirty||!!this.current&&!sameSources(this.value.sources,this.current.sources);}
  changed(file:CodeFile){return !this.baseSources||this.value.sources[file]!==this.baseSources[file];}
  private emit(patch:Partial<SessionState>){this.value={...this.value,...patch};this.listeners.forEach(f=>f());}
  private async initialize(){
    try{const draft=await this.io.readDraft();if(draft){
      this.emit({sources:{...draft.sources},revision:draft.sequence??0});
      if(draft.revision!==this.value.lesson.revision&&!sameSources(draft.sources,this.baseSources!)){
        const remote={lesson:this.value.lesson,sources:this.baseSources!};this.baseSources=draft.baseSources;
        this.emit({lesson:{...this.value.lesson,revision:draft.revision}});this.reconcile(remote,draft.baseSources);
      }
    }}catch(e){this.emit({storageError:'无法读取本机草稿：'+message(e)});}finally{this.emit({ready:true});}
  }
  attach(io:CourseSessionIO,remote:CourseBase){this.io=io;if(!this.value.saving&&this.value.ready&&remote.lesson.revision!==this.value.lesson.revision)this.reconcile(remote,this.baseSources);}
  edit(file:CodeFile,source:string){if(this.value.sources[file]===source)return;this.emit({sources:{...this.value.sources,[file]:source},revision:this.value.revision+1,saved:false});this.persist();}
  private persist(){this.writer.schedule({sources:{...this.value.sources},revision:this.value.lesson.revision,baseSources:this.baseSources?{...this.baseSources}:undefined,sequence:this.value.revision,updatedAt:Date.now()});}
  async flush(){this.persist();try{await this.writer.flush();this.emit({storageError:''});}catch(e){this.emit({storageError:'本机草稿保存失败：'+message(e)});throw e;}}
  private reconcile(remote:CourseBase,base:CodeSources|undefined){
    const merged=mergeCourseSources(base,this.value.sources,remote.sources);
    this.emit({sources:merged.sources,revision:this.value.revision+1,conflict:{...remote,files:merged.files},error:'讲义中的课程已更新',saved:false});this.persist();
  }
  resolveFile(file:CodeFile,useRemote:boolean){const conflict=this.value.conflict;if(!conflict)return;
    if(useRemote)this.edit(file,conflict.sources[file]);
    this.emit({conflict:{...conflict,files:conflict.files.filter(f=>f!==file)}});this.persist();
  }
  confirmMerge(){const conflict=this.value.conflict;if(!conflict||conflict.files.length)return;
    this.baseSources={...conflict.sources};this.emit({lesson:conflict.lesson,conflict:undefined,error:'',saved:false});this.persist();
  }
  discard(){if(this.value.saving)return;const remote=this.value.conflict;
    if(remote)this.baseSources={...remote.sources};
    this.emit({lesson:remote?.lesson??this.value.lesson,sources:{...(this.baseSources??this.value.sources)},revision:this.value.revision+1,conflict:undefined,error:'',saved:false});this.persist();
  }
  save(preview?:CoursePreview):Promise<void>{
    if(!this.value.ready||this.value.conflict||!this.canSave)return this.savingTask??Promise.resolve();
    const request={sources:{...this.value.sources},preview};
    if(this.current&&sameSources(this.current.sources,request.sources)){this.pending=undefined;return this.savingTask!;}
    this.pending=request;if(this.savingTask)return this.savingTask;
    this.emit({saving:true,error:''});
    this.savingTask=this.drain().finally(()=>{this.current=undefined;this.savingTask=undefined;this.emit({saving:false});});return this.savingTask;
  }
  private async drain(){
    while(this.pending){
      const request=this.pending;this.pending=undefined;this.current=request;
      if(this.baseSources&&sameSources(request.sources,this.baseSources))continue;
      // Draft storage is best effort for service saving, never a prerequisite.
      await this.flush().catch(()=>{});
      try{
        const next=await this.io.save({lesson:this.value.lesson,sources:this.baseSources??this.value.sources},request.sources,request.preview);
        this.baseSources={...request.sources};this.emit({lesson:next,saved:sameSources(this.value.sources,request.sources),error:''});
        await this.flush().catch(()=>{});
      }catch(e){
        this.pending=undefined;this.emit({error:message(e)});
        try{const remote=await this.io.read();if(remote.lesson.revision!==this.value.lesson.revision&&!sameSources(remote.sources,request.sources))this.reconcile(remote,this.baseSources);}catch{}
        break;
      }
    }
  }
}
function message(e:unknown){return e instanceof Error?e.message:String(e);}
