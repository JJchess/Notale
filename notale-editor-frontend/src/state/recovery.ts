import type {SavedOperation} from '../sync-journal';
import type {Pending,PendingJournal} from '../pending-journal';
import {pendingRecordKey} from '../pending-journal';
export interface RecoveryRow {id:string;label:string;action?:string;disabled?:boolean;download:string;legacyKey?:string;}
const empty={rows:[] as RecoveryRow[],error:''};
class RecoveryState {
 private state=empty;private listeners=new Set<()=>void>();
 getSnapshot=()=>this.state;getServerSnapshot=()=>empty;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 publish(rows:RecoveryRow[],error=''){this.state={rows,error};for(const listener of this.listeners)listener();}
}
export const recoveryState=new RecoveryState();
export const recoveryActions:{refresh:()=>Promise<void>;run:(id:string)=>Promise<void>;download:(id:string)=>string;import:(raw:string)=>Promise<void>}={refresh:async()=>{},run:async()=>{},download:()=>'',import:async()=>{}};
export function bindRecovery(context:{retained:()=>Promise<SavedOperation[]>;journal:PendingJournal;pending:()=>Pending|undefined;busy:()=>boolean;load:(id:string)=>Promise<void>;importDraft:(raw:string)=>Promise<void>;copy:(id:string,request:unknown)=>Promise<string>;open:(id:string)=>void}){
 let generation=0,disposed=false;let handlers=new Map<string,{run?:()=>Promise<void>;raw:string}>();
 async function refresh(){const token=++generation;try{
  const records=await context.retained();if(disposed||token!==generation)return;
  const retained=new Set(records.map(e=>e.id)),legacy=context.journal.list(),rows:RecoveryRow[]=[],next=new Map<string,{run?:()=>Promise<void>;raw:string}>();
  for(const entry of records.filter(e=>e.state==='recovery')){
   const id='saved:'+entry.id;rows.push({id,label:'已保留草稿 · '+(entry.error??'等待恢复'),action:'打开恢复副本',download:'导出完整草稿'});
   next.set(id,{raw:JSON.stringify({schema:'notale-sync-v1',operations:records.filter(e=>e.documentId===entry.documentId)},null,2),run:async()=>{
    const source=entry.edit?.sourceVersion??entry.task?.request.baseVersion??entry.draftTask?.request.baseVersion;if(!source)throw Error('请先导出草稿以保留操作');
    const edits=records.filter(e=>e.documentId===entry.documentId&&e.state==='recovery');
    const commands=edits.flatMap(e=>e.edit?.commands??(e.task?.kind!=='restore'?e.task?.request.commands??(e.draftTask?.kind!=='restore'?e.draftTask?.request.commands??[]:[]):[]));
    const history=entry.task??entry.draftTask,operation=history?.inverseVersion?{commands:[],inverseVersion:history.inverseVersion}:history?.kind==='restore'?{commands:[],restoreVersion:history.request.version}:{commands};
    const copy=await context.copy(entry.documentId,{baseVersion:source,mutationId:entry.id,...operation});if(!disposed)context.open(copy);
   }});
  }
  for(const {key,entry}of legacy.entries.filter(e=>!retained.has(e.entry.task.request.mutationId))){
   const id='legacy:'+key,own=context.pending()&&pendingRecordKey(context.pending()!)===key;
   rows.push({id,legacyKey:key,label:`${entry.title} · ${entry.task.kind==='restore'?'恢复版本':'编辑修改'} · v${entry.task.request.baseVersion} · ${new Date(entry.createdAt).toLocaleString()}`,action:own?'当前待确认修改':'继续恢复',disabled:!!own||context.busy()||!!context.pending(),download:'导出修改'});
   next.set(id,{raw:JSON.stringify(entry,null,2),run:async()=>{if(context.busy()||context.pending())throw Error('请先处理当前待确认修改');const selected=context.journal.adopt(key);await context.load(selected.task.documentId);}});
  }
  legacy.invalid.forEach((item,index)=>{const id='invalid:'+index;rows.push({id,label:'恢复记录无法读取，原始数据仍保留在本机',download:'导出原始记录'});next.set(id,{raw:item.raw});});
  handlers=next;recoveryState.publish(rows);
 }catch(error){if(!disposed&&token===generation)recoveryState.publish(recoveryState.getSnapshot().rows,error instanceof Error?error.message:String(error));}}
 recoveryActions.refresh=refresh;
 recoveryActions.run=async id=>{const action=handlers.get(id)?.run;if(disposed||!action)throw Error('恢复记录已变化，请刷新后重试');await action();await refresh();};
 recoveryActions.download=id=>{const entry=handlers.get(id);if(!entry)throw Error('恢复记录已变化');return entry.raw;};
 recoveryActions.import=async raw=>{if(disposed)throw Error('编辑器已关闭');if(JSON.parse(raw).schema==='notale-sync-v1')await context.importDraft(raw);else context.journal.importFile(raw);await refresh();};
 return {refresh,dispose(){disposed=true;generation++;handlers.clear();}};
}
