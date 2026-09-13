import {isComposingKey} from '../keyboard';
import {latestPresentationState} from './latest-state';
import Reveal from 'reveal.js';
import {upcoming} from './upcoming';
import {maxStep,stepLabel,stepInterval,showControl,readShowCheckpoint,mergePresentationRuntime,presentationOrder,validPresentationState,type ShowControlMode,type Snapshot,type Slide,type PresentationSessionState,type PresentationRuntimePatch,type PresentationRuntimeState,type PresentationViewport} from '@notale/editor/browser';
import {trackPreviewLease} from '../canvas/resource-lease';
export type Tool='pointer'|'laser'|'pen'|'highlight'|'eraser'|'zoom';
export type PresentationView={snapshot?:Snapshot;slides:Slide[];state?:PresentationSessionState;control:ShowControlMode|'audience';speaker:boolean;overview:boolean;tool:Tool;ready:boolean;error:string;audiences:number;sound:boolean;capabilities:string[];activity:number};
const initial:PresentationView={slides:[],control:'starting',speaker:false,overview:false,tool:'pointer',ready:false,error:'',audiences:0,sound:false,capabilities:[],activity:0};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export class PresentationController {
 private view:PresentationView={...initial};private listeners=new Set<()=>void>();private params=new URLSearchParams(location.search);
 readonly session=this.params.get('session')??crypto.randomUUID();readonly audience=this.params.get('audience')==='1';
 private mounting=false;private engine:any;private engineRoot?:HTMLElement;private frames=new Map<string,HTMLIFrameElement>();private readyFrames=new Map<Window,string>();
 private resident=new Map<string,HTMLIFrameElement>();
 private frameSteps=new WeakMap<HTMLIFrameElement,number>();
 private urls=new Map<string,string>();private channel='';private bus=new BroadcastChannel('notale-presentation-v2:'+this.session);
 private control?:ReturnType<typeof showControl>;private lease?:ReturnType<typeof trackPreviewLease>;private abort=new AbortController();
 private timer?:ReturnType<typeof setTimeout>;private autoDue=0;private autoRemaining:number|undefined;private persistTimer?:ReturnType<typeof setTimeout>;private helloTimer?:ReturnType<typeof setInterval>;
 private audienceSeen=new Map<string,number>();private windowId=crypto.randomUUID();private configured=new WeakMap<HTMLIFrameElement,string>();private destroyed=false;private nextFrame?:HTMLIFrameElement;private previewKey='';private switching=false;private animate=true;private backwards=false;private viewportListeners=new Set<(data:any)=>void>();
 private flushes=new Map<string,()=>void>();private transition=Promise.resolve();private request=new AbortController();
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};getSnapshot=()=>this.view;
 private emit(patch:Partial<PresentationView>={}){this.view={...this.view,...patch};this.listeners.forEach(fn=>fn());}
 private get state(){return this.view.state!;}private get leader(){return this.view.control==='controlling';}
 private get current(){return this.view.slides.find(s=>s.id===this.state?.slideId);}
 private key(){return 'notale-show-v2:'+this.session+':'+this.state.documentId;}
 private read(){try{const data=JSON.parse(localStorage.getItem(this.key())??'null');return validPresentationState(data,this.state.documentId,this.state.version,this.session)?data:undefined;}catch{return undefined;}}
 private persist(immediate=false){if(!this.leader||!this.view.state)return;clearTimeout(this.persistTimer);const save=()=>{try{localStorage.setItem(this.key(),JSON.stringify(this.state));}catch{this.emit({error:'浏览器未能保存本次放映进度，请保留当前窗口。'});}};if(immediate)save();else this.persistTimer=setTimeout(save,200);}
 private sendFrame(frame:HTMLIFrameElement|undefined,type:string,data:unknown){if(frame?.contentWindow&&frame.src)this.post(frame.contentWindow,new URL(frame.src).origin,type,data);}
 private post(window:Window,origin:string,type:string,data:unknown){window.postMessage({source:'notale-host',channel:this.channel,type,data},origin);}
 private frame(){return this.frames.get(this.state?.slideId);}
 private role(frame:HTMLIFrameElement){return this.state?.ended||frame===this.nextFrame||frame!==this.frame()?'preview':this.audience?'audience':this.leader?'controller':'following';}
 private soundHere(){return !this.state?.ended&&this.view.sound&&(this.audience||this.leader&&this.view.audiences===0);}
 private configure(frame=this.frame()) {if(!frame||!this.readyFrames.has(frame.contentWindow!))return;const config={role:this.role(frame),sound:frame===this.frame()&&this.soundHere()},key=JSON.stringify([config,this.readyFrames.get(frame.contentWindow!)]);if(this.configured.get(frame)!==key){this.configured.set(frame,key);this.sendFrame(frame,'presentation-config',config);}frame.inert=frame===this.nextFrame||!this.leader;}
 private commit(patch:Partial<PresentationSessionState>,full=false){if(!this.leader)return;this.emit({state:{...this.state,...patch,sequence:this.state.sequence+1}});this.persist();const {runtime,...state}=this.state;this.bus.postMessage({kind:'state',...this.address(),full,animate:this.animate,state:full?this.state:state});this.paint();}
 private address(){return {documentId:this.state.documentId,version:this.state.version,session:this.session,term:this.state.term,sequence:this.state.sequence,sender:this.windowId};}
 private paint(){this.refreshApplyReport();const s=this.state;this.emit({capabilities:s.runtime[s.slideId]?.capabilities??[]});for(const frame of this.frames.values())this.configure(frame);this.paintPreview();}
 private applyCurrent(animate=this.animate){if(!this.view.ready)return;this.configure();const runtime=this.state.runtime[this.state.slideId];if(runtime&&runtime.step!==this.state.step)this.sendFrame(this.frame(),'presentation-apply',{patch:runtime,full:true});this.sendFrame(this.frame(),'seek',{step:this.state.step,animate,media:this.leader});if(runtime&&runtime.step===this.state.step)this.sendFrame(this.frame(),'presentation-apply',{patch:runtime,full:true});this.paintPreview();}
 private async json(url:string){const r=await fetch(url,{signal:this.request.signal});if(!r.ok)throw Error('无法加载放映内容（'+r.status+'）');return r.json();}
 async mount(root:HTMLElement){
  if(this.mounting||this.destroyed)return;this.mounting=true;
  this.engineRoot=root;try{
   const id=this.params.get('document');if(!id)throw Error('没有指定讲义');
   const snapshot:Snapshot=await this.json('/api/documents/'+encodeURIComponent(id)+(this.params.get('version')?'?version='+encodeURIComponent(this.params.get('version')!):''));
   const slides=snapshot.document.slides.filter(s=>!s.hidden&&!s.layoutSourceId);if(!slides.length)throw Error('没有可放映的页面');
   const selected=slides.find(s=>s.id===this.params.get('slide'))??slides[0];
   let state:PresentationSessionState={protocol:2,documentId:id,version:snapshot.version,session:this.session,term:0,sequence:0,slideId:selected.id,step:0,max:maxStep(selected),ended:false,blank:false,timer:{elapsed:0,runningSince:Date.now()},autoPaused:false,viewport:{scale:1,x:0,y:0},annotations:{},runtime:{}};
   this.emit({snapshot,slides,state,speaker:!this.audience&&this.params.get('speaker')==='1',control:this.audience?'audience':'starting'});
   const saved=this.read();if(saved&&slides.some(s=>s.id===saved.slideId))state=saved;
   else {const old=readShowCheckpoint(localStorage.getItem('notale-show-v1:'+this.session+':'+id),id,snapshot.version);if(old&&slides.some(s=>s.id===old.slideId)){state={...state,slideId:old.slideId,step:old.step,max:old.max,blank:old.blank,timer:{elapsed:0,runningSince:old.started}};if(!this.audience)this.emit({speaker:old.speaker});}}
   this.emit({state});this.params.set('version',String(snapshot.version));this.params.set('session',this.session);history.replaceState(null,'','/present?'+this.params);
   const previews=await this.json('/api/documents/'+encodeURIComponent(id)+'/preview?version='+snapshot.version);if(this.destroyed)return;
   this.channel=previews.channel;this.lease=trackPreviewLease(id,previews,'presentation');for(const page of previews.slides)this.urls.set(page.id,page.url);
   const host=root.querySelector('.slides')!;
   for(const page of slides){const section=document.createElement('section');section.dataset.transition=page.transition;const iframe=document.createElement('iframe');iframe.dataset.slideId=page.id;iframe.title=page.name;iframe.inert=true;iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');iframe.setAttribute('allow','autoplay');section.append(iframe);host.append(section);this.frames.set(page.id,iframe);}
   window.addEventListener('message',this.message,{signal:this.abort.signal});window.addEventListener('keydown',this.keydown,{signal:this.abort.signal});window.addEventListener('pagehide',()=>{this.persist(true);this.bus.postMessage({kind:'bye',...this.address()});this.control?.close();},{signal:this.abort.signal});
   this.bus.onmessage=e=>this.receive(e.data);
   this.engine=new Reveal(root,{width:snapshot.document.width,height:snapshot.document.height,margin:0,controls:false,progress:false,center:false,keyboard:false,touch:false,hash:false,embedded:true,loop:false,slideNumber:false,transition:'fade',viewDistance:2,mobileViewDistance:2,preloadIframes:true,autoSlide:0});
   this.warmFrames();await this.engine.initialize();if(this.destroyed)return;
   this.switching=true;this.engine.slide(slides.findIndex(s=>s.id===this.state.slideId));this.switching=false;
   this.engine.on('slidechanged',()=>{if(this.switching)return;const page=slides[this.engine.getIndices().h];if(this.leader)this.move(page.id,0);});
   this.control=this.audience?undefined:showControl({key:'notale-show-controller:'+this.session+':'+id+':'+snapshot.version,requestRelease:()=>this.bus.postMessage({kind:'takeover',...this.address()}),error:e=>this.fail(e),change:mode=>{
    if(this.leader&&mode!=='controlling')this.persist(true);this.emit({control:mode,...(mode==='unavailable'?{error:'当前浏览器无法协调放映控制，请使用 HTTPS 或本机地址'}:{})});
    if(mode==='controlling'){const saved=this.read();const latest=latestPresentationState(this.state,saved);this.emit({state:{...latest,term:Math.max(latest.term,this.state.term)+1,sequence:0}});this.synchronizePosition(false);this.commit({},true);this.schedule();}
    else{this.schedule();this.configure();this.hello();}
   }});
   this.control?.start();this.hello();this.helloTimer=setInterval(()=>{this.hello();if(this.leader){const now=Date.now();for(const [id,time] of this.audienceSeen)if(now-time>6500){this.audienceSeen.delete(id);this.applyReports.delete(id);}this.refreshApplyReport();if(this.view.audiences!==this.audienceSeen.size){this.emit({audiences:this.audienceSeen.size});this.configure();}}},2000);
   this.sendFrame(this.frame(),'state',{});this.emit();
   Object.assign(window,{NotaleShow:{next:()=>this.next(),prev:()=>this.prev(),seek:(n:number,animate=true)=>this.seek(n,animate),reveal:{slide:(index:number)=>this.jump(index),getIndices:()=>({h:slides.findIndex(s=>s.id===this.state.slideId)})},state:()=>({...this.state,index:slides.findIndex(s=>s.id===this.state.slideId),started:this.state.timer.runningSince??Date.now()-this.state.timer.elapsed,control:this.view.control,ready:this.view.ready})}});
  }catch(e){if(!this.destroyed)this.fail(e);}
 }
 url(id:string,role='preview'){const original=this.urls.get(id);if(!original)return '';const url=new URL(original);url.searchParams.set('notaleRole',role);return url.href;}
 private applyReports=new Map<string,{slideId:string;sequence:number;term:number;failed:boolean}>();
 private dismissedApplyReport="";
 private localApplyStatus:{slideId:string;failed:boolean}|undefined;
 private applyReportKey(){return JSON.stringify([...this.applyReports].filter(([sender,report])=>this.audienceSeen.has(sender)&&report.term===this.state.term&&report.slideId===this.state.slideId&&report.failed).map(([sender,report])=>[sender,report.slideId,report.term]));}
 private refreshApplyReport(){
  if(!this.leader)return;
  const key=this.applyReportKey(),failed=key!=='[]';if(!failed)this.dismissedApplyReport='';
  const message='观众窗口的部分互动内容未能更新，请重新打开观众窗口重试';
  if(failed&&key!==this.dismissedApplyReport&&this.view.error!==message)this.emit({error:message});else if(!failed&&this.view.error===message)this.emit({error:''});
 }
 private hello(){if(!this.view.state)return;this.bus.postMessage({kind:'hello',...this.address(),audience:this.audience});if(this.audience&&this.localApplyStatus?.slideId===this.state.slideId)this.bus.postMessage({kind:'apply-status',...this.address(),...this.localApplyStatus});}
 private receive(data:any){
  if(!this.view.state||data?.documentId!==this.state.documentId||data.version!==this.state.version||data.session!==this.session||data.sender===this.windowId)return;
  if(data.kind==='takeover'){void this.control?.yieldIfRequested();return;}
  if(data.kind==='bye'){this.audienceSeen.delete(data.sender);this.applyReports.delete(data.sender);this.refreshApplyReport();if(this.leader){this.emit({audiences:this.audienceSeen.size});this.configure();}return;}
  if(data.kind==='hello'){if(this.leader){if(data.audience){this.audienceSeen.set(data.sender,Date.now());if(this.view.audiences!==this.audienceSeen.size){this.emit({audiences:this.audienceSeen.size});this.configure();}}this.bus.postMessage({kind:'state',...this.address(),full:true,state:this.state,to:data.sender});}return;}
  if(data.to&&data.to!==this.windowId)return;
  if(data.kind==='pointer'){if(!this.leader&&data.term===this.state.term)this.viewportListeners.forEach(fn=>fn(data));return;}
  if(data.kind==='apply-status'){if(this.leader&&this.audienceSeen.has(data.sender)&&data.term===this.state.term&&data.slideId===this.state.slideId&&typeof data.failed==='boolean'&&Number.isInteger(data.sequence)){const previous=this.applyReports.get(data.sender);if(!previous||data.term!==previous.term||data.sequence>=previous.sequence){this.applyReports.set(data.sender,{slideId:data.slideId,sequence:data.sequence,term:data.term,failed:data.failed});this.refreshApplyReport();}}return;}
  if(this.leader)return;
  const order=presentationOrder(this.state,data);if(order==='stale'&&!(data.full&&data.term===this.state.term&&data.sequence===this.state.sequence))return;
  if(order==='gap'&&!data.full){this.hello();return;}
  if(data.kind==='runtime'){
   if(!this.view.slides.some(s=>s.id===data.slideId)||!data.patch||typeof data.patch!=='object')return;
   const runtime={...this.state.runtime,[data.slideId]:mergePresentationRuntime(data.full===true?undefined:this.state.runtime[data.slideId],data.patch)};this.emit({state:{...this.state,runtime,term:data.term,sequence:data.sequence}});
   if(data.slideId===this.state.slideId&&this.view.ready)this.sendFrame(this.frame(),'presentation-apply',{patch:data.patch,full:data.full===true});return;
  }
  if(data.kind!=='state')return;
  if(data.full&&order==='stale'&&JSON.stringify(data.state)===JSON.stringify(this.state)){if(this.view.ready)this.sendFrame(this.frame(),'presentation-retry',{});return;}
  const next={...data.state,runtime:data.full?data.state.runtime:this.state.runtime};if(!validPresentationState(next,this.state.documentId,this.state.version,this.session)||!this.view.slides.some(s=>s.id===next.slideId))return;
  const moved=next.slideId!==this.state.slideId||next.step!==this.state.step;
  this.emit({state:next});if(moved)this.synchronizePosition(data.animate!==false);else if(data.full&&this.view.ready&&next.runtime[next.slideId])this.sendFrame(this.frame(),'presentation-apply',{patch:next.runtime[next.slideId],full:true});this.paint();
 }
 private message=(event:MessageEvent)=>{
  if(!this.view.state||event.data?.source!=='notale-slide'||event.data.channel!==this.channel)return;
  const frame=[...this.frames.values(),this.nextFrame].find(f=>f?.contentWindow===event.source);if(!frame?.getAttribute('src')||event.origin!==new URL(frame.src).origin)return;
  const {type,data}=event.data;
  if(type==='ready'){
   const runtimeId=data.runtimeId??'legacy';if(this.readyFrames.get(event.source as Window)===runtimeId)return;this.readyFrames.set(event.source as Window,runtimeId);this.frameSteps.set(frame,Number(data.max)||0);
   this.configure(frame);if(frame===this.nextFrame){this.paintPreview();return;}
   if(frame!==this.frame())return;let max=Math.max(maxStep(this.current!),Number(data.max)||0);const step=this.backwards?max:Math.min(this.state.step,max);this.backwards=false;
   this.emit({ready:true,state:{...this.state,max,step}});this.applyCurrent(this.animate);if(this.leader){this.commit({max,step});this.sendFrame(frame,'presentation-capture',{});}this.schedule();return;
  }
  if(frame!==this.frame())return;
  if(type==='presentation-apply-status'){if(this.audience&&typeof data.failed==='boolean'){this.localApplyStatus={slideId:this.state.slideId,failed:data.failed};this.bus.postMessage({kind:'apply-status',...this.address(),slideId:this.state.slideId,failed:data.failed});return;}const message='部分互动内容未能更新，请重新打开观众窗口重试';if(data.failed===true)this.emit({error:message});else if(data.failed===false&&this.view.error===message)this.emit({error:''});return;}
  if(type==='presentation-flushed'){this.flushes.get(data.requestId)?.();this.flushes.delete(data.requestId);return;}
  if(type==='presentation-runtime'&&this.leader){
   if(data.slideId!==this.state.slideId)return;const previous=this.state.runtime[data.slideId],runtime=mergePresentationRuntime(data.full===true?undefined:previous,data.patch);if(JSON.stringify(previous)===JSON.stringify(runtime))return;
   this.emit({state:{...this.state,sequence:this.state.sequence+1,runtime:{...this.state.runtime,[data.slideId]:runtime}},capabilities:runtime.capabilities});this.persist();this.bus.postMessage({kind:'runtime',...this.address(),slideId:data.slideId,patch:data.patch,full:data.full===true});this.paintPreview();return;
  }
  if(type==='presentation-key'&&this.leader)this.handleKey(data);
  if(type==='presentation-activity')this.activity();
  if(type==='navigate'&&this.leader){if(data.slideId){const at=this.view.slides.findIndex(s=>s.id===data.slideId);if(at>=0)this.jump(at);else this.fail('链接目标页没有包含在本次放映中');}else if(data.direction>0)this.next();else if(data.direction<0)this.prev();else this.overview();}
  if(type==='media-blocked')this.emit({error:this.audience?'':'请在输出窗口点击“启用声音”，允许播放媒体。'});
 };
 /** Keep a bounded set of runtime identities; Reveal only handles slide layout/transitions. */
 private warmFrames(){
  const at=this.view.slides.findIndex(slide=>slide.id===this.state.slideId);
  const desired=[at,at+1,at-1].filter(index=>index>=0&&index<this.view.slides.length);
  const pinned=new Set(desired.map(index=>this.view.slides[index].id));
  for(const index of desired){
   const id=this.view.slides[index].id,frame=this.frames.get(id)!;
   if(!this.resident.has(id)){
    frame.src=this.url(id);this.resident.set(id,frame);
   }
  }
  const current=this.frames.get(this.state.slideId)!;
  this.resident.delete(this.state.slideId);this.resident.set(this.state.slideId,current);
  for(const [id,frame] of this.resident){
   if(this.resident.size<=5)break;if(pinned.has(id))continue;
   if(frame.contentWindow)this.readyFrames.delete(frame.contentWindow);
   this.configured.delete(frame);this.frameSteps.delete(frame);frame.removeAttribute('src');frame.inert=true;this.resident.delete(id);
  }
 }
 private synchronizePosition(animate:boolean){
  this.animate=animate;this.warmFrames();const at=this.view.slides.findIndex(s=>s.id===this.state.slideId);if(this.engine?.getIndices().h!==at){this.switching=true;this.engine?.slide(at);this.switching=false;this.emit({ready:this.readyFrames.has(this.frame()?.contentWindow!)});}
  if(this.view.ready){const max=Math.max(maxStep(this.current!),this.frameSteps.get(this.frame()!)??0),step=this.backwards?max:Math.min(this.state.step,max);this.backwards=false;if(max!==this.state.max||step!==this.state.step){if(this.leader)this.commit({max,step});else this.emit({state:{...this.state,max,step}});}this.applyCurrent(animate);}else this.sendFrame(this.frame(),'state',{});
 }
 private flush(){if(!this.view.ready||!this.leader)return Promise.resolve();const requestId=crypto.randomUUID();return new Promise<void>(resolve=>{const timeout=setTimeout(()=>{this.flushes.delete(requestId);resolve();},300);this.flushes.set(requestId,()=>{clearTimeout(timeout);resolve();});this.sendFrame(this.frame(),'presentation-flush',{requestId});});}
 private queue(fn:()=>void){
  const term=this.state.term;
  const current=()=>!this.destroyed&&this.leader&&this.state.term===term;
  this.transition=this.transition.then(async()=>{if(!current())return;await this.flush();if(current())fn();}).catch(e=>this.fail(e));
 }
 private move(slideId:string,step:number,backwards=false){if(!this.leader)return;this.animate=!backwards;this.backwards=backwards;const page=this.view.slides.find(s=>s.id===slideId)!;const runtimeMax=maxStep(page);this.commit({slideId,step,max:Math.max(runtimeMax,step),ended:false,viewport:{scale:1,x:0,y:0}});this.synchronizePosition(!backwards);this.schedule();}
 next=()=>{if(!this.leader||!this.view.ready)return;this.queue(()=>{if(this.state.step<this.state.max)this.seek(this.state.step+1);else{const at=this.view.slides.findIndex(s=>s.id===this.state.slideId);if(at+1<this.view.slides.length)this.move(this.view.slides[at+1].id,0);else if(this.view.snapshot!.document.presentation.loop)this.move(this.view.slides[0].id,0);else{this.commit({ended:true});this.schedule();}}});};
 prev=()=>{if(!this.leader)return;this.queue(()=>{if(this.state.ended){this.commit({ended:false});return;}if(this.state.step>0)this.seek(this.state.step-1,false);else{const at=this.view.slides.findIndex(s=>s.id===this.state.slideId);if(at>0){const page=this.view.slides[at-1];this.move(page.id,maxStep(page),true);}}});};
 seek=(step:number,animate=true)=>{if(!this.leader||!finite(step))return;this.animate=animate;this.commit({step:Math.max(0,Math.min(this.state.max,Math.floor(step))),ended:false});this.sendFrame(this.frame(),'seek',{step:this.state.step,animate,media:true});this.sendFrame(this.frame(),'presentation-capture',{});this.schedule();};
 jump=(index:number)=>{if(!this.leader||!this.view.slides[index])return;this.queue(()=>{this.emit({overview:false});this.move(this.view.slides[index].id,0);});};
 overview=()=>{if(!this.leader)return;const open=!this.view.overview;if(open&&this.timer)this.autoRemaining=Math.max(0,this.autoDue-Date.now());this.emit({overview:open});this.schedule(true);};
 blank=()=>{if(!this.leader)return;if(this.timer)this.autoRemaining=Math.max(0,this.autoDue-Date.now());this.commit({blank:!this.state.blank});this.schedule(true);};
 tool=(tool:Tool)=>{if(this.leader)this.emit({tool});};
 viewport=(viewport:PresentationViewport)=>{if(this.leader)this.commit({viewport:{scale:Math.max(1,Math.min(4,viewport.scale)),x:Math.max(0,Math.min(1,viewport.x)),y:Math.max(0,Math.min(1,viewport.y))}});};
 annotate=(svg:string)=>{if(this.leader)this.commit({annotations:{...this.state.annotations,[this.state.slideId]:svg}});};
 pointer=(point:{x:number;y:number}|null)=>{if(!this.leader)return;this.bus.postMessage({kind:'pointer',...this.address(),point});};
 onPointer=(fn:(data:any)=>void)=>{this.viewportListeners.add(fn);return()=>{this.viewportListeners.delete(fn);};};
 timerPause=()=>{const timer=this.state.timer;this.commit({timer:timer.runningSince===null?{...timer,runningSince:Date.now()}:{elapsed:timer.elapsed+Date.now()-timer.runningSince,runningSince:null}});};
 timerReset=()=>this.commit({timer:{elapsed:0,runningSince:Date.now()}});
 autoPause=()=>{if(this.timer)this.autoRemaining=Math.max(0,this.autoDue-Date.now());this.commit({autoPaused:!this.state.autoPaused});this.schedule(true);};
 private schedule(resume=false){clearTimeout(this.timer);this.timer=undefined;if(!resume)this.autoRemaining=undefined;if(!this.leader||!this.view.ready||this.view.overview||this.state.autoPaused||this.state.blank||this.state.ended)return;const interval=resume&&this.autoRemaining!==undefined?Math.max(1,this.autoRemaining):stepInterval(this.current!,this.state.step);this.autoRemaining=undefined;if(interval){this.autoDue=Date.now()+interval;this.timer=setTimeout(()=>this.next(),interval);}}
 bindPreview=(frame:HTMLIFrameElement|null)=>{if(this.nextFrame===frame)return;this.nextFrame=frame??undefined;this.previewKey='';this.paintPreview();};
 private paintPreview(){if(!this.nextFrame||!this.view.snapshot||!this.view.speaker||!this.current)return;const destination=upcoming(this.view),next=destination?.slide;if(!next){this.nextFrame.style.visibility='hidden';return;}this.nextFrame.style.visibility='visible';const key=next.id,url=this.url(next.id);if(!url)return;if(key!==this.previewKey){this.previewKey=key;this.readyFrames.delete(this.nextFrame.contentWindow!);this.nextFrame.src=url;return;}if(!this.readyFrames.has(this.nextFrame.contentWindow!))return;this.configure(this.nextFrame);const runtime=this.state.runtime[next.id];if(runtime)this.sendFrame(this.nextFrame,'presentation-apply',{patch:runtime,full:true});this.sendFrame(this.nextFrame,'seek',{step:destination!.step,animate:false,media:false});}
 speaker=()=>{if(this.audience)return;this.emit({speaker:!this.view.speaker});this.params.set('speaker',this.view.speaker?'1':'0');history.replaceState(null,'','/present?'+this.params);requestAnimationFrame(()=>this.engine?.layout());this.paintPreview();};
 openAudience=()=>{const query=new URLSearchParams(this.params);query.delete('speaker');query.set('audience','1');const viewer=window.open('/present?'+query,'notale-audience-'+this.session);if(!viewer)this.fail('请允许浏览器打开观众窗口');else viewer.focus();};
 enableSound=()=>{this.emit({sound:true});this.configure();this.sendFrame(this.frame(),'presentation-sound',{enabled:this.soundHere()});};
 fullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>this.fail('请使用浏览器的全屏操作'));};
 takeover=()=>this.control?.takeover();
 activity=()=>{if(Date.now()-this.view.activity>150)this.emit({activity:Date.now()});};
 end=()=>{if(this.leader){const timer=this.state.timer;this.commit({ended:true,blank:false,autoPaused:true,timer:{elapsed:timer.elapsed+(timer.runningSince===null?0:Math.max(0,Date.now()-timer.runningSince)),runningSince:null}});this.schedule();}this.persist(true);this.control?.close();this.bus.postMessage({kind:'bye',...this.address()});if(window.opener){window.close();}else location.assign('/?document='+this.state.documentId);};
 private keydown=(e:KeyboardEvent)=>{if(isComposingKey(e)||e.defaultPrevented)return;const target=e.target as HTMLElement;if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))return;if((e.key===' '||e.key==='Enter')&&target?.closest('button,summary,a[href],[role=button]'))return;if(this.handleKey(e))e.preventDefault();};
 handleKey=(e:{key:string;ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean;altKey?:boolean})=>{if(!this.leader)return false;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&['z','y'].includes(key)&&['pen','highlight','eraser'].includes(this.view.tool)){this.viewportListeners.forEach(fn=>fn({kind:'history',redo:key==='y'||e.shiftKey}));return true;}if(e.ctrlKey||e.metaKey||e.altKey)return false;if(key==='escape'){if(this.view.overview)this.overview();else if(this.view.tool!=='pointer')this.tool('pointer');else if(this.state.viewport.scale!==1)this.viewport({scale:1,x:0,y:0});else if(document.fullscreenElement)void document.exitFullscreen();else this.end();return true;}if(this.view.overview)return false;if(['arrowright','pagedown',' '].includes(key)){this.next();return true;}if(['arrowleft','pageup'].includes(key)){this.prev();return true;}if(key==='home')this.jump(0);else if(key==='end')this.jump(this.view.slides.length-1);else if(key==='b')this.blank();else if(key==='o')this.overview();else if(key==='l')this.tool(this.view.tool==='laser'?'pointer':'laser');else if(key==='p')this.tool(this.view.tool==='pen'?'pointer':'pen');else if(key==='f')this.fullscreen();else return false;return true;};
 fail=(error:unknown)=>this.emit({error:String(error instanceof Error?error.message:error)});
 clearError=()=>{this.dismissedApplyReport=this.applyReportKey();this.emit({error:''});};
 layout=()=>this.engine?.layout();
 destroy(){this.destroyed=true;this.persist(true);this.request.abort();this.abort.abort();clearTimeout(this.timer);clearTimeout(this.persistTimer);clearInterval(this.helloTimer);this.lease?.stop();this.control?.close();this.bus.close();this.engine?.destroy();this.listeners.clear();for(const frame of this.frames.values())frame.remove();this.frames.clear();this.resident.clear();this.readyFrames.clear();this.flushes.forEach(fn=>fn());}
}
