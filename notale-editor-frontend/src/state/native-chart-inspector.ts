import {nativeChartOptionSchema,nativeChartAppearancePatchSchema,type NativeChartInspection,type NativeChartInteraction,type Command,type Slide} from '@notale/editor/browser';
type Chart=Slide['nativeCharts'][string];
export interface NativeChartSource {documentId:string;pageId:string;target:string;runtimeId:string;available:boolean;chart?:Chart;}
export interface NativeChartDraft {name:string;color:string;width:string;data:string;showSymbol:boolean;saveData:boolean;option:string;value:string;appearanceState:'active'|'inactive';backgroundColor:string;textColor:string;borderColor:string;fontWeight:string;}
export interface NativeChartModel {available:boolean;busy:boolean;inspection?:NativeChartInspection;component?:NativeChartInteraction;index:number;draft:NativeChartDraft;status:string;error:string;change?:(patch:Partial<NativeChartDraft>)=>void;series?:(index:number)=>void;run?:(action:'inspect'|'series'|'option'|'reset'|'value'|'appearance')=>Promise<void>;}
const draft:NativeChartDraft={name:'',color:'#466ddb',width:'2',data:'[]',showSymbol:false,saveData:false,option:'{}',value:'0.1',appearanceState:'active',backgroundColor:'',textColor:'',borderColor:'',fontWeight:''};
const initial:NativeChartModel={available:false,busy:false,index:0,draft,status:'读取图表后可编辑序列数据与样式。',error:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const nativeChartInspectorState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
const keyOf=(s:NativeChartSource)=>JSON.stringify([s.documentId,s.pageId,s.target,s.runtimeId,s.available,s.chart]);
function appearance(draft:NativeChartDraft,component?:NativeChartInteraction){const style=component?.[draft.appearanceState];return {...draft,backgroundColor:style?.backgroundColor??'',textColor:style?.color??'',borderColor:style?.borderColor??'',fontWeight:style?.fontWeight??''};}
export function nativeSeriesOption(source:Chart|undefined,index:number,draft:NativeChartDraft){
 if(!Number.isInteger(index)||index<0)throw Error('请选择有效序列');
 if(!draft.width.trim()||!Number.isFinite(Number(draft.width)))throw Error('请输入有效线宽');
 const option=structuredClone(source?.option??{});option.series??=[];while(option.series.length<=index)option.series.push({});
 const patch=option.series[index];patch.name=draft.name;patch.lineStyle={...patch.lineStyle,color:draft.color,width:Number(draft.width)};patch.itemStyle={...patch.itemStyle,color:draft.color};patch.showSymbol=draft.showSymbol;
 if(draft.saveData)patch.data=JSON.parse(draft.data);else delete patch.data;
 return nativeChartOptionSchema.parse(option);
}
export function createNativeChartInspector(context:{source:()=>NativeChartSource;inspect:(target:string)=>Promise<NativeChartInspection>;commands:(commands:Command[])=>Promise<unknown>;discovered:()=>void;supports:(property:string,value:string)=>boolean}){
 const token=Symbol();owner=token;let current=initial,key='',generation=0;
 function publish(next:NativeChartModel){if(owner!==token)return;current=next;model=next;listeners.forEach(fn=>fn());}
 function fillSeries(index:number){const series=current.inspection?.series[index];if(!series)return;publish({...current,index,draft:{...current.draft,name:series.name,color:series.color,width:String(series.width),data:JSON.stringify(series.data,null,2),showSymbol:series.showSymbol,saveData:context.source().chart?.option.series?.[index]?.data!==undefined}});}
 function render(){
  if(owner!==token)return;const source=context.source(),nextKey=keyOf(source);if(key===nextKey)return;key=nextKey;const stamp=++generation;
  const valid=()=>owner===token&&stamp===generation&&keyOf(context.source())===nextKey;
  publish({...initial,available:source.available,component:source.chart?.interaction,draft:appearance({...draft,option:JSON.stringify(source.chart?.option??{},null,2),value:source.chart?.interaction?.value??'0.1'},source.chart?.interaction),change:patch=>{if(!valid()||current.busy)return;let next={...current.draft,...patch};if(patch.appearanceState)next=appearance(next,current.component);publish({...current,draft:next});},series:index=>{if(valid()&&!current.busy)fillSeries(index);},run:async action=>{
   if(!valid()||current.busy||!source.available)return;publish({...current,busy:true,error:''});
   try{
    if(action==='inspect'){await inspect();return;}
    const target=source.target,slideId=source.pageId;let commands:Command[]=[];
    const adoption=():Command[]=>{if(source.chart?.interaction)return [];const component=current.component;if(!component)throw Error('请先读取当前组件');const {value,active,inactive}=component;return [{type:'native-chart.component',slideId,target,state:{value,active,inactive}}];};
    if(action==='series'){if(!current.inspection?.series[current.index])throw Error('请先读取当前图表');commands=[{type:'native-chart.set',slideId,target,option:nativeSeriesOption(source.chart,current.index,current.draft)}];}
    else if(action==='option')commands=[{type:'native-chart.set',slideId,target,option:nativeChartOptionSchema.parse(JSON.parse(current.draft.option))}];
    else if(action==='reset')commands=[{type:'native-chart.remove',slideId,target}];
    else if(action==='value'){const value=current.draft.value;if(value!=='1.0'&&value!=='0.1'&&value!=='0.02')throw Error('请选择有效学习率');commands=[...adoption(),{type:'native-chart.state',slideId,target,value}];}
    else {
     const state=current.draft.appearanceState,before=current.component?.[state];if(!before)throw Error('请先读取当前组件');const patch:Record<string,string>={};
     for(const [property,field] of Object.entries({backgroundColor:'backgroundColor',color:'textColor',borderColor:'borderColor',fontWeight:'fontWeight'})){
      const value=String(current.draft[field as keyof NativeChartDraft]).trim();if(!context.supports(property.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value))throw Error('无效的样式值：'+value);if(value!==before[property as keyof typeof before])patch[property]=value;
     }
     if(Object.keys(patch).length)commands=[...adoption(),{type:'native-chart.appearance',slideId,target,state,patch:nativeChartAppearancePatchSchema.parse(patch)}];
    }
    if(commands.length)await context.commands(commands);
   }catch(cause){if(valid())publish({...current,error:cause instanceof Error?cause.message:String(cause)});}
   finally{if(valid())publish({...current,busy:false});}
  }});
 }
 async function inspect(){
  render();const source=context.source(),sourceKey=keyOf(source),stamp=generation;
  const result=await context.inspect(source.target);
  if(owner!==token||generation!==stamp||keyOf(context.source())!==sourceKey)return;
  if(result.target!==source.target||!result.available||result.error)throw Error(result.error??'图表实例不可用');
  const inspection=structuredClone(result),component=source.chart?.interaction??inspection.component;
  publish({...current,inspection,component,draft:appearance({...current.draft,value:result.value??current.draft.value},component),status:`${result.series.length} 个序列；未固定的数据继续响应原页面互动。`});fillSeries(0);context.discovered();return result;
 }
 return {render,inspect,get inspection(){return owner===token&&keyOf(context.source())===key?current.inspection:undefined;},dispose(){if(owner!==token)return;++generation;publish(initial);owner=undefined;}};
}
