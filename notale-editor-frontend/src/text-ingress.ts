import {DraftWrites} from './state/draft-writes';
import type {Pending} from './pending-journal.js';
import type {GeometrySession} from './geometry-session.js';
export type TextDraft={sessionId:string;target:string;sequence:number;html:string;beforeHtml?:string;style?:Record<string,string>;immediate:boolean;composing:boolean;slideId:string;runtimeId:string};
export function createTextIngress(context:{queue:GeometrySession;documentId:()=>string;version:()=>number;error:(e:unknown)=>void;confirm:(data:{sessionId:string;target:string;sequence:number;html:string})=>void}){
 const drafts=new DraftWrites(task=>context.queue.stageText(task));
 let sealed=false;
 const finalizing=new Set<Promise<void>>();
 let write=Promise.resolve(),timer:ReturnType<typeof setTimeout>|undefined,maxTimer:ReturnType<typeof setTimeout>|undefined;
 let bucket:{id:string;data:TextDraft;before:string}|undefined,redo:{data:TextDraft;before:string}|undefined;
 function clear(){clearTimeout(timer);clearTimeout(maxTimer);timer=undefined;maxTimer=undefined;}
 function take(){const current=bucket;bucket=undefined;clear();return current;}
 function flush(){
  if(sealed)return Promise.resolve();
  const current=take(),staging=write;
  const task=(async()=>{await staging;if(current)await context.queue.finalizeText(current.id);})();
  finalizing.add(task);void task.then(()=>finalizing.delete(task),()=>finalizing.delete(task));return task;
 }
 function receive(data:TextDraft){
  if(sealed)return;
  if(bucket&&bucket.data.sessionId!==data.sessionId)void flush().catch(context.error);
  redo=undefined;
  bucket??={id:crypto.randomUUID(),data,before:data.beforeHtml??data.html};data={...data,style:{...bucket.data.style,...data.style}};bucket.data=data;
  const captured=bucket,id=captured.id;
  const task:Pending={kind:'commit',documentId:context.documentId(),slideId:data.slideId,selection:[data.target],textEdit:{sessionId:data.sessionId,target:data.target,sequence:data.sequence},request:{baseVersion:context.version(),mutationId:id,commands:[{type:'element.patch',slideId:data.slideId,target:data.target,patch:{richText:data.html,...(data.style?{style:data.style}:{})}}]}};
  write=drafts.stage(task);void write.catch(context.error);
  clearTimeout(timer);
  if(data.composing){clearTimeout(maxTimer);maxTimer=undefined;return;}
  if(data.immediate){void flush().catch(context.error);return;}
  timer=setTimeout(()=>void flush().catch(context.error),500);maxTimer??=setTimeout(()=>void flush().catch(context.error),2000);
 }
 return {receive,flush,async seal(){sealed=true;clear();const results=await Promise.allSettled([...finalizing]);await drafts.retain();const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected');if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'文字草稿收尾失败');},get canUndo(){return !!bucket;},get canRedo(){return !!redo;},async undo(){if(sealed||!bucket)return false;const current=take()!;await write;if(!await context.queue.cancelText(current.id))return false;redo={data:current.data,before:current.before};context.confirm({sessionId:current.data.sessionId,target:current.data.target,sequence:current.data.sequence,html:current.before});return true;},async redo(){if(sealed||!redo)return false;const entry=redo;redo=undefined;receive({...entry.data,immediate:true});context.confirm({sessionId:entry.data.sessionId,target:entry.data.target,sequence:entry.data.sequence,html:entry.data.html});return true;}};
}
