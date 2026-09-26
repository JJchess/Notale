import {chartAuthoringSchema,cleanChartReferences,type ChartAuthoring} from '@notale/editor/browser';
import {readDelimitedRows} from '../chart-table-parser';
export function chartNumber(value:unknown,row:number,name:string):number|null {
 if(value===null||String(value??'').trim()==='')return null;
 const raw=String(value).trim();
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw Error(`第 ${row+1} 行「${name}」需要数字`);
 return Number(raw);
}
/** Build an isolated candidate; malformed imports never partially modify the document. */
export function importChartTable(source:ChartAuthoring,text:string,withHeader=true,uid:()=>string=()=>crypto.randomUUID()):ChartAuthoring {
 const rows=readDelimitedRows(text);
 if(rows.length<(withHeader?2:1))throw Error('需要至少一行数据');
 const header=withHeader?rows.shift()!:rows[0].map((_,index)=>index?`系列 ${index}`:'分类');
 const next=structuredClone(source);
 next.columns=header.map((name,index)=>({id:source.columns[index]?.id??uid(),name:name||`列 ${index+1}`,type:index?'number':'text'}));
 next.series=next.columns.slice(1).map((column,index)=>({...source.series[index],id:source.series[index]?.id??uid(),columnId:column.id,name:column.name,axis:source.series[index]?.axis??'primary',style:source.series[index]?.style??{},points:source.series[index]?.points??{}}));
 next.bindings={label:next.columns[0].id,x:next.columns[1]?.id,y:next.columns[2]?.id??next.columns[1]?.id};
 next.rows=rows.map((row,index)=>({id:source.rows[index]?.id??uid(),values:Object.fromEntries(next.columns.map((column,columnIndex)=>[column.id,columnIndex?chartNumber(row[columnIndex],index,column.name):(row[columnIndex]??'')]))}));
 next.origin='manual';
 return chartAuthoringSchema.parse(cleanChartReferences(next));
}
