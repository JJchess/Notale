import type {Pending} from './pending-journal.js';
import type {GeometrySession} from './geometry-session.js';
export type TextDraft={sessionId:string;target:string;sequence:number;html:string;beforeHtml?:string;style?:Record<string,string>;immediate:boolean;composing:boolean;slideId:string;runtimeId:string};
export function createTextIngress(context:{queue:GeometrySession;documentId:()=>string;version:()=>number;error:(e:unknown)=>void;confirm:(data:{sessionId:string;target:string;sequence:number;html:string})=>void}){
 let write=Promise.resolve(),timer:ReturnType<typeof setTimeout>|undefined,maxTimer:ReturnType<typeof setTimeout>|undefined;
 let bucket:{id:string;data:TextDraft;before:string}|undefined,redo:{data:TextDraft;before:string}|undefined;
 function clear(){clearTimeout(timer);clearTimeout(maxTimer);timer=undefined;maxTimer=undefined;}
 function take(){const current=bucket;bucket=undefined;clear();return current;}
 async function flush(){const current=take();await write;if(current)await context.queue.finalizeText(current.id);}
 function receive(data:TextDraft){
  if(bucket&&bucket.data.sessionId!==data.sessionId)void flush().catch(context.error);
  redo=undefined;
  bucket??={id:crypto.randomUUID(),data,before:data.beforeHtml??data.html};data={...data,style:{...bucket.data.style,...data.style}};bucket.data=data;
  const captured=bucket,id=captured.id;
  const task:Pending={kind:'commit',documentId:context.documentId(),slideId:data.slideId,selection:[data.target],textEdit:{sessionId:data.sessionId,target:data.target,sequence:data.sequence},request:{baseVersion:context.version(),mutationId:id,commands:[{type:'element.patch',slideId:data.slideId,target:data.target,patch:{richText:data.html,...(data.style?{style:data.style}:{})}}]}};
  write=write.catch(()=>{}).then(()=>context.queue.stageText(task));void write.catch(context.error);
  clearTimeout(timer);
  if(data.composing){clearTimeout(maxTimer);maxTimer=undefined;return;}
  if(data.immediate){void flush().catch(context.error);return;}
  timer=setTimeout(()=>void flush().catch(context.error),500);maxTimer??=setTimeout(()=>void flush().catch(context.error),2000);
 }
 return {receive,flush,get canUndo(){return !!bucket;},get canRedo(){return !!redo;},async undo(){if(!bucket)return false;const current=take()!;await write;if(!await context.queue.cancelText(current.id))return false;redo={data:current.data,before:current.before};context.confirm({sessionId:current.data.sessionId,target:current.data.target,sequence:current.data.sequence,html:current.before});return true;},async redo(){if(!redo)return false;const entry=redo;redo=undefined;receive({...entry.data,immediate:true});context.confirm({sessionId:entry.data.sessionId,target:entry.data.target,sequence:entry.data.sequence,html:entry.data.html});return true;}};
}
