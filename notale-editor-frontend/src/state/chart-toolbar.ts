export interface ChartToolbarAction {label:string;run:()=>unknown;file?:{accept:string;prepare:()=>(file:File)=>Promise<void>};}
export interface ChartToolbar {id:number;container:HTMLElement;actions:ChartToolbarAction[];}
let model:ChartToolbar|undefined,counter=0;const listeners=new Set<()=>void>();
function publish(next:ChartToolbar|undefined){model=next;for(const listener of listeners)listener();}
export const chartToolbarState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindChartToolbar(container:HTMLElement,actions:ChartToolbarAction[]){
 const source={id:++counter,container,actions};publish(source);
 return {dispose(){if(model===source)publish(undefined);}};
}
export async function runChartToolbar(source:ChartToolbar,index:number){
 if(model!==source)throw Error('图表工具栏已关闭');
 await source.actions[index]?.run();
}
