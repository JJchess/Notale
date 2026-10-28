import {validFilmAppearance,type FilmEasing} from './film-appearance.js';
export interface FilmTiming {rate?:number;map?:{frame:number;value:number;easing?:FilmEasing|'step-start'}[]}
export interface FilmTransition {kind:'dissolve'|'wipe'|'push'|'dip-black'|'dip-white';duration:number}
export function validFilmTiming(input:unknown):input is FilmTiming {
 if(!input||typeof input!=='object'||Array.isArray(input))return false;const t=input as FilmTiming;
 if(Object.keys(t).some(k=>!['rate','map'].includes(k)))return false;
 if(t.rate!==undefined&&(!Number.isFinite(t.rate)||Math.abs(t.rate)>8||t.rate!==0&&Math.abs(t.rate)<.0625))return false;
 return t.map===undefined||Array.isArray(t.map)&&t.map.length>=2&&t.map.every(k=>typeof k.value==='number'&&k.value>=0)&&validFilmAppearance({keyframes:{x:t.map.map(k=>({...k,easing:k.easing==='step-start'?'hold':k.easing}))}});
}
export function validFilmTransition(input:unknown):input is FilmTransition {if(!input||typeof input!=='object')return false;const t=input as FilmTransition;return ['dissolve','wipe','push','dip-black','dip-white'].includes(t.kind)&&Number.isSafeInteger(t.duration)&&t.duration>0;}
