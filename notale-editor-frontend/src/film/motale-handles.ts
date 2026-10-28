import type {FilmMotaleAuthor} from '@notale/editor/film';
import type {MotaleContext,MotaleBridgeObject} from './motale-bridge.js';
import {translateUi as t} from '../i18n/store.js';
import {additiveSelection} from './selection-modifiers.js';
import {inverseMotalePoint,transformMotalePoint,motaleSelectionRoots,motaleSelectionBounds,motaleSelectionPivot,transformMotaleSelection,type MotalePoint,type MotaleAffine,type MotaleGroupTransform} from './motale-handles-geometry.js';

export type MotaleHandleAuthoring={commit:(clipId:string,author:FilmMotaleAuthor)=>boolean;scope:()=>string};
export type MotaleHandleContext={clipId:string;context:MotaleContext;node:HTMLElement;width:number;height:number;ids:readonly string[]};
type Mode='move'|'scale'|'rotate';
type Gesture={input:MotaleHandleContext;scope:string;key:string;revision:number;author:FilmMotaleAuthor;objects:MotaleBridgeObject[];baseObjects:MotaleBridgeObject[];matrix:MotaleAffine;center:MotalePoint;start:MotalePoint;change:MotaleGroupTransform;mode:Mode;pointer?:number;keys:Set<string>;lastAngle:number;angle:number;draft?:FilmMotaleAuthor;changed:boolean;controller:AbortController};
const idle=():MotaleGroupTransform=>({dx:0,dy:0,scale:1,rotate:0});
const moved=(change:MotaleGroupTransform)=>Math.abs(change.dx)+Math.abs(change.dy)+Math.abs(change.scale-1)+Math.abs(change.rotate)>1e-7;
const svgNS='http://www.w3.org/2000/svg';

/** The host owns handles and transactions; the iframe remains the renderer and
 * object picker. Only public bridge queries and author preview/check are used. */
export class MotaleHandles {
 private element:HTMLDivElement;private svg:SVGSVGElement;private outlines:SVGGElement;private box:SVGPolygonElement;private stem:SVGLineElement;
 private move:HTMLButtonElement;private corners:HTMLButtonElement[];private rotate:HTMLButtonElement;
 private binding?:MotaleHandleAuthoring;private input?:MotaleHandleContext;private gesture?:Gesture;private applying=false;private disposed=false;private listeners=new AbortController();
 private cancelledKeys=new Set<string>();
 constructor(private root:HTMLElement,private report:(message:string)=>void,private select:(input:MotaleHandleContext,point:MotalePoint,shift:boolean)=>void){
  this.element=document.createElement('div');this.element.className='film-motale-handles';this.element.hidden=true;
  this.svg=document.createElementNS(svgNS,'svg');this.svg.setAttribute('aria-hidden','true');
  this.outlines=document.createElementNS(svgNS,'g');this.box=document.createElementNS(svgNS,'polygon');this.box.setAttribute('class','film-motale-group-box');this.stem=document.createElementNS(svgNS,'line');this.stem.setAttribute('class','film-motale-rotate-stem');
  this.svg.append(this.outlines,this.box,this.stem);
  const button=(mode:Mode,label:string,corner?:number)=>{const node=document.createElement('button');node.type='button';node.className='film-motale-handle film-motale-'+mode;node.dataset.motaleHandle=mode;if(corner!==undefined)node.dataset.corner=String(corner);node.setAttribute('aria-label',t(label));node.title=t(label);node.addEventListener('pointerdown',event=>this.pointerDown(event,mode),{signal:this.listeners.signal});node.addEventListener('keydown',event=>this.keyDown(event,mode),{signal:this.listeners.signal});node.addEventListener('blur',()=>{if(this.gesture?.pointer===undefined)this.cancel();},{signal:this.listeners.signal});return node;};
  this.move=button('move','移动所选场景对象');this.move.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>';
  this.corners=[0,1,2,3].map(index=>button('scale','等比缩放所选场景对象',index));this.rotate=button('rotate','旋转所选场景对象');
  this.element.append(this.svg,this.move,...this.corners,this.rotate);root.append(this.element);
  window.addEventListener('keyup',event=>{if(this.cancelledKeys.delete(event.key)){event.preventDefault();event.stopPropagation();}},{signal:this.listeners.signal,capture:true});
 }
 bind(binding?:MotaleHandleAuthoring){this.cancel();this.binding=binding;if(!binding)this.update();}
 private identity(input:MotaleHandleContext){return JSON.stringify([input.clipId,input.context.hello.film,input.context.act.id,input.context.act.revision,input.context.time,[...input.ids].sort()]);}
 private valid(g:Gesture){const now=this.input;return !!this.binding&&!!now&&this.binding.scope()===g.scope&&this.identity(now)===g.key&&now.context.instance===g.input.context.instance&&now.node===g.input.node&&now.node.isConnected&&!now.node.hidden&&!now.context.error&&now.context.bridge.mode()==='author';}
 update(input?:MotaleHandleContext){
  this.input=input;
  const gesture=this.gesture;
  if(gesture&&!this.applying){try{if(!this.valid(gesture)||input!.context.bridge.state().authorRevision!==gesture.revision)this.cancel();}catch{this.cancel();}}
  if(!this.binding||!input||input.context.error||!input.ids.length||input.context.bridge.mode()!=='author'){this.element.hidden=true;return;}
  try{this.paint();}catch{this.element.hidden=true;}
 }
 focus(){if(!this.element.hidden)this.move.focus({preventScroll:true});}
 private matrix(input:MotaleHandleContext):MotaleAffine{
  const transform=new DOMMatrix(getComputedStyle(input.node).transform),box=input.node.getBoundingClientRect(),root=this.root.getBoundingClientRect(),stage=input.context.hello.stage;
  const a=transform.a*input.width/stage.width,b=transform.b*input.width/stage.width,c=transform.c*input.height/stage.height,d=transform.d*input.height/stage.height;
  return{a,b,c,d,e:box.x+box.width/2-root.x-this.root.clientLeft-a*stage.width/2-c*stage.height/2,f:box.y+box.height/2-root.y-this.root.clientTop-b*stage.width/2-d*stage.height/2};
 }
 private point(event:{clientX:number;clientY:number},matrix:MotaleAffine){const root=this.root.getBoundingClientRect();return inverseMotalePoint(matrix,{x:event.clientX-root.x-this.root.clientLeft,y:event.clientY-root.y-this.root.clientTop});}
 private paint(){
  const input=this.input!,context=input.context,objects=context.bridge.objects(context.act.id,context.time,{parameters:'film'}),selected=motaleSelectionRoots(objects,input.ids),bounds=motaleSelectionBounds(selected);
  if(!bounds){this.element.hidden=true;return;}this.element.hidden=false;
  const matrix=this.matrix(input),corners=[{x:bounds[0],y:bounds[1]},{x:bounds[2],y:bounds[1]},{x:bounds[2],y:bounds[3]},{x:bounds[0],y:bounds[3]}].map(point=>transformMotalePoint(matrix,point));
  this.svg.setAttribute('viewBox',`0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);
  this.box.setAttribute('points',corners.map(point=>`${point.x},${point.y}`).join(' '));
  // Individual selected bounds remain draggable; the group's empty gaps pass
  // through so another object can still be selected through the iframe.
  const retained=new Set(selected.map(object=>object.id));
  for(const node of [...this.outlines.children])if(!retained.has((node as SVGElement).dataset.motaleMove!))node.remove();
  for(const object of selected){const b=object.bounds!;let polygon=[...this.outlines.children].find(node=>(node as SVGElement).dataset.motaleMove===object.id) as SVGPolygonElement|undefined;
   if(!polygon){polygon=document.createElementNS(svgNS,'polygon');polygon.setAttribute('class','film-motale-object-hit');polygon.dataset.motaleMove=object.id;polygon.addEventListener('pointerdown',event=>this.pointerDown(event,'move'));this.outlines.append(polygon);}
   polygon.setAttribute('points',[{x:b[0],y:b[1]},{x:b[2],y:b[1]},{x:b[2],y:b[3]},{x:b[0],y:b[3]}].map(point=>{const p=transformMotalePoint(matrix,point);return`${p.x},${p.y}`;}).join(' '));
  }
  const place=(node:HTMLElement,point:MotalePoint)=>{node.style.left=point.x+'px';node.style.top=point.y+'px';};this.corners.forEach((node,index)=>place(node,corners[index]));
  const top={x:(corners[0].x+corners[1].x)/2,y:(corners[0].y+corners[1].y)/2},bottom={x:(corners[2].x+corners[3].x)/2,y:(corners[2].y+corners[3].y)/2},dx=top.x-bottom.x,dy=top.y-bottom.y,length=Math.hypot(dx,dy)||1,rotation={x:top.x+dx/length*28,y:top.y+dy/length*28};
  place(this.rotate,rotation);place(this.move,{x:bottom.x-dx/length*22,y:bottom.y-dy/length*22});
  this.stem.setAttribute('x1',String(top.x));this.stem.setAttribute('y1',String(top.y));this.stem.setAttribute('x2',String(rotation.x));this.stem.setAttribute('y2',String(rotation.y));
 }
 private begin(mode:Mode,point?:MotalePoint,pointer?:number):Gesture|undefined{
  this.cancel();const input=this.input;if(!this.binding||!input||this.element.hidden)return;
  const context=input.context;if(context.error||context.bridge.mode()!=='author')return;
  const v1=context.hello.protocol!=='motale-bridge/0',objects=context.bridge.objects(context.act.id,context.time,{all:!v1,parameters:'film'}),baseObjects=v1?[]:context.bridge.objects(context.act.id,context.time,{all:true,author:false,parameters:'film'}),bounds=motaleSelectionBounds(motaleSelectionRoots(objects,input.ids));if(!bounds)return;
  const author=context.bridge.author.get()??{schema:context.hello.authorSchema,acts:{}};author.film=context.hello.film;author.acts[context.act.id]??={};if(context.act.revision)author.acts[context.act.id].revision=context.act.revision;
  const center=motaleSelectionPivot(motaleSelectionRoots(objects,input.ids))!,start=point??{x:bounds[2],y:bounds[3]},controller=new AbortController();
  const g:Gesture={input,scope:this.binding.scope(),key:this.identity(input),revision:context.bridge.state().authorRevision,author,objects,baseObjects,matrix:this.matrix(input),center,start,change:idle(),mode,pointer,keys:new Set(),lastAngle:Math.atan2(start.y-center.y,start.x-center.x),angle:0,changed:false,controller};this.gesture=g;
  const opts={signal:controller.signal,capture:true};
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.cancel();}},opts);
  if(pointer===undefined)window.addEventListener('keyup',event=>{if(!g.keys.delete(event.key))return;event.preventDefault();event.stopPropagation();if(!g.keys.size)this.finish();},opts);
  window.addEventListener('blur',()=>this.cancel(),opts);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();},opts);
  return g;
 }
 private pointerDown(event:PointerEvent,mode:Mode){
  if(event.button!==0||!this.input)return;event.preventDefault();event.stopPropagation();
  try{
   const point=this.point(event,this.matrix(this.input));
   if(additiveSelection(event)&&mode==='move'&&event.currentTarget instanceof SVGElement){this.cancel();this.select(this.input,point,true);return;}
   const button=event.currentTarget instanceof HTMLButtonElement?event.currentTarget:this.move;button.focus({preventScroll:true});
   const g=this.begin(mode,point,event.pointerId);if(!g)return;this.element.setPointerCapture(event.pointerId);
   const opts={signal:g.controller.signal,capture:true};
   this.element.addEventListener('pointermove',event=>{if(event.pointerId!==g.pointer)return;event.preventDefault();event.stopPropagation();this.pointerMove(event,g);},opts);
   this.element.addEventListener('pointerup',event=>{if(event.pointerId!==g.pointer)return;event.preventDefault();event.stopPropagation();this.finish();},opts);
   this.element.addEventListener('pointercancel',()=>this.cancel(),opts);this.element.addEventListener('lostpointercapture',()=>this.cancel(),opts);
  }catch(error){this.cancel();this.report(error instanceof Error?error.message:String(error));}
 }
 private pointerMove(event:PointerEvent,g:Gesture){
  try{
   if(g.pointer!==undefined&&!g.changed&&Math.hypot(event.clientX-this.root.getBoundingClientRect().left-transformMotalePoint(g.matrix,g.start).x,event.clientY-this.root.getBoundingClientRect().top-transformMotalePoint(g.matrix,g.start).y)<3)return;
   const point=this.point(event,g.matrix),change=idle();
   if(g.mode==='move'){change.dx=point.x-g.start.x;change.dy=point.y-g.start.y;if(event.shiftKey){if(Math.abs(change.dx)>Math.abs(change.dy))change.dy=0;else change.dx=0;}}
   if(g.mode==='scale'){const x=g.start.x-g.center.x,y=g.start.y-g.center.y;change.scale=Math.max(.01,Math.min(100,((point.x-g.center.x)*x+(point.y-g.center.y)*y)/(x*x+y*y||1)));}
   if(g.mode==='rotate'){const angle=Math.atan2(point.y-g.center.y,point.x-g.center.x);let delta=angle-g.lastAngle;if(delta>Math.PI)delta-=2*Math.PI;if(delta< -Math.PI)delta+=2*Math.PI;g.angle+=delta;g.lastAngle=angle;change.rotate=g.angle*180/Math.PI;if(event.shiftKey)change.rotate=Math.round(change.rotate/15)*15;}
   this.preview(change);
  }catch(error){this.cancel();this.report(error instanceof Error?error.message:String(error));}
 }
 private keyDown(event:KeyboardEvent,mode:Mode){
  if(['Delete','Backspace'].includes(event.key)){if(this.gesture){event.preventDefault();event.stopPropagation();this.cancel();}return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
  event.preventDefault();event.stopPropagation();
  if(this.cancelledKeys.has(event.key)){if(event.repeat)return;this.cancelledKeys.delete(event.key);}
  try{
   if(this.gesture?.pointer!==undefined)return;
   const g=this.gesture??this.begin(mode);if(!g)return;g.keys.add(event.key);
   const sign=['ArrowLeft','ArrowDown'].includes(event.key)?-1:1,change={...g.change};
   if(mode==='move'){const step=event.shiftKey?10:1;if(event.key==='ArrowLeft')change.dx-=step;if(event.key==='ArrowRight')change.dx+=step;if(event.key==='ArrowUp')change.dy-=step;if(event.key==='ArrowDown')change.dy+=step;}
   else if(mode==='scale')change.scale*=Math.pow(event.shiftKey?1.1:1.01,sign);
   else change.rotate+=sign*(event.shiftKey?15:1);
   this.preview(change);
  }catch(error){this.cancel();this.report(error instanceof Error?error.message:String(error));}
 }
 private preview(change:MotaleGroupTransform){
  const g=this.gesture;if(!g)return;if(!this.valid(g)||g.input.context.bridge.state().authorRevision!==g.revision){this.cancel();return;}
  const context=g.input.context,draft=transformMotaleSelection(g.author,context.act.id,context.time,g.objects,g.input.ids,change,g.baseObjects),problems=context.bridge.author.check(draft);
  if(problems.length)throw Error(problems.map(problem=>problem.message).join('；'));
  g.change=change;g.changed=moved(change);g.draft=draft;this.applying=true;
  try{g.revision=context.bridge.author.preview(draft).revision;}finally{this.applying=false;}
  this.paint();
 }
 private release(g:Gesture){this.gesture=undefined;g.controller.abort();if(g.pointer!==undefined&&this.element.hasPointerCapture(g.pointer))this.element.releasePointerCapture(g.pointer);}
 cancel(){const g=this.gesture;if(!g)return;for(const key of g.keys)this.cancelledKeys.add(key);this.release(g);try{if(g.input.context.bridge.state().authorRevision===g.revision)g.input.context.bridge.author.cancelPreview();}catch{} }
 private finish(){
  const g=this.gesture;if(!g)return;
  try{
   if(!this.valid(g)||g.input.context.bridge.state().authorRevision!==g.revision){this.cancel();return;}
   this.release(g);g.input.context.bridge.author.cancelPreview();
   if(g.changed&&g.draft&&!this.binding!.commit(g.input.clipId,g.draft))throw Error('场景修改未保存');
  }catch(error){this.cancel();this.report(error instanceof Error?error.message:String(error));}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.cancel();this.listeners.abort();this.element.remove();this.input=undefined;this.binding=undefined;}
}
