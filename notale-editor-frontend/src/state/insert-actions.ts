interface Actions {insert:(kind:string,value?:string)=>Promise<unknown>;drag:(visible:boolean)=>void;error:(cause:unknown)=>void;}
let current:Actions|undefined;const listeners=new Set<()=>void>();
export const insertActionsState={getSnapshot:()=>current,getServerSnapshot:()=>undefined,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindInsertActions(actions:Actions){current=actions;listeners.forEach(fn=>fn());return {dispose(){if(current===actions){current=undefined;listeners.forEach(fn=>fn());}}};}
export async function runInsert(source:Actions,kind:string,value?:string){if(current!==source)return;try{await source.insert(kind,value);}catch(cause){if(current===source)source.error(cause);}}
export function showInsertionDrop(source:Actions,visible:boolean){if(current===source)source.drag(visible);}
