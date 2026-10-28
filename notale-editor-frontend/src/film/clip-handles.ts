import {type FilmDocument,type FilmClip,type FilmCommand,clipAppearance} from '@notale/editor/film';
import {OverlayPage} from './overlay-page.js';
import {type ClipGeometry,decomposeClipMatrix,clipGeometryCommands,sampledClipGeometry} from './clip-geometry.js';
import {ClipGroupHandles} from './clip-group-handles.js';
/** Transparent full-stage proxy: Notale owns selection, gesture geometry,
 * snapping, cancellation and handles. The actual source stays in its own host. */
export class ClipHandles {
 private page?:OverlayPage;private frame?:HTMLIFrameElement;private signature='';private identity='';private dragging=false;
 private context?:{clip:FilmClip;at:number;base:ClipGeometry;width:number;height:number;factorX:number;factorY:number};
 private draft?:ClipGeometry;
 private group:ClipGroupHandles;
 constructor(private root:HTMLElement,private commands:(commands:FilmCommand[])=>boolean,private report:(message:string)=>void){this.group=new ClipGroupHandles(root,commands,report);}
 appearance(id:string){return this.group.appearance(id)??(this.context?.clip.id===id?this.draft:undefined);}
 updateSelection(doc:FilmDocument,at:number,ids:readonly string[],size:(id:string)=>{width:number;height:number}|undefined,groupSingle=false){if(ids.length>1||groupSingle){this.clearSingle();this.group.update(doc,at,ids,size);}else{this.group.clear();this.update(doc,at,ids[0],ids[0]?size(ids[0]):undefined);}}
 cancel(){this.group.cancel();this.clearSingle();}
 private read(html:string):ClipGeometry {
  const c=this.context!,node=new DOMParser().parseFromString(html,'text/html').querySelector<HTMLElement>('[data-notale-id="film-clip"]');if(!node)throw Error('片段手柄目标丢失');
  const style=node.style,m=new DOMMatrix(style.transform||undefined);
  const result=decomposeClipMatrix([m.a,m.b,m.c,m.d,m.e,m.f],parseFloat(style.left),parseFloat(style.top),c.width,c.height,{...c.base,scaleX:c.base.scaleX*c.factorX,scaleY:c.base.scaleY*c.factorY});
  return {...result,scaleX:result.scaleX/c.factorX,scaleY:result.scaleY/c.factorY};
 }
 update(doc:FilmDocument,at:number,id:string|undefined,size:{width:number;height:number}|undefined){
  const track=doc.tracks.find(t=>t.kind==='media'&&t.clips.some(c=>c.id===id)),clip=track?.kind==='media'?track.clips.find(c=>c.id===id):undefined;
  const source=doc.sources.find(s=>s.id===clip?.sourceId);
  if(!clip||!size||track?.locked||track?.hidden||source?.kind==='audio'||at<clip.at||at>=clip.at+clip.duration){this.clear();return;}
  const identity=JSON.stringify([id,at,doc.width,doc.height,size]);
  if(identity!==this.identity){this.clear();this.identity=identity;}
  const scale=Math.min(this.root.clientWidth/doc.width,this.root.clientHeight/doc.height);
  this.page?.camera(scale);
  if(this.frame)Object.assign(this.frame.style,{width:`${doc.width}px`,height:`${doc.height}px`,transform:`translate(-50%,-50%) scale(${scale})`});
  const signature=JSON.stringify([clip,at,size]);
  if(this.dragging){if(signature!==this.signature)this.clear();return;}
  const base=sampledClipGeometry(clip,at,doc.width,doc.height),appearance=clipAppearance(clip,at-clip.at);
  const factorX=Number(appearance.width??size.width)/size.width,factorY=Number(appearance.height??size.height)/size.height;
  if(signature===this.signature)return;
  this.signature=signature;this.draft=undefined;this.context={clip,at,base,width:size.width,height:size.height,factorX,factorY};
  const html=`<div data-notale-id="film-clip" style="position:absolute;left:${base.x-size.width/2}px;top:${base.y-size.height/2}px;width:${size.width}px;height:${size.height}px;transform-origin:center;transform:rotate(${base.rotation}deg) skewX(${base.skewX}deg) scale(${base.scaleX*factorX},${base.scaleY*factorY});background:transparent"></div>`;
  if(!this.page){
   this.frame=document.createElement('iframe');this.frame.className='film-clip-handles';this.frame.setAttribute('aria-label','片段画布手柄');
   Object.assign(this.frame.style,{width:`${doc.width}px`,height:`${doc.height}px`,transform:`translate(-50%,-50%) scale(${scale})`});this.root.append(this.frame);
   this.page=new OverlayPage(this.frame,html,doc.width,doc.height,fragment=>{
    const c=this.context;if(!c)return false;
    try{return this.commands(clipGeometryCommands(c.clip,c.at,c.base,this.read(fragment)));}catch(error){this.report(String(error));return false;}
   },this.report,()=>{},{target:'film-clip',preview:fragment=>{if(this.dragging)try{this.draft=this.read(fragment);}catch{/* Singular transient drag is never committed. */}},active:value=>{this.dragging=value;if(!value)this.draft=undefined;}});
   this.frame.title='片段画布手柄';this.page.camera(scale);this.page.setEditing(true);this.page.select('film-clip');
  }else this.page.update(html);
 }
 private clearSingle(){this.page?.dispose();this.frame?.remove();this.page=undefined;this.frame=undefined;this.context=undefined;this.draft=undefined;this.dragging=false;this.signature='';this.identity='';}
 clear(){this.clearSingle();this.group.clear();}
 dispose(){this.clearSingle();this.group.dispose();}
}
