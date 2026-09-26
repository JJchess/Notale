type Waiter={resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
type Request={type:string;idField:'requestId'|'id';resolve:(data:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
/** Request lifetime follows an active page instance, never a workbench-global callback map. */
export class CanvasRequests {
 private ready=false;
 private closed=false;
 private generation=0;
 private waiting=new Set<Waiter>();
 private pending=new Map<string,Request>();
 constructor(private send:(type:string,data:Record<string,unknown>)=>void){}
 whenReady(timeoutMs=30000):Promise<void>{
  if(this.closed)return Promise.reject(Error('画布已关闭'));
  if(this.ready)return Promise.resolve();
  return new Promise((resolve,reject)=>{const waiter:Waiter={resolve,reject,timer:setTimeout(()=>{this.waiting.delete(waiter);reject(Error('页面仍未加载完成'));},timeoutMs)};this.waiting.add(waiter);});
 }
 markReady(){if(this.closed)return;this.ready=true;for(const waiter of this.waiting){clearTimeout(waiter.timer);waiter.resolve();}this.waiting.clear();}
 async request<T>(type:string,data:Record<string,unknown>,responseType=type,timeoutMs=5000,idField:'requestId'|'id'='requestId'):Promise<T>{
  const generation=this.generation;await this.whenReady();
  if(generation!==this.generation||this.closed)throw Error('页面已切换，请在当前页面重试');
  return new Promise<T>((resolve,reject)=>{
   const requestId=crypto.randomUUID();
   const timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('画布未响应，请等待页面加载后重试'));},timeoutMs);
   this.pending.set(requestId,{type:responseType,idField,resolve:result=>resolve(result as T),reject,timer});
   try{this.send(type,{...data,[idField]:requestId});}catch(error){clearTimeout(timer);this.pending.delete(requestId);reject(error);}
  });
 }
 receive(type:string,data:unknown){
  if(!data||typeof data!=='object')return;
  for(const idField of ['requestId','id'] as const){
   const id=(data as Record<string,unknown>)[idField];if(typeof id!=='string')continue;
   const request=this.pending.get(id);if(!request||request.type!==type||request.idField!==idField)continue;
   this.pending.delete(id);clearTimeout(request.timer);request.resolve(data);return;
  }
 }
 reset(message='页面已切换，请在当前页面重试'){
  this.ready=false;++this.generation;const error=Error(message);
  for(const waiter of this.waiting){clearTimeout(waiter.timer);waiter.reject(error);}this.waiting.clear();
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();
 }
 dispose(){this.closed=true;this.reset('画布已关闭');}
}
