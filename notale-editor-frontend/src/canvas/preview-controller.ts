import {CanvasController} from './controller';
import {trackPreviewLease} from './resource-lease';
import {PreviewSession,type PreviewSource} from '../state/preview-session';
type Page={id:string;url:string};
/** Runtime ownership only: no dialog, buttons, text labels or focus mutations. */
export class PreviewController {
 private canvas?:CanvasController;
 private pages:Page[]=[];
 private channel='';
 private generation=0;
 private initialStep=0;
 private ending=false;
 private disposed=false;
 private awaitingFrame=false;
 private request?:AbortController;
 private timeout?:ReturnType<typeof setTimeout>;
 private lease?:ReturnType<typeof trackPreviewLease>;
 private observer:ResizeObserver;
 constructor(private host:HTMLElement,private session:PreviewSession,private context:{prepare:()=>Promise<PreviewSource>;error:(error:unknown)=>void}){
  this.observer=new ResizeObserver(this.layout);this.observer.observe(host);
 }
 private get state(){return this.session.getSnapshot();}
 private createCanvas(){if(!this.canvas){this.canvas=new CanvasController(this.host,3,{id:'preview-canvas',title:'讲义互动预览'});this.canvas.subscribe(this.receive);}return this.canvas;}
 private send(type:string,data:unknown){this.canvas?.send(type,data);}
 layout=()=>{
  const source=this.state.source,frame=this.canvas?.frame;if(!source||!frame)return;
  const {width,height}=source.snapshot.document;
  const scale=Math.max(.01,Math.min((this.host.clientWidth-32)/width,(this.host.clientHeight-32)/height));
  frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform=`translate(-50%, -50%) scale(${scale})`;
 };
 private failed(error:string){this.awaitingFrame=false;clearTimeout(this.timeout);this.session.update({status:'failed',error});}
 private load(atEnd=false,force=false){
  const source=this.state.source,page=this.pages[this.state.index];if(!source||!page)return;
  this.awaitingFrame=true;this.ending=atEnd;this.session.update({step:0,max:0,status:'loading',error:''});
  const {frame}=this.createCanvas().activate({documentId:source.snapshot.document.id,version:source.snapshot.version,pageId:page.id,url:page.url,channel:this.channel},force);
  frame.style.visibility='hidden';this.layout();clearTimeout(this.timeout);
  this.timeout=setTimeout(()=>this.failed('预览加载失败，请重试。'),10000);
 }
 retry=async()=>{
  const source=this.state.source;if(!this.state.open||!source||this.disposed)return;
  this.awaitingFrame=false;clearTimeout(this.timeout);
  this.canvas?.suspend();
  const generation=++this.generation;this.request?.abort();const request=this.request=new AbortController();
  const deadline=setTimeout(()=>request.abort(),10000);
  this.session.update({status:'loading',error:''});
  try{
   const response=await fetch(`/api/documents/${source.snapshot.document.id}/preview?version=${source.snapshot.version}`,{signal:request.signal});
   if(!response.ok)throw Error('无法获取预览');
   const data=await response.json();if(generation!==this.generation||!this.state.open||this.disposed)return;
   this.lease?.stop();this.lease=trackPreviewLease(source.snapshot.document.id,data,'preview');
   const visible=new Set(source.snapshot.document.slides.filter(s=>(!s.layoutSourceId&&!s.hidden)||s.id===source.slideId).map(s=>s.id));
   const previousId=this.pages[this.state.index]?.id??source.slideId;
   this.pages=data.slides.filter((s:Page)=>visible.has(s.id));this.channel=data.channel;
   if(!this.pages.length)throw Error('没有可预览的页面');
   this.session.update({index:Math.max(0,this.pages.findIndex(s=>s.id===previousId)),count:this.pages.length});
   this.load(false,true);
  }catch(error){if(generation===this.generation&&this.state.open&&!this.disposed)this.failed('无法加载预览，请检查连接后重试。');}
  finally{clearTimeout(deadline);}
 };
 open=async(atStep=0)=>{
  if(this.disposed||this.state.open||this.state.opening)return;
  const generation=++this.generation;this.session.update({opening:true});
  try{
   const source=await this.context.prepare();if(generation!==this.generation||this.disposed)return;
   this.initialStep=Number.isFinite(atStep)?Math.max(0,Math.trunc(atStep)):0;this.pages=[];
   this.session.update({source,open:true,opening:false,index:0,count:0,step:0,max:0,status:'loading',error:''});
   await this.retry();
  }catch(error){if(generation===this.generation&&!this.disposed){this.session.update({opening:false});this.context.error(error);}}
 };
 close=()=>{
  this.awaitingFrame=false;++this.generation;this.request?.abort();this.request=undefined;clearTimeout(this.timeout);
  this.lease?.stop();this.lease=undefined;this.canvas?.dispose();this.canvas=undefined;this.pages=[];this.channel='';this.initialStep=0;
  this.session.reset();
 };
 navigate=(direction:number)=>{
  const {index,step,max,status}=this.state;if(status!=='ready'||![-1,1].includes(direction))return;
  if(direction<0&&step===0&&index>0){this.session.update({index:index-1});this.load(true);}
  else if(direction>0&&step===max&&index<this.pages.length-1){this.session.update({index:index+1});this.load();}
  else{const next=Math.max(0,Math.min(max,step+direction));this.session.update({step:next});this.send('seek',{step:next,animate:true});}
 };
 private receive=(event:MessageEvent)=>{
  if(!this.state.open||!this.canvas?.accepts(event))return;
  const {type,data}=event.data,pageId=this.pages[this.state.index]?.id;
  if(type==='ready'&&this.awaitingFrame&&data?.slideId===pageId&&this.state.status==='loading'){
   this.awaitingFrame=false;
   const max=Math.max(0,Math.min(500,Number(data.max)||0)),step=this.ending?max:Math.min(max,this.initialStep);this.initialStep=0;
   const page=this.state.source?.snapshot.document.slides.find(s=>s.id===pageId);if(page)this.send('charts-update',{charts:page.nativeCharts});
   clearTimeout(this.timeout);this.session.update({max,step,status:'ready',error:''});
   this.send('mode',{mode:'play'});this.send('seek',{step,animate:!this.ending});this.ending=false;
   this.canvas.frame.inert=false;this.canvas.frame.style.visibility='visible';
  }
  if(type==='navigate'&&this.state.status==='ready'){
   if(data?.slideId){const index=this.pages.findIndex(s=>s.id===data.slideId);if(index>=0){this.session.update({index});this.load();}}
   else if(data?.direction===0)this.close();else this.navigate(data?.direction);
  }
 };
 dispose(){this.disposed=true;this.close();this.observer.disconnect();}
}
