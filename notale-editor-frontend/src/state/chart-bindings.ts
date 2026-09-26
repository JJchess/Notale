export interface ChartBindingField {label:string;value:string;options?:Record<string,string>;change:(value:string)=>void;}
export interface ChartBindingAction {label:string;run:()=>void;}
export interface ChartBindings {container:HTMLElement;fields:ChartBindingField[];actions:ChartBindingAction[];hint:string;}
let model:ChartBindings|undefined;const listeners=new Set<()=>void>();
function publish(next:ChartBindings|undefined){model=next;for(const listener of listeners)listener();}
export const chartBindingsState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindChartBindings(container:HTMLElement){let current:ChartBindings|undefined,disposed=false;return {
 update(fields:ChartBindingField[],actions:ChartBindingAction[],hint=''){if(disposed)return;current={container,fields,actions,hint};publish(current);},
 dispose(){disposed=true;if(model===current)publish(undefined);current=undefined;},
};}
