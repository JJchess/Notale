interface Bounds {left:number;top:number;width:number;height:number;}
interface Model {visible:boolean;bounds?:Bounds;drop?:(raw:string,x:number,y:number)=>Promise<void>;leave?:()=>void;}
const initial:Model={visible:false};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const insertionDropState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindInsertionDrop(context:{scope:()=>string;bounds:()=>Bounds;insert:(kind:string,value:string|undefined,point:{x:number;y:number})=>Promise<unknown>;error:(cause:unknown)=>void}){
 const token=Symbol();owner=token;let generation=0;
 const publish=(next:Model)=>{if(owner!==token)return;model=next;listeners.forEach(fn=>fn());};
 function show(visible:boolean){
  if(owner!==token)return;const stamp=++generation;if(!visible){publish(initial);return;}
  const scope=context.scope(),bounds=context.bounds();
  publish({visible:true,bounds:{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height},leave:()=>show(false),drop:async(raw,x,y)=>{
   if(owner!==token||generation!==stamp)return;show(false);
   try{
    if(scope!==context.scope())throw Error('页面已切换，请重新拖入对象');
    if(!raw)return;const entry=JSON.parse(raw);if(!entry||typeof entry.kind!=='string'||entry.value!==undefined&&typeof entry.value!=='string'||!Number.isFinite(x)||!Number.isFinite(y))throw Error('无法识别拖入的对象');
    await context.insert(entry.kind,entry.value,{x,y});
   }catch(cause){if(owner===token)context.error(cause);}
  }});
 }
 return {show,dispose(){if(owner===token){show(false);owner=undefined;}}};
}
