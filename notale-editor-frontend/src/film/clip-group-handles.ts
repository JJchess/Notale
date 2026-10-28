import {additiveSelection} from './selection-modifiers';
import {type FilmDocument,type FilmClip,type FilmCommand,clipAppearance} from '@notale/editor/film';
import {translateUi as t} from '../i18n/store.js';
import {clipGeometryCorners,clipGeometryCommands,sampledClipGeometry,transformClipGroup,type ClipGeometry,type ClipGroupChange} from './clip-geometry.js';
import './canvas-selection.css';
type Point={x:number;y:number};
type Item={clip:FilmClip;base:ClipGeometry;width:number;height:number};
type Context={key:string;doc:FilmDocument;at:number;items:Item[]};
type Mode='move'|'scale'|'rotate';
type Gesture={context:Context;mode:Mode;start:Point;center:Point;pointer?:number;keys:Set<string>;change:ClipGroupChange;lastAngle:number;angle:number;abort:AbortController};
const idle=():ClipGroupChange=>({dx:0,dy:0,scale:1,rotate:0});
const changed=(change:ClipGroupChange)=>Math.abs(change.dx)+Math.abs(change.dy)+Math.abs(change.scale-1)+Math.abs(change.rotate)>1e-7;
export class ClipGroupHandles {
 private element:HTMLDivElement;private svg:SVGSVGElement;private buttons:HTMLButtonElement[];private context?:Context;private gesture?:Gesture;private drafts=new Map<string,ClipGeometry>();private events=new AbortController();
 private cancelledKeys=new Set<string>();
 constructor(private root:HTMLElement,private commit:(commands:FilmCommand[])=>boolean,private report:(message:string)=>void){
  this.element=document.createElement('div');this.element.className='film-group-handles';this.element.hidden=true;this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.svg.setAttribute('aria-hidden','true');this.element.append(this.svg);
  this.buttons=[...Array.from({length:4},()=>['scale','等比缩放所选片段'] as const),['rotate','旋转所选片段'] as const,['move','移动所选片段'] as const].map(([mode,label],index)=>{const node=document.createElement('button');node.type='button';node.dataset.groupHandle=mode;node.dataset.corner=String(index);node.title=t(label);node.setAttribute('aria-label',node.title);node.addEventListener('pointerdown',event=>this.pointer(event,mode),{signal:this.events.signal});node.addEventListener('keydown',event=>this.key(event,mode),{signal:this.events.signal});node.addEventListener('blur',()=>{if(this.gesture?.pointer===undefined)this.cancel();},{signal:this.events.signal});this.element.append(node);return node;});root.append(this.element);
  window.addEventListener('keyup',event=>{if(this.cancelledKeys.delete(event.key)){event.preventDefault();event.stopPropagation();}},{signal:this.events.signal,capture:true});
 }
 appearance(id:string){return this.drafts.get(id);}
 update(doc:FilmDocument,at:number,ids:readonly string[],size:(id:string)=>{width:number;height:number}|undefined){
  if(!ids.length){this.clear();return;}
  const items:Item[]=[];
  for(const id of ids){const track=doc.tracks.find(track=>track.kind==='media'&&track.clips.some(clip=>clip.id===id)),clip=track?.kind==='media'?track.clips.find(clip=>clip.id===id):undefined,source=doc.sources.find(source=>source.id===clip?.sourceId),dimensions=size(id);
   if(!clip||!dimensions||track?.locked||track?.hidden||source?.kind==='audio'||at<clip.at||at>=clip.at+clip.duration){this.clear();return;}
   const appearance=clipAppearance(clip,at-clip.at);if(Number(appearance.opacity??1)<=0){this.clear();return;}
   items.push({clip,base:sampledClipGeometry(clip,at,doc.width,doc.height),width:Number(appearance.width??dimensions.width),height:Number(appearance.height??dimensions.height)});
  }
  const key=JSON.stringify([doc.id,doc.width,doc.height,at,items]);if(this.gesture&&key!==this.gesture.context.key)this.cancel();this.context={doc,at,items,key};this.element.hidden=false;this.paint();
 }
 private point(event:{clientX:number;clientY:number}):Point{const box=this.root.getBoundingClientRect(),doc=this.context!.doc,scale=Math.min(this.root.clientWidth/doc.width,this.root.clientHeight/doc.height);return{x:((event.clientX-box.x)*this.root.clientWidth/box.width-this.root.clientWidth/2)/scale+doc.width/2,y:((event.clientY-box.y)*this.root.clientHeight/box.height-this.root.clientHeight/2)/scale+doc.height/2};}
 private bounds(){const points=this.context!.items.flatMap(item=>clipGeometryCorners(this.drafts.get(item.clip.id)??item.base,item.width,item.height));return{x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),y1:Math.max(...points.map(p=>p.y))};}
 private paint(){
  const context=this.context;if(!context)return;const b=this.bounds(),scale=Math.min(this.root.clientWidth/context.doc.width,this.root.clientHeight/context.doc.height),map=(point:Point)=>({x:this.root.clientWidth/2+(point.x-context.doc.width/2)*scale,y:this.root.clientHeight/2+(point.y-context.doc.height/2)*scale});
  const corners=[{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1}].map(map);this.svg.setAttribute('viewBox',`0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);
  const polygon=(points:Point[],cls:string)=>{const node=document.createElementNS('http://www.w3.org/2000/svg','polygon');node.setAttribute('class',cls);node.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));return node;};
  this.svg.replaceChildren(polygon(corners,'film-group-outline'),...context.items.map(item=>{const node=polygon(clipGeometryCorners(this.drafts.get(item.clip.id)??item.base,item.width,item.height).map(map),'film-group-body');node.dataset.groupClip=item.clip.id;node.addEventListener('pointerdown',event=>{if(!additiveSelection(event))this.pointer(event,'move');});return node;}));
  [...corners,{x:(corners[0].x+corners[1].x)/2,y:corners[0].y-24},{x:(corners[2].x+corners[3].x)/2,y:corners[2].y+22}].forEach((p,i)=>{this.buttons[i].style.left=p.x+'px';this.buttons[i].style.top=p.y+'px';});
 }
 private begin(mode:Mode,start?:Point,pointer?:number){
  this.cancel();const context=this.context;if(!context)return;const b=this.bounds(),center={x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2},point=start??{x:b.x1,y:b.y1},g:Gesture={context,mode,start:point,center,pointer,keys:new Set(),change:idle(),lastAngle:Math.atan2(point.y-center.y,point.x-center.x),angle:0,abort:new AbortController()};this.gesture=g;
  const opts={signal:g.abort.signal,capture:true};window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.cancel();}},opts);
  if(pointer===undefined)window.addEventListener('keyup',event=>{if(!g.keys.delete(event.key))return;event.preventDefault();event.stopPropagation();if(!g.keys.size)this.finish();},opts);
  window.addEventListener('blur',()=>this.cancel(),opts);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();},opts);return g;
 }
 private pointer(event:PointerEvent,mode:Mode){
  if(event.button!==0||!this.context)return;event.preventDefault();event.stopPropagation();this.buttons[mode==='move'?5:mode==='rotate'?4:Number((event.currentTarget as HTMLElement).dataset.corner??0)].focus({preventScroll:true});const g=this.begin(mode,this.point(event),event.pointerId);if(!g)return;
  this.element.setPointerCapture(event.pointerId);const opts={signal:g.abort.signal,capture:true};
  this.element.addEventListener('pointermove',event=>{if(event.pointerId!==g.pointer)return;event.preventDefault();event.stopPropagation();const p=this.point(event),change=idle();
   if(mode==='move'){change.dx=p.x-g.start.x;change.dy=p.y-g.start.y;if(event.shiftKey){if(Math.abs(change.dx)>Math.abs(change.dy))change.dy=0;else change.dx=0;}}
   else if(mode==='scale'){const x=g.start.x-g.center.x,y=g.start.y-g.center.y;change.scale=Math.max(.01,Math.min(100,((p.x-g.center.x)*x+(p.y-g.center.y)*y)/(x*x+y*y||1)));}
   else{const angle=Math.atan2(p.y-g.center.y,p.x-g.center.x);let delta=angle-g.lastAngle;if(delta>Math.PI)delta-=2*Math.PI;if(delta< -Math.PI)delta+=2*Math.PI;g.angle+=delta;g.lastAngle=angle;change.rotate=g.angle*180/Math.PI;if(event.shiftKey)change.rotate=Math.round(change.rotate/15)*15;}
   this.preview(g,change);
  },opts);
  this.element.addEventListener('pointerup',event=>{if(event.pointerId===g.pointer){event.preventDefault();event.stopPropagation();this.finish();}},opts);this.element.addEventListener('pointercancel',()=>this.cancel(),opts);this.element.addEventListener('lostpointercapture',()=>this.cancel(),opts);
 }
 private preview(g:Gesture,change:ClipGroupChange){if(this.gesture!==g||this.context?.key!==g.context.key){this.cancel();return;}g.change=change;for(const item of g.context.items)this.drafts.set(item.clip.id,transformClipGroup(item.base,g.center,change));this.paint();}
 private key(event:KeyboardEvent,mode:Mode){
  if(['Delete','Backspace'].includes(event.key)){if(this.gesture){event.preventDefault();event.stopPropagation();}return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;event.preventDefault();event.stopPropagation();if(this.gesture?.pointer!==undefined)return;
  if(this.cancelledKeys.has(event.key)){if(event.repeat)return;this.cancelledKeys.delete(event.key);}
  const g=this.gesture??this.begin(mode);if(!g)return;g.keys.add(event.key);const change={...g.change},sign=['ArrowLeft','ArrowDown'].includes(event.key)?-1:1;
  if(mode==='move'){const step=event.shiftKey?10:1;if(event.key==='ArrowLeft')change.dx-=step;if(event.key==='ArrowRight')change.dx+=step;if(event.key==='ArrowUp')change.dy-=step;if(event.key==='ArrowDown')change.dy+=step;}
  else if(mode==='scale')change.scale*=Math.pow(event.shiftKey?1.1:1.01,sign);else change.rotate+=sign*(event.shiftKey?15:1);this.preview(g,change);
 }
 private release(){const g=this.gesture;this.gesture=undefined;if(g){g.abort.abort();if(g.pointer!==undefined&&this.element.hasPointerCapture(g.pointer))this.element.releasePointerCapture(g.pointer);}return g;}
 cancel(){if(this.gesture)for(const key of this.gesture.keys)this.cancelledKeys.add(key);this.release();this.drafts.clear();if(this.context)this.paint();}
 private finish(){const g=this.release();if(!g)return;const edits=this.context?.key===g.context.key&&changed(g.change)?g.context.items.flatMap(item=>clipGeometryCommands(item.clip,g.context.at,item.base,this.drafts.get(item.clip.id)??item.base)):[];this.drafts.clear();if(edits.length&&!this.commit(edits))this.report('片段组合修改未应用');if(this.context)this.paint();}
 clear(){this.cancel();this.context=undefined;this.element.hidden=true;this.svg.replaceChildren();}
 dispose(){this.clear();this.events.abort();this.element.remove();}
}
