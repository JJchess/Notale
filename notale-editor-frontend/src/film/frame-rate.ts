import {assertFilmRate,parseFilmDocument,type FilmDocument,type FilmRate} from '@notale/editor/film';
/** Quantize author frame coordinates once, preserving source seconds and nested native grids. */
export function resampleFilmRate(document:FilmDocument,rate:FilmRate):FilmDocument {
 assertFilmRate(rate);const doc=parseFilmDocument(document),scale=rate.numerator*doc.frameRate.denominator/(rate.denominator*doc.frameRate.numerator);
 if(scale===1){doc.frameRate={...rate};return doc;}
 const frame=(n:number)=>Math.round(n*scale);
 const keys=(rows:{frame:number}[]|undefined)=>{if(!rows)return;const seen=new Set<number>();for(const key of rows){key.frame=frame(key.frame);if(seen.has(key.frame))throw Error('目标帧率会合并两个关键帧，请先调整关键帧间距');seen.add(key.frame);}};
 const curves=(map:Record<string,{frame:number}[]|undefined>|undefined)=>{for(const rows of Object.values(map??{}))keys(rows);};
 for(const track of doc.tracks){
  for(const item of track.kind==='media'?track.clips:track.cues){const end=frame(item.at+item.duration);item.at=frame(item.at);item.duration=end-item.at;if(item.duration<1)throw Error('目标帧率会丢失过短片段或字幕，请先调整其时长');}
  if(track.kind!=='media')continue;
  for(const clip of track.clips){
   if(clip.animationOffset!==undefined)clip.animationOffset=frame(clip.animationOffset);
   curves(clip.appearance?.keyframes);for(const object of Object.values(clip.objects??{}))curves(object.keyframes);for(const mask of clip.masks??[])curves(mask.keyframes);
   keys(clip.timing?.map);
   if(clip.transitionIn){clip.transitionIn.duration=frame(clip.transitionIn.duration);if(clip.transitionIn.duration<1)throw Error('目标帧率会丢失转场，请先调整转场时长');}
   if(clip.fade){for(const name of ['in','out','span','start'] as const)if(clip.fade[name]!==undefined)clip.fade[name]=frame(clip.fade[name]!);}
   if(clip.audio){keys(clip.audio.keys);for(const name of ['fadeIn','fadeOut','span'] as const)if(clip.audio[name]!==undefined)clip.audio[name]=frame(clip.audio[name]!);if(clip.audio.duck){clip.audio.duck.attack=frame(clip.audio.duck.attack);clip.audio.duck.release=frame(clip.audio.duck.release);}}
  }
 }
 for(const marker of doc.markers)marker.at=frame(marker.at);doc.frameRate={...rate};
 try{return parseFilmDocument(doc);}catch(error){throw Error('帧率换算超出素材或时间边界，未修改影片：'+String(error instanceof Error?error.message:error));}
}
