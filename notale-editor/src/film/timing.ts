import {type FilmTiming,type FilmClip,type FilmRate,frameSeconds} from '@notale/format/film';
import {filmEase} from './appearance.js';
export function clipSourceTime(clip:FilmClip,localFrame:number,rate:FilmRate):number {
 const keys=clip.timing?.map,at=localFrame+(clip.animationOffset??0);
 if(!keys?.length)return clip.in+frameSeconds(localFrame,rate)*(clip.timing?.rate??1);
 if(at<=keys[0].frame)return keys[0].value;if(at>=keys.at(-1)!.frame)return keys.at(-1)!.value;
 const index=keys.findIndex(k=>k.frame>at),a=keys[index-1],b=keys[index];const p=Math.max(0,Math.min(1,filmEase((at-a.frame)/(b.frame-a.frame),a.easing)));return a.value+(b.value-a.value)*p;
}
export function clipPlaybackRate(clip:FilmClip,localFrame:number,rate:FilmRate):number {if(!clip.timing?.map)return clip.timing?.rate??1;const delta=.001;return (clipSourceTime(clip,localFrame+delta,rate)-clipSourceTime(clip,localFrame,rate))/frameSeconds(delta,rate);}
/** Intersect a source interval with each monotonic time-map segment. */
export function sourceIntervals(clip:FilmClip,start:number,end:number,rate:FilmRate):{from:number;to:number}[]{
 if(!clip.timing?.map){const speed=clip.timing?.rate??1;if(!speed)return clip.in>=start&&clip.in<end?[{from:0,to:clip.duration}]:[];const x=(start-clip.in)*rate.numerator/rate.denominator/speed,y=(end-clip.in)*rate.numerator/rate.denominator/speed,from=Math.max(0,Math.min(x,y)),to=Math.min(clip.duration,Math.max(x,y));return to>from?[{from,to}]:[];}
 const offset=clip.animationOffset??0,knots=[0,...(clip.timing?.map??[]).map(k=>k.frame-offset).filter(f=>f>0&&f<clip.duration),clip.duration];const intervals:{from:number;to:number}[]=[];
 for(let i=1;i<knots.length;i++){const from=knots[i-1],to=knots[i],a=clipSourceTime(clip,from,rate),b=clipSourceTime(clip,to,rate);if(a===b){if(a>=start&&a<end)intervals.push({from,to});continue;}const low=Math.max(Math.min(a,b),start),high=Math.min(Math.max(a,b),end);if(high<=low)continue;
  const invert=(source:number)=>{let l=from,r=to;for(let k=0;k<40;k++){const mid=(l+r)/2,value=clipSourceTime(clip,mid,rate);if((b>a)===(value<source))l=mid;else r=mid;}return (l+r)/2;};const x=invert(low),y=invert(high);intervals.push({from:Math.min(x,y),to:Math.max(x,y)});
 }return intervals;
}

export function reversedClipTiming(clip:FilmClip,rate:FilmRate):{timing:FilmTiming;sourceIn:number}{
 const sourceIn=clipSourceTime(clip,clip.duration-1,rate),keys=clip.timing?.map;
 if(!keys)return {timing:{rate:-(clip.timing?.rate||1)},sourceIn};
 const axis=2*(clip.animationOffset??0)+clip.duration-1;
 const invert=(ease:NonNullable<FilmTiming['map']>[number]['easing']):NonNullable<FilmTiming['map']>[number]['easing']=>Array.isArray(ease)?[1-ease[2],1-ease[3],1-ease[0],1-ease[1]] as [number,number,number,number]:ease==='hold'?'step-start':ease==='step-start'?'hold':'linear';
 return {timing:{map:keys.map((k,i)=>({frame:axis-k.frame,value:k.value,easing:invert(keys[i-1]?.easing)})).reverse()},sourceIn};
}
