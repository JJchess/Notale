import type {NativeChartInteraction} from '@notale/editor/browser';
export interface ComponentNavigationSource {
 scope:string;target:string;objects:{id:string;parent?:string}[];
 components:{id:string;component:NativeChartInteraction}[];
 discovered?:{id:string;component:NativeChartInteraction};
}
interface ComponentNavigationModel {options:{value:string;label:string}[];selected:string;choose?:(value:string)=>void;select?:()=>void;}
const initial:ComponentNavigationModel={options:[],selected:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const componentNavigationState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
const metricLabels:Record<string,string>={optM:'最佳轮数',minErr:'最低验证误差',overfit:'后期反弹',verdict:'结论'};
export function componentMemberOptions(source:ComponentNavigationSource){
 const parents=new Map(source.objects.map(object=>[object.id,object.parent]));
 const ancestors=new Set<string>();let target:string|undefined=source.target;
 while(target&&!ancestors.has(target)){ancestors.add(target);target=parents.get(target);}
 const entry=source.components.find(entry=>ancestors.has(entry.component.root));if(!entry)return [];
 const component=entry.component;
 const options=[{value:component.root,label:'整个组件'},{value:entry.id,label:'图表'},...Object.entries(component.controls).map(([key,value])=>({value,label:`按钮 ${key}`})),...Object.entries(component.metrics).map(([key,value])=>({value,label:metricLabels[key]??key}))];
 const seen=new Set<string>();return options.filter(option=>{if(seen.has(option.value))return false;seen.add(option.value);return true;});
}
export function createComponentNavigation(context:{source:()=>ComponentNavigationSource;select:(id:string)=>void}){
 const token=Symbol();owner=token;let scope='',signature='',selected='';const discoveries=new Map<string,NativeChartInteraction>();
 function publish(next:ComponentNavigationModel){if(owner!==token)return;model=next;listeners.forEach(listener=>listener());}
 return {
  render(){
   if(owner!==token)return;const source=context.source();if(scope!==source.scope){scope=source.scope;discoveries.clear();}
   if(source.discovered)discoveries.set(source.discovered.id,structuredClone(source.discovered.component));
   const components=[...source.components];for(const [id,component] of discoveries)if(!components.some(entry=>entry.id===id))components.push({id,component});
   const options=componentMemberOptions({...source,components});const nextSignature=JSON.stringify([scope,source.target,options]);if(signature===nextSignature)return;signature=nextSignature;
   selected=options.some(option=>option.value===source.target)?source.target:options[0]?.value??'';
   const sourceScope=source.scope,sourceTarget=source.target;
   const valid=()=>owner===token&&signature===nextSignature&&context.source().scope===sourceScope&&context.source().target===sourceTarget;
   const update=()=>publish({options,selected,choose:value=>{if(!valid()||!options.some(option=>option.value===value))return;selected=value;update();},select:()=>{if(!valid()||!selected)return;context.select(selected);}});update();
  },
  dispose(){if(owner!==token)return;discoveries.clear();publish(initial);owner=undefined;},
 };
}
