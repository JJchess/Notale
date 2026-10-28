import {CaptureVideoImage,type CaptureVideoFrames} from './capture-video.js';
import {collectProjectFonts,projectFontCss,loadProjectFonts} from './project-fonts.js';
import {resolvePreviewMedia,mediaPreviewState,previewMode} from './media-preview.js';
import {CropHandles} from './crop-handles.js';
import {LecturePage} from './lecture-page.js';
import {captionStyle} from './presentation.js';
import {FilmColorSurface} from './color-engine.js';
import {FilmAudioMixer} from './audio-engine.js';
import { MaskHandles } from './mask-handles.js';
import { ClipHandles } from './clip-handles.js';
import { OverlayPage, type OverlayCapture, type OverlayAuthorOrigin } from './overlay-page.js';
import type {Command} from '@notale/editor/browser';
import { type FilmDocument, type FilmSource, type FilmLayer, filmFrame, filmMaskCss, secondsFrame, type FilmCommand, MotaleTransport, type MotaleShell } from '@notale/editor/film';
import { loadOpenFilm, type OpenFilmTransport } from './openfilm-page.js';
import { NativeMediaTransport } from './media-transport.js';
import {MotaleBridgeSession,type MotaleRawBridge,type MotaleContext} from './motale-bridge.js';
import {MotaleRenderSurface} from './motale-render-surface.js';
import {MotaleHandles,type MotaleHandleAuthoring} from './motale-handles.js';
import {collectPreviewOcclusion} from './preview-occlusion.js';
import type {OcclusionLayer,OcclusionResult} from './motale-occlusion.js';
import {CanvasSelection,canvasClientMap,canvasContains,canvasRect,type CanvasSelectionBinding,type CanvasSelectionContext,type CanvasCandidate,type CanvasPoint} from './canvas-selection.js';
import {overlayObjects} from './authoring-commands.js';

type Mount = { container:HTMLElement;node: HTMLElement; element: HTMLIFrameElement | HTMLVideoElement | HTMLImageElement | HTMLAudioElement | HTMLDivElement;
  motale?:MotaleBridgeSession;motaleRender?:MotaleRenderSurface;motaleRenderRequired?:boolean;motaleRejected?:MotaleRawBridge;motaleEditable?:boolean;motaleSelection?:string[];motaleOutline?:HTMLDivElement;motaleOutlineSignature?:string;shell?:MotaleShell;
  proxyMode?:string;proxyTried?:boolean;captured?:CaptureVideoImage;dip?:HTMLDivElement;nested?:FilmPreview;htmlStyle?:Record<string,string>;authoredStyle?:Set<string>;hits?:HTMLDivElement;inputEnabled?:boolean;hitSignature?:string;
  lecture?:LecturePage;color?:FilmColorSurface;overlay?: OverlayPage; transport?: MotaleTransport; openfilm?: OpenFilmTransport; abort?: AbortController; width?: number; height?: number; media?: NativeMediaTransport; appearance?: FilmLayer['appearance']; masks?:FilmLayer['masks']; maskSignature?:string;maskCss?:ReturnType<typeof filmMaskCss>;transition?:FilmLayer['transition']; ready: boolean; error?: string; lastTime?: number; source: FilmSource };
/** Opaque Motale pages retain their own DOM/pointer listeners and branch tree. */
export type FilmPreviewAuthoring={commands:(clipId:string,commands:Command[],origin?:OverlayAuthorOrigin)=>void|Promise<void>;selection:(clipId:string,ids:string[])=>void;action?:(clipId:string,action:string,target?:string)=>void|Promise<void>;event?:(clipId:string,type:string,data:any)=>void};
export class FilmPreview {
  private canvasSelection:CanvasSelection;private canvasBinding?:CanvasSelectionBinding;
  private canvasSample?:{doc:FilmDocument;at:number;layers:readonly FilmLayer[];playing:boolean};
  private canvasInstances=new WeakMap<object,number>();private canvasInstanceSerial=0;private textEditingClips=new Set<string>();
  bindCanvasSelection(binding?:CanvasSelectionBinding){this.cancelCanvasSelection();this.canvasBinding=binding;this.canvasSelection.update();}
  cancelCanvasSelection(){this.canvasSelection.cancel();this.handles.cancel();}
  private canvasContext():CanvasSelectionContext|undefined{
    const sample=this.canvasSample,context=this.canvasBinding?.context();if(!context||!sample||sample.playing||this.captureMode||this.cropEditing||this.maskEditing||this.gestureClip||this.textEditingClips.size)return;
    if(context.domain!=='clips'){
      const mount=context.clipId?this.mounts.get(context.clipId):undefined,layer=sample.layers.find(layer=>layer.clipId===context.clipId);
      if(!mount||!layer||mount.node.hidden||!mount.ready||sample.doc.tracks.find(track=>track.id===layer.trackId)?.locked)return;
      if(context.domain==='motale'&&(!mount.motaleEditable||mount.motaleRenderRequired||mount.motale?.context()?.error||mount.motale?.context()?.bridge.mode()!=='author'))return;
      if(context.domain==='overlay'&&!mount.overlay)return;
      if(context.domain==='motale'){
        const current=mount.motale!.context()!;let instance=this.canvasInstances.get(current.instance);if(instance===undefined){instance=++this.canvasInstanceSerial;this.canvasInstances.set(current.instance,instance);}
        return {...context,scope:JSON.stringify([context.scope,instance,current.act.id,current.act.revision,current.time,current.bridge.state().authorRevision])};
      }
    }
    return context;
  }
  private visibleCanvasMount(mount:Mount){const css=getComputedStyle(mount.node);return mount.ready&&!mount.error&&!mount.node.hidden&&css.visibility==='visible'&&css.display!=='none'&&Number(css.opacity)>0;}
  private canvasPolygon(mount:Mount,rect:{x:number;y:number;width:number;height:number}){return canvasRect(rect.x,rect.y,rect.width,rect.height).map(canvasClientMap(mount.node,mount.width??this.stageWidth,mount.height??this.stageHeight));}
  private canvasPick(context:CanvasSelectionContext,point:CanvasPoint):string|null|undefined{
    const sample=this.canvasSample;if(!sample)return;
    if(context.domain==='clips'){
      for(const layer of sample.layers){const mount=this.mounts.get(layer.clipId);if(!mount||layer.source.kind==='audio'||sample.doc.tracks.find(track=>track.id===layer.trackId)?.locked||!this.visibleCanvasMount(mount))continue;if(canvasContains(this.canvasPolygon(mount,{x:0,y:0,width:mount.width??this.stageWidth,height:mount.height??this.stageHeight}),point))return layer.clipId;}return null;
    }
    const mount=this.mounts.get(context.clipId!);if(!mount)return;
    if(context.domain==='overlay')return mount.overlay?.regions.some(region=>canvasContains(this.canvasPolygon(mount,region),point))?undefined:null;
    const current=mount.motale?.context();if(!current)return;const map=canvasClientMap(mount.node,mount.width??this.stageWidth,mount.height??this.stageHeight),zero=map({x:0,y:0}),x=map({x:1,y:0}),y=map({x:0,y:1}),a=x.x-zero.x,b=x.y-zero.y,c=y.x-zero.x,d=y.y-zero.y,det=a*d-b*c;
    const px=point.x-zero.x,py=point.y-zero.y;return current.bridge.objectAt(current.act.id,current.time,{x:(d*px-c*py)/det*current.hello.stage.width/(mount.width??this.stageWidth),y:(a*py-b*px)/det*current.hello.stage.height/(mount.height??this.stageHeight)},{parameters:'film'})?.id??null;
  }
  private async canvasCandidates(context:CanvasSelectionContext):Promise<CanvasCandidate[]>{
    const sample=this.canvasSample;if(!sample)return [];
    const viewport=this.root.getBoundingClientRect(),visible=(polygon:CanvasPoint[])=>polygon.some(point=>point.x>=viewport.left&&point.x<=viewport.right&&point.y>=viewport.top&&point.y<=viewport.bottom)||canvasContains(polygon,{x:viewport.x+viewport.width/2,y:viewport.y+viewport.height/2});
    if(context.domain==='clips')return sample.layers.flatMap(layer=>{const mount=this.mounts.get(layer.clipId);if(!mount||layer.source.kind==='audio'||!this.visibleCanvasMount(mount))return [];const polygon=this.canvasPolygon(mount,{x:0,y:0,width:mount.width??this.stageWidth,height:mount.height??this.stageHeight});return [{id:layer.clipId,polygon,hidden:!visible(polygon),locked:!!sample.doc.tracks.find(track=>track.id===layer.trackId)?.locked}];});
    const mount=this.mounts.get(context.clipId!);if(!mount||!this.visibleCanvasMount(mount))return [];
    if(context.domain==='motale'){
      const current=mount.motale?.context();if(!current||current.error)return [];return current.bridge.objects(current.act.id,current.time,{parameters:'film'}).map(object=>{const b=object.bounds,polygon=b?this.canvasPolygon(mount,{x:b[0]*(mount.width??this.stageWidth)/current.hello.stage.width,y:b[1]*(mount.height??this.stageHeight)/current.hello.stage.height,width:(b[2]-b[0])*(mount.width??this.stageWidth)/current.hello.stage.width,height:(b[3]-b[1])*(mount.height??this.stageHeight)/current.hello.stage.height}):[];return{id:object.id,parent:object.parent??undefined,polygon,selectable:object.editable,hidden:!object.visible||!b||!visible(polygon)};});
    }
    const clip=sample.doc.tracks.flatMap(track=>track.kind==='media'?track.clips:[]).find(clip=>clip.id===context.clipId);if(!clip||!mount.overlay)return [];
    const objects=overlayObjects(sample.doc,clip,sample.at),byId=new Map(objects.map(object=>[object.id,object])),capture=await mount.overlay.capture(objects.map(object=>object.id));
    if(this.canvasSample?.doc!==sample.doc||this.canvasSample.at!==sample.at||this.mounts.get(context.clipId!)!==mount)throw Error('画面已变化，框选已取消');
    return objects.map(object=>{
      const rect=capture.rectangles.find(rect=>rect.id===object.id),polygon=rect?this.canvasPolygon(mount,rect):[];let hidden=!rect||!visible(polygon),locked=object.locked,parent:string|undefined=object.id;const seen=new Set<string>();
      while(parent&&!seen.has(parent)){seen.add(parent);const css=capture.computedStyles[parent]??byId.get(parent)?.style??{};hidden ||=css.display==='none'||Number(css.opacity??1)<=0||(parent===object.id&&(css.visibility==='hidden'||css.visibility==='collapse'));parent=byId.get(parent)?.parent;}
      for(const other of objects){let ancestor=other.parent;const seen=new Set<string>();while(ancestor&&!seen.has(ancestor)){seen.add(ancestor);if(ancestor===object.id&&other.locked)locked=true;ancestor=byId.get(ancestor)?.parent;}}
      const css=capture.computedStyles[object.id]??object.style,layout=!!rect&&rect.width>=(mount.width??this.stageWidth)-1&&rect.height>=(mount.height??this.stageHeight)-1&&['div','section','article'].includes(object.tag)&&!object.attributes['data-notale-name']&&['transparent','rgba(0, 0, 0, 0)',''].includes(css['background-color']??'')&&(!css['background-image']||css['background-image']==='none');
      return{id:object.id,parent:object.parent,polygon,hidden,locked,selectable:!layout};
    });
  }
  menuTarget(point:CanvasPoint){
    const context=this.canvasContext();if(!context)return;
    const id=this.canvasPick(context,point);return {context,id};
  }
  menuPoint(clipId:string,x:number,y:number){
    const mount=this.mounts.get(clipId);if(!mount||mount.node.hidden||!Number.isFinite(x)||!Number.isFinite(y))return;
    return canvasClientMap(mount.node,mount.width??this.stageWidth,mount.height??this.stageHeight)({x,y});
  }
  private occlusionListener?: (result:OcclusionResult)=>void;
  private occlusionDirty=true;private occlusionChecked=-Infinity;private occlusionSignature='';
  private occlusionDocument?:FilmDocument;private occlusionTime?:number;
  private occlusionSample?:{doc:FilmDocument;layers:readonly FilmLayer[];time:number;playing:boolean};
  bindOcclusion(listener?:(result:OcclusionResult)=>void){this.occlusionListener=listener;for(const mount of this.mounts.values())mount.overlay?.setPaintInspection(!!listener&&!this.captureMode,false);this.invalidateOcclusion();}
  invalidateOcclusion(){this.occlusionDirty=true;this.occlusionSignature='';}
  private updateOcclusion(doc:FilmDocument,layers:readonly FilmLayer[],time:number,playing:boolean){
    if(!this.occlusionListener||this.captureMode)return;
    const now=performance.now(),changed=this.occlusionDocument!==doc||this.occlusionTime!==time;
    // Paused edits/seeks refresh on the next frame. During playback even bridge
    // notifications and late paint measurements share the same 10 Hz budget.
    if(now-this.occlusionChecked<100&&(playing||!this.occlusionDirty&&!changed))return;
    // frame() just queued a new overlay paint. Give the matching geometry packet
    // the sampling slot; otherwise every 100 ms check would see only "pending"
    // and starve the ready event a few milliseconds later. A bounded fallback
    // still removes old warnings when an overlay stops producing measurements.
    if(playing&&now-this.occlusionChecked<250&&layers.some(layer=>{const overlay=this.mounts.get(layer.clipId)?.overlay;return overlay&&!overlay.paintRegions.ready;}))return;
    this.occlusionChecked=now;this.occlusionDirty=false;this.occlusionDocument=doc;this.occlusionTime=time;
    const captions:OcclusionLayer[]=[];
    for(const text of this.subtitles.children){
      const element=text as HTMLElement,css=getComputedStyle(element),range=document.createRange();range.selectNodeContents(element);
      const shapes=[...range.getClientRects()].map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height}));
      if(css.backgroundColor!=='transparent'&&css.backgroundColor!=='rgba(0, 0, 0, 0)'){const rect=element.getBoundingClientRect();shapes.push({x:rect.x,y:rect.y,width:rect.width,height:rect.height});}
      captions.push({clipId:element.dataset.cueId!,title:element.textContent??'字幕',shapes,opacity:Number(css.opacity),hidden:css.visibility!=='visible'});
    }
    const result=collectPreviewOcclusion(this.root,{width:this.stageWidth,height:this.stageHeight},layers,this.mounts,captions),signature=JSON.stringify(result);
    if(signature!==this.occlusionSignature){this.occlusionSignature=signature;this.occlusionListener(result);}
  }
  private unsubscribeMedia:()=>void=()=>{};
  private captureMode=false;private originalMedia=false;private videoFrames:CaptureVideoFrames={};
  private fontSignature='';private fontsReady=true;private fontCss='';private fontFailure=false;
  setOriginalMedia(value:boolean){this.originalMedia=value;}
  setCaptureFrames(value?:CaptureVideoFrames){this.captureMode=value!==undefined;this.videoFrames=value??{};if(this.captureMode)for(const mount of this.mounts.values())mount.overlay?.setPaintInspection(false,false);}
  private prepareFonts(doc:FilmDocument){const fonts=collectProjectFonts(doc),signature=JSON.stringify(fonts);if(signature===this.fontSignature)return;this.fontSignature=signature;this.fontCss=projectFontCss(fonts,location.href);this.fontsReady=false;this.fontFailure=false;void loadProjectFonts(fonts).then(()=>{if(this.fontSignature===signature)this.fontsReady=true;},error=>{if(this.fontSignature===signature){this.fontFailure=true;this.status(String(error));this.stop();}});}
  private audio:FilmAudioMixer;private solo=new Set<string>();
  setSolo(ids:ReadonlySet<string>){this.solo=new Set(ids);}
  levels(){return this.audio.levels();}
  resetPeaks(){this.audio.resetPeaks();}
  private audioResumed=false;private rate=1;private gain=1;
  setRate(rate:number){this.rate=rate;}
  setGain(gain:number){this.gain=gain;}
  resumeAudio(){this.audioResumed=true;void this.audio.resume().catch(error=>{this.status(String(error));this.stop();});for(const mount of this.mounts.values())mount.nested?.resumeAudio();}
  pause(){for(const mount of this.mounts.values()){mount.nested?.pause();mount.media?.pause();if(mount.element instanceof HTMLMediaElement)this.audio.pause(mount.element);}}
  private mounts = new Map<string, Mount>();
  private subtitles: HTMLDivElement;
  private background:HTMLDivElement;private transparent=false;
  setTransparent(value:boolean){this.transparent=value;}
  private resize: ResizeObserver;
  private disposed = false;
  private revision = 0;
  private documentId?:string;
  private motaleEditing?:string;
  private motaleHandles:MotaleHandles;private motaleAuthoringEnabled=false;
  bindMotaleAuthoring(binding?:MotaleHandleAuthoring){this.motaleAuthoringEnabled=!!binding;this.motaleHandles.bind(binding);this.refreshMotaleHandles();}
  cancelMotaleGesture(){this.motaleHandles.cancel();}
  focusMotaleSelection(clipId:string){if(this.motaleEditing===clipId){this.refreshMotaleHandles();this.motaleHandles.focus();}}
  private refreshMotaleHandles(){
    const clipId=this.motaleEditing,mount=clipId?this.mounts.get(clipId):undefined,context=mount?.motale?.context();
    this.motaleHandles.update(this.motaleAuthoringEnabled&&clipId&&mount&&context&&!mount.node.hidden&&mount.motaleEditable&&!mount.motaleRenderRequired?{clipId,context,node:mount.node,width:mount.width??this.stageWidth,height:mount.height??this.stageHeight,ids:mount.motaleSelection??[]}:undefined);
  }
  motaleContext(clipId:string):MotaleContext|undefined{
    const mount=this.mounts.get(clipId);return mount&&!mount.node.hidden?mount.motale?.context():undefined;
  }
  motaleObjectBounds(clipId:string,id:string){
    const mount=this.mounts.get(clipId),context=mount?.motale?.context();if(!mount||!context)return;
    const bounds=context.bridge.objects(context.act.id,context.time,{parameters:'film'}).find(object=>object.id===id)?.bounds;if(!bounds)return;
    const scaleX=(mount.width??this.stageWidth)/context.hello.stage.width,scaleY=(mount.height??this.stageHeight)/context.hello.stage.height;
    const points=this.canvasPolygon(mount,{x:bounds[0]*scaleX,y:bounds[1]*scaleY,width:(bounds[2]-bounds[0])*scaleX,height:(bounds[3]-bounds[1])*scaleY});
    const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
  }
  setMotaleAuthorMode(clipId?:string){
    this.motaleEditing=clipId;
    for(const [id,mount]of this.mounts){
      mount.motale?.setAuthorMode(id===clipId&&!!mount.motaleEditable&&!mount.node.hidden);
      this.paintMotaleSelection(mount);
    }
  }
  selectMotaleObjects(clipId:string,ids:string[]){
    for(const [id,mount]of this.mounts)if(mount.motale){mount.motaleSelection=id===clipId?[...new Set(ids)]:[];this.paintMotaleSelection(mount);}
  }
  private paintMotaleSelection(mount:Mount){
    if(this.motaleAuthoringEnabled){if(mount.motaleOutline)mount.motaleOutline.hidden=true;this.refreshMotaleHandles();return;}
    const context=mount.motale?.context();
    if(!context||mount.node.hidden||context.error||context.bridge.mode()!=='author'||!mount.motaleSelection?.length){
      if(mount.motaleOutline)mount.motaleOutline.hidden=true;return;
    }
    try{
      const objects=context.bridge.objects(context.act.id,context.time,{parameters:'film'}).filter(object=>mount.motaleSelection!.includes(object.id)&&object.visible&&object.bounds);
      const signature=JSON.stringify(objects.map(object=>[object.id,object.bounds]));
      mount.motaleOutline??=document.createElement('div');mount.motaleOutline.className='film-motale-selection';
      mount.motaleOutline.setAttribute('aria-hidden','true');
      mount.motaleOutline.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2147483646';
      if(!mount.motaleOutline.isConnected)mount.node.append(mount.motaleOutline);
      if(signature!==mount.motaleOutlineSignature){
        mount.motaleOutlineSignature=signature;
        mount.motaleOutline.replaceChildren(...objects.map(object=>{
          const [x0,y0,x1,y1]=object.bounds!,box=document.createElement('div');
          // Percent coordinates follow the iframe's stage and the clip's transform.
          box.style.cssText=`position:absolute;left:${x0/context.hello.stage.width*100}%;top:${y0/context.hello.stage.height*100}%;width:${(x1-x0)/context.hello.stage.width*100}%;height:${(y1-y0)/context.hello.stage.height*100}%;box-shadow:inset 0 0 0 2px var(--accent,#7c5ce0);pointer-events:none`;
          return box;
        }));
      }
      mount.motaleOutline.hidden=false;
    }catch{if(mount.motaleOutline)mount.motaleOutline.hidden=true;}
  }
  private connectMotale(id:string,mount:Mount){
    if(!(mount.element instanceof HTMLIFrameElement))return;
    const element=mount.element;
    const read=()=>{try{const window=element.contentWindow as (Window&{motaleBridge?:MotaleRawBridge;shell?:MotaleShell})|null;return {motaleBridge:window?.motaleBridge,shell:window?.shell};}catch{return null;}};
    const window=read(),instance=window?.motaleBridge;
    if(mount.shell!==window?.shell){mount.shell=window?.shell;mount.transport=mount.shell?new MotaleTransport(mount.shell):undefined;mount.ready=!!mount.shell;}
    if(mount.motale?.instance===instance)return;
    mount.motaleRender?.dispose();mount.motaleRender=undefined;mount.motale?.dispose();mount.motale=undefined;mount.motaleOutline?.remove();mount.motaleOutline=undefined;mount.motaleOutlineSignature=undefined;
    if(!instance||!['motale-bridge/0','motale-bridge/1','motale-bridge/2'].includes(instance.protocol)||instance===mount.motaleRejected)return;
    try{
      mount.motale=new MotaleBridgeSession(instance,()=>!this.disposed&&this.mounts.get(id)===mount&&read()?.motaleBridge===instance,
        (type,data)=>{
          this.occlusionDirty=true;
          if(type==='motale-author')this.paintMotaleSelection(mount);
          this.authoring?.event?.(id,type,{...data,clipId:id});
        },message=>this.status(message));
      this.authoring?.event?.(id,'motale-ready',{clipId:id,instance,hello:mount.motale.hello});
    }catch(error){mount.motaleRejected=instance;this.status(error instanceof Error?error.message:String(error));}
  }
  private editing?: string;
  private clipEditing?:string;private clipGroupEntry=false;private clipEditingIds:readonly string[]=[];private handles:ClipHandles;private cropEditing?:string;private cropHandles:CropHandles;
  private colorEditing?:string;
  private colorDrafts=new Map<string,NonNullable<FilmLayer['color']>>();
  draftColor(id:string,color?:FilmLayer['color']){if(color)this.colorDrafts.set(id,color);else this.colorDrafts.delete(id);}
  inspectColor(id?:string){this.colorEditing=id;}
  scope(id:string){return this.mounts.get(id)?.color?.scope();}
  private maskEditing?:{clipId:string;maskId?:string};private maskHandles:MaskHandles;
  editMask(clipId?:string,maskId?:string){this.maskEditing=clipId?{clipId,maskId}:undefined;}
  editCrop(id?:string){this.cropEditing=id;}
  setCropRatio(ratio?:number|'original'){this.cropHandles.setRatio(ratio);}
  editClip(id?:string){this.clipGroupEntry=false;this.clipEditing=id;this.clipEditingIds=id?[id]:[];}
  editClips(ids:readonly string[]){this.clipGroupEntry=true;this.clipEditingIds=[...new Set(ids)];this.clipEditing=ids[0];}
  editOverlay(id?:string){this.editing=id;}
  selectObject(clipId:string,id:string){this.mounts.get(clipId)?.overlay?.select(id);}
  selectObjects(clipId:string,ids:string[]){this.touchSelection=ids.length?{clipId,ids:[...ids]}:undefined;for(const [id,mount] of this.mounts)mount.overlay?.selectObjects(id===clipId?ids:[]);}
  captureObjects(clipId:string,ids:string[]):Promise<OverlayCapture>{const overlay=this.mounts.get(clipId)?.overlay;return overlay?overlay.capture(ids):Promise.reject(Error('所选对象不在当前画面，请先定位到该片段'));}
  captureObject(clipId:string,id:string){return this.captureObjects(clipId,[id]);}
  startText(clipId:string,id:string,selectAll=false){const overlay=this.mounts.get(clipId)?.overlay;return overlay?overlay.startText(id,selectAll):Promise.reject(Error('所选对象不在当前画面'));}
  sendAuthor(clipId:string,type:string,data:Record<string,unknown>={}){this.mounts.get(clipId)?.overlay?.sendAuthor(type,data);}
  async flushAuthoring(clipId?:string){this.cancelMotaleGesture();await Promise.all([...this.mounts].filter(([id,mount])=>(!clipId||id===clipId)&&mount.overlay?.ready).map(([,mount])=>mount.overlay!.flush()));}
  private authoring?:FilmPreviewAuthoring;
  private gestureClip?:string;
  private pointerClip?:string;
  private lastPointer?:{x:number;y:number};
  bindAuthoring(authoring?:FilmPreviewAuthoring){this.authoring=authoring;for(const [id,mount]of this.mounts){this.connectAuthoring(id,mount);if(!authoring){mount.hits?.remove();mount.hits=undefined;mount.hitSignature=undefined;mount.element.style.pointerEvents='';}}}
  private connectAuthoring(id:string,mount:Mount){mount.overlay?.bindAuthoring(this.authoring?{
   commands:(commands,origin)=>this.authoring!.commands(id,commands,origin),
   selection:ids=>{this.touchSelection={clipId:id,ids:[...ids]};this.authoring?.selection(id,ids);},
   action:(action,target)=>this.authoring?.action?this.authoring.action(id,action,target):this.editAction(id,action,target),
   event:(type,data)=>{
    if(type==='text-session-start')this.textEditingClips.add(id);if(type==='text-session-end')this.textEditingClips.delete(id);
    if(type==='gesture-active'){this.gestureClip=data.active?id:undefined;if(!data.active&&this.lastPointer)this.routePointer(this.lastPointer.x,this.lastPointer.y);}
    if(type==='hit-regions')this.paintHits(id,mount);
    if(type==='paint-regions'){
      this.occlusionDirty=true;
      const sample=this.occlusionSample;
      if(sample&&data.ready===true)this.updateOcclusion(sample.doc,sample.layers,sample.time,sample.playing);
    }
    if(type==='pointer'){
     const matrix=new DOMMatrix(getComputedStyle(mount.node).transform),box=mount.node.getBoundingClientRect();
     const localX=data.x-(mount.width??this.stageWidth)/2,localY=data.y-(mount.height??this.stageHeight)/2;
     this.routePointer(box.x+box.width/2+matrix.a*localX+matrix.c*localY,box.y+box.height/2+matrix.b*localX+matrix.d*localY);
    }
    this.authoring?.event?.(id,type,data);
   },
  }:undefined);}
  private routePointer(x:number,y:number){
   this.lastPointer={x,y};if(this.gestureClip){this.activatePointer(this.gestureClip);return;}
   const mounts=[...this.mounts].filter(([,mount])=>mount.overlay&&mount.inputEnabled&&!mount.node.hidden).sort((a,b)=>Number(b[1].container.style.zIndex)-Number(a[1].container.style.zIndex));
   const hit=mounts.find(([,mount])=>{
    const matrix=new DOMMatrix(getComputedStyle(mount.node).transform),det=matrix.a*matrix.d-matrix.b*matrix.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)return false;
    const box=mount.node.getBoundingClientRect(),dx=x-box.x-box.width/2,dy=y-box.y-box.height/2;
    const localX=(matrix.d*dx-matrix.c*dy)/det+(mount.width??this.stageWidth)/2,localY=(-matrix.b*dx+matrix.a*dy)/det+(mount.height??this.stageHeight)/2;
    return mount.overlay!.regions.some(rect=>localX>=rect.x-3&&localX<=rect.x+rect.width+3&&localY>=rect.y-3&&localY<=rect.y+rect.height+3);
   });
   this.activatePointer(hit?.[0]);
  }
  private selectPointer(x:number,y:number,additive:boolean){
   this.routePointer(x,y);const id=this.pointerClip,mount=id?this.mounts.get(id):undefined;if(!id||!mount?.overlay)return false;
   const matrix=new DOMMatrix(getComputedStyle(mount.node).transform),det=matrix.a*matrix.d-matrix.b*matrix.c,box=mount.node.getBoundingClientRect(),dx=x-box.x-box.width/2,dy=y-box.y-box.height/2;
   const localX=(matrix.d*dx-matrix.c*dy)/det+(mount.width??this.stageWidth)/2,localY=(-matrix.b*dx+matrix.a*dy)/det+(mount.height??this.stageHeight)/2;
   const target=[...mount.overlay.regions].reverse().find(rect=>rect.id&&localX>=rect.x&&localX<=rect.x+rect.width&&localY>=rect.y&&localY<=rect.y+rect.height)?.id;
   if(!target)return false;
   this.stop();const previous=this.touchSelection?.clipId===id?this.touchSelection.ids:[];
   // Native Ctrl/Meta clicks retain their deep-selection meaning; Shift toggles.
   const ids=additive?(previous.includes(target)?previous.filter(value=>value!==target):[...previous,target]):[target];
   this.selectObjects(id,ids);this.touchSelection={clipId:id,ids};this.authoring?.selection(id,ids);return true;
  }
  private activatePointer(id?:string){
   this.pointerClip=id;
    for(const [key,mount]of this.mounts)if(mount.overlay){const active=!!mount.inputEnabled&&key===id;mount.element.style.pointerEvents=active?'auto':'none';if(mount.hits)mount.hits.hidden=!mount.inputEnabled||active;}
  }
  private paintHits(id:string,mount:Mount){
   if(!mount.overlay||!this.authoring)return;
   const signature=JSON.stringify(mount.overlay.regions);if(signature===mount.hitSignature)return;mount.hitSignature=signature;
   mount.hits??=document.createElement('div');mount.hits.className='film-overlay-hit-regions';mount.hits.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2147483646';
   if(!mount.hits.isConnected)mount.node.append(mount.hits);
   mount.hits.replaceChildren(...mount.overlay.regions.map(rect=>{
    const hit=document.createElement('div');hit.setAttribute('aria-hidden','true');hit.style.cssText=`position:absolute;left:${rect.x-3}px;top:${rect.y-3}px;width:${rect.width+6}px;height:${rect.height+6}px;pointer-events:auto`;
    // Let a real pointermove bubble to the host before enabling the iframe.
    // Toggling iframe hit-testing synthesizes pointerenter with Chromium's last
    // parent-document coordinates; accepting it would reactivate an old layer.
    return hit;
   }));
   mount.hits.hidden=!mount.inputEnabled||this.pointerClip===id;
   if(this.lastPointer)this.routePointer(this.lastPointer.x,this.lastPointer.y);
  }
  private touchSelection?:{clipId:string;ids:string[]};
  private pointerEvents=new AbortController();
  objectStyle(clipId:string,id:string,property:string){return this.mounts.get(clipId)?.overlay?.style(id,property);}
  readObjectStyle(clipId:string,id:string,property:string):Promise<string>{const overlay=this.mounts.get(clipId)?.overlay;return overlay?overlay.readStyle(id,property):Promise.reject(Error('所选对象不在当前画面'));}
  private stageWidth = 1280;
  private stageHeight = 720;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private root: HTMLElement, private status: (message: string) => void, private takeover: () => void, private stop: () => void = () => {}, private overlayChanged:(id:string,html:string)=>boolean=()=>false,private objectSelected:(clipId:string,id:string)=>void=()=>{},commands:(commands:FilmCommand[])=>boolean=()=>false,private editAction:(clipId:string,action:string,target?:string)=>void=()=>{},audioParent?:FilmAudioMixer) {
    this.audio=new FilmAudioMixer(error=>{this.status(error);this.stop();},audioParent);
    this.unsubscribeMedia=mediaPreviewState.subscribe(()=>{
      if(this.disposed||this.originalMedia||this.captureMode)return;
      for(const mount of this.mounts.values()){
        if(!(mount.element instanceof HTMLVideoElement))continue;
        const mode=previewMode(mount.source.uri),state=mediaPreviewState.get(mount.source.uri);
        if(mode===mount.proxyMode&&state?.state!=='complete')continue;mount.proxyMode=mode;const element=mount.element;
        void resolvePreviewMedia(mount.source,{signal:mount.abort?.signal}).then(result=>{
          if(this.disposed||mount.abort?.signal.aborted||new URL(result.uri,location.href).href===element.src)return;
          mount.ready=false;mount.error=undefined;mount.media?.dispose();mount.media=new NativeMediaTransport(element,message=>{mount.error=message;this.status(message);this.stop();});element.src=result.uri;element.load();
        }).catch(()=>{});
      }
    });
    this.motaleHandles=new MotaleHandles(root,status,(input,point,shift)=>{
      const context=input.context,hit=context.bridge.objectAt(context.act.id,context.time,point,{parameters:'film'});
      this.authoring?.event?.(input.clipId,'motale-select',{instance:context.instance,hit,shift,act:context.act.id,t:context.time,point});
    });
    this.handles=new ClipHandles(root,commands,status);this.cropHandles=new CropHandles(root,commands,status);this.maskHandles=new MaskHandles(root,commands,status);
    this.canvasSelection=new CanvasSelection(root,{context:()=>this.canvasContext(),candidates:context=>this.canvasCandidates(context),pick:(context,point)=>this.canvasPick(context,point),select:(context,ids)=>this.canvasBinding?.select(context,ids),report:status});
    this.background=document.createElement('div');this.background.className='film-stage-background';this.root.append(this.background);
    this.subtitles = document.createElement('div'); this.subtitles.className = 'film-subtitles';
    this.root.append(this.subtitles);
    this.resize = new ResizeObserver(() => this.scale()); this.resize.observe(root);
    root.addEventListener('pointermove',event=>{if(this.authoring)this.routePointer(event.clientX,event.clientY);},{signal:this.pointerEvents.signal,passive:true});
    root.addEventListener('pointerdown',event=>{
     if(!this.authoring||event.button!==0||!(event.target===root||event.target instanceof Element&&event.target.closest('.film-overlay-hit-regions')))return;
     // Touch and a first click during compositing can land on the transparent
     // proxy. Select its object without replaying an untrusted synthetic click.
     if(this.selectPointer(event.clientX,event.clientY,event.shiftKey))event.preventDefault();
     else if(this.touchSelection?.ids.length){const id=this.touchSelection.clipId;this.selectObjects(id,[]);this.touchSelection={clipId:id,ids:[]};this.authoring.selection(id,[]);}
    },{signal:this.pointerEvents.signal,capture:true});
    root.addEventListener('pointerleave',()=>{if(!this.gestureClip){this.lastPointer=undefined;this.activatePointer();}},{signal:this.pointerEvents.signal});
  }
  pageDocument(id:string){const mount=this.mounts.get(id);return mount?.source.kind==='openfilm'&&mount.ready&&mount.element instanceof HTMLIFrameElement?mount.element.contentDocument:undefined;}
  dimensions(id:string) { const mount=this.mounts.get(id);return mount?{width:mount.width??this.stageWidth,height:mount.height??this.stageHeight}:undefined; }
  private scale() {
    this.canvasSelection.cancel();this.handles.cancel();
    this.occlusionDirty=true;
    for(const mount of this.mounts.values())this.place(mount);
    const scale=Math.min(this.root.clientWidth/this.stageWidth,this.root.clientHeight/this.stageHeight);
    for(const node of [this.subtitles,this.background])Object.assign(node.style,{width:`${this.stageWidth}px`,height:`${this.stageHeight}px`,left:'50%',top:'50%',right:'auto',bottom:'auto',transform:`translate(-50%,-50%) scale(${scale})`,transformOrigin:'center'});
    if(this.lastPointer)this.routePointer(this.lastPointer.x,this.lastPointer.y);
  }
  get captureReady():boolean{return this.fontsReady&&!this.fontFailure&&[...this.mounts.values()].every(m=>m.node.hidden||(!m.error&&m.ready&&(!m.motaleRenderRequired||!!m.motaleRender?.ready&&!m.motaleRender.error)&&(!m.captured||m.captured.ready)&&(!m.overlay||m.overlay.frameReady)&&(!m.nested||m.nested.captureReady)));}
  private place(mount:Mount) {
    const {node,element}=mount,w=mount.width??this.stageWidth,h=mount.height??this.stageHeight,a={...mount.appearance,...this.handles.appearance(node.dataset.previewClipId!),...this.cropHandles.appearance(node.dataset.previewClipId!)};
    const scale=Math.min(this.root.clientWidth/this.stageWidth,this.root.clientHeight/this.stageHeight);
    const number=(key:keyof typeof a,fallback:number)=>typeof a[key]==='number'?a[key] as number:fallback;
    Object.assign(node.style,{width:`${w}px`,height:`${h}px`,
      left:`calc(50% + ${(number('x',this.stageWidth/2)-this.stageWidth/2)*scale}px)`,top:`calc(50% + ${(number('y',this.stageHeight/2)-this.stageHeight/2)*scale}px)`,
      transform:`translate(-50%, -50%) rotate(${number('rotation',0)}deg) skewX(${number('skewX',0)}deg) scale(${scale*number('scaleX',1)*number('width',w)/w},${scale*number('scaleY',1)*number('height',h)/h})`,
      opacity:String(number('opacity',1)),mixBlendMode:'normal',borderRadius:`${number('radius',0)}px`,overflow:number('radius',0)>0?'hidden':'',
      filter:`blur(${number('blur',0)}px) brightness(${number('brightness',1)}) contrast(${number('contrast',1)}) saturate(${number('saturation',1)}) hue-rotate(${number('hue',0)}deg)`,
      clipPath:a.mask==='ellipse'?'ellipse(50% 50% at 50% 50%)':a.mask==='inset'?`inset(${number('cropTop',0)}% ${number('cropRight',0)}% ${number('cropBottom',0)}% ${number('cropLeft',0)}%)`:'none',
    });
    mount.container.style.mixBlendMode=String(a.blendMode??'normal');
    const masks=this.maskHandles.samples(node.dataset.previewClipId!,mount.masks??[]);
    const signature=JSON.stringify([w,h,masks]);if(signature!==mount.maskSignature){mount.maskSignature=signature;mount.maskCss=filmMaskCss(masks,w,h);}
    node.style.maskComposite='add';Object.assign(node.style,mount.maskCss);
    mount.container.style.clipPath=mount.transition?.kind==='wipe'&&mount.transition.incoming?`inset(0 ${(1-mount.transition.progress)*100}% 0 0)`:'none';
    const dip=mount.transition?.kind.startsWith('dip-')&&mount.transition.incoming;
    if(dip){mount.dip??=document.createElement('div');if(!mount.dip.isConnected)mount.container.append(mount.dip);Object.assign(mount.dip.style,{position:'absolute',pointerEvents:'none',zIndex:'2147483647',left:'50%',top:'50%',width:this.stageWidth*scale+'px',height:this.stageHeight*scale+'px',transform:'translate(-50%,-50%)',background:mount.transition!.kind==='dip-white'?'white':'black',opacity:String(1-Math.abs(2*mount.transition!.progress-1))});mount.dip.hidden=false;}else if(mount.dip)mount.dip.hidden=true;
    const css=mount.htmlStyle;
    if(css){for(const [property,value] of Object.entries(css)){if(['opacity','filter','mix-blend-mode','object-fit','object-position'].includes(property))continue;if(property.startsWith('border-')&&property.endsWith('-radius')&&mount.authoredStyle?.has('radius'))continue;node.style.setProperty(property,value);}
      node.style.opacity=String((Number(css.opacity)||0)*number('opacity',1));
      if(css.filter&&css.filter!=='none')node.style.filter=css.filter+' '+node.style.filter;
      mount.container.style.mixBlendMode=String(mount.authoredStyle?.has('blendMode')?a.blendMode:css['mix-blend-mode']??a.blendMode??'normal');
    }
    if(element instanceof HTMLImageElement||element instanceof HTMLVideoElement){element.style.objectFit=String(mount.authoredStyle?.has('fit')?a.fit:css?.['object-fit']??a.fit??'contain');element.style.objectPosition=css?.['object-position']??'50% 50%';}
  }
  private mount(id: string, source: FilmSource, width: number, height: number): Mount {
    const container=document.createElement('div');container.className='film-composite-layer';Object.assign(container.style,{position:'absolute',inset:'0',pointerEvents:'none'});
    const node = document.createElement('div'); node.className = 'film-source'; node.dataset.previewClipId = id; node.dataset.sourceId = source.id;
    const element = document.createElement(source.kind==='sequence'?'div':source.kind === 'image'||source.kind==='video'&&this.captureMode ? 'img' : source.kind === 'video' ? 'video' : source.kind === 'audio' ? 'audio' : 'iframe');
    const mount: Mount = { container,node, element, ready: false, source, width: source.width ?? width, height: source.height ?? height };
    const revision = this.revision;
    const current = () => !this.disposed && this.revision === revision && this.mounts.get(id) === mount;
    node.style.pointerEvents=['audio','image','video','openfilm','overlay','lecture'].includes(source.kind)?'none':'auto';
    node.append(element);container.append(node); this.root.insertBefore(container, this.subtitles); this.mounts.set(id, mount);
    if(element instanceof HTMLDivElement&&source.kind==='sequence'){
      element.style.cssText='position:relative;width:100%;height:100%;overflow:hidden;overscroll-behavior:none';mount.nested=new FilmPreview(element,this.status,this.takeover,this.stop,undefined,undefined,undefined,undefined,this.audio);mount.nested.setOriginalMedia(this.originalMedia);mount.nested.setCaptureFrames(this.captureMode?this.videoFrames:undefined);mount.ready=true;if(this.audioResumed)mount.nested.resumeAudio();
    } else if (element instanceof HTMLIFrameElement && source.kind === 'overlay') {
      mount.overlay=new OverlayPage(element,source.html!,mount.width!,mount.height!,html=>current()&&this.overlayChanged(id,html),message=>{if(current()){mount.error=message;this.status(message);this.stop();}},target=>{if(current())this.objectSelected(id,target);},undefined,(action,target)=>this.editAction(id,action,target));
      mount.overlay.setFonts(this.fontCss);this.connectAuthoring(id,mount);
    } else if (element instanceof HTMLIFrameElement && source.kind === 'lecture') {
      try{mount.lecture=new LecturePage(element,source,message=>{if(current()){mount.error=message;this.status(message);this.stop();}});mount.ready=true;}catch(error){mount.error=String(error);this.status(mount.error);}
    } else if (element instanceof HTMLIFrameElement && source.kind === 'openfilm') {
      element.title = source.title; element.allow = "autoplay 'none'";
      mount.abort = new AbortController();
      const fail = (message: string) => { if (current()) { mount.error = `OpenFilm：${message}`; this.status(mount.error); this.stop(); } };
      void loadOpenFilm(element, source.uri, mount.abort.signal, fail).then(loaded => {
        if (!current()) { loaded.transport.dispose(); return; }
        mount.openfilm = loaded.transport; mount.width = loaded.width ?? mount.width; mount.height = loaded.height ?? mount.height;
        mount.ready = true; this.scale();
      }).catch(error => { fail(error instanceof Error ? error.message : String(error)); mount.abort?.abort(); });
    } else if (element instanceof HTMLIFrameElement) {
      element.title = source.title;
      // Both bridge versions use the same-origin direct API. Legacy films still play.
      const url = new URL(source.uri, location.href);
      if (url.origin !== location.origin) { this.status('此候选预览需要同源网页素材'); return mount; }
      // Motale's public tool flag suppresses viewer gates and pause overlays.
      // The host owns transport; this changes only the mounted preview URL.
      if(source.kind==='motale'&&!/(?:^#|&)tool\b/.test(url.hash))url.hash=(url.hash.slice(1)?url.hash.slice(1)+'&':'')+'tool';
      element.addEventListener('load', () => {
        if (!current()) return;
        if(source.kind==='motale'){
          // Hide player chrome, preserving the full stage and its interactions.
          // No shadow DOM, renderer internals or source files are touched.
          const doc=element.contentDocument;if(doc){const style=doc.createElement('style');style.textContent='video-controls,.mx-bigplay{display:none!important}html,body,*{overscroll-behavior:none}';doc.head.append(style);}
        }
        const started = performance.now();
        const poll = () => {
          if (!current()) return;
          try {
            this.connectMotale(id,mount);
            if (mount.transport) return;
          } catch { this.status('无法访问网页素材的播放接口'); return; }
          if (performance.now() - started > 10000) { this.status('网页素材未提供 Motale shell，尚不能在此候选中播放'); return; }
          const timer = setTimeout(() => { this.timers.delete(timer); poll(); }, 30); this.timers.add(timer);
        };
        poll();
      });
      element.src = url.href;
    } else if(element instanceof HTMLImageElement&&source.kind==='video'&&this.captureMode){
      const frames=this.videoFrames[source.uri];if(!frames){mount.error='导出缺少视频固定帧源';this.status(mount.error);return mount;}
      mount.captured=new CaptureVideoImage(element,frames,message=>{if(current()){mount.error=message;this.status(message);this.stop();}});mount.ready=true;
    } else if(element instanceof HTMLMediaElement||element instanceof HTMLImageElement) {
      element.addEventListener('error', () => {
        if(!current())return;
        if(element instanceof HTMLVideoElement&&!this.originalMedia&&!this.captureMode&&!mount.proxyTried){
          mount.proxyTried=true;mount.ready=false;void resolvePreviewMedia(source,{force:true,signal:mount.abort?.signal}).then(result=>{if(!current())return;if(new URL(result.uri,location.href).href===element.src){mount.error=`素材加载失败：${source.title}`;this.status(mount.error);this.stop();}else{element.src=result.uri;element.load();}},error=>{if(current()){mount.error=String(error);this.status(mount.error);this.stop();}});return;
        }
        mount.error=`素材加载失败：${source.title}`;this.status(mount.error);this.stop();
      });
      if (element instanceof HTMLImageElement) element.addEventListener('load', () => { mount.ready = true; });
      else {
        element.dataset.filmSourceUri=source.uri;element.crossOrigin='anonymous';element.preload = 'auto'; if (element instanceof HTMLVideoElement) element.playsInline = true;
        mount.media = new NativeMediaTransport(element, message => { if (current()) { this.status(`媒体播放失败：${message}`); this.stop(); } });
        element.addEventListener('loadedmetadata', () => { mount.ready = true; });
      }
      mount.proxyMode=previewMode(source.uri);mount.abort=new AbortController();void resolvePreviewMedia(source,{original:this.originalMedia||this.captureMode,signal:mount.abort.signal}).then(result=>{if(current())element.src=result.uri;},error=>{if(current()&&!mount.abort?.signal.aborted){mount.error=String(error);this.status(mount.error);this.stop();}});
    }
    this.scale(); return mount;
  }
  frame(doc: FilmDocument, time: number, resume = false, languages?: readonly string[], playing = false): boolean {
    if(this.documentId!==undefined&&this.documentId!==doc.id)this.reset();this.documentId=doc.id;
    this.prepareFonts(doc);
    if (this.stageWidth !== doc.width || this.stageHeight !== doc.height) { this.stageWidth = doc.width; this.stageHeight = doc.height; this.scale(); }
    this.background.style.background=this.transparent?'transparent':doc.background??'transparent';
    const solo=doc.tracks.some(t=>this.solo.has(t.id)),mix=solo?{...doc,tracks:doc.tracks.map(t=>({...t,muted:t.muted||!this.solo.has(t.id)}))}:doc;
    const frame = filmFrame(mix, time, languages), active = new Set(frame.layers.map(l => l.clipId));
    this.canvasSample={doc,at:secondsFrame(time,doc.frameRate),layers:frame.layers,playing};this.canvasSelection.update();
    let ready = this.fontsReady&&!this.fontFailure,inputChanged=false;
    const authorClips=new Map(doc.tracks.flatMap(t=>t.kind==='media'?t.clips.map(c=>[c.id,c] as const):[]));const authored=new Set(authorClips.keys());
    for (const [id, mount] of this.mounts) {
      const changedSource=authorClips.get(id)&&doc.sources.find(s=>s.id===authorClips.get(id)!.sourceId);if (!authored.has(id)||changedSource&&(changedSource.id!==mount.source.id||changedSource.uri!==mount.source.uri||changedSource.kind!==mount.source.kind)) { mount.motaleRender?.dispose();mount.motale?.dispose();mount.nested?.dispose();mount.lecture?.dispose();mount.color?.dispose();mount.overlay?.dispose(); mount.abort?.abort(); mount.openfilm?.dispose(); mount.media?.dispose();mount.captured?.dispose();if(mount.element instanceof HTMLMediaElement)this.audio.remove(mount.element); mount.container.remove(); this.mounts.delete(id);this.textEditingClips.delete(id); continue; }
      mount.node.hidden = !active.has(id);mount.container.hidden=!active.has(id);
      if (!active.has(id)) {this.textEditingClips.delete(id);mount.motaleRender?.deactivate();mount.motaleRenderRequired=false;mount.motale?.setAuthorMode(false);mount.nested?.pause();mount.media?.pause();if(mount.element instanceof HTMLMediaElement)this.audio.pause(mount.element);mount.overlay?.setEditing(false);}
    }
    this.cropHandles.update(doc,secondsFrame(time,doc.frameRate),playing?undefined:this.cropEditing,this.cropEditing?this.dimensions(this.cropEditing):undefined);
    this.handles.updateSelection(doc,secondsFrame(time,doc.frameRate),playing?[]:this.clipEditingIds,id=>{const layer=frame.layers.find(layer=>layer.clipId===id),mount=this.mounts.get(id),rect=mount?.node.getBoundingClientRect(),viewport=this.root.getBoundingClientRect();return layer&&mount&&this.visibleCanvasMount(mount)&&Number(layer.appearance.opacity??1)>0&&rect&&rect.right>viewport.left&&rect.left<viewport.right&&rect.bottom>viewport.top&&rect.top<viewport.bottom?this.dimensions(id):undefined;},this.clipGroupEntry);
    this.maskHandles.update(doc,secondsFrame(time,doc.frameRate),playing?undefined:this.maskEditing?.clipId,this.maskEditing?.maskId,this.maskEditing?this.dimensions(this.maskEditing.clipId):undefined);
    let viewerTookOver = false;
    for (let i = 0; i < frame.layers.length; i++) {
      const layer = frame.layers[i], mount = this.mounts.get(layer.clipId) ?? this.mount(layer.clipId, layer.source, doc.width, doc.height);
      layer.playbackRate*=this.rate;layer.gain*=this.gain;
      const author=authorClips.get(layer.clipId);mount.authoredStyle=new Set([...Object.keys(author?.appearance?.values??{}),...Object.keys(author?.appearance?.keyframes??{})]);mount.htmlStyle=layer.openfilm?.resolvedStyle;mount.appearance=layer.appearance;mount.transition=layer.transition;mount.masks=layer.masks;this.place(mount);
      if(layer.source.kind==='motale'){
        this.connectMotale(layer.clipId,mount);
        mount.motaleRenderRequired=this.captureMode||!!layer.transition;
        if(!mount.motaleRenderRequired)mount.motaleRender?.deactivate();
        mount.motale?.prepare(layer.sourceTime,author?.motale);
        mount.motaleEditable=!mount.motaleRenderRequired&&!playing&&!doc.tracks.find(track=>track.id===layer.trackId)?.locked;
        mount.motale?.setAuthorMode(this.motaleEditing===layer.clipId&&mount.motaleEditable);
      }
      if(mount.overlay){
        mount.overlay.setPaintInspection(!!this.occlusionListener&&!this.captureMode,playing);
        mount.overlay.setFonts(this.fontCss);mount.overlay.update(layer.source.html!);mount.ready=mount.overlay.ready;
        const editable=!playing&&(!!this.authoring||this.editing===layer.clipId)&&!doc.tracks.find(t=>t.id===layer.trackId)?.locked;
        if(!editable)this.textEditingClips.delete(layer.clipId);
        const wasInputEnabled=mount.inputEnabled;
        mount.overlay.setEditing(editable);mount.ready=mount.overlay.prepare(layer.objectStyles,layer.objectLocks,{frame:secondsFrame(time,doc.frameRate),documentId:doc.id,sourceId:author?.sourceId,clipAt:author?.at,animationOffset:author?.animationOffset??0});mount.inputEnabled=editable&&mount.ready;
        inputChanged||=wasInputEnabled!==mount.inputEnabled;
        mount.node.style.pointerEvents=this.authoring?'none':editable?'auto':'none';
        if(this.authoring){mount.element.style.pointerEvents=mount.inputEnabled&&this.pointerClip===layer.clipId?'auto':'none';if(mount.hits)mount.hits.hidden=!mount.inputEnabled||this.pointerClip===layer.clipId;}
      }
      mount.node.hidden = false;mount.container.hidden=false; mount.node.style.zIndex = String(frame.layers.length - i);mount.container.style.zIndex=String(frame.layers.length-i);
      if (mount.error) { if (playing) { this.status(mount.error); this.stop(); } ready = false; continue; }
      if (!mount.ready) { ready = false; continue; }
      if(mount.motaleRenderRequired){
        mount.motaleRender??=new MotaleRenderSurface(mount.node,mount.element as HTMLIFrameElement,message=>{if(!this.disposed&&this.mounts.get(layer.clipId)===mount){this.status(message);this.stop();}});
        const context=mount.motale?.context();
        if(!mount.motale){mount.motaleRender.block('此场景仅支持旧版播放，无法用于转场或离线捕获');ready=false;}
        else if(!context){mount.motaleRender.block('当前源时间没有可渲染的场景');ready=false;}
        else{
          try{
            const width=Math.max(1280,Math.min(4096,Math.ceil(mount.node.getBoundingClientRect().width)));
            if(!mount.motaleRender.prepare(context,width,{width:mount.width??this.stageWidth,height:mount.height??this.stageHeight}))ready=false;
          }catch(error){mount.motaleRender.block(error instanceof Error?error.message:String(error));ready=false;}
        }
        this.paintMotaleSelection(mount);
      }
      else if(mount.captured){if(!mount.captured.prepare(layer.sourceTime))ready=false;}
      else if(mount.nested){mount.nested.setRate(layer.playbackRate);mount.nested.setGain(layer.gain);if(!mount.nested.frame(layer.source.sequence!,layer.sourceTime,resume,languages,playing))ready=false;}
      else if(mount.lecture){const drawn=mount.lecture.prepare(layer.sourceTime);mount.node.style.visibility=drawn?'':'hidden';if(!drawn)ready=false;}
      else if (mount.openfilm) {
        const drawn = mount.openfilm.prepare(layer.sourceTime,layer.openfilm?.original.overrides);
        mount.node.style.visibility = drawn ? '' : 'hidden';
        if (!drawn) ready = false;
      } else if (mount.transport) {
        if (resume) mount.transport.resume(layer.sourceTime);
        else if (mount.transport.frame(layer.sourceTime) === 'viewer-takeover') { viewerTookOver = true; this.takeover(); }
        this.paintMotaleSelection(mount);
      } else if (mount.element instanceof HTMLMediaElement) {
        mount.element.muted = layer.muted;this.audio.set(mount.element,layer.gain,layer.audioEffects);
        if(layer.playbackRate>0){mount.element.playbackRate=Math.max(.0625,Math.min(16,layer.playbackRate));mount.element.preservesPitch=layer.preservePitch;}
        if(!this.audio.prepare(mount.element,layer.sourceTime,layer.playbackRate,playing))ready=false;
        if(!(mount.element instanceof HTMLAudioElement&&layer.playbackRate<0)&&!mount.media!.prepare(layer.sourceTime,playing&&layer.playbackRate>0,resume,playing&&layer.playbackRate<0))ready=false;
      }
      if(mount.element instanceof HTMLVideoElement||mount.element instanceof HTMLImageElement){
        if(layer.color||this.colorEditing===layer.clipId){try{if(mount.captured&&!mount.captured.ready){ready=false;continue;}mount.color??=new FilmColorSurface();if(!mount.color.canvas.isConnected)mount.node.append(mount.color.canvas);mount.color.canvas.hidden=false;if(mount.element instanceof HTMLVideoElement&&mount.element.seeking)ready=false;else if(!mount.color.render(mount.element,this.colorDrafts.get(layer.clipId)??layer.color,String(layer.appearance.fit??'contain')))ready=false;mount.element.style.visibility='hidden';}catch(error){mount.error=String(error);this.status(mount.error);this.stop();ready=false;}}
        else if(mount.color){mount.color.canvas.hidden=true;mount.element.style.visibility='';}
      }
      mount.lastTime = layer.sourceTime;
    }
    // Content is visible before the native bridge is ready. A pointer already
    // resting over that content must become interactive as readiness changes;
    // it must not require another mouse movement to wake the iframe.
    if(inputChanged&&this.lastPointer)this.routePointer(this.lastPointer.x,this.lastPointer.y);
    for (const layer of frame.layers) {
      const mount=this.mounts.get(layer.clipId),media=mount?.media;
      if(playing&&ready&&!viewerTookOver&&layer.playbackRate>0)media?.play();else media?.pause();
      if(mount?.element instanceof HTMLMediaElement){if(playing&&ready&&!viewerTookOver&&layer.playbackRate<0)this.audio.playReverse(mount.element);else this.audio.pause(mount.element);}
    }
    this.subtitles.replaceChildren(...frame.subtitles.map(({ cue, language,style },index) => {
      const text = document.createElement('p');text.dataset.cueId=cue.id; text.lang = language;captionStyle(text,style,cue.settings,index);
      // Native cue tags are metadata; do not execute source HTML.
      if(cue.words?.length){const local=frame.time-cue.at*doc.frameRate.denominator/doc.frameRate.numerator;for(const word of cue.words){const span=document.createElement('span');span.textContent=word.text+' ';span.className=local>=word.start&&local<word.end?'film-word-active':'';text.append(span);}}else text.textContent = cue.text.replace(/<[^>]*>/g, ''); return text;
    }));
    this.refreshMotaleHandles();
    this.canvasSelection.update();
    this.occlusionSample={doc,layers:frame.layers,time,playing};
    this.updateOcclusion(doc,frame.layers,time,playing);
    return ready;
  }
  reset() {
    this.canvasSelection.cancel();this.canvasSample=undefined;this.textEditingClips.clear();
    this.occlusionSample=undefined;this.occlusionDocument=undefined;this.occlusionTime=undefined;this.occlusionChecked=-Infinity;this.invalidateOcclusion();this.occlusionListener?.({warnings:[],unknown:[]});
    this.motaleHandles.update();
    this.handles.clear();this.maskHandles.clear();this.cropHandles.clear();this.revision++;
    for (const timer of this.timers) clearTimeout(timer); this.timers.clear();
    for (const mount of this.mounts.values()) { mount.motaleRender?.dispose();mount.motale?.dispose();mount.nested?.dispose();mount.lecture?.dispose();mount.color?.dispose();mount.overlay?.dispose(); mount.abort?.abort(); mount.openfilm?.dispose(); mount.media?.dispose();mount.captured?.dispose();if(mount.element instanceof HTMLMediaElement)this.audio.remove(mount.element); mount.container.remove(); }
    this.mounts.clear(); this.subtitles.replaceChildren();this.pointerClip=undefined;this.gestureClip=undefined;this.touchSelection=undefined;
  }
  dispose() { this.disposed = true;this.motaleHandles.dispose();this.canvasSelection.dispose();this.unsubscribeMedia();this.pointerEvents.abort(); this.reset();this.handles.dispose();this.audio.dispose(); this.resize.disconnect(); this.subtitles.remove();this.background.remove(); }
}
