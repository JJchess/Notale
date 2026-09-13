'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import type {AnimationListModel,AnimationRow} from '../state/animation-list';
export function AnimationTiming({row,model}:{row:AnimationRow;model:AnimationListModel}){
 const track=useRef<HTMLButtonElement>(null),bar=useRef<HTMLSpanElement>(null);
 const [preview,setPreview]=useState({delay:row.animation.delay,duration:row.animation.duration}),[busy,setBusy]=useState(false);
 const owner=useRef<object>({}),running=useRef(false),suppress=useRef(false);
 const drag=useRef<{pointer:number;x:number;width:number;resize:boolean;moved:boolean;value:number}|undefined>(undefined);
 const original=row.animation;
 function release(){const pointer=drag.current?.pointer;drag.current=undefined;if(pointer!==undefined&&track.current?.hasPointerCapture(pointer))track.current.releasePointerCapture(pointer);}
 function cancel(){release();setPreview({delay:original.delay,duration:original.duration});}
 useLayoutEffect(()=>{const token={};owner.current=token;running.current=false;setBusy(false);setPreview({delay:original.delay,duration:original.duration});return()=>{release();if(owner.current===token)owner.current={};};},[row.id,model.scope]);
 async function save(field:'delay'|'duration',value:number){if(value===original[field]||running.current||!model.current())return;const token=owner.current;running.current=true;setBusy(true);try{await model.commit({...original,[field]:value});}catch(error){if(owner.current===token){setPreview({delay:original.delay,duration:original.duration});model.error(error);}}finally{if(owner.current===token){running.current=false;setBusy(false);}}}
 return <button ref={track} className="animation-track" data-edit-animation={row.id} data-extent={row.extent} aria-busy={busy||undefined} aria-label={`编辑${row.label}的动画`} aria-description="拖动调整延迟，拖动条末端调整时长。左右键调整延迟，Shift 加左右键调整时长；Alt 精调，Esc 取消拖动。" title={`延迟 ${preview.delay} ms · 时长 ${preview.duration} ms`}
 onClick={event=>{if(suppress.current){suppress.current=false;event.preventDefault();event.stopPropagation();return;}if(model.current())void Promise.resolve().then(()=>{if(model.current())model.edit(row.id);}).catch(model.error);}}
 onPointerDown={event=>{if(event.button!==0||running.current||!model.current())return;suppress.current=false;const rect=bar.current!.getBoundingClientRect(),resize=event.clientX>=rect.right-9&&event.clientX<=rect.right+4;drag.current={pointer:event.pointerId,x:event.clientX,width:event.currentTarget.clientWidth,resize,moved:false,value:original[resize?'duration':'delay']};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});}}
 onPointerMove={event=>{const current=drag.current;if(!current||current.pointer!==event.pointerId)return;if(!model.current()){cancel();return;}if(Math.abs(event.clientX-current.x)<3&&!current.moved)return;current.moved=true;const field=current.resize?'duration':'delay',increment=event.altKey?10:50;current.value=Math.max(0,Math.min(60000,Math.round((original[field]+(event.clientX-current.x)/Math.max(1,current.width)*row.extent/(current.resize?(original.repeat??1)*(original.autoReverse?2:1):1))/increment)*increment));setPreview({delay:field==='delay'?current.value:original.delay,duration:field==='duration'?current.value:original.duration});event.preventDefault();}}
 onPointerUp={event=>{const current=drag.current;if(!current||current.pointer!==event.pointerId)return;release();if(current.moved){suppress.current=true;void save(current.resize?'duration':'delay',current.value);}}}
 onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
 onKeyDown={event=>{if(event.key==='Escape'&&drag.current){suppress.current=true;cancel();event.preventDefault();event.stopPropagation();return;}if(!['ArrowLeft','ArrowRight'].includes(event.key)||running.current)return;event.preventDefault();event.stopPropagation();const field=event.shiftKey?'duration':'delay',value=Math.max(0,Math.min(60000,original[field]+(event.key==='ArrowRight'?1:-1)*(event.altKey?10:50)));void save(field,value);}}
 ><span ref={bar} style={{left:`${(row.start+preview.delay-original.delay)/row.extent*100}%`,width:`${preview.duration*(original.repeat??1)*(original.autoReverse?2:1)/row.extent*100}%`}}><i aria-hidden="true"/></span></button>;
}
