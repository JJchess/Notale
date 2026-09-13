import {CanvasRequests} from './request-session';
interface CanvasPage {documentId:string;version:number;pageId:string;url:string;channel:string;}
interface Entry {page:CanvasPage;frame:HTMLIFrameElement;}
const controllers=new WeakMap<HTMLElement,CanvasController>();
export function disposeCanvasHost(host:HTMLElement){controllers.get(host)?.dispose();}

/** Owns iframe identities, transport and the lifetime of a bounded set of page runtimes. */
export class CanvasController {
  private entries=new Map<string,Entry>();
  private active?:Entry;
  private suspended=true;
  private disposed=false;
  private disposal=new Set<()=>void>();
  private listeners=new Set<(event:MessageEvent)=>void>();
  private requests=new CanvasRequests((type,data)=>this.send(type,data));
  private revision='';
  private placeholder:HTMLIFrameElement;
  constructor(private host:HTMLElement,private capacity=3,private options={id:'canvas',title:'讲义编辑画布'}){
    this.placeholder=this.create();this.placeholder.id=this.options.id;host.append(this.placeholder);
    controllers.set(host,this);
    window.addEventListener('message',this.receive);
  }
  get frame(){return this.active?.frame??this.placeholder;}
  private create(){const frame=document.createElement('iframe');frame.title=this.options.title;frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');frame.inert=true;return frame;}
  private post(entry:Entry,type:string,data:unknown){entry.frame.contentWindow?.postMessage({source:'notale-host',channel:entry.page.channel,type,data},new URL(entry.page.url).origin);}
  activate(page:CanvasPage,force=false){
    if(this.disposed)throw Error('画布已关闭');
    if(this.active&&!this.suspended)this.suspend();
    this.suspended=false;
    const revision=`${page.documentId}:${page.version}`;
    if(this.active){this.post(this.active,'canvas-visibility',{visible:false});this.active.frame.removeAttribute('id');this.active.frame.style.display='none';this.active.frame.inert=true;}
    if(this.revision!==revision){for(const entry of this.entries.values())entry.frame.remove();this.entries.clear();this.revision=revision;}
    let entry=this.entries.get(page.pageId);
    if(entry&&(force||entry.page.url!==page.url||entry.page.channel!==page.channel)){entry.frame.remove();this.entries.delete(page.pageId);entry=undefined;}
    const reused=!!entry;
    if(!entry){entry={page,frame:this.create()};this.host.append(entry.frame);entry.frame.src=page.url;}
    this.placeholder.remove();
    this.entries.delete(page.pageId);this.entries.set(page.pageId,entry);this.active=entry;
    entry.frame.id=this.options.id;entry.frame.style.display='block';
    while(this.entries.size>this.capacity){const oldest=this.entries.keys().next().value!;this.entries.get(oldest)!.frame.remove();this.entries.delete(oldest);}
    if(reused){this.post(entry,'canvas-visibility',{visible:true});this.post(entry,'state',{});}
    return {frame:entry.frame,reused};
  }
  /** Warm one adjacent runtime without changing selection or admitting its messages. */
  preload(page:CanvasPage){
    if(this.disposed||this.suspended||this.capacity<2||this.revision!==`${page.documentId}:${page.version}`||this.entries.has(page.pageId))return;
    // A speculative page must never evict the active page.
    while(this.entries.size>=this.capacity){
      const oldest=[...this.entries].find(([,entry])=>entry!==this.active);
      if(!oldest)return;
      oldest[1].frame.remove();this.entries.delete(oldest[0]);
    }
    const entry={page,frame:this.create()};
    entry.frame.style.display='none';
    this.entries.set(page.pageId,entry);
    this.host.append(entry.frame);entry.frame.src=page.url;
  }
  send(type:string,data:unknown){if(this.active&&!this.suspended&&!this.disposed)this.post(this.active,type,data);}
  accepts(event:MessageEvent){const entry=this.active;return !this.suspended&&!this.disposed&&!!entry&&event.source===entry.frame.contentWindow&&event.origin===new URL(entry.page.url).origin&&event.data?.source==='notale-slide'&&event.data.channel===entry.page.channel;}
  onDispose(dispose:()=>void){if(this.disposed){dispose();return()=>{};}this.disposal.add(dispose);return()=>{this.disposal.delete(dispose);};}
  subscribe(listener:(event:MessageEvent)=>void){if(this.disposed)return()=>{};this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  whenReady(){return this.requests.whenReady();}
  flushEditor(){return this.requests.request('flush-editor',{},'editor-flushed',5000,'id');}
  request<T>(type:string,data:Record<string,unknown>,responseType=type){return this.requests.request<T>(type,data,responseType);}
  suspend(){
    if(this.suspended||this.disposed)return;
    this.suspended=true;this.requests.reset();
    if(this.active){this.active.frame.inert=true;this.post(this.active,'canvas-visibility',{visible:false});}
  }
  private receive=(event:MessageEvent)=>{
    if(!this.accepts(event)){
      if(!this.disposed&&event.data?.source==='notale-slide'&&event.data.type==='ready'){
        for(const entry of this.entries.values()){
          if((entry!==this.active||this.suspended)&&event.source===entry.frame.contentWindow&&event.origin===new URL(entry.page.url).origin&&event.data.channel===entry.page.channel){
            this.post(entry,'canvas-visibility',{visible:false});break;
          }
        }
      }
      return;
    }
    const {type,data}=event.data;
    if(type==='ready'&&data?.slideId===this.active?.page.pageId)this.requests.markReady();
    this.requests.receive(type,data);
    for(const listener of this.listeners)listener(event);
  };
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    const errors:unknown[]=[];
    const release=(action:()=>void)=>{try{action();}catch(error){errors.push(error);}};
    release(()=>this.requests.dispose());
    const callbacks=[...this.disposal];this.disposal.clear();
    for(const callback of callbacks)release(callback);
    this.listeners.clear();
    release(()=>window.removeEventListener('message',this.receive));
    for(const entry of this.entries.values())release(()=>entry.frame.remove());
    this.entries.clear();release(()=>this.placeholder.remove());this.active=undefined;
    if(controllers.get(this.host)===this)controllers.delete(this.host);
    if(errors.length)console.error(new AggregateError(errors,'画布资源清理失败'));
  }
}
