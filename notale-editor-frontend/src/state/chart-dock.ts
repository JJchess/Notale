const initial={visible:false,height:280,status:'',error:false};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:typeof model){model=next;for(const listener of listeners)listener();}
export const chartDockState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export const chartDockActions={close:()=>{publish({...model,visible:false});},resize:(height:number)=>{if(Number.isFinite(height))publish({...model,height:Math.max(180,height)});}};
export function bindChartDock(){const identity=Symbol('chart-dock');owner=identity;publish(initial);const active=()=>owner===identity;return {
 get visible(){return active()&&model.visible;},
 show(height:number){if(active())publish({...model,visible:true,height:Number.isFinite(height)?height:280});},
 hide(){if(active())publish({...model,visible:false});},
 status(status:string,error:boolean){if(active())publish({...model,status,error});},
 dispose(){if(active()){owner=undefined;publish(initial);}},
};}
