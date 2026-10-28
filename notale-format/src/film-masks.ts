import type {FilmKeyframe,FilmPropertyValue} from './film-appearance.js';
export const filmMaskNumbers={x:[-10000,10000],y:[-10000,10000],width:[0,10000],height:[0,10000],rotation:[-360000,360000],skewX:[-89.999999,89.999999],feather:[0,100000],radius:[0,50]} as const;
export const filmMaskEnums={shape:['linear','mirror','ellipse','rect','star','heart'],combine:['add','subtract','intersect','exclude'],invert:['normal','inverse'],enabled:['on','off']} as const;
export type FilmMaskProperty=keyof typeof filmMaskNumbers|keyof typeof filmMaskEnums;
export interface FilmMask {id:string;values?:Partial<Record<FilmMaskProperty,FilmPropertyValue>>;keyframes?:Partial<Record<FilmMaskProperty,FilmKeyframe[]>>}
/** Position/size/radius are percentages; feather is source pixels, rotation degrees. */
export const filmMaskDefaults:Record<FilmMaskProperty,FilmPropertyValue>={x:50,y:50,width:60,height:60,rotation:0,skewX:0,feather:0,radius:0,shape:'ellipse',combine:'add',invert:'normal',enabled:'on'};
export function validFilmMaskValue(property:string,value:unknown):value is FilmPropertyValue {
 if(Object.hasOwn(filmMaskNumbers,property)){const [min,max]=filmMaskNumbers[property as keyof typeof filmMaskNumbers];return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;}
 return Object.hasOwn(filmMaskEnums,property)&&typeof value==='string'&&(filmMaskEnums[property as keyof typeof filmMaskEnums] as readonly string[]).includes(value);
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validFilmMasks(value:unknown):value is FilmMask[] {
 if(!Array.isArray(value))return false;const ids=new Set<string>();
 for(const mask of value){
  if(!record(mask)||typeof mask.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(mask.id)||ids.has(mask.id)||Object.keys(mask).some(k=>!['id','values','keyframes'].includes(k)))return false;ids.add(mask.id);
  for(const name of ['values','keyframes']){
   const collection=mask[name];if(collection===undefined)continue;if(!record(collection))return false;
   for(const [property,payload] of Object.entries(collection)){
    if(name==='values'){if(!validFilmMaskValue(property,payload))return false;continue;}
    if(!Array.isArray(payload)||!payload.length)return false;let previous=-Infinity;
    for(const key of payload){
     if(!record(key)||!Number.isSafeInteger(key.frame)||(key.frame as number)<=previous||!validFilmMaskValue(property,key.value))return false;
     const e=key.easing;if(e!==undefined&&e!=='linear'&&e!=='hold'&&!(Array.isArray(e)&&e.length===4&&e.every(n=>typeof n==='number'&&Number.isFinite(n))&&e[0]>=0&&e[0]<=1&&e[2]>=0&&e[2]<=1))return false;
     previous=key.frame as number;
    }
   }
  }
 }
 return true;
}
