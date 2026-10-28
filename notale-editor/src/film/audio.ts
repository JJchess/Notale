import {sourceIntervals} from './timing.js';
import {type FilmClip,type FilmDocument,type FilmWord,type FilmSubtitleTrack,filmAssert,validFilmWords,frameSeconds,secondsFrame} from '@notale/format/film';
import {filmEase} from './appearance.js';
export function clipFadeGain(clip:FilmClip,localFrame:number):number{const fade=clip.fade;if(!fade)return 1;const at=localFrame+(clip.animationOffset??0),start=fade.start??0,k=Math.min(1,(fade.span-start)/(fade.in+fade.out||1));return Math.max(0,Math.min(1,fade.in?(at-start)/(fade.in*k):1,fade.out?(fade.span-at)/(fade.out*k):1));}
export function clipGain(clip:FilmClip,localFrame:number):number{
 const a=clip.audio;if(a?.muted)return 0;const at=localFrame+(clip.animationOffset??0),keys=a?.keys??[];let gain=a?.gain??1;
 if(keys.length){if(at<=keys[0].frame)gain=keys[0].value;else if(at>=keys.at(-1)!.frame)gain=keys.at(-1)!.value;else{const right=keys.findIndex(k=>k.frame>at),l=keys[right-1],r=keys[right];gain=l.value+(r.value-l.value)*filmEase((at-l.frame)/(r.frame-l.frame),l.easing);}}
 const span=a?.span??clip.duration+(clip.animationOffset??0);if(a?.fadeIn)gain*=Math.min(1,Math.max(0,at/a.fadeIn));if(a?.fadeOut)gain*=Math.min(1,Math.max(0,(span-at)/a.fadeOut));return Math.max(0,Math.min(4,gain))*clipFadeGain(clip,localFrame);
}
/** Deterministic sidechain envelope, sampled from narration regions, without stateful pumping. */
export function filmGain(doc:FilmDocument,clip:FilmClip,frame:number):number{
 let gain=clipGain(clip,frame-clip.at);const duck=clip.audio?.duck;if(clip.audio?.role!=='music'||!duck?.enabled)return gain;
 let weight=0;for(const t of doc.tracks)if(t.kind==='media'&&!t.hidden&&!t.muted)for(const voice of t.clips){if(voice.audio?.role!=='narration'||voice.audio.muted)continue;const end=voice.at+voice.duration;
  if(frame<voice.at-duck.attack||frame>=end+duck.release)continue;
  if(clipGain(voice,Math.max(0,Math.min(voice.duration-1,frame-voice.at)))<=.0001)continue;
  const w=frame<voice.at?(duck.attack?(frame-voice.at+duck.attack)/duck.attack:0):frame>=end?(duck.release?1-(frame-end)/duck.release:0):1;weight=Math.max(weight,w);
 }return gain*Math.pow(10,duck.amountDb*weight/20);
}
export function parseWordTimings(input:unknown):FilmWord[]{
 const value=input as any;const rows=Array.isArray(value)?value:value?.words??value?.segments?.flatMap((s:any)=>s.words??[]);filmAssert(Array.isArray(rows),'Expected words: [{text, start, end}] in source seconds');const words=rows.map((w:any)=>({text:String(w.text??w.word??'').trim(),start:w.start,end:w.end}));filmAssert(validFilmWords(words),'Invalid word timings');return words;
}
export function wordSubtitles(doc:FilmDocument,clip:FilmClip,words:FilmWord[],options:{id:string;language:string;groupSize?:number}):FilmSubtitleTrack{
 const size=options.groupSize??6;filmAssert(Number.isSafeInteger(size)&&size>=1&&size<=30,'Invalid subtitle group size');
 const visible=words.flatMap(word=>sourceIntervals(clip,word.start,word.end,doc.frameRate).map(interval=>({text:word.text,start:Math.max(0,interval.from),end:Math.min(clip.duration,interval.to)}))).sort((a,b)=>a.start-b.start);
 const cues=[];for(let i=0;i<visible.length;i+=size){const group=visible.slice(i,i+size),localAt=Math.round(group[0].start),at=clip.at+localAt,to=Math.min(clip.at+clip.duration,clip.at+Math.round(Math.max(...group.map(w=>w.end))));if(to<=at)continue;
  cues.push({id:`${options.id}-word-${i}`,at,duration:to-at,text:group.map(w=>w.text).join(' '),words:group.map(w=>({text:w.text,start:Math.max(0,frameSeconds(w.start-localAt,doc.frameRate)),end:Math.max(.000001,frameSeconds(w.end-localAt,doc.frameRate))}))});
 }
 return {id:options.id,title:`逐词字幕 · ${options.language}`,kind:'subtitle',language:options.language,hidden:false,muted:false,locked:false,cues};
}
