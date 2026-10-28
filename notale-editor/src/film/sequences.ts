import {type FilmDocument,type FilmMediaTrack,type FilmTrack,type FilmSource,filmAssert,clipEnd,filmDuration,frameSeconds,parseFilmDocument} from '@notale/format/film';
import {filmFrame,type FilmLayer} from './frame.js';
import {sourceIntervals} from './timing.js';
import type {FilmSubtitleTrack} from '@notale/format/film';
export interface NestSelection {itemIds:string[];id:string;sourceId:string;trackId:string;clipId:string;title:string}
/** Consecutive tracks and complete overlapping selections preserve paint order. */
export function nestSelection(doc:FilmDocument,options:NestSelection){
 const ids=new Set(options.itemIds),tracks=doc.tracks.filter(t=>(t.kind==='media'?t.clips:t.cues).some(c=>ids.has(c.id))),items=tracks.flatMap(t=>(t.kind==='media'?t.clips:t.cues).filter(c=>ids.has(c.id)));
 filmAssert(items.length===ids.size&&items.length>0,'Select clips or captions to nest');filmAssert(tracks.every(t=>!t.locked),'Cannot nest locked tracks');
 const first=doc.tracks.indexOf(tracks[0]),last=doc.tracks.indexOf(tracks.at(-1)!);filmAssert(doc.tracks.slice(first,last+1).every(t=>tracks.includes(t)||(t.kind==='media'?t.clips:t.cues).length===0),'Nested tracks must be consecutive');
 const start=Math.min(...items.map(c=>c.at)),end=Math.max(...items.map(clipEnd));
 for(const t of tracks)filmAssert(!(t.kind==='media'?t.clips:t.cues).some(c=>!ids.has(c.id)&&c.at<end&&clipEnd(c)>start),'Include every overlapping clip on the selected tracks');
 const childTracks:FilmTrack[]=tracks.map(t=>t.kind==='media'?{...structuredClone(t),clips:t.clips.filter(c=>ids.has(c.id)).map(c=>({...structuredClone(c),at:c.at-start}))}:{...structuredClone(t),wordSourceId:undefined,sourceClipId:undefined,sourceCaptionId:undefined,cues:t.cues.filter(c=>ids.has(c.id)).map(c=>({...structuredClone(c),at:c.at-start}))});
 for(const t of childTracks)if(t.kind==='media'){const clips=[...t.clips].sort((a,b)=>a.at-b.at);for(let i=0;i<clips.length;i++)if(i===0||clipEnd(clips[i-1])!==clips[i].at)delete clips[i].transitionIn;}
 const sourceIds=new Set(childTracks.flatMap(t=>t.kind==='media'?t.clips.map(c=>c.sourceId):[]));
 const child=parseFilmDocument({...doc,background:undefined,id:options.id,title:options.title,tracks:childTracks,sources:doc.sources.filter(s=>sourceIds.has(s.id)),markers:doc.markers.filter(m=>m.at>=start&&m.at<end).map(m=>({...m,at:m.at-start}))});
 const source:FilmSource={id:options.sourceId,title:options.title,kind:'sequence',uri:`sequence:${options.sourceId}`,sequence:child,width:child.width,height:child.height,duration:frameSeconds(filmDuration(child),child.frameRate)};
 for(const t of tracks)if(t.kind==='media')t.clips=t.clips.filter(c=>!ids.has(c.id));else t.cues=t.cues.filter(c=>!ids.has(c.id));
 const track:FilmMediaTrack={id:options.trackId,title:options.title,kind:'media',hidden:false,muted:false,locked:false,clips:[{id:options.clipId,title:options.title,sourceId:source.id,at:start,in:0,duration:end-start}]};
 doc.sources.push(source);doc.tracks.splice(first,0,track);
}
export function sequenceAt(root:FilmDocument,path:readonly string[]){let current=root;for(const id of path){const source=current.sources.find(s=>s.id===id);filmAssert(source?.kind==='sequence'&&source.sequence,'Nested sequence no longer exists');current=source.sequence;}return current;}
/** Audio leaves retain nested gain, mute and source clock derivatives. */
export function filmAudioLayers(doc:FilmDocument,time:number,prefix='',gain=1,rate=1,preservePitch=true):FilmLayer[]{
 return filmFrame(doc,time).layers.flatMap(layer=>{if(layer.source.kind==='sequence')return filmAudioLayers(layer.source.sequence!,layer.sourceTime,prefix+layer.clipId+'/',gain*layer.gain,rate*layer.playbackRate,preservePitch&&layer.preservePitch);if(!['audio','video'].includes(layer.source.kind))return [];return [{...layer,clipId:prefix+layer.clipId,gain:gain*layer.gain,playbackRate:rate*layer.playbackRate,preservePitch:preservePitch&&layer.preservePitch}];});
}
export function filmSubtitleTracks(doc:FilmDocument):FilmSubtitleTrack[]{
 const tracks=doc.tracks.filter((t):t is FilmSubtitleTrack=>t.kind==='subtitle').map(t=>structuredClone(t));
 for(const track of doc.tracks)if(track.kind==='media'&&!track.hidden)for(const clip of track.clips){const source=doc.sources.find(s=>s.id===clip.sourceId);if(source?.kind!=='sequence')continue;for(const nested of filmSubtitleTracks(source.sequence!)){const cues=nested.cues.flatMap(c=>sourceIntervals(clip,frameSeconds(c.at,source.sequence!.frameRate),frameSeconds(clipEnd(c),source.sequence!.frameRate),doc.frameRate).map((range,i)=>({...c,id:`${clip.id}/${c.id}/${i}`,at:clip.at+range.from,duration:range.to-range.from,words:undefined})));if(cues.length)tracks.push({...nested,id:`${clip.id}/${nested.id}`,title:`${clip.title} / ${nested.title}`,cues,wordSourceId:undefined,sourceClipId:undefined,sourceCaptionId:undefined});}}
 return tracks;
}
