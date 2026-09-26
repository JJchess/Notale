import {sceneValuesSchema,sceneCheckpointSchema,type SourceScene,type SceneScalar,type SceneCheckpoint,type Command} from '@notale/editor/browser';
export interface SceneInspection {values?:Record<string,SceneScalar>;checkpoint?:SceneCheckpoint;error?:string;}
export interface SceneContext {documentId:string;pageId:string;runtimeId:string;target:string;ready:boolean;scenes:SourceScene[];saved:{id:string;values:Record<string,SceneScalar>;checkpoint?:SceneCheckpoint}[];}
export interface SceneModel {scope:string;scenes:SourceScene[];selected:string;draft:Record<string,string|boolean>;captured:boolean;busy:boolean;status:string;error:string;select?:(id:string)=>void;change?:(key:string,value:string|boolean)=>void;run?:(action:'read'|'save'|'reset'|'root')=>Promise<void>;}
const initial:SceneModel={scope:'',scenes:[],selected:'',draft:{},captured:false,busy:false,status:'',error:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const sceneInspectorState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
const scopeOf=(source:SceneContext)=>JSON.stringify([source.documentId,source.pageId,source.runtimeId,source.target,source.ready,source.scenes.filter(scene=>scene.targets.includes(source.target)),source.saved]);
export function sceneDraftValues(scene:SourceScene,draft:SceneModel['draft']){
 const values:Record<string,SceneScalar>={};
 for(const p of scene.parameters.filter(p=>!p.readonly)){
  const raw=draft[p.key];let value:SceneScalar;
  if(p.choices){const choice=p.choices.find(choice=>String(choice.value)===String(raw));if(!choice)throw Error(`请为 ${p.label} 选择有效值`);value=choice.value;}
  else if(typeof p.value==='number'){if(typeof raw!=='string'||!raw.trim()||!Number.isFinite(Number(raw)))throw Error(`请为 ${p.label} 输入有效数字`);value=Number(raw);}
  else if(typeof p.value==='boolean')value=raw===true||raw==='true';
  else value=String(raw??'');
  const bounds=p.control;
  if(typeof value==='number'&&bounds){if(bounds.min!==undefined&&value<bounds.min||bounds.max!==undefined&&value>bounds.max)throw Error(`${p.label} 超出允许范围`);if(bounds.step&&bounds.step>0&&Math.abs((value-(bounds.min??0))/bounds.step-Math.round((value-(bounds.min??0))/bounds.step))>1e-7)throw Error(`${p.label} 不符合步长要求`);}
  values[p.key]=value;
 }
 return sceneValuesSchema.parse(values);
}
export function createSceneInspector(context:{source:()=>SceneContext;inspect:(sceneId:string)=>Promise<SceneInspection>;commands:(commands:Command[])=>Promise<unknown>;select:(id:string)=>void}){
 const token=Symbol();owner=token;let current=initial,checkpoint:SceneCheckpoint|undefined,generation=0;
 function publish(next:SceneModel){if(owner!==token)return;current=next;model=next;listeners.forEach(fn=>fn());}
 function initialize(source:SceneContext,id?:string){
  ++generation;checkpoint=undefined;const scenes=source.ready?source.scenes.filter(scene=>scene.targets.includes(source.target)):[];const scene=scenes.find(scene=>scene.id===id)??scenes[0];const saved=source.saved.find(s=>s.id===scene?.id)?.values;
  const draft:SceneModel['draft']={};for(const p of scene?.parameters??[]){const value=saved?.[p.key]??p.value;draft[p.key]=typeof value==='boolean'?value:String(value);}
  const scope=scopeOf(source),stamp=generation;
  const valid=()=>owner===token&&stamp===generation&&scope===scopeOf(context.source());
  publish({...initial,scope,scenes,selected:scene?.id??'',draft,status:scene?.checkpoint?'在画布中体验互动并调整树的数量或重新抽样，然后读取并保存完整场景状态。':'读取当前互动状态后，可以保存本次采样和修改启动参数。',select:id=>{if(valid()&&!current.busy)initialize(context.source(),id);},change:(key,value)=>{if(valid()&&!current.busy)publish({...current,draft:{...current.draft,[key]:value}});},run:async action=>{
   if(!valid()||current.busy||!scene)return;
   publish({...current,busy:true,error:''});
   try{
    if(action==='read'){
     const result=await context.inspect(scene.id);if(!valid())return;
     if(result.error||!result.values)throw Error(result.error??'无法读取场景');
     const values=sceneValuesSchema.parse(result.values);const nextCheckpoint=scene.checkpoint?sceneCheckpointSchema.parse(result.checkpoint):undefined;
     const draft={...current.draft};for(const p of scene.parameters){const value=values[p.key];if(value!==undefined)draft[p.key]=typeof value==='boolean'?value:String(value);}
     checkpoint=nextCheckpoint;publish({...current,draft,captured:true,status:checkpoint?`已读取第 ${checkpoint.state.runCount} 次抽样、${checkpoint.state.m} 棵树及预测历史，保存后可继续互动。`:'已读取当前互动状态；保存后重新打开将使用这些参数。'});
    }else if(action==='save'){
     if(!current.captured)throw Error('请先读取当前互动状态');
     if(scene.checkpoint&&!checkpoint)throw Error('请先读取完整场景状态');
     const command:Command=scene.checkpoint?{type:'scene.checkpoint',slideId:source.pageId,sceneId:scene.id,checkpoint:structuredClone(checkpoint!)}:{type:'scene.set',slideId:source.pageId,sceneId:scene.id,values:sceneDraftValues(scene,current.draft)};
     await context.commands([command]);
    }else if(action==='reset')await context.commands([{type:'scene.remove',slideId:source.pageId,sceneId:scene.id}]);
    else if(scene.root)context.select(scene.root);
   }catch(cause){if(valid())publish({...current,error:cause instanceof Error?cause.message:String(cause)});}
   finally{if(valid())publish({...current,busy:false});}
  }});
 }
 return {render(){if(owner!==token)return;const source=context.source();if(current.scope!==scopeOf(source))initialize(source,current.selected);},dispose(){if(owner!==token)return;++generation;publish(initial);owner=undefined;}};
}
