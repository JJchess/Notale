import {type FilmClip,type FilmMaskProperty,type FilmPropertyValue,filmMaskDefaults,filmMaskNumbers} from '@notale/format/film';
import {filmEase} from './appearance.js';
export interface FilmMaskSample {id:string;values:Record<FilmMaskProperty,FilmPropertyValue>}
export function clipMasks(clip:FilmClip,localFrame:number):FilmMaskSample[] {
 const at=localFrame+(clip.animationOffset??0);
 return (clip.masks??[]).map(mask=>{
  const values={...filmMaskDefaults,...mask.values};
  for(const [name,keys] of Object.entries(mask.keyframes??{})){
   if(!keys?.length)continue;const property=name as FilmMaskProperty;let value:FilmPropertyValue;
   if(at<=keys[0].frame)value=keys[0].value;
   else if(at>=keys[keys.length-1].frame)value=keys[keys.length-1].value;
   else{const right=keys.findIndex(k=>k.frame>at),a=keys[right-1],b=keys[right],t=filmEase((at-a.frame)/(b.frame-a.frame),a.easing);value=typeof a.value==='number'&&typeof b.value==='number'?a.value+(b.value-a.value)*t:a.value;}
   if(typeof value==='number'&&Object.hasOwn(filmMaskNumbers,property)){const [min,max]=filmMaskNumbers[property as keyof typeof filmMaskNumbers];value=Math.max(min,Math.min(max,value));}values[property]=value;
  }
  return {id:mask.id,values};
 }).filter(mask=>mask.values.enabled!=='off');
}
const n=(value:number)=>String(Number(value.toFixed(6)));
/** Standalone SVG alpha image, independent of DOM, prior time or random IDs. */
export function filmMaskSvg(mask:FilmMaskSample,width:number,height:number,inverse=mask.values.invert==='inverse'):string {
 const v=mask.values,x=Number(v.x)*width/100,y=Number(v.y)*height/100,w=Number(v.width)*width/100,h=Number(v.height)*height/100;
 const extent=Math.hypot(width,height)+Math.abs(x)+Math.abs(y)+w+h,fill=inverse?'black':'white';
 let shape:string;
 switch(v.shape){
  case 'linear':shape=`<rect x="${n(-extent)}" y="0" width="${n(extent*2)}" height="${n(extent)}"/>`;break;
  case 'mirror':shape=`<rect x="${n(-extent)}" y="${n(-h/2)}" width="${n(extent*2)}" height="${n(h)}"/>`;break;
  case 'rect':shape=`<rect x="${n(-w/2)}" y="${n(-h/2)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(w,h)*Number(v.radius)/100)}"/>`;break;
  case 'star':{const points=Array.from({length:10},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/5,r=i%2?.45:1;return `${n(Math.cos(angle)*w*r/2)},${n(Math.sin(angle)*h*r/2)}`;}).join(' ');shape=`<polygon points="${points}"/>`;break;}
  case 'heart':shape=`<path transform="scale(${n(w/2)} ${n(h/2)})" d="M0 .9 C-.3 .6 -1 .1 -1 -.4 C-1 -1 0 -1 0 -.4 C0 -1 1 -1 1 -.4 C1 .1 .3 .6 0 .9Z"/>`;break;
  default:shape=`<ellipse rx="${n(w/2)}" ry="${n(h/2)}"/>`;
 }
 const feather=Number(v.feather),pad=feather*4+1;
 const filter=feather?`<filter id="blur" filterUnits="userSpaceOnUse" x="${n(-pad)}" y="${n(-pad)}" width="${n(width+pad*2)}" height="${n(height+pad*2)}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(feather/2)}"/></filter>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}" preserveAspectRatio="none"><defs>${filter}<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${n(width)}" height="${n(height)}" style="mask-type:luminance"><rect width="100%" height="100%" fill="${inverse?'white':'black'}"/><g${feather?' filter="url(#blur)"':''}><g transform="translate(${n(x)} ${n(y)}) rotate(${n(Number(v.rotation))}) skewX(${n(Number(v.skewX))})" fill="${fill}">${shape}</g></g></mask></defs><rect width="100%" height="100%" fill="white" mask="url(#cut)"/></svg>`;
}
/** The authored order folds from the first mask. CSS composites bottom-up, so
 * reverse layers. A subtract B is A intersect (inverse B), never B subtract A. */
export function filmMaskCss(masks:readonly FilmMaskSample[],width:number,height:number) {
 const layers=masks.map((mask,i)=>{const subtract=i>0&&mask.values.combine==='subtract';return {image:`url("data:image/svg+xml,${encodeURIComponent(filmMaskSvg(mask,width,height,subtract?mask.values.invert!=='inverse':mask.values.invert==='inverse'))}")`,op:i===0?'add':subtract?'intersect':String(mask.values.combine)};}).reverse();
 return {maskImage:layers.length?layers.map(l=>l.image).join(','):'none',maskComposite:layers.length?layers.map(l=>l.op).join(','):'add',maskMode:'alpha',maskSize:'100% 100%',maskRepeat:'no-repeat',maskPosition:'center'};
}
