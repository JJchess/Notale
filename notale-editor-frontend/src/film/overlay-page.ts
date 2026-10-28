import {overlayAnimationRuntime} from './overlay-animation.js';
import {commitSchema,type Snapshot,type Slide,type Command} from '@notale/editor/browser';
import {projectCommands} from '../author-projection.js';
import {CanvasRequests} from '../canvas/request-session.js';

export type OverlayCapture = {computedStyles:Record<string,Record<string,string>>;rectangles:({id:string;x:number;y:number;width:number;height:number;geometry?:unknown;baseWidth?:number;baseHeight?:number;matrix?:number[]})[]};
export type OverlayRegion = {id:string;x:number;y:number;width:number;height:number};
export type OverlayPaintRegion = Readonly<OverlayRegion & {opacity:number;uncertain:boolean}>;
export type OverlayPaintRegions = Readonly<{ready:boolean;sequence:number;fontSequence:number;regions:readonly OverlayPaintRegion[];uncertain:boolean}>;
export type OverlayAuthorOrigin={frame:number;documentId?:string;sourceId?:string;clipAt?:number;animationOffset?:number};
export type OverlayAuthoring = {
 commands:(commands:Command[],origin?:OverlayAuthorOrigin)=>void|Promise<void>;
 selection?:(ids:string[])=>void;
 action?:(action:string,target?:string)=>void|Promise<void>;
 event?:(type:string,data:any)=>void;
};

/** Geometry messages contain a normalized matrix even for an unchanged transform.
 * Diff the actual gesture styles, so untouched sampled properties never become
 * author values merely because another property was edited. */
export function overlayGeometryCommands(before:{id:string;style:string|null}[],after:{id:string;style:string|null}[]):Command[] {
 return after.flatMap(state=>{
  const previous=before.find(item=>item.id===state.id);if(!previous)return [];
  const old=document.createElement('div').style,next=document.createElement('div').style;
  old.cssText=previous.style??'';next.cssText=state.style??'';
  const style:Record<string,string>={};
  for(const property of new Set([...Array.from(old),...Array.from(next)]))if(old.getPropertyValue(property)!==next.getPropertyValue(property))style[property]=next.getPropertyValue(property);
  return Object.keys(style).length?[{type:'element.patch' as const,slideId:'overlay',target:state.id,patch:{style}}]:[];
 });
}

/** Overlay content is authored data, never an executable webpage. OpenFilm is the
 * separate page source for scripts. Both preview and editor use this sanitizer. */
export function cleanOverlayHtml(html:string):string {
  const doc=new DOMParser().parseFromString(html,'text/html');
  const tags=new Set('div section article p h1 h2 h3 h4 h5 h6 span b strong i em u s sub sup br ul ol li blockquote a pre code svg g path rect circle ellipse line polyline polygon text tspan title desc'.split(' '));
  const attrs=new Set('data-type data-notale-id data-notale-name data-notale-wordart data-notale-code data-notale-code-lang data-notale-icon data-notale-shape class style href title role aria-label aria-hidden viewBox preserveAspectRatio xmlns d x y x1 y1 x2 y2 cx cy r rx ry width height points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-dasharray stroke-dashoffset transform text-anchor dominant-baseline opacity vector-effect'.toLowerCase().split(' '));
  const ids=new Set<string>();
  for(const node of [...doc.body.querySelectorAll('*')]) {
    if(!tags.has(node.localName)){node.remove();continue;}
    for(const attr of [...node.attributes])if(!attrs.has(attr.name.toLowerCase()) || attr.name==='data-type'&&attr.value!=='text' || attr.name==='href'&&!/^(https?:|mailto:|#)/i.test(attr.value))node.removeAttribute(attr.name);
    const style=(node as HTMLElement).style;
    if(style)for(const name of Array.from(style))if(/^(?:-[a-z]+-)?(?:animation|transition)(?:-|$)/.test(name))style.removeProperty(name);
    const id=node.getAttribute('data-notale-id');
    if(id&&(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||ids.has(id)))node.removeAttribute('data-notale-id');
    else if(id)ids.add(id);
  }
  let sequence=0;
  for(const node of doc.body.querySelectorAll('*'))if(!node.hasAttribute('data-notale-id')){let id:string;do{id=`overlay-${sequence++}`;}while(ids.has(id));ids.add(id);node.setAttribute('data-notale-id',id);}
  return doc.body.innerHTML||'<div data-notale-id="empty"></div>';
}
function overlaySlide(html:string):Slide {
 return {id:'overlay',name:'叠加层',sourcePath:'overlay.html',html,notes:'',hidden:false,section:'',layoutId:null,theme:{},guides:[],transition:'none',advanceAfter:0,nativeStepCount:0,stepMap:[],animations:[],bindings:[],groups:[],connectors:[],nativeCharts:{},locked:[],transforms:{}};
}
/** Reuses the lecture author projection and runtime commands, without creating a
 * deck revision or pretending that the film has joined the persistence contract. */
export class OverlayPage {
 private channel=crypto.randomUUID();
 private html:string;
 private snapshot:Snapshot;
 private runtimeId='';
 private paintSerial=0;private painted=0;private signature='';private styles:Record<string,Record<string,string>>={};
 private styleValues=new Map<string,string>();
 private styleRequests=new Map<string,{revision:number;resolve:(value:string)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private fontCss='';private fontSequence=0;private fontsPainted=0;private fontFailure?:string;
 private paintRevision=0;private paintCollection=0;private paintStylesSignature='';
 private paintInspection=false;private paintPlaying=false;
 private paintMeasurement?:OverlayPaintRegions & {revision:number};
 private selectedIds:string[]=[];
 private authoring?:OverlayAuthoring;
 private requests=new CanvasRequests((type,data)=>this.send(type,data));
 private authorTasks=new Set<Promise<void>>();
 private textFailure?:Error;
 private authorOrigin:OverlayAuthorOrigin={frame:0};
 private inputOrigin?:OverlayAuthorOrigin;
 private gestureOrigin?:OverlayAuthorOrigin;
 private pendingTextOrigin?:OverlayAuthorOrigin;
 private pendingTextSelectAll?:string;
 private textOrigins=new Map<string,OverlayAuthorOrigin>();
 private revision=0;
 regions:OverlayRegion[]=[];
 /** Advisory visual bounds in iframe viewport pixels, never editor hit areas.
  * Pending or stale results expose no regions and must not mean “unobstructed”. */
 get paintRegions():OverlayPaintRegions {
  const value=this.paintMeasurement;
  if(this.paintInspection&&!this.disposed&&this.ready&&this.painted>0&&this.fontsPainted===this.fontSequence&&!this.fontFailure&&value?.ready&&value.sequence<=this.paintSerial&&value.fontSequence===this.fontSequence&&value.revision===this.paintRevision)return value;
  return {ready:false,sequence:this.paintSerial,fontSequence:this.fontSequence,regions:[],uncertain:true};
 }
 private enabled=false;private cameraScale=1;
 private loaded=false;
 private disposed=false;
 private timer:ReturnType<typeof setTimeout>;
 ready=false;
 constructor(private frame:HTMLIFrameElement,html:string,private width:number,private height:number,
   private changed:(html:string)=>boolean,private error:(message:string)=>void,private selected:(id:string)=>void=()=>{},private geometry?:{target:string;preview:(html:string)=>void;active:(active:boolean)=>void},private action?:(action:string,target?:string)=>void) {
  this.html=html;const fragment=cleanOverlayHtml(html);
  this.snapshot={version:1,createdAt:'',actor:'film-working-copy',document:{schemaVersion:1,id:'film-overlay',title:'叠加层',width,height,theme:{},layouts:[],slides:[overlaySlide(this.document(fragment))],assets:{},comments:[],presentation:{loop:false,showSlideNumber:false}}};
  // Opaque origin: an imported fragment cannot access host state or credentials.
  frame.setAttribute('sandbox','allow-scripts');frame.title='Notale 叠加层';
  window.addEventListener('message',this.receive);
  this.timer=setTimeout(()=>{if(!this.ready&&!this.disposed)this.error('叠加层编辑运行时加载超时');},10000);
  frame.src=new URL(`film-overlay.html?channel=${this.channel}`,location.href).href;
 }
 private document(fragment:string){return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}*{box-sizing:border-box;overscroll-behavior:none}#stage{width:${this.width}px;height:${this.height}px;transform-origin:center}#stage,#stage *{animation:none!important;transition:none!important}p,h1,h2,h3{margin:0}.ProseMirror{outline:none;white-space:pre-wrap}</style></head><body><div id="stage" data-notale-id="film-stage-${this.channel}">${fragment}</div></body></html>`;}
 private get slide(){return this.snapshot.document.slides[0];}
 private send(type:string,data:unknown={}){if(!this.disposed)this.frame.contentWindow?.postMessage({source:'notale-host',channel:this.channel,type,data},'*');}
 private fragment(html:string){return new DOMParser().parseFromString(html,'text/html').getElementById('stage')!.innerHTML;}
 private async commit(commands:Command[],origin:OverlayAuthorOrigin={...this.authorOrigin}) {
  const parsed=commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands}).commands;
  if(!parsed.length)return;
  if(this.authoring){await this.authoring.commands(parsed,origin);return;}
  const before=this.slide.html,next=projectCommands(this.snapshot,parsed),after=next.document.slides[0];
  const fragment=cleanOverlayHtml(this.fragment(after.html));
  if(!this.changed(fragment))throw Error('叠加层修改未应用');
  after.html=this.document(fragment);this.html=fragment;this.snapshot=next;this.styleValues.clear();
  this.send('author-update',{before,after:after.html,transforms:after.transforms,paintRevision:++this.paintRevision});
  this.send('geometry-confirm',{transforms:after.transforms});
 }
 private task(run:()=>void|Promise<void>){
  // Register before executing: a synchronous author commit can immediately render
  // its accepted HTML back into this runtime while a text session is still open.
  const task=Promise.resolve().then(()=>{if(!this.disposed)return run();}).catch(error=>{if(!this.disposed)this.error(error instanceof Error?error.message:String(error));}).finally(()=>this.authorTasks.delete(task));
  this.authorTasks.add(task);
 }
 private receive=(event:MessageEvent)=>{
  if(this.disposed||event.source!==this.frame.contentWindow||event.data?.channel!==this.channel)return;
  const {source,type,data}=event.data;
  if(source==='notale-film-shell'&&!this.loaded){
   this.loaded=true;
   const config={slide:this.slide,width:this.width,height:this.height,channel:this.channel,textEditorUrl:new URL('film-runtime/text-editor.js',location.href).href};
   const script=`<script>(${overlayAnimationRuntime.toString()})(${JSON.stringify(this.channel)});window.__NOTALE__=${JSON.stringify(config).replaceAll('<','\\u003c')}</script><script src="${new URL('film-runtime/bridge.js',location.href).href}"></script>`;
   this.frame.contentWindow!.postMessage({source:'notale-film-init',channel:this.channel,html:this.slide.html.replace('</body>',script+'</body>')},'*');return;
  }
  if(source==='notale-film-animation'){
   if(type==='input-origin'&&Number.isSafeInteger(event.data.origin?.frame)){
    this.inputOrigin={...event.data.origin};if(event.data.kind==='text')this.pendingTextOrigin={...event.data.origin};if(event.data.kind==='gesture')this.gestureOrigin={...event.data.origin};
   }
   if(type==='geometry-preview'&&this.enabled)this.geometry?.preview(event.data.html);
   if(type==='painted')this.painted=Math.max(this.painted,event.data.sequence);
   if(type==='style'){const pending=this.styleRequests.get(event.data.key);if(pending){this.styleRequests.delete(event.data.key);clearTimeout(pending.timer);if(pending.revision!==this.revision||event.data.error)pending.reject(Error(event.data.error??'对象已更新，请重新读取属性'));else pending.resolve(event.data.value);}else this.styleValues.set(event.data.key,event.data.value);}
   if(type==='fonts-ready'&&event.data.sequence===this.fontSequence){this.fontsPainted=event.data.sequence;this.fontFailure=event.data.error;if(this.fontFailure)this.error(this.fontFailure);}
   if(type==='hit-regions')this.regions=event.data.regions;
   if(type==='paint-regions'){
    const value=event.data;
    if(!this.paintInspection||!Number.isSafeInteger(value.sequence)||value.sequence<=0||value.sequence>this.paintSerial||value.fontSequence!==this.fontSequence||value.revision!==this.paintRevision||!Number.isSafeInteger(value.collection)||value.collection<=this.paintCollection)return;
    if(!Array.isArray(value.regions)||value.regions.length>2048||!value.regions.every((rect:any)=>typeof rect?.id==='string'&&['x','y','width','height','opacity'].every(key=>Number.isFinite(rect[key]))&&rect.width>0&&rect.height>0&&rect.opacity>0&&rect.opacity<=1&&typeof rect.uncertain==='boolean'))return;
    this.paintCollection=value.collection;
    this.paintMeasurement=Object.freeze({ready:value.ready===true,sequence:value.sequence,fontSequence:value.fontSequence,revision:value.revision,regions:Object.freeze(value.regions.map((rect:OverlayPaintRegion)=>Object.freeze({...rect}))),uncertain:value.uncertain!==false});
   }
   this.authoring?.event?.(type,event.data);return;
  }
  if(source!=='notale-slide')return;
  if(type==='ready'){this.runtimeId=data.runtimeId;this.ready=true;this.requests.markReady();if(this.fontSequence)this.send('film-fonts',{css:this.fontCss,sequence:this.fontSequence,paintRevision:this.paintRevision});this.send('camera',{scale:this.cameraScale,paintRevision:this.paintRevision});if(this.paintInspection)this.send('film-paint-inspection',{enabled:true,playing:this.paintPlaying,paintRevision:this.paintRevision});clearTimeout(this.timer);this.send('mode',{mode:this.enabled?'edit':'play'});this.signature='';if(this.geometry)this.send('film-geometry-watch',{target:this.geometry.target});this.send('select',{ids:this.selectedIds});this.authoring?.event?.(type,data);return;}
  if(data?.slideId&&data.slideId!==this.slide.id||data?.runtimeId&&data.runtimeId!==this.runtimeId)return;
  if(type==='text-session-start'&&typeof data.sessionId==='string'){
   this.textOrigins.set(data.sessionId,{...(this.pendingTextOrigin??this.inputOrigin??this.authorOrigin)});this.pendingTextOrigin=undefined;
   if(data.target===this.pendingTextSelectAll){this.pendingTextSelectAll=undefined;this.send('text-select-all',{sessionId:data.sessionId});}
  }
  if(type==='text-session-end'&&typeof data.sessionId==='string')this.textOrigins.delete(data.sessionId);
  if(type==='gesture-active'&&data.active)this.gestureOrigin={...(this.inputOrigin??this.authorOrigin)};
  // Capture before dispatching the async author task. A subsequent seek, session
  // end or pointer-up must not reassign this command to the current playhead.
  const origin={...(type==='text-draft'?this.textOrigins.get(data.sessionId):type==='geometry-commit'?this.gestureOrigin:undefined)??this.inputOrigin??this.authorOrigin};
  this.requests.receive(type,data);
  if(['text-error','edit-error','runtime-reload-required'].includes(type)){this.error(data.message??'叠加层运行时需要重新载入');return;}
  this.authoring?.event?.(type,data);
  const pendingAuthorCommand=this.authoring&&(type==='text-draft'&&this.textOrigins.has(data.sessionId)||type==='geometry-commit'&&!!this.gestureOrigin||type==='transform'&&!!this.inputOrigin);
  if(!this.enabled&&!pendingAuthorCommand)return;
  this.task(async()=>{
   if(type==='gesture-active'){if(data.active)this.frame.focus();this.geometry?.active(!!data.active);}
   if(type==='select'){
    this.frame.focus();const ids=Array.isArray(data.ids)?data.ids.filter((id:unknown):id is string=>typeof id==='string'):[];
    if(JSON.stringify(ids)!==JSON.stringify(this.selectedIds)){this.selectedIds=ids;if(ids[0])this.selected(ids[0]);this.authoring?.selection?.([...ids]);}
   }
   if(type==='geometry-commit'){
    try{await this.commit(this.authoring&&data.before&&data.after?overlayGeometryCommands(data.before,data.after):data.commands,origin);}
    catch(error){if(JSON.stringify(origin)===JSON.stringify(this.authorOrigin)){if(data.before)this.send('geometry-draft',{states:data.before});}else this.send('film-object-frame',{sequence:++this.paintSerial,styles:this.styles,origin:this.authorOrigin,paintRevision:++this.paintRevision,forcePaint:true});throw error;}
   }
   if(type==='transform')await this.commit([{type:'elements.arrange',slideId:this.slide.id,action:'translate',reference:'selection',angle:0,factor:1,rectangles:data.rectangles,dx:data.dx,dy:data.dy}],origin);
   if(type==='text-draft'){
    try{await this.commit([{type:'element.patch',slideId:this.slide.id,target:data.target,patch:{richText:data.html,...(data.style?{style:data.style}:{})}}],origin);this.textFailure=undefined;}
    catch(error){this.textFailure=error instanceof Error?error:Error(String(error));throw error;}
    if(this.disposed)return;
    const confirmed=this.authoring?data.html:new DOMParser().parseFromString(this.slide.html,'text/html').querySelector(`[data-notale-id="${CSS.escape(data.target)}"]`)?.innerHTML??data.html;
    this.send('text-confirm',{target:data.target,sessionId:data.sessionId,sequence:data.sequence,html:confirmed});
   }
   if(type==='text-history'||type==='edit-action'){const action=this.authoring?.action??this.action;if(action)await action(typeof data.action==='string'?data.action:data.action.type,this.selectedIds[0]);else this.error('请使用主工作台的编辑快捷键');}
  });
 };
 update(html:string) {
  if(html===this.html)return;
  const before=this.slide.html;
  const fragment=cleanOverlayHtml(html),next=new DOMParser().parseFromString(fragment,'text/html'),ids=new Set([...next.querySelectorAll('[data-notale-id]')].map(node=>node.getAttribute('data-notale-id')));
  const retained=this.selectedIds.filter(id=>ids.has(id));
  this.html=html;this.revision++;this.paintRevision++;this.styleValues.clear();this.signature='';this.snapshot.document.slides[0]={...overlaySlide(this.document(fragment)),locked:this.slide.locked};
  if(this.ready){
   // Deselect removed nodes before the runtime patches HTML and refreshes handles.
   // Keep the previous host selection until the runtime acknowledges this select.
   if(retained.length!==this.selectedIds.length)this.send('select',{ids:retained});
   if(!this.authorTasks.size)this.send('text-end');this.send('author-update',{before,after:this.slide.html,transforms:{},paintRevision:this.paintRevision});
  }
 }
 camera(scale:number){if(scale===this.cameraScale)return;this.cameraScale=scale;this.paintRevision++;if(this.ready)this.send('camera',{scale,paintRevision:this.paintRevision});}
 /** Opt-in editor-only inspection; capture and published players leave it off. */
 setPaintInspection(enabled:boolean,playing:boolean){
  playing=enabled&&playing;if(this.paintInspection===enabled&&this.paintPlaying===playing)return;
  this.paintInspection=enabled;this.paintPlaying=playing;this.paintRevision++;this.paintMeasurement=undefined;
  if(this.ready)this.send('film-paint-inspection',{enabled,playing,paintRevision:this.paintRevision});
 }
 bindAuthoring(authoring?:OverlayAuthoring){this.authoring=authoring;}
 select(id:string){this.selectObjects([id]);}
 selectObjects(ids:string[]){this.selectedIds=[...new Set(ids)];if(this.ready)this.send('select',{ids:this.selectedIds});}
 async startText(id:string,selectAll=false){const origin={...this.authorOrigin};await this.requests.whenReady();if(this.disposed)return;this.pendingTextOrigin=origin;this.pendingTextSelectAll=selectAll?id:undefined;this.selectObjects([id]);this.send('text-start',{target:id,authorOrigin:origin});}
 sendAuthor(type:string,data:Record<string,unknown>={}){this.send(type,data);}
 async capture(ids:string[]):Promise<OverlayCapture>{const revision=this.revision;const result=await this.requests.request<OverlayCapture>('capture',{ids});if(revision!==this.revision)throw Error('对象已更新，请重新读取属性');return result;}
 async flush(){await this.requests.request('flush-editor',{},'editor-flushed',5000,'id');while(this.authorTasks.size)await Promise.all([...this.authorTasks]);if(this.textFailure)throw this.textFailure;}
 style(target:string,property:string){const key=JSON.stringify([target,property]);if(!this.styleValues.has(key)&&this.ready){this.styleValues.set(key,'');this.send('film-object-read',{key,target,property});}return this.styleValues.get(key);}
 async readStyle(target:string,property:string):Promise<string>{
  const revision=this.revision;await this.requests.whenReady();if(this.disposed||revision!==this.revision)throw Error('对象已更新，请重新读取属性');
  const key=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.styleRequests.delete(key);reject(Error('读取 CSS 属性超时'));},5000);this.styleRequests.set(key,{revision,resolve,reject,timer});this.send('film-object-read',{key,target,property});});
 }
 setFonts(css:string){if(css===this.fontCss)return;this.fontCss=css;this.fontSequence++;this.revision++;this.paintRevision++;this.fontFailure=undefined;this.styleValues.clear();if(this.ready)this.send('film-fonts',{css,sequence:this.fontSequence,paintRevision:this.paintRevision});}
 prepare(styles:Record<string,Record<string,string>>,locked:string[],origin:OverlayAuthorOrigin=this.authorOrigin):boolean {
  this.styles=styles;this.authorOrigin={...origin};
  const paintSignature=JSON.stringify(styles);if(paintSignature!==this.paintStylesSignature){this.paintStylesSignature=paintSignature;this.paintRevision++;}
  if(JSON.stringify(this.slide.locked)!==JSON.stringify(locked)){this.slide.locked=[...locked];if(this.ready){this.send('text-end');this.send('author-state',{slide:this.slide});}}
  const sampled=styles,signature=JSON.stringify([sampled,origin]);
  if(this.ready&&signature!==this.signature){this.signature=signature;this.send('film-object-frame',{sequence:++this.paintSerial,styles:sampled,origin,paintRevision:this.paintRevision});}
  // Preview queues subsequent paints without dropping elapsed time every RAF.
  // Capture consumers can wait for frameReady to acknowledge the exact request.
  return this.ready&&this.painted>0&&this.fontsPainted===this.fontSequence&&!this.fontFailure;
 }
 /** Exact paint acknowledgement for future capture/export consumers. */
 get frameReady(){return this.ready&&this.painted>0&&this.painted===this.paintSerial&&this.fontsPainted===this.fontSequence&&!this.fontFailure;}
 setEditing(enabled:boolean){
  if(this.enabled===enabled)return;this.enabled=enabled;
  if(!enabled)this.pendingTextSelectAll=undefined;
  if(this.ready)this.send('mode',{mode:enabled?'edit':'play'});
 }
 dispose(){this.setPaintInspection(false,false);this.disposed=true;this.requests.dispose();for(const request of this.styleRequests.values()){clearTimeout(request.timer);request.reject(Error('编辑会话已关闭'));}this.styleRequests.clear();clearTimeout(this.timer);window.removeEventListener('message',this.receive);}
}
export const overlayPresets:Record<string,{title:string;icon:string;html:string}>={
 text:{title:'文字',icon:'T',html:'<p style="position:absolute;left:180px;top:280px;width:900px;color:white;font:52px/1.3 sans-serif">影片标题</p>'},
 rectangle:{title:'矩形',icon:'▰',html:'<div style="position:absolute;left:380px;top:240px;width:520px;height:240px;background:#8bb7d1;border-radius:24px"></div>'},
 ellipse:{title:'椭圆',icon:'●',html:'<div style="position:absolute;left:440px;top:200px;width:400px;height:320px;background:#b3a0ed;border-radius:50%"></div>'},
 sticker:{title:'星形贴纸',icon:'★',html:'<div style="position:absolute;left:460px;top:180px;width:360px;height:360px;background:#f2ca73;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 94%,50% 72%,21% 94%,32% 57%,2% 35%,39% 35%)"></div>'},
 annotation:{title:'标注',icon:'↗',html:'<div style="position:absolute;left:680px;top:150px;width:330px;padding:24px;border-left:8px solid #f2ca73;background:#18212eee;color:white;font:32px/1.4 sans-serif">关键点</div>'},
 lowerthird:{title:'下三分之一字幕条',icon:'▁',html:'<div style="position:absolute;left:90px;top:530px;width:650px;padding:22px 30px;border-left:8px solid #b3a0ed;background:#18212eee;color:white;font:38px/1.35 sans-serif"><p>姓名 / 标题</p><p style="font-size:22px;color:#c7cfdb">补充说明</p></div>'},
};
