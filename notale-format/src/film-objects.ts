import type {FilmEasing} from './film-appearance.js';
export interface FilmStyleKeyframe {frame:number;value:string;easing?:FilmEasing}
export interface FilmObjectStyle {
 locked?:boolean;
 values?:Record<string,string>;
 keyframes?:Record<string,FilmStyleKeyframe[]>;
}
export type FilmObjects=Record<string,FilmObjectStyle>;
export const validFilmObjectId=(id:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
// CSS clocks would break deterministic frame(t); animation is expressed by keys.
export const validFilmStyleName=(name:string)=>/^(?:--[a-zA-Z0-9_-]+|-?[a-z][a-z0-9-]*)$/.test(name)&&!/^(-webkit-)?(animation|transition)(-|$)/.test(name)&&!['behavior','__proto__','constructor','prototype'].includes(name);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validFilmObjects(value:unknown):value is FilmObjects {
 if(!record(value))return false;
 for(const [id,style] of Object.entries(value)){
  if(!validFilmObjectId(id)||!record(style)||Object.keys(style).some(k=>!['locked','values','keyframes'].includes(k))||style.locked!==undefined&&typeof style.locked!=='boolean')return false;
  for(const name of ['values','keyframes']){
   const collection=style[name];if(collection===undefined)continue;if(!record(collection))return false;
   for(const [property,data] of Object.entries(collection)){
    if(!validFilmStyleName(property))return false;
    const validValue=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=10000&&!v.includes('\0');
    if(name==='values'){if(!validValue(data))return false;continue;}
    if(!Array.isArray(data)||!data.length)return false;
    let previous=-Infinity;
    for(const key of data){
     if(!record(key)||!Number.isSafeInteger(key.frame)||(key.frame as number)<=previous||!validValue(key.value))return false;
     const ease=key.easing;
     if(ease!==undefined&&ease!=='linear'&&ease!=='hold'&&!(Array.isArray(ease)&&ease.length===4&&ease.every(x=>typeof x==='number'&&Number.isFinite(x))&&ease[0]>=0&&ease[0]<=1&&ease[2]>=0&&ease[2]<=1))return false;
     previous=key.frame as number;
    }
   }
  }
 }
 return true;
}
