export type ObjectMenuItem={id?:string;label:string;icon?:string;shortcut?:string;disabled?:boolean;reason?:string;danger?:boolean;separator?:boolean;children?:ObjectMenuItem[];run?:()=>unknown};
export type FormatControl={id:string;label:string;kind:'button'|'select'|'number'|'color';icon?:string;value?:string;mixed?:boolean;checked?:boolean;disabled?:boolean;options?:{value:string;label:string}[];min?:number;max?:number;run:(value:string)=>unknown};
interface Model {open:boolean;generation:number;x:number;y:number;items:ObjectMenuItem[];controls:FormatControl[];act?:(action:()=>unknown,close?:boolean)=>void;close?:(focus?:boolean)=>void;toolbarFocus?:(focused:boolean)=>void;}
const initial:Model={open:false,generation:0,x:0,y:0,items:[],controls:[]};let model=initial,owner:symbol|undefined,sequence=0;const listeners=new Set<()=>void>();
export const objectMenuState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindObjectMenu(restoreFocus:()=>void,onError:(error:unknown)=>void=()=>{}){
 const token=Symbol();owner=token;let valid=()=>true,focused=false;
 const active=()=>owner===token;
 const publish=(patch:Partial<Model>)=>{if(active()){model={...model,...patch};listeners.forEach(listener=>listener());}};
 function close(focus=false){if(!active()||!model.open)return;focused=false;publish({open:false});if(focus)restoreFocus();}
 publish(initial);
 return {get opened(){return active()&&model.open;},close,
 open(x:number,y:number,items:ObjectMenuItem[],controls:FormatControl[]=[],isValid=()=>true){
  if(!active())return;valid=isValid;focused=false;const generation=++sequence;
  publish({open:true,generation,x,y,items,controls,close:focus=>{if(model.generation===generation)close(focus);},toolbarFocus:value=>{if(active()&&model.generation===generation)focused=value;},act:(action,closeAfter=false)=>{
   if(!active()||!model.open||model.generation!==generation)return;
   if(!valid()){close();return;}
   try{void Promise.resolve(action()).catch(cause=>{if(active())onError(cause);});}catch(cause){onError(cause);}
   if(closeAfter)close();
  }});
 },refresh(controls:FormatControl[]){if(active()&&model.open&&!focused)publish({controls});},
 dispose(){if(active()){publish({...initial,generation:++sequence});owner=undefined;valid=()=>false;}}
 };
}
