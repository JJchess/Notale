import type {FilmClip,FilmDocument,FilmRate,FilmSource,FilmCommand} from '@notale/editor/film';
import {motaleKeyFrames} from './motale-keyframes';
import './rhythm.css';
type Rhythm=NonNullable<FilmSource['rhythm']>;
const cache=new WeakMap<FilmClip,{key:string;points:number[]}>();
/** All inverse solutions survive reverse/ramp/repeat maps; a hold contributes once. */
export function rhythmFrames(clip:FilmClip,rate:FilmRate,rhythm:Rhythm):number[]{
 const key=JSON.stringify([rate,rhythm.fingerprint,rhythm.beats.length,rhythm.onsets.length,clip.duration,clip.in,clip.animationOffset,clip.timing]);const old=cache.get(clip);if(old?.key===key)return old.points;
 const points=[...new Set((rhythm.beats.length?rhythm.beats:rhythm.onsets).flatMap(time=>motaleKeyFrames(clip,rate,time).map(Math.round)).filter(frame=>frame>=0&&frame<clip.duration))].sort((a,b)=>a-b);cache.set(clip,{key,points});return points;
}
export function rhythmSnapPoints(doc:FilmDocument,exclude:readonly string[]=[]):number[]{const skip=new Set(exclude);return doc.tracks.flatMap(t=>t.kind==='media'&&!t.hidden?t.clips.flatMap(c=>{const s=doc.sources.find(s=>s.id===c.sourceId);return !skip.has(c.id)&&s?.rhythm?rhythmFrames(c,doc.frameRate,s.rhythm).map(f=>c.at+f):[];}):[]);}
export function rhythmTicks(clip:FilmClip,rate:FilmRate,rhythm:Rhythm,zoom:number):HTMLElement{
 const ticks=document.createElement('span');ticks.className='film-rhythm-ticks';ticks.title=rhythm.beats.length?`节拍 · ${rhythm.bpm?.toFixed(1)??''} BPM`:'起音点';ticks.setAttribute('aria-label',ticks.title);let previous=-Infinity;
 for(const frame of rhythmFrames(clip,rate,rhythm)){const x=frame*zoom;if(x-previous<4)continue;previous=x;const tick=document.createElement('i');tick.style.left=x+'px';ticks.append(tick);}return ticks;
}
export async function analyzeRhythm(root:HTMLElement,source:FilmSource,options:{document:()=>FilmDocument;execute:(commands:FilmCommand[])=>boolean;report:(text:string)=>void;signal:AbortSignal}){
 if(!['audio','video'].includes(source.kind))return;
 const origin=options.document(),controller=new AbortController(),dialog=document.createElement('dialog');dialog.className='film-document-dialog film-rhythm-dialog';dialog.setAttribute('aria-label','识别节拍');
 const title=document.createElement('h3');title.textContent=source.title;const status=document.createElement('p');status.setAttribute('role','status');const progress=document.createElement('progress');progress.max=1;progress.value=0;const cancel=document.createElement('button');cancel.textContent='取消';const retry=document.createElement('button');retry.textContent='重试';retry.hidden=true;dialog.append(title,status,progress,retry,cancel);root.append(dialog);
 let jobId:string|undefined,finished=false;const stop=()=>{controller.abort();if(jobId&&!finished)void fetch('/film-media/rhythm/'+jobId,{method:'DELETE'}).catch(()=>{});dialog.close();};cancel.onclick=stop;dialog.oncancel=event=>{event.preventDefault();stop();};options.signal.addEventListener('abort',stop,{once:true});dialog.onclose=()=>{options.signal.removeEventListener('abort',stop);dialog.remove();};dialog.showModal();cancel.focus();
 async function request(url:string,init?:RequestInit){const response=await fetch(url,{...init,signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error??'节拍识别失败');return value;}
 const pause=()=>new Promise<void>((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(controller.signal.reason);};const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',onAbort);resolve();},500);controller.signal.addEventListener('abort',onAbort,{once:true});});
 const run=async()=>{try{retry.hidden=true;progress.hidden=false;status.textContent='正在识别节拍…';let job=await request('/film-media/rhythm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uri:source.uri})});jobId=job.id;
  while(job.state==='queued'||job.state==='running'){progress.value=job.progress??0;status.textContent=job.state==='queued'?'正在等待音频处理…':`正在识别节拍 ${Math.round((job.progress??0)*100)}%`;await pause();job=await request('/film-media/rhythm/'+jobId);}
  if(job.state!=='complete')throw Error(job.error??'已取消识别');finished=true;
  const current=options.document(),now=current.sources.find(s=>s.id===source.id);if(current.id!==origin.id||!now||now.uri!==source.uri||now.fingerprint&&now.fingerprint.sha256!==job.result.fingerprint.sha256)throw Error('素材已变化，请重新识别');
  if(!options.execute([{type:'film.rhythm.set',sourceId:source.id,expectedUri:source.uri,...job.result}]))throw Error('节拍尚未保存，请重试');
  options.report(job.result.rhythm.beats.length?'已标出节拍':job.result.rhythm.onsets.length?'节奏不稳定，已标出起音点':'未发现清晰起音点');dialog.close();
 }catch(error){if(controller.signal.aborted)return;status.textContent=error instanceof Error?error.message:String(error);progress.hidden=true;retry.hidden=false;cancel.textContent='关闭';}};retry.onclick=()=>{finished=false;void run();};await run();
}
