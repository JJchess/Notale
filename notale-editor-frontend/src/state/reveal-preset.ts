import {commitSchema,type Command,type Slide,type InteractiveComponent} from '@notale/editor/browser';
import {revealInsertCommands} from '../reveal-commands';
interface ObjectInfo {id:string;parent?:string;tag:string;text:string;locked:boolean;attributes:Record<string,string>;}
interface Context {documentId:()=>string;slide:()=>Slide;objects:()=>ObjectInfo[];selected:()=>string[];commands:(commands:Command[])=>Promise<unknown>;whenReady:()=>Promise<void>;choose:(id:string)=>void;error:(cause:unknown)=>void;}
export interface RevealDraft {name:string;closedLabel:string;openLabel:string;answer:string;initial:string;}
interface Model {available:boolean;scope:string;draft?:RevealDraft;busy:boolean;locked:boolean;error:string;insert?:()=>Promise<void>;save?:()=>Promise<void>;change?:(patch:Partial<RevealDraft>)=>void;reset?:()=>void;}
const initial:Model={available:false,scope:'',busy:false,locked:false,error:''};let model=initial,owner:symbol|undefined;
const listeners=new Set<()=>void>();
export const revealPresetState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function createRevealPreset(context:Context){
 const token=Symbol();owner=token;let current=initial,dirty=false,baseline='',generation=0,running=false;
 const active=()=>owner===token;
 const pageKey=()=>JSON.stringify([context.documentId(),context.slide().id]);
 function publish(next:Model){if(!active())return;current=next;model=next;listeners.forEach(fn=>fn());}
 function source(){
  const objects=context.objects(),byId=new Map(objects.map(object=>[object.id,object])),selected=context.selected();
  const inside=(id:string,root:string)=>{const seen=new Set<string>();let object=byId.get(id);while(object&&!seen.has(object.id)){if(object.id===root)return true;seen.add(object.id);object=object.parent?byId.get(object.parent):undefined;}return false;};
  const component=(context.slide().components??[]).find(c=>!c.instance&&byId.get(c.root)?.attributes['data-notale-preset']==='reveal'&&selected.some(id=>inside(id,c.root)));
  const children=component?objects.filter(object=>object.parent===component.root):[];
  const button=children.find(object=>object.attributes['data-notale-role']==='toggle'),answer=children.find(object=>object.attributes['data-notale-role']==='answer');
  if(!component||!button||!answer)return;
  return {component,button,answer,locked:[component.root,button.id,answer.id].some(id=>byId.get(id)?.locked)};
 }
 const key=(value:ReturnType<typeof source>)=>JSON.stringify([pageKey(),value?.component.id,value?.button.id,value?.answer.id]);
 const content=(value:NonNullable<ReturnType<typeof source>>)=>JSON.stringify([value.component,value.button.text,value.answer.text]);
 const draftOf=({component,button,answer}:NonNullable<ReturnType<typeof source>>):RevealDraft=>({name:component.name,closedLabel:component.states.find(state=>state.id==='closed')?.patches[button.id]?.text??button.text,openLabel:component.states.find(state=>state.id==='open')?.patches[button.id]?.text??button.text,answer:answer.text,initial:component.initial});
 function render(){
  if(!active())return;
  const value=source(),scope=key(value),changed=scope!==current.scope;
  if(changed){generation++;dirty=false;}
  let draft=current.draft;if(!value){draft=undefined;baseline='';}else if(changed||!dirty){draft=draftOf(value);baseline=content(value);}
  const stamp=generation,page=pageKey();
  publish({available:true,scope,draft,busy:running,locked:value?.locked??false,error:changed?'':current.error,
   change:patch=>{if(!active()||generation!==stamp||running||current.locked||!current.draft||key(source())!==scope)return;dirty=true;publish({...current,draft:{...current.draft,...patch},error:''});},
   reset:()=>{if(!active()||generation!==stamp||running||key(source())!==scope)return;dirty=false;publish({...current,error:''});render();},
   insert:async()=>{
    if(!active()||running||pageKey()!==page)return;running=true;render();
    const old=new Set((context.slide().components??[]).map(component=>component.id));
    try{
     await context.commands(revealInsertCommands(context.slide().id));await context.whenReady();
     if(active()&&generation===stamp&&pageKey()===page){const created=(context.slide().components??[]).find(component=>!old.has(component.id));if(created)context.choose(created.root);}
    }catch(cause){if(active()&&pageKey()===page){publish({...current,error:cause instanceof Error?cause.message:String(cause)});context.error(cause);}}
    finally{running=false;if(active())render();}
   },
   save:async()=>{
    if(!active()||generation!==stamp||running||!current.draft)return;
    const latest=source();if(!latest||key(latest)!==scope||latest.locked)return;
    if(content(latest)!==baseline){publish({...current,error:'互动内容已变化，请载入最新内容后再编辑。'});return;}
    const draft={...current.draft},component:InteractiveComponent=structuredClone(latest.component),destination=context.slide().id;
    component.name=draft.name;component.initial=draft.initial;
    for(const state of component.states)if(state.id==='closed'||state.id==='open')state.patches[latest.button.id]={...state.patches[latest.button.id],text:state.id==='closed'?draft.closedLabel:draft.openLabel};
    component.steps=component.steps.map(step=>step.step===0?{...step,state:component.initial}:step);
    running=true;render();
    try{
     const commands=commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:[{type:'element.patch',slideId:destination,target:latest.answer.id,patch:{text:draft.answer}},{type:'component.set',slideId:destination,component}]}).commands;
     await context.commands(commands);
     if(active()&&generation===stamp){dirty=false;publish({...current,error:''});}
    }catch(cause){if(active()&&generation===stamp){publish({...current,error:cause instanceof Error?cause.message:String(cause)});context.error(cause);}}
    finally{running=false;if(active())render();}
   },
  });
 }
 publish({...initial});
 return {render,dispose(){if(active()){publish({...initial});owner=undefined;}}};
}
