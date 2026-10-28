import {type DeckDocument,type Snapshot,type AuthorChangesPage,type SyncAcknowledgement} from '@notale/editor/browser';
import {parseFilmDocument,type FilmDocument,type FilmCommand} from '@notale/editor/film';
import {EditorKernel} from '../editor-kernel.js';
import {DocumentSession} from '../geometry-session.js';
import type {Pending} from '../pending-journal.js';
export async function filmApi<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message??data.error??`HTTP ${response.status}`),{code:data.error??`HTTP_${response.status}`});return data;
}
export function filmEnvelope(film:FilmDocument):DeckDocument{return {schemaVersion:1,kind:'film',id:film.id,title:film.title,width:film.width,height:film.height,slides:[],film,theme:{},layouts:[],assets:{},comments:[],presentation:{loop:false,showSlideNumber:true}};}
/** Film is a producer of the existing kernel and durable document queue. */
export class FilmSession {
  private queue:DocumentSession;private kernel:EditorKernel;private pending=0;private closed=false;private pulling:Promise<void>|undefined;
  private constructor(snapshot:Snapshot,private changed:(film:FilmDocument,status:string,unsaved:boolean,undo:boolean,redo:boolean,snapshot:Snapshot)=>void,private error:(e:unknown)=>void){
    this.queue=new DocumentSession({task:()=>{throw Error('Film does not emit geometry drafts');},submit:task=>this.submit(task),paint:()=>{},snapshot:()=>this.kernel.confirmed,
      changed:()=>{this.kernel.refresh(true);this.publish();},error,remote:()=>this.pull(),confirm:(task,version)=>{void this.pull().then(()=>{this.kernel.acknowledge(task.request.mutationId,version);this.publish();}).catch(error);},recovered:task=>this.kernel.recover(task.request.mutationId)});
    this.kernel=new EditorKernel({operations:()=>this.queue.operations(),owner:()=>this.queue.ownerId,stage:t=>this.queue.stageText(t),finalize:id=>this.queue.finalizeText(id),retainPreparation:(t,e)=>this.queue.retainPreparation(t,e),enqueue:t=>this.queue.enqueueTask(t),cancel:id=>this.queue.cancelOperation(id),prepare:request=>filmApi(`/api/documents/${this.id}/prepare`,request),barrier:async()=>{await this.queue.barrier();await this.pull();},changed:()=>this.publish(),preview:()=>{},error});
    this.kernel.load(snapshot);
  }
  static async open(input:FilmDocument|string,changed:FilmSession['changed'],error:FilmSession['error']){
    const snapshot=typeof input==='string'?await filmApi<Snapshot>(`/api/documents/${encodeURIComponent(input)}`):await filmApi<Snapshot>('/api/documents',filmEnvelope(input));
    if(snapshot.document.kind!=='film'||!snapshot.document.film)throw Error('请选择影片文档');
    parseFilmDocument(snapshot.document.film);
    const session=new FilmSession(snapshot,changed,error);
    try{await session.queue.load(snapshot.document.id);await session.queue.checkpoint(snapshot);session.kernel.refresh(true);session.publish();void session.queue.retry().catch(error);return session;}catch(e){await session.close();throw e;}
  }
  get id(){return this.kernel.confirmed.document.id;}
  get film(){return this.kernel.current.document.film!;}
  get unsaved(){return this.pending>0||this.queue.count>0||this.queue.blocked;}
  private publish(){if(!this.closed&&!this.pending)this.changed(this.film,this.queue.status||`已保存 · v${this.kernel.confirmed.version}`,this.unsaved,this.kernel.canUndo,this.kernel.canRedo,this.kernel.current);}
  private pull(){
    if(this.closed)return Promise.resolve();
    return this.pulling??=(async()=>{while(!this.closed){const page=await filmApi<AuthorChangesPage>(`/api/documents/${this.id}/changes?after=${this.kernel.confirmed.version}`);if(this.closed)return;for(const change of page.changes)this.kernel.accept(change);if(!page.hasMore)break;}this.kernel.refresh(true);this.publish();})().finally(()=>{this.pulling=undefined;});
  }
  private async submit(task:Pending){
    const request=task.inverseMutationId?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],inverseMutationId:task.inverseMutationId}:task.kind==='restore'?{baseVersion:task.request.baseVersion,mutationId:task.request.mutationId,commands:[],restoreVersion:task.request.version}:task.request;
    const reply=await filmApi<SyncAcknowledgement>(`/api/documents/${task.documentId}/edits`,{...request,...(task.kernel?.dependencies?.length?{dependencies:task.kernel.dependencies}:{})});
    if(!this.closed){if(reply.change.fromVersion===this.kernel.confirmed.version)this.kernel.accept(reply.change);if(this.kernel.confirmed.version<reply.committedVersion)await this.pull();this.kernel.acknowledge(task.request.mutationId,reply.committedVersion);}
    return reply.committedVersion;
  }
  async execute(commands:FilmCommand[]){this.pending++;try{await this.kernel.execute([{type:'film.edit',commands}]);}finally{this.pending--;this.publish();}}
  async rename(title:string){this.pending++;try{await this.kernel.execute([{type:'deck.update',title}]);}finally{this.pending--;this.publish();}}
  async undo(){await this.kernel.undo();this.publish();}
  async redo(){await this.kernel.redo();this.publish();}
  async save(){await this.kernel.whenIdle();await this.queue.retry();await this.pull();this.publish();}
  async exportDraft(){await this.kernel.whenIdle();return this.queue.exportDraft();}
  async close(){this.closed=true;await this.kernel.seal();await this.queue.close();}
}
