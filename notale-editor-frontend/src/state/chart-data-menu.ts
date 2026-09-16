export interface ChartMenuAction {label:string;run:()=>void;}
export interface ChartDataMenu {id:number;x:number;y:number;actions:ChartMenuAction[];}
let model:ChartDataMenu|undefined,counter=0;const listeners=new Set<()=>void>();
function publish(next:ChartDataMenu|undefined){model=next;for(const listener of listeners)listener();}
export const chartDataMenuState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function createChartDataMenu(){let current:ChartDataMenu|undefined,disposed=false;return {
 open(x:number,y:number,actions:ChartMenuAction[]){if(disposed)return;current={id:++counter,x,y,actions};publish(current);},
 dispose(){disposed=true;if(model===current)publish(undefined);current=undefined;},
};}
export function closeChartDataMenu(source:ChartDataMenu){if(model===source)publish(undefined);}
export function runChartDataMenu(source:ChartDataMenu,index:number){if(model!==source)return;source.actions[index]?.run();closeChartDataMenu(source);}
