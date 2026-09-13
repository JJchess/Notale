interface Notice {message:string;visible:boolean;}
const initial:Notice={message:'',visible:false};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const notificationState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindNotifications(){const token=Symbol();owner=token;let timer:ReturnType<typeof setTimeout>|undefined;
 const publish=(next:Notice)=>{if(owner!==token)return;model=next;listeners.forEach(fn=>fn());};publish(initial);
 return {show(message:string,duration=10000){if(owner!==token)return;if(timer)clearTimeout(timer);publish({message,visible:true});timer=setTimeout(()=>publish({...model,visible:false}),duration);},dispose(){if(timer)clearTimeout(timer);if(owner===token){publish(initial);owner=undefined;}}};
}
