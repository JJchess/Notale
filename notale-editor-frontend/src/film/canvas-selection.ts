import {additiveSelection} from './selection-modifiers';
import './canvas-selection.css';

export type CanvasSelectionContext={domain:'clips'|'overlay'|'motale';clipId?:string;ids:readonly string[];scope:string};
export type CanvasSelectionBinding={context:()=>CanvasSelectionContext|undefined;select:(context:CanvasSelectionContext,ids:string[])=>void};
export type CanvasPoint={x:number;y:number};
export type CanvasCandidate={id:string;parent?:string;polygon:readonly CanvasPoint[];locked?:boolean;hidden?:boolean;selectable?:boolean};
export const canvasRect=(x:number,y:number,width:number,height:number):CanvasPoint[]=>[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
export function canvasContains(polygon:readonly CanvasPoint[],point:CanvasPoint){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function canvasSelectionRoots(candidates:readonly CanvasCandidate[],ids:readonly string[]):string[]{
 const byId=new Map(candidates.map(item=>[item.id,item])),chosen=new Set(ids);
 return [...chosen].filter(id=>{const item=byId.get(id);if(!item||item.locked||item.hidden||item.selectable===false||!item.polygon.length)return false;let parent=item.parent;const seen=new Set([id]);while(parent){if(seen.has(parent))return false;seen.add(parent);const ancestor=byId.get(parent);if(ancestor?.locked||chosen.has(parent)&&ancestor&&!ancestor.hidden&&ancestor.selectable!==false)return false;parent=ancestor?.parent;}return true;});
}
export function canvasBoxSelection(candidates:readonly CanvasCandidate[],from:CanvasPoint,to:CanvasPoint,initial:readonly string[]=[]) {
 const left=Math.min(from.x,to.x),right=Math.max(from.x,to.x),top=Math.min(from.y,to.y),bottom=Math.max(from.y,to.y);
 return canvasSelectionRoots(candidates,[...initial,...candidates.filter(item=>!item.hidden&&!item.locked&&item.polygon.length&&item.polygon.every(point=>point.x>=left-.01&&point.x<=right+.01&&point.y>=top-.01&&point.y<=bottom+.01)).map(item=>item.id)]);
}
/** Mount nodes have an affine transform and a centered source rectangle. Fold
 * ancestor CSS transforms into its linear part; its client box supplies origin. */
export function canvasClientMap(node:HTMLElement,width:number,height:number){
 let m=new DOMMatrix(getComputedStyle(node).transform);for(let parent=node.parentElement;parent;parent=parent.parentElement){const next=new DOMMatrix(getComputedStyle(parent).transform);if(!next.is2D)throw Error('当前画布变换不支持框选');m=next.multiply(m);}
 const rect=node.getBoundingClientRect(),det=m.a*m.d-m.b*m.c;if(!m.is2D||Math.abs(det)<1e-10)throw Error('当前画布变换不可逆');
 return (point:CanvasPoint):CanvasPoint=>({x:rect.x+rect.width/2+m.a*(point.x-width/2)+m.c*(point.y-height/2),y:rect.y+rect.height/2+m.b*(point.x-width/2)+m.d*(point.y-height/2)});
}
type Gesture={context:CanvasSelectionContext;key:string;pointer:number;from:CanvasPoint;to:CanvasPoint;initial:readonly string[];additive:boolean;moved:boolean;ended:boolean;candidates?:CanvasCandidate[];controller:AbortController};
type Options={context:()=>CanvasSelectionContext|undefined;candidates:(context:CanvasSelectionContext)=>Promise<CanvasCandidate[]>;pick:(context:CanvasSelectionContext,point:CanvasPoint)=>string|null|undefined;select:CanvasSelectionBinding['select'];report:(message:string)=>void};
export class CanvasSelection {
 private shield:HTMLDivElement;private drawing:SVGSVGElement;private gesture?:Gesture;private events=new AbortController();private disposed=false;private originalTabIndex:string|null;
 constructor(private root:HTMLElement,private options:Options){
  this.originalTabIndex=root.getAttribute('tabindex');if(this.originalTabIndex===null)root.tabIndex=-1;
  this.shield=document.createElement('div');this.shield.className='film-canvas-pick';this.shield.hidden=true;root.append(this.shield);
  this.drawing=document.createElementNS('http://www.w3.org/2000/svg','svg');this.drawing.classList.add('film-canvas-marquee');this.drawing.style.display='none';this.drawing.setAttribute('aria-hidden','true');root.append(this.drawing);
  root.addEventListener('pointerdown',event=>this.down(event),{signal:this.events.signal,capture:true});
 }
 private key(context:CanvasSelectionContext){return JSON.stringify([context.domain,context.clipId,context.scope,context.ids]);}
 private valid(g:Gesture){const context=this.options.context();return !this.disposed&&this.gesture===g&&!!context&&this.key(context)===g.key;}
 update(){const context=this.options.context();this.shield.hidden=context?.domain!=='motale';if(this.gesture&&!this.valid(this.gesture))this.cancel();}
 private down(event:PointerEvent){
  if(event.button!==0||event.defaultPrevented||this.gesture)return;const context=this.options.context();if(!context)return;
  const target=event.target instanceof Element?event.target:undefined,additive=additiveSelection(event),groupBody=context.domain==='clips'&&additive&&target?.closest('.film-group-body');if(target?.closest('button,input,textarea,select,a,[contenteditable=true],.film-motale-handles,.film-clip-handles,.film-mask-handles,.film-crop-handles')||target?.closest('.film-group-handles')&&!groupBody)return;
  const from={x:event.clientX,y:event.clientY},pick=this.options.pick(context,from);
  // Native object hit islands retain their own text/drag/handle gestures.
  if(context.domain==='overlay'&&pick!==null)return;
  event.preventDefault();event.stopImmediatePropagation();this.root.focus({preventScroll:true});
  if(pick){const ids=additive?(context.ids.includes(pick)?context.ids.filter(id=>id!==pick):[...context.ids,pick]):[pick];this.options.select(context,ids);return;}
  const g:Gesture={context:{...context,ids:[...context.ids]},key:this.key(context),pointer:event.pointerId,from,to:from,initial:[...context.ids],additive,moved:false,ended:false,controller:new AbortController()};this.gesture=g;
  this.root.setPointerCapture(event.pointerId);const opts={signal:g.controller.signal,capture:true};
  this.root.addEventListener('pointermove',event=>{if(event.pointerId!==g.pointer||!this.valid(g))return;event.preventDefault();event.stopImmediatePropagation();g.to={x:event.clientX,y:event.clientY};g.moved ||=Math.hypot(g.to.x-g.from.x,g.to.y-g.from.y)>=3;if(g.moved)this.paint(g);},opts);
  this.root.addEventListener('pointerup',event=>{if(event.pointerId!==g.pointer)return;event.preventDefault();event.stopImmediatePropagation();g.ended=true;if(g.candidates)this.finish(g);},opts);
  this.root.addEventListener('pointercancel',()=>this.cancel(),opts);this.root.addEventListener('lostpointercapture',()=>{if(!g.ended)this.cancel();},opts);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.cancel();}},opts);window.addEventListener('blur',()=>this.cancel(),opts);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();},opts);
  void this.options.candidates(context).then(candidates=>{if(!this.valid(g))return;g.candidates=candidates;if(g.ended)this.finish(g);else if(g.moved)this.paint(g);},error=>{if(this.valid(g)){this.cancel();this.options.report(error instanceof Error?error.message:String(error));}});
 }
 private chosen(g:Gesture){return g.moved?canvasBoxSelection(g.candidates??[],g.from,g.to,g.additive?g.initial:[]):g.additive?[...g.initial]:[];}
 private paint(g:Gesture){
  const root=this.root.getBoundingClientRect(),sx=this.root.clientWidth/root.width,sy=this.root.clientHeight/root.height;
  this.drawing.style.display='';this.drawing.setAttribute('viewBox',`0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);
  const polygon=(points:readonly CanvasPoint[],className:string)=>{const node=document.createElementNS('http://www.w3.org/2000/svg','polygon');node.setAttribute('class',className);node.setAttribute('points',points.map(p=>`${(p.x-root.x)*sx},${(p.y-root.y)*sy}`).join(' '));return node;};
  const ids=new Set(this.chosen(g));this.drawing.replaceChildren(polygon(canvasRect(Math.min(g.from.x,g.to.x),Math.min(g.from.y,g.to.y),Math.abs(g.from.x-g.to.x),Math.abs(g.from.y-g.to.y)),'film-canvas-box'),...(g.candidates??[]).filter(item=>ids.has(item.id)).map(item=>polygon(item.polygon,'film-canvas-chosen')));
 }
 private finish(g:Gesture){if(!this.valid(g)){this.cancel();return;}const ids=this.chosen(g);this.cancel();this.options.select(g.context,ids);}
 cancel(){const g=this.gesture;this.gesture=undefined;if(g){g.controller.abort();if(this.root.hasPointerCapture(g.pointer))this.root.releasePointerCapture(g.pointer);}this.drawing.style.display='none';this.drawing.replaceChildren();}
 dispose(){this.disposed=true;this.cancel();this.events.abort();this.shield.remove();this.drawing.remove();if(this.originalTabIndex===null)this.root.removeAttribute('tabindex');}
}
