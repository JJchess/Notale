/** Cancel transient interface work when its owning workbench exits. */
export class UiTasks {
 private timers=new Set<ReturnType<typeof setTimeout>>();
 private disposed=false;
 constructor(signal:AbortSignal){if(signal.aborted)this.dispose();else signal.addEventListener('abort',()=>this.dispose(),{once:true});}
 schedule(callback:()=>void,delay:number){
  if(this.disposed)return()=>{};
  const timer=setTimeout(()=>{this.timers.delete(timer);if(!this.disposed)callback();},delay);this.timers.add(timer);
  return()=>{clearTimeout(timer);this.timers.delete(timer);};
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const timer of this.timers)clearTimeout(timer);this.timers.clear();}
}
