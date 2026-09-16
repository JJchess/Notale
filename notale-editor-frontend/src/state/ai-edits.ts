import type {Command} from '@notale/editor/browser';
export type AiIntent='insert-interactive'|'edit-selection';
export interface AiCandidate {mutationId:string;baseVersion:number;commands:Command[];model:string;summary:string[];}
export interface AiModel {
 available:boolean;          // false until the host configures a model service
 reason:string;              // why it is unavailable, shown in place of the submit button
 status:'idle'|'running'|'candidate'|'error';
 instruction:string;
 intent:AiIntent;
 targets:string[];
 targetLabel:string;
 candidate?:AiCandidate;
 error:string;
 change?:(patch:{instruction?:string})=>void;
 submit?:()=>Promise<void>;
 stop?:()=>void;
 apply?:()=>Promise<void>;
 discard?:()=>void;
}
const initial:AiModel={available:false,reason:'',status:'idle',instruction:'',intent:'insert-interactive',targets:[],targetLabel:'',error:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
const publish=(next:AiModel)=>{model=next;for(const fn of listeners)fn();};
export const aiEditsState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
/** What the candidate will touch, in the author's words rather than command types. */
export function summarize(commands:readonly Command[]):string[]{
 const labels:Record<string,string>={'element.insert':'新增内容','element.patch':'修改对象','element.content':'替换内部结构','element.delete':'删除对象','component.set':'定义交互','component.remove':'移除交互','elements.transfer':'新增内容'};
 const counts=new Map<string,number>();
 const add=(label:string)=>counts.set(label,(counts.get(label)??0)+1);
 for(const command of commands){
  // The scratch page of an insert transaction is plumbing; what it carries is the interaction.
  if(command.type==='slide.insert'){
   const slide=(command as {slide?:{components?:unknown[]}}).slide;
   if(slide?.components?.length)add('定义交互');
   continue;
  }
  const label=labels[command.type];
  if(label)add(label);
 }
 return [...counts].map(([label,count])=>count>1?`${label} ×${count}`:label);
}
export interface AiContext {
 documentId:()=>string;
 slideId:()=>string;
 selection:()=>string[];
 selectionLabel:()=>string;
 request:(path:string,body:unknown,signal:AbortSignal)=>Promise<unknown>;
 apply:(commands:Command[])=>Promise<unknown>;
 status:()=>Promise<{available:boolean;reason:string}>;
}
export function bindAiEdits(context:AiContext){
 const token=Symbol();owner=token;
 const active=()=>owner===token;
 let controller:AbortController|undefined;
 // The page and target a task was started against; a candidate that no longer matches the
 // author's current selection must not be applied silently.
 let scope='';
 const scopeNow=()=>JSON.stringify([context.documentId(),context.slideId(),context.selection()]);
 const render=(patch:Partial<AiModel>)=>{if(active())publish({...model,...patch});};
 function refresh(){
  if(!active())return;
  const targets=context.selection();
  const intent:AiIntent=targets.length?'edit-selection':'insert-interactive';
  if(model.status==='running')return;
  const stale=model.status==='candidate'&&scope!==scopeNow();
  render({intent,targets,targetLabel:context.selectionLabel(),...(stale?{status:'idle' as const,candidate:undefined}:{})});
 }
 void context.status().then(status=>render({available:status.available,reason:status.reason})).catch(()=>render({available:false,reason:'无法确认模型服务状态'}));
 publish({...initial,
  change:patch=>{if(active()&&model.status!=='running')render({...patch,error:''});},
  stop:()=>{controller?.abort();},
  discard:()=>{if(active())render({status:'idle',candidate:undefined,error:''});},
  submit:async()=>{
   if(!active()||model.status==='running'||!model.instruction.trim())return;
   const targets=context.selection(),intent:AiIntent=targets.length?'edit-selection':'insert-interactive';
   scope=scopeNow();
   controller=new AbortController();
   render({status:'running',error:'',candidate:undefined,intent,targets});
   try{
    const reply=await context.request(
     '/api/documents/'+context.documentId()+'/ai-edits',
     {slideId:context.slideId(),intent,instruction:model.instruction.trim(),targets},
     controller.signal,
    ) as {mutationId:string;baseVersion:number;commands:Command[];model:string};
    if(!active()||scope!==scopeNow()&&intent==='edit-selection'){render({status:'idle'});return;}
    render({status:'candidate',candidate:{...reply,summary:summarize(reply.commands)}});
   }catch(cause){
    if(!active())return;
    const aborted=controller?.signal.aborted;
    render({status:aborted?'idle':'error',error:aborted?'':cause instanceof Error?cause.message:String(cause)});
   }finally{controller=undefined;}
  },
  apply:async()=>{
   if(!active()||model.status!=='candidate'||!model.candidate)return;
   const candidate=model.candidate;
   if(model.intent==='edit-selection'&&scope!==scopeNow()){render({status:'error',error:'选区已变化，请重新生成'});return;}
   render({status:'running'});
   try{
    // One batch, one mutation, one undo step.
    await context.apply(candidate.commands);
    render({status:'idle',candidate:undefined,instruction:'',error:''});
   }catch(cause){
    render({status:'candidate',error:cause instanceof Error?cause.message:String(cause)});
   }
  },
 });
 return {render:refresh,dispose(){if(owner===token){owner=undefined;controller?.abort();publish(initial);}}};
}
