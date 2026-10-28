export interface CanvasLoadingState {visible:boolean;timedOut:boolean;retrying:boolean;mode:'initial'|'replacement';}
const initial:CanvasLoadingState={visible:false,timedOut:false,retrying:false,mode:'initial'};
let state=initial;
const listeners=new Set<()=>void>();
export const canvasLoadingState={
 getSnapshot:()=>state,getServerSnapshot:()=>initial,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
 update(patch:Partial<CanvasLoadingState>){state={...state,...patch};for(const listener of listeners)listener();},
 reset(){this.update(initial);},
};
export const canvasLoadingActions={retry:async()=>{}};
