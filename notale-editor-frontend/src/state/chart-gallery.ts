import type {ChartKind} from '@notale/editor/browser';
export interface ChartGallery {id:number;mode:'insert'|'change';kind?:ChartKind;choose:(kind:ChartKind)=>Promise<void>;}
const listeners=new Set<()=>void>();let model:ChartGallery|undefined,counter=0;
function publish(next:ChartGallery|undefined){model=next;for(const listener of listeners)listener();}
export const chartGalleryState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function createChartGallery(){
 let current:ChartGallery|undefined,disposed=false;
 return {
  open(source:Omit<ChartGallery,'id'>){if(disposed)return;current={...source,id:++counter};publish(current);},
  dispose(){disposed=true;if(model===current)publish(undefined);current=undefined;},
 };
}
export function closeChartGallery(source:ChartGallery){if(model===source)publish(undefined);}
export async function chooseChartGallery(source:ChartGallery,kind:ChartKind){
 if(model!==source)throw Error('图表类型窗口已关闭');
 await source.choose(kind);closeChartGallery(source);
}
