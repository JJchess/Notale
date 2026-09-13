export interface VectorState {active:boolean;editing?:boolean;sourceEditing?:boolean;sourceItems?:{id:string;name:string}[];gradientEditing?:boolean;processing?:boolean;items?:{id:string;tag:string;locked:boolean;generated:boolean;attributes:Record<string,string>;styles:Record<string,string>}[];}
interface Model {scope:string;state:VectorState;drafts:Record<string,string>;colors:string[];angle:string;error:string;run?:(action:string,data?:Record<string,unknown>)=>void;change?:(property:string,value:string,attribute?:boolean)=>void;commit?:(property:string,numeric?:boolean,attribute?:boolean)=>void;cancel?:(property:string,attribute?:boolean)=>void;configure?:(patch:{colors?:string[];angle?:string})=>void;file?:(file:File,kind:'font'|'image')=>Promise<void>;reset?:()=>void;}
const initial:Model={scope:'',state:{active:false},drafts:{},colors:['#8b5cf6','#38bdf8'],angle:'15',error:''};let model=initial,owner:symbol|undefined;
const listeners=new Set<()=>void>();
export const vectorInspectorState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function vectorValue(state:VectorState,property:string,attribute=false){const values=(state.items??[]).map(item=>attribute?item.attributes[property]??'0':item.styles[property]??item.attributes[property]??'');return new Set(values).size>1?undefined:values[0]??'';}
const fieldKey=(property:string,attribute:boolean)=>`${attribute?'attribute':'style'}:${property}`;
/** Editing constraints for scalar SVG fields; coordinates and spacing may be negative. */
export function vectorNumberBounds(property:string,attribute=false){
 if(!attribute&&property==='opacity')return {min:0,max:1,message:'透明度应在 0–1 之间'};
 const labels:Record<string,string>=attribute?{width:'宽度',height:'高度',r:'半径',rx:'水平半径',ry:'垂直半径'}:{'stroke-width':'描边宽度','font-size':'字号'};
 if(labels[property])return {min:0,max:undefined,message:labels[property]+'不能为负数'};
}
export function createVectorInspector(context:{scope:()=>string;send:(action:string,data?:Record<string,unknown>)=>void}){
 const token=Symbol();owner=token;let current=initial,generation=0;const baselines=new Map<string,string|undefined>(),pending=new Map<string,string>();
 const active=()=>owner===token;
 function publish(next:Model){if(!active())return;current=next;model=next;listeners.forEach(fn=>fn());}
 function render(state:VectorState){
  if(!active())return;const page=context.scope(),scope=JSON.stringify([page,state.active,(state.items??[]).map(item=>item.id)]),changed=scope!==current.scope;
  if(changed){generation++;baselines.clear();pending.clear();}
  const drafts=changed?{}:{...current.drafts};
  for(const [key,value]of pending){const colon=key.indexOf(':'),property=key.slice(colon+1),attribute=key.startsWith('attribute:');if(vectorValue(state,property,attribute)===value||vectorValue(state,property,attribute)!==baselines.get(key)){delete drafts[key];baselines.delete(key);pending.delete(key);}}
  const stamp=generation,valid=()=>active()&&generation===stamp&&context.scope()===page&&current.state.active;
  const editable=()=>valid()&&!current.state.processing&&!(current.state.items??[]).some(item=>item.locked||item.generated);
  const run=(action:string,data:Record<string,unknown>={})=>{if(!valid()||!['exit','finish-source','cancel','export','snapshot'].includes(action)&&!editable())return;context.send(action,data);};
  publish({...current,...(changed?{...initial}:{}),scope,state:structuredClone(state),drafts,
   run,
   change:(property,value,attribute=false)=>{if(!editable())return;const key=fieldKey(property,attribute);if(!baselines.has(key))baselines.set(key,vectorValue(current.state,property,attribute));pending.delete(key);publish({...current,drafts:{...current.drafts,[key]:value},error:''});},
   commit:(property,numeric=false,attribute=false)=>{
    if(!editable())return;const key=fieldKey(property,attribute),draft=current.drafts[key];if(draft===undefined||pending.has(key))return;
    if(numeric&&(!draft.trim()||!Number.isFinite(Number(draft)))){publish({...current,error:'请输入有效数字。'});return;}
    const bounds=numeric?vectorNumberBounds(property,attribute):undefined;
    if(bounds&&(Number(draft)<bounds.min||(bounds.max!==undefined&&Number(draft)>bounds.max))){publish({...current,error:bounds.message});return;}
    if(vectorValue(current.state,property,attribute)!==baselines.get(key)){publish({...current,error:'图形属性已变化，请载入最新属性后再编辑。'});return;}
    const value=draft+(!attribute&&['font-size','letter-spacing'].includes(property)?'px':'');pending.set(key,value);run(attribute?'attribute':'style',{property,value});
   },
   cancel:(property,attribute=false)=>{if(!valid())return;const key=fieldKey(property,attribute);if(pending.has(key))return;baselines.delete(key);const drafts={...current.drafts};delete drafts[key];publish({...current,drafts,error:''});},
   configure:patch=>{if(editable())publish({...current,...patch});},
   reset:()=>{if(!valid())return;baselines.clear();pending.clear();publish({...current,drafts:{},error:''});},
   file:async(file,kind)=>{
    if(!editable())return;
    try{if(kind==='font'){const font=await file.arrayBuffer();if(editable())run('text-outline',{font});}else{const href=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error??Error('图片读取失败'));reader.readAsDataURL(file);});if(editable())run('pattern',{href});}}
    catch(cause){if(valid())publish({...current,error:cause instanceof Error?cause.message:String(cause)});}
   },
  });
 }
 publish({...initial});
 return {render,get active(){return current.state.active;},get editing(){return !!current.state.editing;},dispose(){if(active()){publish({...initial});owner=undefined;}}};
}
