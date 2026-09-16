import type {ChartGridHost} from '../adapters/chart-grid';
export interface ChartGridHandle {adapter:ChartGridHost;element:HTMLElement;}
export interface ChartGridRequest {id:number;container:HTMLElement;ready:(handle:ChartGridHandle)=>void;failed:(cause:unknown)=>void;}
let model:ChartGridRequest|undefined,counter=0;const listeners=new Set<()=>void>();
function publish(next:ChartGridRequest|undefined){model=next;for(const listener of listeners)listener();}
export const chartGridState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
/** Bridge for the remaining controller; React owns the adapter's lifetime. */
export function createChartGridConnection(){
 let request:ChartGridRequest|undefined,pending:Promise<ChartGridHandle>|undefined,disposed=false;
 return {
  mount(container:HTMLElement):Promise<ChartGridHandle>{
   if(disposed)return Promise.reject(Error('图表数据面板已关闭'));
   if(pending)return pending;
   const promise=new Promise<ChartGridHandle>((resolve,reject)=>{
    const source:ChartGridRequest={id:++counter,container,ready:handle=>{
     if(disposed||model!==source){handle.adapter.dispose();reject(Error('图表数据面板已关闭'));return;}
     resolve(handle);
    },failed:reject};request=source;
   });
   model?.failed(Error('图表数据面板已替换'));publish(request);
   pending=promise.catch(cause=>{pending=undefined;throw cause;});return pending;
  },
  dispose(){disposed=true;request?.failed(Error('图表数据面板已关闭'));if(model===request)publish(undefined);request=undefined;},
 };
}
