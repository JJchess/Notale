import type {CaptureVideoFrames} from './capture-video.js';
import {parseFilmDocument,filmDuration,frameSeconds,type FilmDocument} from '@notale/editor/film';
import {renderFilmAudio} from './audio-effects.js';
import {FilmPreview} from './preview.js';

/** The same compositor drives editing, fixed-frame capture and published films. */
const root=document.getElementById('picture')!;
const status=document.getElementById('status')!;
let doc:FilmDocument,playing=false,time=0,previous=performance.now(),resume=false,languages:string[]|undefined;
let failed='',serial=0,capturing=false,pendingTime:number|undefined;
const controls=document.getElementById('controls')!;
const play=document.getElementById('play') as HTMLButtonElement;
const seek=document.getElementById('seek') as HTMLInputElement;
const language=document.getElementById('language') as HTMLSelectElement;
function stop(message=''){playing=false;pendingTime=undefined;if(doc)preview.pause();play.textContent='播放';status.textContent=message;}
const preview=new FilmPreview(root,message=>{failed=message;stop(message);},()=>stop('观众已接手；播放可从当前剪辑位置继续。'),()=>stop());
const raf=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function draw(seconds:number){
  if(!capturing&&seconds!==time)failed='';
  const own=++serial,target=Math.max(0,Math.min(Math.max(0,frameSeconds(filmDuration(doc),doc.frameRate)-1e-7),seconds));time=target;pendingTime=undefined;
  const deadline=performance.now()+30000;
  do {
    if(own!==serial)throw Error('Frame superseded');if(failed)throw Error(failed);
    const ready=preview.frame(doc,target,true,languages,false);
    if(ready&&preview.captureReady){await document.fonts.ready;await raf();await raf();if(own!==serial)throw Error('Frame superseded');if(failed)throw Error(failed);return;}
    if(performance.now()>deadline)throw Error(`Frame ${time.toFixed(3)} timed out`);
    await raf();
  }while(true);
}
const api={
 audio:renderFilmAudio,
 async load(value:unknown,options:{languages?:string[];transparent?:boolean;capture?:boolean;videoFrames?:CaptureVideoFrames;initialTime?:number}={}){
   stop();preview.reset();failed='';capturing=!!options.capture;doc=parseFilmDocument(value);languages=options.languages;
   document.title=doc.title;preview.setTransparent(!!options.transparent);root.style.background=options.transparent?'transparent':'#000';
   document.body.style.background=document.documentElement.style.background=options.transparent?'transparent':'#111218';
   preview.setOriginalMedia(true);preview.setCaptureFrames(options.capture?options.videoFrames??{}:undefined);controls.hidden=!!options.capture;document.body.classList.toggle('capture',!!options.capture);
   seek.max=String(frameSeconds(filmDuration(doc),doc.frameRate));seek.step=String(frameSeconds(1,doc.frameRate));
   language.replaceChildren(new Option('全部字幕','all'),new Option('隐藏字幕','none'),...doc.tracks.filter(t=>t.kind==='subtitle').map(t=>new Option(t.title,t.kind==='subtitle'?t.language:'')));
   Object.assign(published,{duration:Number(seek.max),width:doc.width,height:doc.height});
   await draw(options.initialTime??0);return {duration:Number(seek.max),width:doc.width,height:doc.height};
 },
 frame:draw,
 state:()=>({time,playing,error:failed}),
};
const published:{frame:typeof draw;ready?:Promise<unknown>;duration?:number;width?:number;height?:number}={frame:draw};
Object.assign(window,{NotaleFilmRenderer:api,film:published});
play.onclick=()=>{if(!doc)return;if(failed){stop(failed);return;}if(playing){stop();return;}playing=true;pendingTime=undefined;if(time>=Number(seek.max))time=0;preview.resumeAudio();resume=true;previous=performance.now();status.textContent='';play.textContent='暂停';};
seek.oninput=()=>{stop();void draw(Number(seek.value)).catch(error=>stop(String(error)));};
language.onchange=()=>{languages=language.value==='all'?undefined:language.value==='none'?[]:[language.value];void draw(time).catch(error=>stop(String(error)));};
function tick(now:number){
  // RAF timestamps describe the start of the frame; a click in that frame can
  // set previous to a slightly later performance.now(). Never seek below zero.
  if(playing&&doc){const next=pendingTime??Math.min(Number(seek.max),time+Math.max(0,Math.min(100,now-previous))/1000);pendingTime=next;if(preview.frame(doc,next,resume,languages,true)){time=next;resume=false;pendingTime=undefined;}seek.value=String(time);if(time>=Number(seek.max))stop();}
  previous=now;requestAnimationFrame(tick);
}requestAnimationFrame(tick);
if(new URL(location.href).searchParams.has('document')||document.body.dataset.autoload){
  const uri=new URL(location.href).searchParams.get('document')??'film.json';
  published.ready=fetch(uri).then(r=>{if(!r.ok)throw Error(`Film load failed (${r.status})`);return r.json();}).then(value=>api.load(value));
  void published.ready.catch(error=>stop(String(error)));
}
