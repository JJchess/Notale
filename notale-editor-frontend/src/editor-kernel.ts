import {waitForOperations} from './state/accepted-operations';
import { commitSchema, authorChanges, applyAuthorChanges, operationPolicies, type AuthorChangeSet, type Command, type Snapshot } from '@notale/editor/browser';
import { canProject, projectCommands, projectPrepared } from './author-projection.js';
import type { Pending } from './pending-journal.js';

export type EditTransaction = { id: string; task: Pending; before: Snapshot; after: Snapshot; version?: number; inverseId?: string };
type Gesture = { id: string; key: string; commands: Command[]; before: Snapshot; write: Promise<void>; timer?: ReturnType<typeof setTimeout> };
type Context = {
  operations: () => Pending[];
  owner: () => string;
  stage: (task: Pending) => Promise<void>;
  finalize: (id: string) => Promise<void>;
  retainPreparation?: (task: Pending, cause: unknown) => Promise<void>;
  enqueue: (task: Pending) => Promise<void>;
  cancel: (id: string) => Promise<boolean>;
  prepare: (request: {baseVersion:number;mutationId:string;commands:Command[]}) => Promise<AuthorChangeSet>;
  barrier: () => Promise<void>;
  changed: (snapshot: Snapshot, previous: Snapshot | undefined, paint: boolean) => void;
  preview: (commands: Command[]) => void;
  error: (error: unknown) => void;
};
/** One projected author document; all producers share the same durable queue. */
export class EditorKernel {
  private base?: Snapshot;
  private visible?: Snapshot;
  private painted?: Snapshot;
  private gestures = new Map<string, Gesture>();
  private acknowledged = new Set<string>();
  private seen = new Map<string, EditTransaction>();
  private undoStack: EditTransaction[] = [];
  private redoStack: EditTransaction[] = [];
  private signature = '';
  private frame = 0;
  private previewCommands: Command[] = [];
  private suppressHistory = new Set<string>();
  private finishedGestures = new Set<string>();
  revision = 0;
  private sealed = false;
  private inFlight = new Set<Promise<unknown>>();
  private executions: Promise<unknown> = Promise.resolve();
  private preparing = new Set<string>();
  private admissions = new Map<string,{task:Pending;cause:unknown}>();
  private sealing?: Promise<void>;
  constructor(private context: Context) {
    const original = context;
    this.context = {...context,
      changed: (...args) => {if (!this.sealed) original.changed(...args);},
      preview: commands => {if (!this.sealed) original.preview(commands);},
      error: error => {if (!this.sealed) original.error(error);},
    };
  }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.sealed) return Promise.reject(Error('编辑内核已关闭'));
    let task:Promise<T>;
    try {task=operation();} catch(cause) {return Promise.reject(cause);}
    this.inFlight.add(task);
    void task.then(() => this.inFlight.delete(task), () => this.inFlight.delete(task));
    return task;
  }
  execute(commands: Command[], focusSlide?: string) {return this.run(() => {const captured=structuredClone(commands);const task=this.executions.then(()=>this.executePending(captured,focusSlide));this.executions=task.catch(()=>{});return task;});}
  /** Admit before awaiting UI/text prerequisites so orderly shutdown owns this command. */
  executeAfter(commands:Command[],before:()=>Promise<void>,focusSlide?:string){
    return this.run(()=>{
      const captured=commitSchema.parse({baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),commands:structuredClone(commands)}).commands;
      const admission=this.task(captured);if(focusSlide)admission.slideId=focusSlide;
      const task=this.executions.then(async()=>{
        try{
          if(this.sealed)throw Error('编辑器已关闭，操作转为恢复草稿');
          await before();
          if(this.sealed||this.confirmed.document.id!==admission.documentId)throw Error('编辑会话已变化，操作转为恢复草稿');
        }catch(cause){
          this.admissions.set(admission.request.mutationId,{task:admission,cause});
          await this.retainAdmission(admission.request.mutationId);
          throw cause;
        }
        await this.executePending(captured,focusSlide);
      });
      this.executions=task.catch(()=>{});return task;
    });
  }
  private async retainAdmission(id:string){
    const entry=this.admissions.get(id);if(!entry)return;
    if(!this.context.retainPreparation)throw Error('操作恢复存储不可用');
    await this.context.retainPreparation(entry.task,entry.cause);
    if(this.admissions.get(id)===entry)this.admissions.delete(id);
  }
  commit(key: string, commands?: Command[]) {return this.run(() => this.commitPending(key, commands));}
  cancel(key: string) {return this.run(() => this.cancelPending(key));}
  flush() {return this.run(() => this.flushPending());}
  // External synchronization only; executePending may itself await the storage barrier.
  async whenIdle() {await waitForOperations(()=>this.inFlight);}
  private history(operation: () => Promise<boolean>) {
    return this.run(() => {
      const task = this.executions.then(operation);
      this.executions = task.catch(() => {});
      return task;
    });
  }
  undo() {return this.history(() => this.undoPending());}
  redo() {return this.history(() => this.redoPending());}
  seal(): Promise<void> {
    if (this.sealing) return this.sealing;
    this.sealed = true;
    if (this.frame) {cancelAnimationFrame(this.frame);this.frame = 0;}
    this.previewCommands = [];
    for (const gesture of this.gestures.values()) {clearTimeout(gesture.timer);gesture.timer = undefined;}
    this.sealing = (async () => {
      // Accepted operations may still finalize/enqueue through their internal paths.
      await Promise.allSettled([...this.inFlight]);
      await this.retainDrafts();
    })().finally(() => {this.sealing = undefined;});
    return this.sealing;
  }
  load(snapshot: Snapshot) {
    if(this.sealed)throw Error('编辑内核已关闭');
    this.base = snapshot; this.visible = snapshot; this.painted=snapshot; this.signature=''; this.acknowledged.clear();
    this.seen.clear();this.undoStack=[];this.redoStack=[];
  }
  get confirmed() { if(!this.base)throw Error('Document is not loaded');return this.base; }
  get current() { return this.visible ?? this.confirmed; }
  get editing() { return this.gestures.size > 0; }
  get canUndo() { return this.editing || this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  handlesVersion(version: number) { return [...this.seen.values()].some(entry=>entry.version===version); }
  private task(commands: Command[], id=crypto.randomUUID()): Pending {
    const queued=this.context.operations(),position=queued.findIndex(task=>task.request.mutationId===id);
    const predecessors=position<0?queued:queued.slice(0,position);
    return {kind:'commit',owner:this.context.owner(),documentId:this.confirmed.document.id,slideId:commands.find(c=>'slideId' in c)?.['slideId'],kernel:{protocol:2,dependencies:predecessors.filter(task=>task.documentId===this.confirmed.document.id&&task.request.mutationId!==id&&!this.acknowledged.has(task.request.mutationId)).map(task=>task.request.mutationId)},request:{baseVersion:this.confirmed.version,mutationId:id,commands}};
  }
  private project(snapshot: Snapshot, task: Pending): Snapshot {
    if(task.kernel?.preview && (task.kind==='restore' || task.kernel.prepared)) return projectPrepared(snapshot,task.kernel.preview,task.kernel.htmlBases);
    return task.kind==='restore'?snapshot:projectCommands(snapshot,task.request.commands as Command[]);
  }
  refresh(paint=false) {
    if(!this.base)return;
    const queued=this.context.operations().filter(task=>task.documentId===this.base!.document.id&&!this.acknowledged.has(task.request.mutationId));
    for(const gesture of this.gestures.values()) {
      const task=this.task(gesture.commands,gesture.id),at=queued.findIndex(t=>t.request.mutationId===gesture.id);
      if(at<0)queued.push(task);else queued[at]=task;
    }
    const signature=JSON.stringify([this.base.version,queued]);
    if(signature===this.signature){if(paint&&this.visible!==this.painted){this.context.changed(this.visible!,this.painted,true);this.painted=this.visible;}return;}
    this.signature=signature;let value=this.base;
    for(const task of queued) {
      if(this.preparing.has(task.request.mutationId))continue;
      const before=value;
      try { value=this.project(value,task); } catch { continue; /* Server resolves a conflicting prepared operation; its durable record remains. */ }
      if(task.owner===this.context.owner()&&task.kernel?.protocol===2&&!task.historyAction&&!this.suppressHistory.has(task.request.mutationId)) {
        const existing=this.seen.get(task.request.mutationId);
        if(existing) { existing.after=value;existing.task=task; }
        else {const entry={id:task.request.mutationId,task,before,after:value};this.seen.set(entry.id,entry);this.undoStack.push(entry);this.redoStack=[];}
      }
    }
    const previous=this.visible;this.visible=value;this.revision++;
    this.context.changed(value,paint?this.painted:previous,paint);if(paint)this.painted=value;
  }
  accept(change: AuthorChangeSet) {
    if(change.toVersion<=this.confirmed.version)return;
    const before=this.confirmed;
    this.base=applyAuthorChanges(before,change);
    if(change.mutationId){
      this.acknowledged.add(change.mutationId);
      const entry=this.seen.get(change.mutationId);if(entry){entry.before=before;entry.after=this.base;entry.version=change.toVersion;}
    }
  }
  resetBase(snapshot: Snapshot) { this.base=snapshot;this.signature=''; }
  acknowledge(id: string, version: number) {
    this.acknowledged.add(id);const entry=this.seen.get(id);if(entry)entry.version=version;
    this.refresh(true);
  }
  recover(id: string) {
    this.acknowledged.add(id);this.undoStack=this.undoStack.filter(e=>e.id!==id);this.refresh(true);
  }
  private bases(snapshot: Snapshot,change:AuthorChangeSet) {const ids=new Set(change.changes.filter(p=>p.splice).map(p=>change.slideIds?.[Number(p.path[1])]??snapshot.document.slides[Number(p.path[1])]?.id));return Object.fromEntries(snapshot.document.slides.filter(s=>ids.has(s.id)).map(s=>[s.id,s.html]));}
  private async executePending(commands: Command[], focusSlide?: string) {
    if(!commands.length)return;
    commands=commitSchema.parse({baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),commands}).commands;
    for(const command of commands)if(!operationPolicies[command.type])throw Error('Unregistered editor operation');
    await this.flushPending();
    const task=this.task(commands);
    if(focusSlide)task.slideId=focusSlide;
    if(!canProject(commands)) {
      const id=task.request.mutationId;this.preparing.add(id);
      try {
        // Persist the original command before any network barrier or preparation.
        await this.context.stage(task);
        await this.context.barrier();
        if(this.confirmed.document.id!==task.documentId)throw Error('讲义已切换，操作保留为恢复草稿');
        task.request.baseVersion=this.confirmed.version;
        const preview=await this.context.prepare({baseVersion:task.request.baseVersion,mutationId:id,commands});
        if(this.confirmed.document.id!==task.documentId)throw Error('讲义已切换，操作保留为恢复草稿');
        task.kernel={protocol:2,prepared:true,preview,htmlBases:this.bases(this.confirmed,preview)};
        await this.context.stage(task);
        this.preparing.delete(id);this.signature='';
        await this.context.finalize(id);
      } catch(cause) {
        await this.context.retainPreparation?.(task,cause);
        throw cause;
      } finally {this.preparing.delete(id);}
    } else {
      if(this.confirmed.document.id!==task.documentId)throw Error('讲义已切换，操作未提交');
      await this.context.enqueue(task);
    }
    this.refresh(true);
  }
  preview(key: string, commands: Command[]) {
    if(this.sealed)return;
    if(!commands.length)return;
    commands=commitSchema.parse({baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),commands}).commands;
    if(!canProject(commands))throw Error('This operation requires preparation');
    let gesture=this.gestures.get(key);
    if(!gesture) { gesture={key,id:crypto.randomUUID(),commands,before:this.current,write:Promise.resolve()};this.gestures.set(key,gesture); }
    gesture.commands=commands;
    this.previewCommands.push(...commands);
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;const commands=this.previewCommands;this.previewCommands=[];this.context.preview(commands);});
    if(!gesture.timer)gesture.timer=setTimeout(()=>{gesture!.timer=undefined;void this.persistGesture(gesture!).catch(this.context.error);},100);
  }
  private persistGesture(gesture: Gesture) {
    const task=this.task(gesture.commands,gesture.id);
    // Persist in order; a final value cannot be overwritten by an older IDB write.
    gesture.write=gesture.write.catch(()=>{}).then(()=>this.context.stage(task));
    return gesture.write;
  }
  private async commitPending(key: string, commands?: Command[]) {
    let gesture=this.gestures.get(key);
    if(this.finishedGestures.has(key))return;
    if(!gesture) {if(commands?.length)await this.executePending(commands);return;}
    if(commands)gesture.commands=commands;
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;const preview=this.previewCommands;this.previewCommands=[];this.context.preview(preview);}
    clearTimeout(gesture.timer);
    await this.persistGesture(gesture);
    this.gestures.delete(key);this.finishedGestures.add(key);
    await this.context.finalize(gesture.id);
    this.refresh(true);
  }
  private async cancelPending(key: string) {
    const gesture=this.gestures.get(key);if(!gesture)return;
    clearTimeout(gesture.timer);cancelAnimationFrame(this.frame);this.frame=0;this.previewCommands=[];await gesture.write;
    const painted=projectCommands(this.current,gesture.commands);
    await this.context.cancel(gesture.id);this.gestures.delete(key);this.finishedGestures.add(key);
    this.suppressHistory.add(gesture.id);this.undoStack=this.undoStack.filter(e=>e.id!==gesture.id);
    this.signature='';this.refresh();this.context.changed(this.current,painted,true);this.painted=this.current;
  }
  /** Retain the final preview as a staged draft without applying more UI work. */
  async retainDrafts() {
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;}
    this.previewCommands=[];
    const writes=[...this.gestures.values()].map(gesture=>{
      clearTimeout(gesture.timer);gesture.timer=undefined;
      return this.persistGesture(gesture);
    });
    writes.push(...[...this.admissions.keys()].map(id=>this.retainAdmission(id)));
    const results=await Promise.allSettled(writes);
    const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
    if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'部分编辑草稿尚未写入本机');
  }
  private async flushPending() { for(const key of [...this.gestures.keys()])await this.commitPending(key); }
  private inverse(entry: EditTransaction, inverseId: string): Pending {
    const preview=authorChanges(entry.after,entry.before);
    return {kind:'restore',owner:this.context.owner(),documentId:this.confirmed.document.id,slideId:entry.task.slideId,
      inverseMutationId:inverseId,historyAction:'undo',kernel:{protocol:2,prepared:true,preview,htmlBases:this.bases(entry.after,preview)},
      request:{baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),version:entry.version??1}};
  }
  private async undoPending() {
    await this.flushPending();
    const entry = this.undoStack.at(-1);
    if (!entry) return false;
    const suppressed = this.suppressHistory.has(entry.id);
    this.suppressHistory.add(entry.id);
    try {
      if (!entry.version && await this.context.cancel(entry.id)) {
        this.acknowledged.add(entry.id);
        entry.inverseId = undefined;
      } else {
        const task = this.inverse(entry, entry.id);
        await this.context.enqueue(task);
        entry.inverseId = task.request.mutationId;
      }
    } catch (cause) {
      if (!suppressed) this.suppressHistory.delete(entry.id);
      throw cause;
    }
    this.undoStack.splice(this.undoStack.indexOf(entry), 1);
    this.redoStack.push(entry);
    this.signature = ''; this.refresh(true); return true;
  }
  private async redoPending() {
    const entry = this.redoStack.at(-1);
    if (!entry) return false;
    if (entry.inverseId) {
      const task = this.inverse({...entry, before: entry.after, after: entry.before}, entry.inverseId);
      task.historyAction = 'redo';
      await this.context.enqueue(task);
      const replacement = {...entry, id: task.request.mutationId, task, version: undefined, inverseId: undefined};
      this.seen.set(replacement.id, replacement);
      this.undoStack.push(replacement);
    } else {
      const acknowledged = this.acknowledged.has(entry.id);
      const suppressed = this.suppressHistory.has(entry.id);
      this.acknowledged.delete(entry.id);
      this.suppressHistory.delete(entry.id);
      try {
        await this.context.enqueue(entry.task);
      } catch (cause) {
        if (acknowledged) this.acknowledged.add(entry.id);
        if (suppressed) this.suppressHistory.add(entry.id);
        throw cause;
      }
      this.undoStack.push(entry);
    }
    this.redoStack.splice(this.redoStack.indexOf(entry), 1);
    this.signature = ''; this.refresh(true); return true;
  }
}
