import {propertyLabels} from './authoring-properties';
import {translateUi as filmText} from '../i18n/store';
import {timelineX} from './timeline-view';
import {clipSourceTime,type FilmRate} from '@notale/editor/film';
import {motaleKeyFrames,isMotaleKeys,editMotaleKey,motalePropertyLabels,type MotaleProperty} from './motale-keyframes';
import type {FilmClip,FilmCommand,FilmProperty,FilmMaskProperty,FilmKeyframe,FilmStyleKeyframe} from '@notale/editor/film';
type Key=FilmKeyframe|FilmStyleKeyframe;
type Lane={name:string;keys:Key[];locked:boolean;put:(key:Key)=>FilmCommand;remove:(frame:number)=>FilmCommand;select:()=>void};
/** Expanded tracks use the same frame clock and commands as the property inspector. */
export function keyframeTracks(o:{motale?:{acts:readonly {id:string;start:number;end:number}[];rate:FilmRate;select:(actId:string,objectId:string,sourceTime:number)=>void};clip:FilmClip;zoom:number;locked:boolean;signal:AbortSignal;current:()=>boolean;seek:(at:number)=>void;select:(target?:string,property?:string)=>void;execute:(commands:FilmCommand[])=>boolean;error:(message:string)=>void}){
 const clip=o.clip,lanes:Lane[]=[],root=document.createElement('div');root.className='film-keyframe-tracks';root.setAttribute('aria-label',filmText('对象动画')+' · '+clip.title);
 for(const [property,keys]of Object.entries(clip.appearance?.keyframes??{}))lanes.push({name:filmText(propertyLabels[property]??property),keys,locked:o.locked,put:key=>({type:'film.keyframe.put',clipId:clip.id,property:property as FilmProperty,keyframe:key as FilmKeyframe}),remove:frame=>({type:'film.keyframe.delete',clipId:clip.id,property:property as FilmProperty,frame}),select:()=>o.select(undefined,property)});
 for(const [target,style]of Object.entries(clip.objects??{}))for(const [property,keys]of Object.entries(style.keyframes??{}))lanes.push({name:target+' · '+filmText(propertyLabels[property]??property),keys,locked:o.locked||!!style.locked,put:key=>({type:'film.object.key.put',clipId:clip.id,target,property,keyframe:key as FilmStyleKeyframe}),remove:frame=>({type:'film.object.key.delete',clipId:clip.id,target,property,frame}),select:()=>o.select(target,property)});
 for(const mask of clip.masks??[])for(const [property,keys]of Object.entries(mask.keyframes??{}))lanes.push({name:filmText('遮罩')+' · '+filmText(propertyLabels[property]??property),keys,locked:o.locked,put:key=>({type:'film.mask.key.put',clipId:clip.id,maskId:mask.id,property:property as FilmMaskProperty,keyframe:key as FilmKeyframe}),remove:frame=>({type:'film.mask.key.delete',clipId:clip.id,maskId:mask.id,property:property as FilmMaskProperty,frame}),select:()=>o.select()});
 const globalFrame=(frame:number)=>clip.at+frame-(clip.animationOffset??0);
 for(const lane of lanes){const row=document.createElement('div');row.className='film-keyframe-row';const label=document.createElement('button');label.className='film-keyframe-label';label.textContent=lane.name;label.title=lane.name;label.onclick=lane.select;row.append(label);
  for(const key of lane.keys){const at=globalFrame(key.frame);if(at<clip.at||at>clip.at+clip.duration)continue;
   const node=document.createElement('button');node.className='film-keyframe';node.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 9-9 9-9-9Z"/></svg>';node.style.left=timelineX(at,o.zoom)+'px';node.setAttribute('aria-label',lane.name+' · '+key.frame+' '+filmText('帧'));node.title=node.getAttribute('aria-label')!;
   const move=(frame:number)=>{if(frame===key.frame||lane.locked||!o.current())return;if(lane.keys.some(k=>k.frame===frame)){o.error('该位置已有关键帧');return;}o.execute([lane.remove(key.frame),lane.put({...key,frame})]);};
   node.onclick=()=>{lane.select();o.seek(at);};
   node.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(lane.locked||!o.current())return;if(e.key==='Delete'||e.key==='Backspace')o.execute([lane.remove(key.frame)]);else move(key.frame+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));};
   node.onpointerdown=e=>{if(e.button!==0||lane.locked)return;e.preventDefault();e.stopPropagation();node.setPointerCapture(e.pointerId);const x=e.clientX,scroll=root.closest('.film-timeline-scroll')!,startScroll=scroll.scrollLeft,events=new AbortController();let frame=key.frame,moved=false;
    const finish=(commit:boolean)=>{events.abort();if(node.hasPointerCapture(e.pointerId))node.releasePointerCapture(e.pointerId);node.style.left=timelineX(at,o.zoom)+'px';if(commit&&moved){node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();},{once:true,capture:true});move(frame);}};
    o.signal.addEventListener('abort',()=>finish(false),{once:true,signal:events.signal});
    node.addEventListener('pointermove',event=>{if(event.pointerId!==e.pointerId)return;const delta=event.clientX-x+scroll.scrollLeft-startScroll;moved||=Math.abs(delta)>3;frame=key.frame+Math.round(delta/o.zoom);frame=Math.max(clip.animationOffset??0,Math.min((clip.animationOffset??0)+clip.duration,frame));node.style.left=timelineX(globalFrame(frame),o.zoom)+'px';},{signal:events.signal});
    node.addEventListener('pointerup',()=>finish(true),{signal:events.signal});node.addEventListener('pointercancel',()=>finish(false),{signal:events.signal});window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish(false);}},{signal:events.signal});
   };row.append(node);
  }root.append(row);
 }
 if(o.motale&&clip.motale){const info=o.motale;
  for(const [actId,act]of Object.entries(clip.motale.acts)){
   const meta=info.acts.find(act=>act.id===actId);if(!meta)continue;
   for(const [objectId,props]of Object.entries(act.objects??{}))for(const [name,value]of Object.entries(props)){
    if(!isMotaleKeys(value))continue;const property=name as MotaleProperty,row=document.createElement('div');row.className='film-keyframe-row';row.dataset.motaleAct=actId;row.dataset.motaleObject=objectId;row.dataset.motaleProperty=property;
    const label=document.createElement('button'),title=objectId+' · '+filmText(motalePropertyLabels[property]);label.className='film-keyframe-label';label.textContent=title;label.title=actId+' · '+title;label.onclick=()=>{const key=value.keys[0];if(key)info.select(actId,objectId,meta.start+key[0]);};row.append(label);
    for(const key of value.keys)for(const local of motaleKeyFrames(clip,info.rate,meta.start+key[0])){
     const at=clip.at+local,node=document.createElement('button');node.className='film-keyframe';node.dataset.motaleTime=String(key[0]);node.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 9-9 9-9-9Z"/></svg>';node.style.left=timelineX(at,o.zoom)+'px';node.setAttribute('aria-label',title+' · '+key[0]+' '+filmText('源秒'));node.title=node.getAttribute('aria-label')!;
     const change=(time:number|null)=>{if(o.locked||!o.current()||!root.isConnected)return;if(time!==null&&Math.abs(time-key[0])<1e-7)return;try{if(time!==null&&(time<0||time>meta.end-meta.start))throw Error('关键帧不能移出当前幕');const author=structuredClone(clip.motale!);editMotaleKey(author.acts[actId].objects![objectId],property,key[0],time===null?null:{time});o.execute([{type:'film.motale.author',clipId:clip.id,author}]);}catch(error){o.error(error instanceof Error?error.message:String(error));}};
     const move=(frame:number)=>change(clipSourceTime(clip,Math.max(0,Math.min(clip.duration-1,frame)),info.rate)-meta.start);
     node.onclick=()=>{info.select(actId,objectId,meta.start+key[0]);o.seek(clip.at+Math.max(0,Math.min(clip.duration-1,Math.round(local))));};
     node.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Delete'||e.key==='Backspace')change(null);else move(Math.round(local)+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));};
     node.onpointerdown=e=>{if(e.button!==0||o.locked||!o.current())return;e.preventDefault();e.stopPropagation();node.setPointerCapture(e.pointerId);const scroll=root.closest('.film-timeline-scroll')!,startScroll=scroll.scrollLeft,x=e.clientX,events=new AbortController();let next=local,moved=false,finished=false;
      const finish=(commit:boolean)=>{if(finished)return;finished=true;events.abort();if(node.hasPointerCapture(e.pointerId))node.releasePointerCapture(e.pointerId);node.style.left=timelineX(at,o.zoom)+'px';if(commit&&moved){node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();},{once:true,capture:true});move(next);}};
      o.signal.addEventListener('abort',()=>finish(false),{once:true,signal:events.signal});
      node.addEventListener('pointermove',event=>{if(event.pointerId!==e.pointerId)return;const delta=event.clientX-x+scroll.scrollLeft-startScroll;moved||=Math.abs(delta)>3;next=Math.max(0,Math.min(clip.duration-1,Math.round(local+delta/o.zoom)));node.style.left=timelineX(clip.at+next,o.zoom)+'px';},{signal:events.signal});
      node.addEventListener('pointerup',()=>finish(true),{signal:events.signal});node.addEventListener('pointercancel',()=>finish(false),{signal:events.signal});node.addEventListener('lostpointercapture',()=>finish(false),{signal:events.signal});window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);}},{signal:events.signal,capture:true});
     };row.append(node);
    }if(row.childElementCount>1)root.append(row);
   }
  }
 }
 return root;
}
