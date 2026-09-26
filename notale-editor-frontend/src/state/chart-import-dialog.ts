export interface ChartImport {id:number;text:string;apply:(text:string,header:boolean)=>Promise<void>;}
let model:ChartImport|undefined,counter=0;const listeners=new Set<()=>void>();
function publish(next:ChartImport|undefined){model=next;for(const listener of listeners)listener();}
export const chartImportState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function createChartImport(){let current:ChartImport|undefined,disposed=false;return {
 open(text:string,apply:ChartImport['apply']){if(disposed)return;current={id:++counter,text,apply};publish(current);},
 dispose(){disposed=true;if(model===current)publish(undefined);current=undefined;},
};}
export function closeChartImport(source:ChartImport){if(model===source)publish(undefined);}
export async function applyChartImport(source:ChartImport,text:string,header:boolean){if(model!==source)throw Error('导入窗口已关闭');await source.apply(text,header);closeChartImport(source);}
