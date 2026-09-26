export interface ClosingSession {close:()=>Promise<void>;exportDraft:()=>Promise<string>;}
export interface ClosingNotice {id:number;title:string;pending:boolean;error:string;}
const empty:readonly ClosingNotice[]=[];
/** Retains failed local drafts independently of the editor component lifetime. */
export class ClosingSessions {
 private sequence=0;
 private entries=new Map<number,{session:ClosingSession;notice:ClosingNotice;task?:Promise<void>}>();
 private snapshot:readonly ClosingNotice[]=empty;
 private listeners=new Set<()=>void>();
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.snapshot;
 getServerSnapshot=()=>empty;
 private publish(){this.snapshot=[...this.entries.values()].map(entry=>entry.notice);for(const listener of this.listeners)listener();}
 retain(session:ClosingSession,title:string){
  const existing=[...this.entries].find(([,entry])=>entry.session===session);if(existing)return existing[0];
  const id=++this.sequence;this.entries.set(id,{session,notice:{id,title,pending:false,error:''}});void this.retry(id);return id;
 }
 retry=(id:number):Promise<void>=>{
  const entry=this.entries.get(id);if(!entry)return Promise.resolve();if(entry.task)return entry.task;
  entry.notice={...entry.notice,pending:true,error:''};this.publish();
  entry.task=Promise.resolve().then(()=>entry.session.close()).then(()=>{this.entries.delete(id);},error=>{entry.notice={...entry.notice,pending:false,error:error instanceof Error?error.message:String(error)};}).finally(()=>{entry.task=undefined;this.publish();});
  return entry.task;
 };
 exportDraft=(id:number)=>{const entry=this.entries.get(id);if(!entry)return Promise.reject(Error('草稿已保存'));return entry.session.exportDraft();};
}
export const closingSessions=new ClosingSessions();
