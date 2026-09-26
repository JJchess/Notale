import {commitSchema,type Command} from '@notale/editor/browser';
import {parseChartSpreadsheet} from '../chart-spreadsheet';
export type StaticChart = Extract<Command,{type:'chart.update'}>['data'];
export interface StaticChartItem {id:string;parent?:string;locked:boolean;attributes:Record<string,string>;}
export interface StaticChartDraft {chart:StaticChart;values:string[][];}
export function selectedStaticChart(objects:StaticChartItem[],selection:string[]) {
 let item=selection.length===1?objects.find(item=>item.id===selection[0]):undefined;
 const seen=new Set<string>();
 while(item&&!item.attributes['data-notale-chart']){
  if(seen.has(item.id))return undefined;
  seen.add(item.id);item=objects.find(other=>other.id===item?.parent);
 }
 return item;
}
export function validateStaticChart(data:unknown):StaticChart {
 const command=commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:[{type:'chart.update',slideId:'page',target:'chart',data}]}).commands[0] as Extract<Command,{type:'chart.update'}>;
 return command.data;
}
export function staticChartDraft(data:unknown):StaticChartDraft {
 const chart=structuredClone(validateStaticChart(data));
 chart.series??=[{name:'系列 1',values:[...chart.values]}];chart.values=[];
 return {chart,values:chart.series.map(series=>series.values.map(String))};
}
export function draftChart(draft:StaticChartDraft):StaticChart {
 const series=draft.chart.series!.map((series,index)=>({...series,values:draft.values[index].map((value,row)=>{
  if(!value.trim()||!Number.isFinite(Number(value)))throw Error(`第 ${row+1} 个分类、第 ${index+1} 个系列需要填写有效数值`);
  return Number(value);
 })}));
 if(['pie','doughnut'].includes(draft.chart.kind)){
  if(series.length!==1)throw Error('饼图和环形图只能显示一个系列；请保留一个系列或切换图表类型');
  if(series[0].values.some(value=>value<0))throw Error('饼图和环形图的数值不能为负数');
  if(series[0].values.reduce((total,value)=>total+value,0)<=0)throw Error('饼图和环形图至少需要一个大于零的数值');
 }
 return validateStaticChart({...draft.chart,series});
}
export function importStaticChart(draft:StaticChartDraft,text:string):StaticChartDraft {
 const imported=parseChartSpreadsheet(text);
 const next={chart:{...draft.chart,labels:imported.labels,values:[],series:imported.series.map((series,index)=>({...draft.chart.series?.[index],...series}))},values:imported.series.map(series=>series.values.map(String))};
 return staticChartDraft(draftChart(next));
}
