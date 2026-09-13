export const layerLabels={front:'置顶',back:'置底',forward:'上移一层',backward:'下移一层'};
export type LayerAction=keyof typeof layerLabels;
export const alignmentLabels={left:'左对齐',center:'水平居中',right:'右对齐',top:'顶部对齐',middle:'垂直居中',bottom:'底部对齐','distribute-x':'水平分布','distribute-y':'垂直分布'};
interface Model {scope:string;units:number;disabled:boolean;reference:'selection'|'slide';angle:string;factor:string;run?:(action:string)=>Promise<void>;error:string;}
const initial:Model={scope:'',units:0,disabled:true,reference:'selection',angle:'15',factor:'1.1',error:''};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:Model){model=next;listeners.forEach(fn=>fn());}
export const arrangementState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function changeArrangement(patch:Partial<Pick<Model,'reference'|'angle'|'factor'>>){publish({...model,...patch,error:''});}
export function arrangementSettings(action:string){
 const number=(value:string,label:string)=>{if(!value.trim()||!Number.isFinite(Number(value)))throw Error(`请输入有效的${label}`);return Number(value);};
 const angle=action==='rotate'?number(model.angle,'角度'):15,factor=action==='scale'?number(model.factor,'缩放倍数'):1.1;if(action==='scale'&&factor<=0)throw Error('缩放倍数必须大于零');
 return {reference:model.reference,angle,factor};
}
export function bindArrangement(context:{scope:()=>string;arrange:(action:string)=>Promise<unknown>;layer?:(action:LayerAction)=>Promise<unknown>}){
 const token=Symbol();owner=token;let busy=false;
 publish({...initial});
 return {update(source:{scope:string;units:number;disabled:boolean}){
  if(owner!==token)return;const reference=(source.units===1)!==(model.units===1)?source.units===1?'slide':'selection':model.reference;
  const scope=source.scope;
  publish({...model,...source,reference,error:scope===model.scope?model.error:'',run:async action=>{
   if(owner!==token||scope!==context.scope()||model.disabled||busy||action.startsWith('distribute')&&model.units<3)return;
   busy=true;try{if(action in layerLabels)await context.layer?.(action as LayerAction);else await context.arrange(action);}catch(cause){if(owner===token&&scope===context.scope())publish({...model,error:cause instanceof Error?cause.message:String(cause)});}finally{busy=false;}
  }});
 },dispose(){if(owner===token){owner=undefined;publish(initial);}}};
}
