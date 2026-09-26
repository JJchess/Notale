import {canvasLoadingState as state,canvasLoadingActions} from '../state/canvas-loading';
/** Readiness is supplied by the authenticated slide bridge. */
export function createCanvasLoading(retry:()=>Promise<unknown>,report:(error:unknown)=>void){
 let disposed=false,running=false;
 let appear:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{clearTimeout(appear);clearTimeout(timeout);};
 const run=async()=>{
  if(disposed||running)return;
  running=true;state.update({retrying:true});
  try{await retry();}catch(error){if(!disposed)report(error);}
  finally{running=false;if(!disposed)state.update({retrying:false});}
 };
 canvasLoadingActions.retry=run;
 return {
  start(){if(disposed)return;clear();state.update({visible:false,timedOut:false});appear=setTimeout(()=>state.update({visible:true}),400);timeout=setTimeout(()=>state.update({visible:true,timedOut:true}),8000);},
  ready(){if(disposed)return;clear();state.update({visible:false,timedOut:false});},
  dispose(){if(disposed)return;disposed=true;clear();if(canvasLoadingActions.retry===run){canvasLoadingActions.retry=async()=>{};state.reset();}},
 };
}
