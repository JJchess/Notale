const defaults=new WeakMap<object,Map<PropertyKey,unknown>>();
/** Publishes session actions while keeping captured callbacks bound to their owner. */
export function scopeActions<T extends object>(target:T,signal:AbortSignal):T {
 let initial=defaults.get(target);
 if(!initial){initial=new Map<PropertyKey,unknown>(Reflect.ownKeys(target).map(key=>[key,Reflect.get(target,key)]));defaults.set(target,initial);}
 const baseline=initial;
 const installed=new Map<PropertyKey,unknown>();
 signal.addEventListener('abort',()=>{
  for(const [key,value] of installed)if(Reflect.get(target,key)===value)Reflect.set(target,key,baseline.get(key));
 },{once:true});
 return new Proxy(target,{
  get(_target,key){return installed.has(key)?installed.get(key):baseline.get(key);},
  set(_target,key,value){
   if(signal.aborted)throw Error('编辑会话已关闭');
   if(typeof value!=='function')throw TypeError('编辑动作必须是函数');
   const action=(...args:unknown[])=>{
    if(signal.aborted)throw Error('编辑会话已关闭');
    return value(...args);
   };
   installed.set(key,action);return Reflect.set(target,key,action);
  },
 });
}
