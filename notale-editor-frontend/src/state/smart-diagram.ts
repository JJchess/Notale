import type {Command} from '@notale/editor/browser';
import {cycleContent,cycleLabels} from '../templates';
interface ObjectInfo {id:string;parent?:string;tag:string;text:string;locked:boolean;attributes:Record<string,string>;}
interface Source {documentId:string;pageId:string;objects:ObjectInfo[];selection:string[];}
interface Model {scope:string;item:boolean;cycle:boolean;count:string;busy:boolean;locked:boolean;error:string;change?:(count:string)=>void;save?:()=>Promise<void>;itemAction?:(action:'duplicate'|'delete')=>Promise<void>;}
const initial:Model={scope:'',item:false,cycle:false,count:'3',busy:false,locked:false,error:''};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const smartDiagramState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function createSmartDiagram(context:{source:()=>Source;commands:(commands:Command[])=>Promise<unknown>}){
 const token=Symbol();owner=token;let current=initial,generation=0,dirty=false,baseline='';
 const active=()=>owner===token;
 const scope=(s:Source)=>JSON.stringify([s.documentId,s.pageId,s.selection]);
 const labels=(s:Source)=>s.objects.filter(object=>object.parent===s.selection[0]&&object.tag==='p').map(object=>object.text.trim());
 function publish(next:Model){if(!active())return;current=next;model=next;listeners.forEach(fn=>fn());}
 function render(){
  if(!active())return;const source=context.source(),key=scope(source),changed=key!==current.scope;
  const object=source.selection.length===1?source.objects.find(object=>object.id===source.selection[0]):undefined,parent=source.objects.find(item=>item.id===object?.parent);
  const item=!!object&&['process','list'].includes(parent?.attributes['data-notale-smart']??''),cycle=object?.attributes['data-notale-smart']==='cycle';
  if(changed){generation++;dirty=false;}const count=changed||!dirty?String(labels(source).length||3):current.count;if(!dirty)baseline=JSON.stringify(labels(source));
  const stamp=generation,valid=()=>active()&&generation===stamp&&scope(context.source())===key;
  const locked=!!object?.locked||!!parent?.locked;
  const act=async(action:'count'|'duplicate'|'delete')=>{
   if(!valid()||current.busy||current.locked||!object)return;
   const latest=context.source(),target=latest.objects.find(item=>item.id===object.id);if(!target||target.locked||latest.objects.some(item=>item.id===target.parent&&item.locked))return;
   try{
    let commands:Command[];
    if(action==='count'){
     if(!current.cycle||!dirty)return;const count=Number(current.count);
     if(!current.count.trim()||!Number.isInteger(count)||count<3||count>6)throw Error('循环项数应为 3 到 6 的整数');
     const existing=labels(latest);if(JSON.stringify(existing)!==baseline)throw Error('循环内容已变化，请重新选择图示后修改项数');
     commands=[{type:'element.content',slideId:latest.pageId,target:target.id,html:cycleContent(cycleLabels(count,existing))},{type:'element.patch',slideId:latest.pageId,target:target.id,patch:{attributes:{'data-notale-cycle':String(count)}}}];
    }else{if(!current.item)return;commands=[{type:action==='duplicate'?'element.duplicate':'element.delete',slideId:latest.pageId,target:target.id}];}
    publish({...current,busy:true,error:''});await context.commands(commands);if(valid())dirty=false;
   }catch(cause){if(valid())publish({...current,error:cause instanceof Error?cause.message:String(cause)});}
   finally{if(valid()){publish({...current,busy:false});render();}}
  };
  publish({...current,scope:key,item,cycle,count,locked,...(changed?{busy:false,error:''}:{}),change:count=>{if(valid()&&!current.busy&&!current.locked){dirty=true;publish({...current,count,error:''});}},save:()=>act('count'),itemAction:action=>act(action)});
 }
 publish({...initial});return {render,dispose(){if(active()){publish({...initial});owner=undefined;}}};
}
