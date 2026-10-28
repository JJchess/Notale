import {clipAppearance,type FilmClip,type FilmCommand,type FilmDocument,type FilmProperty,type FilmPropertyValue} from '@notale/editor/film';
import {cropSides,fitCropRatio,panCrop,resizeCrop,type Crop,type CropSide} from './crop-geometry';
import {translateUi as t} from '../i18n/store';
export type CropRatio=number|'original'|undefined;
type Draft={crop:Crop;x?:number;y?:number};
export function cropCommands(clip:FilmClip,at:number,value:Crop,position?:{x:number;y:number}):FilmCommand[]{
 const frame=at-clip.at+(clip.animationOffset??0),sample=clipAppearance(clip,at-clip.at);
 return Object.entries({...value,...position,mask:'inset'}).filter(([name,value])=>sample[name as FilmProperty]!==value).map(([name,value])=>{
  const property=name as FilmProperty,keys=clip.appearance?.keyframes?.[property];
  return keys?.length?{type:'film.keyframe.put',clipId:clip.id,property,keyframe:{frame,value,easing:keys.find(k=>k.frame===frame)?.easing??'linear'}}:{type:'film.property.set',clipId:clip.id,property,value};
 });
}
export function cropPresetCommands(clip:FilmClip,at:number,size:{width:number;height:number},ratio:number):FilmCommand[]{
 const a=clipAppearance(clip,at-clip.at),value=(key:FilmProperty,fallback:number)=>typeof a[key]==='number'?a[key] as number:fallback;
 const crop=Object.fromEntries(cropSides.map(key=>[key,value(key,0)])) as Crop;
 const width=value('width',size.width)*Math.abs(value('scaleX',1)),height=value('height',size.height)*Math.abs(value('scaleY',1))/Math.cos(value('skewX',0)*Math.PI/180);
 return cropCommands(clip,at,fitCropRatio(crop,width,height,ratio));
}
/** A transient crop gesture never writes authored values until pointer-up. */
export class CropHandles {
 private node?:HTMLDivElement;private bounds?:HTMLDivElement;private handles:HTMLButtonElement[]=[];private draft?:Draft;private cancel?:()=>void;private signature='';private ratio:CropRatio;
 private context?:{clip:FilmClip;at:number;crop:Crop;width:number;height:number;world:DOMMatrix;previewScale:number;x:number;y:number;screenX:number;screenY:number;ratio?:number};
 constructor(private root:HTMLElement,private commands:(commands:FilmCommand[])=>boolean,private report:(message:string)=>void){}
 setRatio(ratio:CropRatio){if(this.ratio===ratio)return;this.cancel?.();this.ratio=ratio;}
 appearance(id:string):Partial<Record<FilmProperty,FilmPropertyValue>>|undefined{return this.context?.clip.id===id&&this.draft?{...this.draft.crop,mask:'inset',...(this.draft.x!==undefined?{x:this.draft.x,y:this.draft.y}:{})}:undefined;}
 update(doc:FilmDocument,at:number,id:string|undefined,size:{width:number;height:number}|undefined){
  const track=doc.tracks.find(t=>t.kind==='media'&&t.clips.some(c=>c.id===id)),clip=track?.kind==='media'?track.clips.find(c=>c.id===id):undefined;
  if(!clip||!size||track?.locked||track?.hidden||at<clip.at||at>=clip.at+clip.duration||doc.sources.find(s=>s.id===clip.sourceId)?.kind==='audio'){this.clear();return;}
  const signature=JSON.stringify([clip,at,size,doc.width,doc.height,this.root.clientWidth,this.root.clientHeight]);if(this.cancel&&this.signature!==signature)this.clear();this.signature=signature;
  const a=clipAppearance(clip,at-clip.at),number=(key:FilmProperty,fallback:number)=>typeof a[key]==='number'?a[key] as number:fallback;
  const scale=Math.min(this.root.clientWidth/doc.width,this.root.clientHeight/doc.height),width=number('width',size.width),height=number('height',size.height),x=number('x',doc.width/2),y=number('y',doc.height/2),screenX=(x-doc.width/2)*scale+this.root.clientWidth/2,screenY=(y-doc.height/2)*scale+this.root.clientHeight/2;
  const rotation=number('rotation',0),skew=number('skewX',0),sx=number('scaleX',1)*scale,sy=number('scaleY',1)*scale,box=this.root.getBoundingClientRect();if(Math.abs(sx*sy)<1e-8){this.clear();return;}
  const world=new DOMMatrix().translate(box.left+screenX,box.top+screenY).rotate(rotation).skewX(skew).scale(sx,sy),crop=Object.fromEntries(cropSides.map(key=>[key,number(key,0)])) as Crop;
  this.context={clip,at,crop,width,height,world,previewScale:scale,x,y,screenX,screenY,ratio:this.ratio==='original'?size.width/size.height:this.ratio};
  if(!this.node){
   const node=this.node=document.createElement('div');node.className='film-crop-guide';const bounds=this.bounds=document.createElement('div');bounds.className='film-crop-bounds';node.append(bounds);
   const pan=document.createElement('button');pan.className='film-crop-pan';pan.setAttribute('aria-label',t('在裁切框内平移素材'));pan.title=t('在裁切框内平移素材');pan.onpointerdown=e=>this.drag(e,'pan');pan.onkeydown=e=>this.key(e,'pan');bounds.append(pan);
   for(const [i,key]of cropSides.entries()){
    const button=document.createElement('button');button.className='film-crop-edge '+['left','right','top','bottom'][i];button.setAttribute('aria-label',t(['左裁切边','右裁切边','上裁切边','下裁切边'][i]));button.title=button.getAttribute('aria-label')!;
    button.setAttribute('role','slider');button.setAttribute('aria-valuemin','0');button.setAttribute('aria-valuemax','99');button.onpointerdown=e=>this.drag(e,key);button.onkeydown=e=>this.key(e,key);this.handles.push(button);bounds.append(button);
   }this.root.append(node);
  }
  Object.assign(this.node.style,{width:width+'px',height:height+'px',transform:`translate(-50%,-50%) rotate(${rotation}deg) skewX(${skew}deg) scale(${sx},${sy})`});this.paint(this.draft??{crop});
 }
 private changed(side:CropSide,value:number){const c=this.context!;return resizeCrop(c.crop,side,value,c.width*Math.hypot(c.world.a,c.world.b),c.height*Math.hypot(c.world.c,c.world.d),c.ratio);}
 private pan(dx:number,dy:number):Draft {const c=this.context!,next=panCrop(c.crop,c.width,c.height,dx,dy);return {crop:next.crop,x:c.x+(c.world.a*next.dx+c.world.c*next.dy)/c.previewScale,y:c.y+(c.world.b*next.dx+c.world.d*next.dy)/c.previewScale};}
 private commit(value:Draft){const c=this.context!;const commands=cropCommands(c.clip,c.at,value.crop,value.x!==undefined?{x:value.x,y:value.y!}:undefined);if(commands.length)this.commands(commands);}
 private key(e:KeyboardEvent,key:CropSide|'pan'){
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)||!this.context||e.ctrlKey||e.metaKey)return;e.preventDefault();e.stopPropagation();const c=this.context!,step=e.shiftKey?5:e.altKey ? .1 :1;
  if(key==='pan'){if(e.key!=='Home')this.commit(this.pan(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));return;}
  const delta=(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)*(key==='cropRight'||key==='cropBottom'?-1:1)*step;this.commit({crop:this.changed(key,e.key==='Home'?0:c.crop[key]+delta)});
 }
 private paint(value:Draft){
  if(!this.bounds||!this.node||!this.context)return;const {crop}=value,c=this.context;
  Object.assign(this.node.style,{left:c.screenX+((value.x??c.x)-c.x)*c.previewScale+'px',top:c.screenY+((value.y??c.y)-c.y)*c.previewScale+'px'});
  Object.assign(this.bounds.style,{left:crop.cropLeft+'%',top:crop.cropTop+'%',width:Math.max(.01,100-crop.cropLeft-crop.cropRight)+'%',height:Math.max(.01,100-crop.cropTop-crop.cropBottom)+'%'});this.handles.forEach((node,i)=>node.setAttribute('aria-valuenow',String(Math.round(crop[cropSides[i]]*100)/100)));
 }
 private drag(event:PointerEvent,key:CropSide|'pan'){
  if(event.button!==0||!this.context||this.cancel)return;event.preventDefault();event.stopPropagation();const c=this.context,owner=event.currentTarget as HTMLElement,controller=new AbortController(),point=new DOMPoint(event.clientX,event.clientY).matrixTransform(c.world.inverse());let done=false;
  const finish=(accept:boolean)=>{if(done)return;done=true;controller.abort();this.cancel=undefined;const value=this.draft;this.draft=undefined;if(owner.hasPointerCapture(event.pointerId))owner.releasePointerCapture(event.pointerId);if(accept&&value){try{this.commit(value);}catch(error){this.report(String(error));}}this.paint({crop:c.crop});};
  this.cancel=()=>finish(false);owner.setPointerCapture(event.pointerId);
  owner.addEventListener('pointermove',move=>{if(move.pointerId!==event.pointerId)return;const now=new DOMPoint(move.clientX,move.clientY).matrixTransform(c.world.inverse()),dx=now.x-point.x,dy=now.y-point.y;
   if(key==='pan')this.draft=this.pan(dx,dy);else{const delta=key==='cropLeft'||key==='cropRight'?dx/c.width*100:dy/c.height*100;this.draft={crop:this.changed(key,c.crop[key]+delta*(key==='cropRight'||key==='cropBottom'?-1:1))};}this.paint(this.draft);
  },{signal:controller.signal});
  owner.addEventListener('pointerup',()=>finish(true),{signal:controller.signal});for(const type of ['pointercancel','lostpointercapture'])owner.addEventListener(type,()=>finish(false),{signal:controller.signal});window.addEventListener('blur',()=>finish(false),{signal:controller.signal});window.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false);}},{signal:controller.signal});
 }
 clear(){this.cancel?.();this.node?.remove();this.node=undefined;this.bounds=undefined;this.handles=[];this.context=undefined;this.draft=undefined;this.signature='';}
}
