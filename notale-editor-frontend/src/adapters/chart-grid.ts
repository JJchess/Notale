/** Owns the third-party element and its native events, independently of chart state. */
export class ChartGridHost {
 private element?:HTMLElement;
 private pending?:Promise<HTMLElement|undefined>;
 private disposed=false;
 private events=new AbortController();
 constructor(private host:HTMLElement){}
 load():Promise<HTMLElement|undefined>{
  if(this.disposed)return Promise.resolve(undefined);
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   const {defineCustomElement}=await import('@revolist/revogrid/standalone/revo-grid.js');
   if(this.disposed)return undefined;
   defineCustomElement();
   const element=document.createElement('revo-grid');
   Object.assign(element,{range:true,rowHeaders:true,resize:true,rowSize:32,headerRowSize:34,useClipboard:{rangeFill:true},theme:'compact'});
   element.style.height='100%';this.element=element;this.host.append(element);return element;
  })().catch(cause=>{this.pending=undefined;throw cause;});
  return this.pending;
 }
 on<E extends Event>(type:string,listener:(event:E)=>void){
  if(!this.element||this.disposed)return;
  this.element.addEventListener(type,listener as EventListener,{signal:this.events.signal});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.events.abort();this.element?.remove();this.element=undefined;}
}
