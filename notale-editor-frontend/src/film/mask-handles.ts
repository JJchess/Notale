import {clipMasks,type FilmDocument,type FilmClip,type FilmMask,type FilmMaskSample,type FilmCommand} from '@notale/editor/film';
import {OverlayPage} from './overlay-page.js';
import {clipWorldMatrix,maskProxy,maskFromProxy,maskGeometryCommands,type Matrix,type MaskGeometry} from './mask-geometry.js';
type Size={width:number;height:number};
type Context={clip:FilmClip;mask:FilmMask;at:number;sample:FilmMaskSample;size:Size;world:Matrix;proxy:ReturnType<typeof maskProxy>};
/** Full-film proxy lets the existing Notale handles edit a mask in source space
 * even when its parent clip is rotated, scaled, skewed or reflected. */
export class MaskHandles {
 private page?:OverlayPage;private frame?:HTMLIFrameElement;private context?:Context;
 private identity='';private signature='';private dragging=false;private draft?:MaskGeometry;
 constructor(private root:HTMLElement,private commands:(commands:FilmCommand[])=>boolean,private report:(message:string)=>void){}
 samples(id:string,samples:FilmMaskSample[]){return this.context?.clip.id===id&&this.draft?samples.map(s=>s.id===this.context!.mask.id?{...s,values:{...s.values,...this.draft}}:s):samples;}
 private read(html:string){
  const node=new DOMParser().parseFromString(html,'text/html').querySelector<HTMLElement>('[data-notale-id="film-mask"]');if(!node)throw Error('遮罩编辑目标丢失');
  const c=this.context!,m=new DOMMatrix(node.style.transform),matrix:Matrix=[m.a,m.b,m.c,m.d,m.e+parseFloat(node.style.left)+c.proxy.width/2,m.f+parseFloat(node.style.top)+c.proxy.height/2];
  return maskFromProxy(matrix,c.world,c.proxy,c.size,String(c.sample.values.shape));
 }
 update(doc:FilmDocument,at:number,clipId:string|undefined,maskId:string|undefined,size:Size|undefined){
  const track=doc.tracks.find(t=>t.kind==='media'&&t.clips.some(c=>c.id===clipId)),clip=track?.kind==='media'?track.clips.find(c=>c.id===clipId):undefined;
  const mask=clip?.masks?.find(m=>m.id===maskId)??clip?.masks?.[0],sample=clip&&mask?clipMasks(clip,at-clip.at).find(m=>m.id===mask.id):undefined;
  if(!clip||!mask||!sample||!size||track?.locked||track?.hidden||doc.sources.find(s=>s.id===clip.sourceId)?.kind==='audio'||at<clip.at||at>=clip.at+clip.duration){this.clear();return;}
  const identity=JSON.stringify([clipId,mask.id,at,doc.width,doc.height,size]);if(identity!==this.identity){this.clear();this.identity=identity;}
  const scale=Math.min(this.root.clientWidth/doc.width,this.root.clientHeight/doc.height);this.page?.camera(scale);
  if(this.frame)Object.assign(this.frame.style,{width:`${doc.width}px`,height:`${doc.height}px`,transform:`translate(-50%,-50%) scale(${scale})`});
  const signature=JSON.stringify([clip,at,size]);if(this.dragging){if(signature!==this.signature)this.clear();return;}if(signature===this.signature)return;this.signature=signature;this.draft=undefined;
  const world=clipWorldMatrix(clip,at,doc,size),proxy=maskProxy(sample,size,world);this.context={clip,mask,at,sample,size,world,proxy};
  const html=`<div data-notale-id="film-mask" style="position:absolute;left:${-proxy.width/2}px;top:${-proxy.height/2}px;width:${proxy.width}px;height:${proxy.height}px;transform-origin:center;transform:matrix(${proxy.matrix.join(',')});background:transparent"></div>`;
  if(!this.page){
   this.frame=document.createElement('iframe');this.frame.className='film-mask-handles';this.frame.setAttribute('aria-label','遮罩画布手柄');Object.assign(this.frame.style,{width:`${doc.width}px`,height:`${doc.height}px`,transform:`translate(-50%,-50%) scale(${scale})`});this.root.append(this.frame);
   this.page=new OverlayPage(this.frame,html,doc.width,doc.height,fragment=>{const c=this.context;if(!c)return false;try{return this.commands(maskGeometryCommands(c.clip,c.mask,c.at,c.proxy.base,this.read(fragment)));}catch(error){this.report(String(error));return false;}},this.report,()=>{},{target:'film-mask',preview:fragment=>{if(this.dragging)try{this.draft=this.read(fragment);}catch{/* Singular transient matrices are not authored. */}},active:value=>{this.dragging=value;if(!value)this.draft=undefined;}});
   this.frame.title='遮罩画布手柄';this.page.camera(scale);this.page.setEditing(true);this.page.select('film-mask');
  }else this.page.update(html);
 }
 clear(){this.page?.dispose();this.frame?.remove();this.page=undefined;this.frame=undefined;this.context=undefined;this.draft=undefined;this.identity='';this.signature='';this.dragging=false;}
}
