import {type FilmClip,type FilmObjects} from '@notale/format/film';
import {filmEase} from './appearance.js';
function color(value:string):number[]|undefined {
 const hex=/^#([0-9a-f]{3,8})$/i.exec(value.trim())?.[1];
 if(hex&&[3,4,6,8].includes(hex.length)){const h=hex.length<=4?[...hex].map(x=>x+x).join(''):hex;return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6),16)/255:1];}
 const rgb=/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(value.trim());
 return rgb?[Number(rgb[1]),Number(rgb[2]),Number(rgb[3]),Number(rgb[4]??1)]:undefined;
}
/** Compatible numeric CSS tokens interpolate. Different units, keywords and
 * structure switch discretely; no fake conversion without layout context. */
export function interpolateFilmStyle(a:string,b:string,t:number):string {
 if(t===0)return a;if(t===1)return b;
 const ca=color(a),cb=color(b);
 if(ca&&cb){const p=ca.map((v,i)=>v+(cb[i]-v)*t);return `rgba(${p.slice(0,3).map(v=>Math.round(Math.max(0,Math.min(255,v)))).join(', ')}, ${Math.max(0,Math.min(1,p[3]))})`;}
 if(/(?:url\(|var\(|#|["'])/i.test(a+b))return a;
 const token=/(?<![\w.-])[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;
 const an=[...a.matchAll(token)],bn=[...b.matchAll(token)];
 if(!an.length||an.length!==bn.length||a.replace(token,'@')!==b.replace(token,'@'))return a;
 let index=0;return a.replace(token,()=>{const v=Number(an[index][0]),w=Number(bn[index++][0]);return String(Number((v+(w-v)*t).toFixed(6)));});
}
export function clipObjects(clip:FilmClip,localFrame:number):Record<string,Record<string,string>> {
 const result:Record<string,Record<string,string>>={},at=localFrame+(clip.animationOffset??0);
 for(const [id,object] of Object.entries(clip.objects??{})){
  const styles={...object.values};
  for(const [property,keys] of Object.entries(object.keyframes??{})){
   if(!keys.length)continue;
   if(at<=keys[0].frame)styles[property]=keys[0].value;
   else if(at>=keys[keys.length-1].frame)styles[property]=keys[keys.length-1].value;
   else{const right=keys.findIndex(k=>k.frame>at),a=keys[right-1],b=keys[right];styles[property]=interpolateFilmStyle(a.value,b.value,filmEase((at-a.frame)/(b.frame-a.frame),a.easing));}
  }
  result[id]=styles;
 }
 return result;
}
export const filmObjectLocks=(objects:FilmObjects={})=>Object.entries(objects).filter(([,object])=>object.locked).map(([id])=>id);
