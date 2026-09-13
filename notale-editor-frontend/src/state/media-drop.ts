export interface MediaDropBounds {left:number;top:number;width:number;height:number;}
let bounds:MediaDropBounds|undefined;const listeners=new Set<()=>void>();
export const mediaDropState={getSnapshot:()=>bounds,getServerSnapshot:()=>undefined,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},set(value:MediaDropBounds|undefined){if(bounds===value)return;bounds=value;for(const f of listeners)f();}};
