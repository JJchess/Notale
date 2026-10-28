import { type FilmClip, type FilmProperty, type FilmPropertyValue, type FilmEasing, filmNumericLimits } from '@notale/format/film';
export const filmAppearanceDefaults: Partial<Record<FilmProperty,FilmPropertyValue>> = {
  rotation:0,skewX:0,scaleX:1,scaleY:1,opacity:1,blur:0,brightness:1,contrast:1,saturation:1,hue:0,radius:0,
  cropTop:0,cropRight:0,cropBottom:0,cropLeft:0,blendMode:'normal',fit:'contain',mask:'none',
};
export function filmEase(progress:number,easing:FilmEasing|'step-start'='linear'):number {
  if(easing==='step-start')return progress>0?1:0;
  if(easing==='hold')return progress<1?0:1;
  if(easing==='linear'||progress<=0||progress>=1)return progress;
  const [x1,y1,x2,y2]=easing;
  const curve=(t:number,a:number,b:number)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  // Invert x, rather than treating the Bezier parameter as progress.
  let low=0,high=1;
  for(let i=0;i<32;i++){const t=(low+high)/2;if(curve(t,x1,x2)<progress)low=t;else high=t;}
  return curve((low+high)/2,y1,y2);
}
/** Pure and independent of prior draws. Keys live in an authored frame clock;
 * clip trims/splits bias that clock without changing or resampling the curve. */
export function clipAppearance(clip:FilmClip,localFrame:number):Partial<Record<FilmProperty,FilmPropertyValue>> {
  const result={...filmAppearanceDefaults,...clip.appearance?.values}, at=localFrame+(clip.animationOffset??0);
  for(const [name,keys] of Object.entries(clip.appearance?.keyframes??{})) {
    if(!keys?.length)continue;
    const property=name as FilmProperty;
    let value:FilmPropertyValue;
    if(at<=keys[0].frame)value=keys[0].value;
    else if(at>=keys[keys.length-1].frame)value=keys[keys.length-1].value;
    else {
      const right=keys.findIndex(k=>k.frame>at),a=keys[right-1],b=keys[right];
      const progress=filmEase((at-a.frame)/(b.frame-a.frame),a.easing);
      value=typeof a.value==='number'&&typeof b.value==='number'?a.value+(b.value-a.value)*progress:a.value;
    }
    if(typeof value==='number'&&Object.hasOwn(filmNumericLimits,property)){
      const [min,max]=filmNumericLimits[property as keyof typeof filmNumericLimits] as readonly number[];
      value=Math.max(min??-Infinity,Math.min(max??Infinity,value));
    }
    result[property]=value;
  }
  return result;
}
