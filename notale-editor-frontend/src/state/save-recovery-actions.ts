type Action='retry'|'reload'|'export';
interface Model {visible:boolean;busy:boolean;scope:string;run?:(action:Action)=>Promise<void>;error?:string;}
const initial:Model={visible:false,busy:false,scope:''};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:Model){model=next;listeners.forEach(fn=>fn());}
export const saveRecoveryState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindSaveRecovery(context:{scope:()=>string;retry:()=>Promise<unknown>;reload:()=>Promise<unknown>;export:()=>Promise<unknown>}){
 const token=Symbol();owner=token;const running=new Set<Action>();
 return {update(source:{scope:string;visible:boolean;busy:boolean}){
  if(owner!==token)return;const scope=source.scope;
  publish({...source,error:scope===model.scope?model.error:undefined,run:async action=>{
   if(owner!==token||context.scope()!==scope||!model.visible||running.has(action)||action!=='export'&&(model.busy||running.has('retry')||running.has('reload')))return;
   running.add(action);try{await context[action]();}catch(cause){if(owner===token&&context.scope()===scope)publish({...model,error:cause instanceof Error?cause.message:String(cause)});}finally{running.delete(action);}
  }});
 },dispose(){if(owner===token){owner=undefined;publish(initial);}}};
}
