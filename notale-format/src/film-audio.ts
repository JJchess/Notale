import {validFilmAppearance,type FilmEasing} from './film-appearance.js';
export interface FilmWord {text:string;start:number;end:number}
export interface FilmAudioEffects {
 enabled?:boolean;
 eq?:{type:'lowshelf'|'highshelf'|'peaking'|'highpass'|'lowpass'|'notch';frequency:number;gain:number;q:number}[];
 compressor?:{threshold:number;knee:number;ratio:number;attack:number;release:number};
}
export function validFilmAudioEffects(input:unknown):input is FilmAudioEffects {
 if(!input||typeof input!=='object'||Array.isArray(input))return false;const e=input as FilmAudioEffects;
 if(e.enabled!==undefined&&typeof e.enabled!=='boolean')return false;
 if(e.eq!==undefined&&(!Array.isArray(e.eq)||e.eq.length>16||e.eq.some(b=>!b||!['lowshelf','highshelf','peaking','highpass','lowpass','notch'].includes(b.type)||!Number.isFinite(b.frequency)||b.frequency<10||b.frequency>24000||!Number.isFinite(b.gain)||b.gain< -40||b.gain>40||!Number.isFinite(b.q)||b.q<.001||b.q>100)))return false;
 const c=e.compressor;if(c!==undefined){if(!c||typeof c!=='object')return false;for(const [key,min,max] of [['threshold',-100,0],['knee',0,40],['ratio',1,20],['attack',0,1],['release',0,1]] as const)if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)return false;}
 return true;
}
export interface FilmAudio {
  effects?:FilmAudioEffects;
  role?:'narration'|'music'|'sfx';gain?:number;muted?:boolean;
  /** Fades and keys share the authored frame clock; splitting preserves envelopes. */
  fadeIn?:number;fadeOut?:number;span?:number;
  keys?:{frame:number;value:number;easing?:FilmEasing}[];
  duck?:{enabled:boolean;amountDb:number;attack:number;release:number};
}
export function validFilmAudio(input:unknown):input is FilmAudio{
  if(!input||typeof input!=='object'||Array.isArray(input))return false;const a=input as FilmAudio;
  if(Object.keys(a).some(k=>!['role','gain','muted','fadeIn','fadeOut','span','keys','duck','effects'].includes(k)))return false;
  if(a.effects!==undefined&&!validFilmAudioEffects(a.effects))return false;
  if(a.role!==undefined&&!['narration','music','sfx'].includes(a.role))return false;
  if(a.gain!==undefined&&(!Number.isFinite(a.gain)||a.gain<0||a.gain>4))return false;
  if(a.muted!==undefined&&typeof a.muted!=='boolean')return false;
  for(const key of ['fadeIn','fadeOut','span'] as const)if(a[key]!==undefined&&(!Number.isSafeInteger(a[key])||a[key]!<0))return false;
  if(a.keys!==undefined&&(!Array.isArray(a.keys)||!a.keys.length||a.keys.some(k=>typeof k.value!=='number'||k.value<0||k.value>4)||!validFilmAppearance({keyframes:{x:a.keys}})))return false;
  const d=a.duck;if(d!==undefined&&(!d||typeof d!=='object'||typeof d.enabled!=='boolean'||!Number.isFinite(d.amountDb)||d.amountDb>0||d.amountDb< -60||![d.attack,d.release].every(n=>Number.isSafeInteger(n)&&n>=0)))return false;
  return true;
}
export function validFilmWords(input:unknown):input is FilmWord[]{return Array.isArray(input)&&input.length<=100000&&input.every((w,i)=>w&&typeof w.text==='string'&&!!w.text.trim()&&!/[\r\n]|-->/.test(w.text)&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start&&(!i||w.start>=input[i-1].start));}
