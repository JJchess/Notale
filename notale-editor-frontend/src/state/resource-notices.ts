export type ResourceScope='editor'|'preview'|'presentation';
export type LeaseStatus='healthy'|'retrying'|'failed'|'stopped';
type Entry={scope:ResourceScope;status:LeaseStatus;retry:()=>Promise<void>};
export interface ResourceNotice {scope:ResourceScope;pending:boolean;}
const empty:readonly ResourceNotice[]=[];
/** Commands stay outside the serializable view snapshot. Multiple leases share one notice per surface. */
class ResourceNotices {
 private entries=new Map<symbol,Entry>();
 private snapshot:readonly ResourceNotice[]=empty;
 private listeners=new Set<()=>void>();
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.snapshot;
 getServerSnapshot=()=>empty;
 private publish(){
  const next:ResourceNotice[]=[];
  for(const scope of ['editor','preview','presentation'] as const){const entries=[...this.entries.values()].filter(entry=>entry.scope===scope&&entry.status!=='healthy');if(entries.length)next.push({scope,pending:entries.some(entry=>entry.status==='retrying')});}
  if(JSON.stringify(next)===JSON.stringify(this.snapshot))return;
  this.snapshot=next;for(const listener of this.listeners)listener();
 }
 register(scope:ResourceScope,retry:()=>Promise<void>){
  const id=Symbol(scope);this.entries.set(id,{scope,status:'healthy',retry});
  return (status:LeaseStatus)=>{const entry=this.entries.get(id);if(!entry)return;if(status==='stopped')this.entries.delete(id);else entry.status=status;this.publish();};
 }
 retry=(scope:ResourceScope)=>Promise.all([...this.entries.values()].filter(entry=>entry.scope===scope&&entry.status==='failed').map(entry=>entry.retry()));
}
export const resourceNotices=new ResourceNotices();
