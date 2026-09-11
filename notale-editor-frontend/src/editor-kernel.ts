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
  constructor(private context: Context) {}
  load(snapshot: Snapshot) {
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
    return {kind:'commit',owner:this.context.owner(),documentId:this.confirmed.document.id,slideId:commands.find(c=>'slideId' in c)?.['slideId'],kernel:{protocol:2},request:{baseVersion:this.confirmed.version,mutationId:id,commands}};
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
  async execute(commands: Command[], focusSlide?: string) {
    if(!commands.length)return;
    commands=commitSchema.parse({baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),commands}).commands;
    for(const command of commands)if(!operationPolicies[command.type])throw Error('Unregistered editor operation');
    await this.flush();
    const task=this.task(commands);
    if(focusSlide)task.slideId=focusSlide;
    if(!canProject(commands)) {
      // Source/asset preparation uses the existing authoritative command engine.
      await this.context.barrier();task.request.baseVersion=this.confirmed.version;
      const preview=await this.context.prepare({baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands});
      task.kernel={protocol:2,prepared:true,preview,htmlBases:this.bases(this.confirmed,preview)};
    }
    if(this.confirmed.document.id!==task.documentId)throw Error('讲义已切换，操作未提交');
    await this.context.enqueue(task);
    this.refresh(true);
  }
  preview(key: string, commands: Command[]) {
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
  async commit(key: string, commands?: Command[]) {
    let gesture=this.gestures.get(key);
    if(this.finishedGestures.has(key))return;
    if(!gesture) {if(commands?.length)await this.execute(commands);return;}
    if(commands)gesture.commands=commands;
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=0;const preview=this.previewCommands;this.previewCommands=[];this.context.preview(preview);}
    clearTimeout(gesture.timer);
    await this.persistGesture(gesture);
    this.gestures.delete(key);this.finishedGestures.add(key);
    await this.context.finalize(gesture.id);
    this.refresh(true);
  }
  async cancel(key: string) {
    const gesture=this.gestures.get(key);if(!gesture)return;
    clearTimeout(gesture.timer);cancelAnimationFrame(this.frame);this.frame=0;this.previewCommands=[];await gesture.write;
    const painted=projectCommands(this.current,gesture.commands);
    await this.context.cancel(gesture.id);this.gestures.delete(key);this.finishedGestures.add(key);
    this.suppressHistory.add(gesture.id);this.undoStack=this.undoStack.filter(e=>e.id!==gesture.id);
    this.signature='';this.refresh();this.context.changed(this.current,painted,true);this.painted=this.current;
  }
  async flush() { for(const key of [...this.gestures.keys()])await this.commit(key); }
  private inverse(entry: EditTransaction, inverseId: string): Pending {
    const preview=authorChanges(entry.after,entry.before);
    return {kind:'restore',owner:this.context.owner(),documentId:this.confirmed.document.id,slideId:entry.task.slideId,
      inverseMutationId:inverseId,historyAction:'undo',kernel:{protocol:2,prepared:true,preview,htmlBases:this.bases(entry.after,preview)},
      request:{baseVersion:this.confirmed.version,mutationId:crypto.randomUUID(),version:entry.version??1}};
  }
  async undo() {
    await this.flush();const entry=this.undoStack.pop();if(!entry)return false;
    this.suppressHistory.add(entry.id);
    if(!entry.version && await this.context.cancel(entry.id)) {
      this.acknowledged.add(entry.id);entry.inverseId=undefined;
    } else {
      const task=this.inverse(entry,entry.id);entry.inverseId=task.request.mutationId;
      await this.context.enqueue(task);
    }
    this.redoStack.push(entry);this.signature='';this.refresh(true);return true;
  }
  async redo() {
    const entry=this.redoStack.pop();if(!entry)return false;
    if(entry.inverseId) {
      const task=this.inverse({...entry,before:entry.after,after:entry.before},entry.inverseId);task.historyAction='redo';
      await this.context.enqueue(task);
      const replacement={...entry,id:task.request.mutationId,task,version:undefined,inverseId:undefined};
      this.seen.set(replacement.id,replacement);this.undoStack.push(replacement);
    } else {
      this.acknowledged.delete(entry.id);this.suppressHistory.delete(entry.id);
      await this.context.enqueue(entry.task);this.undoStack.push(entry);
    }
    this.signature='';this.refresh(true);return true;
  }
}
