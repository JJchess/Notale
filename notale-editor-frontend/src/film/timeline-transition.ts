import {type FilmDocument,type FilmClip,type FilmCommand,frameSeconds} from '@notale/editor/film';
import {transitionDurationCommands} from './transition-plan';
import {timelineX} from './timeline-view';
import {translateUi as t} from '../i18n/store';

type Options={doc:FilmDocument;clip:FilmClip;zoom:number;locked:boolean;signal:AbortSignal;current:()=>boolean;scroll:()=>number;start:(cancel:()=>void)=>boolean;draft:(commands?:FilmCommand[])=>void;finish:(commands?:FilmCommand[])=>void;execute:(commands:FilmCommand[])=>boolean;select:()=>void;error:(message:string)=>void};
export function timelineTransition(o:Options){
 const transition=o.clip.transitionIn!;
 const names={dissolve:'叠化',wipe:'擦除',push:'推移','dip-black':'渐黑','dip-white':'渐白'};
 const root=document.createElement('div');root.className='film-transition';root.dataset.transitionClip=o.clip.id;root.setAttribute('role','group');root.setAttribute('aria-label',t(names[transition.kind]));
 const center=document.createElement('button');center.className='film-transition-center';center.innerHTML='<svg viewBox="0 0 24 16" aria-hidden="true"><path d="m2 2 20 12M2 14 22 2"/></svg>';center.title=t(names[transition.kind]);center.setAttribute('aria-label',t('转场属性'));center.onpointerdown=e=>e.stopPropagation();center.onclick=e=>{e.stopPropagation();o.select();};root.append(center);
 const hint=document.createElement('output');hint.className='film-transition-duration';hint.hidden=true;root.append(hint);
 const handles:HTMLButtonElement[]=[];
 function paint(duration:number){root.style.left=timelineX(o.clip.at-duration/2,o.zoom)+'px';root.style.width=duration*o.zoom+'px';hint.textContent=`${duration} ${t('帧')} · ${frameSeconds(duration,o.doc.frameRate).toFixed(3)} s`;for(const handle of handles)handle.setAttribute('aria-valuenow',String(duration));}
 for(const edge of ['in','out'] as const){
  const handle=document.createElement('button');handle.className='film-transition-edge '+edge;handle.disabled=o.locked;handle.title=t(edge==='in'?'调整转场左边缘':'调整转场右边缘');handle.setAttribute('aria-label',handle.title);handle.setAttribute('role','slider');handle.setAttribute('aria-valuemin','1');handle.setAttribute('aria-valuemax',String(Math.min(o.clip.duration,o.doc.tracks.filter(track=>track.kind==='media'&&track.clips.some(clip=>clip.id===o.clip.id)).flatMap(track=>track.kind==='media'?track.clips:[]).find(clip=>clip.at+clip.duration===o.clip.at)?.duration??o.clip.duration)));handles.push(handle);root.append(handle);
  handle.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();let stopped=false,commands:FilmCommand[]|undefined;const events=new AbortController(),x=e.clientX,scroll=o.scroll();
   const finish=(commit:boolean)=>{if(stopped)return;stopped=true;events.abort();hint.hidden=true;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);o.finish(commit&&o.current()?commands:undefined);if(!commit)paint(transition.duration);};
   if(!o.start(()=>finish(false)))return;handle.setPointerCapture(e.pointerId);hint.hidden=false;
   o.signal.addEventListener('abort',()=>finish(false),{once:true,signal:events.signal});
   handle.addEventListener('pointermove',move=>{if(move.pointerId!==e.pointerId)return;if(!o.current()){finish(false);return;}try{
    commands=transitionDurationCommands(o.doc,o.clip,transition.duration+(move.clientX-x+o.scroll()-scroll)/o.zoom*(edge==='in'?-2:2));
    const duration=(commands[0] as Extract<FilmCommand,{type:'film.transition.set'}>).transition!.duration;
    if(duration===transition.duration)commands=undefined;o.draft(commands);paint(duration);
   }catch(error){commands=undefined;o.draft();paint(transition.duration);o.error(String(error));}},{signal:events.signal});
   handle.addEventListener('pointerup',()=>finish(true),{signal:events.signal});for(const type of ['pointercancel','lostpointercapture'])handle.addEventListener(type,()=>finish(false),{signal:events.signal});window.addEventListener('blur',()=>finish(false),{signal:events.signal});window.addEventListener('keydown',key=>{if(key.key==='Escape'){key.preventDefault();finish(false);}},{signal:events.signal});
  };
  handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();try{o.execute(transitionDurationCommands(o.doc,o.clip,e.key==='Home'?1:transition.duration+(e.key==='ArrowRight'?1:-1)*(edge==='in'?-1:1)*(e.shiftKey?10:1)));}catch(error){o.error(String(error));}};
 }
 root.onkeydown=e=>{if(e.key==='Delete'&&!o.locked){e.preventDefault();e.stopPropagation();o.execute([{type:'film.transition.set',clipId:o.clip.id,transition:undefined}]);}};
 paint(transition.duration);return root;
}
