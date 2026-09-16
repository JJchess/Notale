export type ZoomMode=number|'fit';
interface View {mode:ZoomMode;actual:number;fit:number;hand:boolean;}
interface Model extends View {available:boolean;zoom?:(mode:ZoomMode)=>void;step?:(direction:1|-1)=>void;panMode?:(hand:boolean)=>void;}
const initial:Model={mode:'fit',actual:1,fit:1,hand:false,available:false};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const viewportViewState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindViewportView(context:{zoom:(mode:ZoomMode)=>void;hand:(enabled:boolean)=>void}){
 const token=Symbol();owner=token;
 const publish=(next:Model)=>{if(owner!==token)return;model=next;listeners.forEach(fn=>fn());};
 const zoom=(mode:ZoomMode)=>{if(owner===token&&(mode==='fit'||Number.isFinite(mode)))context.zoom(mode==='fit'?mode:Math.max(.1,Math.min(16,mode)));};
 publish({...initial,available:true,zoom,step:direction=>{if(owner===token)zoom(Math.round((model.actual+direction*.1)*100)/100);},panMode:hand=>{if(owner===token)context.hand(hand);}});
 return {update(view:View){if(owner!==token)return;if(view.mode!==model.mode||view.actual!==model.actual||view.fit!==model.fit||view.hand!==model.hand)publish({...model,...view});},dispose(){if(owner===token){publish(initial);owner=undefined;}}};
}
