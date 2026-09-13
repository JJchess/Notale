import {stageBounds} from './stage-bounds.js';
import Moveable from 'moveable';
import { affineGeometry, type Geometry } from '../domain/affine.js';
import { snapTranslation, snapResize, type SnapRect, type SnapLine, type SnapOptions, type ResizeHandle } from '../domain/snapping.js';
import { textBox, beginBoxResize, previewBoxResize, type BoxGesture } from './text-box.js';

type Rect = SnapRect & { id?: string; geometry?: Geometry };
type NodeState = { id: string; style: string | null };
export function moveableGestures(options: {
  width: number; height: number;
  capture: () => Rect[]; get: (id: string) => HTMLElement | null;
  locked: (el: Element) => boolean; neighbors: () => SnapRect[];
  snapping: () => Pick<SnapOptions,'enabled'|'grid'|'guides'>;
  start: () => void; guides: (lines: SnapLine[]) => void;
  active?: (value:boolean)=>void;
  commit: (before: NodeState[], after: NodeState[]) => void;
}) {
  const container=document.createElement('div');container.dataset.notaleHandles='';
  container.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const style=document.createElement('style');
  style.textContent='[data-notale-handles] .moveable-control,[data-notale-handles] .moveable-area,[data-notale-handles] .moveable-line[data-direction]{pointer-events:auto}';
  container.append(style);document.documentElement.append(container);
  const moveable=new (Moveable as unknown as new (container:HTMLElement,options:object)=>any)(container,{target:[],draggable:true,scalable:true,resizable:false,rotatable:true,origin:false,checkInput:true,preventDefault:true,stopPropagation:true,rootContainer:document.documentElement,hideDefaultLines:false});
  let enabled=false,reflow=true,zoom=1,raf=0,starting=false;
  type Gesture={kind:string;x:number;y:number;rects:Rect[];before:NodeState[];neighbors:SnapRect[];box:SnapRect;handle:ResizeHandle;anchor:[number,number];text?:BoxGesture;last?:any;moved:boolean};
  let gesture:Gesture|undefined;
  function nodes(){
    const rects=options.capture().filter(r=>r.id&&r.geometry&&options.get(r.id));
    return rects.some(r=>options.locked(options.get(r.id!)!))?[]:rects;
  }
  function refresh() {
    if(gesture||starting)return;
    const targets=enabled?nodes().map(r=>options.get(r.id!)!):[];
    const current=Array.isArray(moveable.target)?moveable.target:[];
    if(targets.length!==current.length||targets.some((el,i)=>el!==current[i]))moveable.target=targets;
    const text=targets.length===1&&reflow&&textBox(targets[0]);
    if(moveable.resizable!==text)moveable.resizable=text;
    if(moveable.scalable!==!text)moveable.scalable=!text;
    if(moveable.zoom!==zoom)moveable.zoom=zoom;
    moveable.forceUpdate();moveable.updateRect();
  }
  function restore(before:NodeState[]) { for(const state of before){const el=options.get(state.id);if(!el)continue;if(state.style===null)el.removeAttribute('style');else el.setAttribute('style',state.style);} }
  function cancel(){if(!gesture)return;cancelAnimationFrame(raf);raf=0;const g=gesture;gesture=undefined;options.active?.(false);moveable.stopDrag();restore(g.before);options.guides([]);refresh();}
  function begin(kind:string,event:any) {
    if(!enabled)return false;
    starting=true;try{options.start();}finally{starting=false;}const rects=nodes();if(!rects.length)return false;
    const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
    const box={x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};
    const direction=event.direction??[1,1];
    const handle=((direction[1]<0?'n':direction[1]>0?'s':'')+(direction[0]<0?'w':direction[0]>0?'e':'')) as ResizeHandle;
    gesture={kind,x:event.clientX,y:event.clientY,rects,before:rects.map(r=>({id:r.id!,style:options.get(r.id!)!.getAttribute('style')})),neighbors:options.neighbors(),box,handle,anchor:[direction[0]<0?x+box.width:direction[0]>0?x:x+box.width/2,direction[1]<0?y+box.height:direction[1]>0?y:y+box.height/2],moved:false};
    options.active?.(true);
    if(kind==='resize'&&rects.length===1)gesture.text=beginBoxResize(options.get(rects[0].id!)!,handle);
    return true;
  }
  function paint(event:any) {
    const g=gesture;if(!g)return;
    const input=event.inputEvent??{};
    let dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(Math.hypot(dx,dy)<3&&!g.moved)return;
    g.moved=true;
    const stage=stageBounds(options.width,options.height),scale=stage.width/options.width;
    dx/=scale;dy/=scale;
    const snap={...options.snapping(),width:options.width,height:options.height,tolerance:6*zoom/scale,enabled:options.snapping().enabled!==false&&!input.ctrlKey&&!input.metaKey};
    if(g.text){
      const result=previewBoxResize(g.text,event.clientX-g.x,event.clientY-g.y,!!input.altKey,!!input.shiftKey,scale,{stageX:stage.x,stageY:stage.y,neighbors:g.neighbors,options:{...snap,enabled:options.snapping().enabled!==false&&!input.ctrlKey&&!input.metaKey}});
      options.guides(result.lines);return;
    }
    let world=[1,0,0,1],tx=dx,ty=dy;
    if(g.kind==='drag'){
      if(input.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
      const result=snapTranslation(g.rects,g.neighbors,dx,dy,{...snap,constrain:!!input.shiftKey});tx=result.dx;ty=result.dy;options.guides(result.lines);
    } else if(g.kind==='rotate') {
      const anchor:[number,number]=[g.box.x+g.box.width/2,g.box.y+g.box.height/2];g.anchor=anchor;
      const px=stage.x+anchor[0]*scale,py=stage.y+anchor[1]*scale;
      let a=Math.atan2(event.clientY-py,event.clientX-px)-Math.atan2(g.y-py,g.x-px);
      if(input.shiftKey)a=Math.round(a/(Math.PI/12))*Math.PI/12;
      world=[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a)];options.guides([]);
    } else {
      const result=snapResize(g.box,g.handle,g.neighbors,dx,dy,{...snap,constrain:!!input.shiftKey,centered:!!input.altKey,enabled:options.snapping().enabled!==false&&!input.ctrlKey&&!input.metaKey});
      world=[result.factorX,0,0,result.factorY];g.anchor=result.anchor;options.guides(result.lines);
    }
    for(const r of g.rects){
      if(g.kind!=='drag'){const x=r.x+r.width/2-g.anchor[0],y=r.y+r.height/2-g.anchor[1];tx=world[0]*x+world[2]*y-x;ty=world[1]*x+world[3]*y-y;}
      const matrix=affineGeometry(r.geometry!,world,tx,ty);if(!matrix)continue;
      const el=options.get(r.id!)!;el.style.transform=`matrix(${matrix.join(',')})`;el.style.translate=el.style.rotate=el.style.scale='none';
    }
  }
  function update(event:any){if(!gesture)return;gesture.last=event;if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(gesture?.last)paint(gesture.last);});}
  function end(event:any){const g=gesture;if(!g)return;cancelAnimationFrame(raf);raf=0;if(g.last)paint(g.last);gesture=undefined;options.guides([]);
    if(g.moved)options.commit(g.before,g.before.map(s=>({id:s.id,style:options.get(s.id)!.getAttribute('style')})));
    options.active?.(false);refresh();
  }
  for(const kind of ['drag','scale','resize','rotate']) {
    for(const group of ['', 'Group']) {
      (moveable as any).on(kind+group+'Start',(e:any)=>{if(!begin(kind,e))e.stop();});
      (moveable as any).on(kind+group,update);
      (moveable as any).on(kind+group+'End',end);
    }
  }
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture){e.preventDefault();e.stopImmediatePropagation();cancel();}},true);
  window.addEventListener('blur',cancel);
  window.addEventListener('pointercancel',cancel,true);
  return {
    refresh(value:boolean){enabled=value;refresh();},
    textReflow(value:boolean){reflow=value;refresh();},
    camera(scale:number){zoom=1/Math.max(.01,scale);refresh();},
    dragStart(event:MouseEvent){if(enabled&&!gesture){refresh();moveable.dragStart(event);}},
    cancel,
    active:()=>!!gesture,
  };
}
