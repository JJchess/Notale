import {type FilmDocument,type FilmClip,type FilmMediaTrack,type FilmSource,type FilmTrack,filmAssert,clipEnd,frameSeconds} from '@notale/format/film';
import {clipSourceTime} from './timing.js';
export type FilmAttributeGroup='geometry'|'look'|'audio'|'fade';
export type FilmNleCommand=
 | {type:'film.clip.place';trackId:string;clip:FilmClip;mode:'insert'|'overwrite';sync?:boolean;cutId:string}
 | {type:'film.clips.link';clipIds:string[];groupId?:string}
 | {type:'film.clip.detach';clipId:string;sourceId:string;audioClipId:string;trackId:string;groupId:string}
 | {type:'film.clip.replace';clipId:string;sourceId:string}
 | {type:'film.gaps.close';trackIds:string[];at?:number}
 | {type:'film.attributes.paste';clipIds:string[];from:FilmClip;groups:FilmAttributeGroup[]};
const locate=(doc:FilmDocument,id:string)=>{for(const track of doc.tracks)if(track.kind==='media'){const clip=track.clips.find(c=>c.id===id);if(clip){filmAssert(!track.locked,'Track is locked','LOCKED');return {clip,track};}}throw Error('Clip not found: '+id);};
const shifted=(doc:FilmDocument,clip:FilmClip,offset:number):FilmClip=>({...structuredClone(clip),in:clipSourceTime(clip,offset,doc.frameRate),animationOffset:(clip.animationOffset??0)+offset,transitionIn:undefined});
export function linkedFilmIds(doc:FilmDocument,ids:Iterable<string>):string[]{const selected=new Set(ids),groups=new Set(doc.tracks.flatMap(t=>t.kind==='media'?t.clips.filter(c=>selected.has(c.id)&&c.linkGroup).map(c=>c.linkGroup!):[]));for(const t of doc.tracks)if(t.kind==='media')for(const c of t.clips)if(c.linkGroup&&groups.has(c.linkGroup))selected.add(c.id);return [...selected];}
/** Mutable only inside the transactional draft owned by applyFilmCommands. */
export function applyFilmNle(doc:FilmDocument,cmd:FilmNleCommand){
 switch(cmd.type){
 case 'film.clip.place':{
  const target=doc.tracks.find(t=>t.id===cmd.trackId);filmAssert(target?.kind==='media'&&!target.locked,'Target track is unavailable or locked');filmAssert(cmd.mode==='insert'||cmd.mode==='overwrite','Invalid placement mode');filmAssert(cmd.cutId.length>0,'Missing split identity');
  const at=cmd.clip.at,end=clipEnd(cmd.clip),amount=cmd.clip.duration;const tracks=cmd.mode==='insert'&&cmd.sync?doc.tracks.filter(t=>!t.locked):[target];
  for(const track of tracks){const cut=(item:FilmClip|import('@notale/format/film').FilmCue)=>{const finish=clipEnd(item);if(finish<=at)return [item];if(cmd.mode==='insert'){
    if(item.at>=at)return [{...item,at:item.at+amount}];
    return [{...structuredClone(item),duration:at-item.at},{...('in' in item?shifted(doc,item,at-item.at):structuredClone(item)),id:item.id+'~'+cmd.cutId,at:at+amount,duration:finish-at}];
   }if(item.at>=end)return [item];const result=[];if(item.at<at)result.push({...structuredClone(item),duration:at-item.at});if(finish>end)result.push({...('in' in item?shifted(doc,item,end-item.at):structuredClone(item)),id:result.length?item.id+'~'+cmd.cutId:item.id,at:end,duration:finish-end});return result;
  };if(track.kind==='media')track.clips=track.clips.flatMap(cut) as FilmClip[];else track.cues=track.cues.flatMap(cut) as typeof track.cues;}
  if(cmd.mode==='insert'&&cmd.sync)for(const marker of doc.markers)if(marker.at>=at)marker.at+=amount;target.clips.push(structuredClone(cmd.clip));break;
 }
 case 'film.clips.link':{filmAssert(cmd.clipIds.length>0,'No clips selected');const ids=linkedFilmIds(doc,cmd.clipIds);for(const id of ids){const {clip}=locate(doc,id);if(cmd.groupId)clip.linkGroup=cmd.groupId;else delete clip.linkGroup;}break;}
 case 'film.clip.detach':{
  const {clip,track}=locate(doc,cmd.clipId),source=doc.sources.find(s=>s.id===clip.sourceId)!;filmAssert(source.kind==='video','Select a video to detach its sound');
  const audioSource:FilmSource={...structuredClone(source),id:cmd.sourceId,kind:'audio',title:source.title+' · 声音'};doc.sources.push(audioSource);
  const audio=structuredClone(clip);audio.id=cmd.audioClipId;audio.sourceId=audioSource.id;audio.title=clip.title+' · 声音';audio.linkGroup=cmd.groupId;delete audio.appearance;delete audio.masks;delete audio.color;delete audio.objects;delete audio.overlayHtml;delete audio.openfilm;delete audio.transitionIn;
  const audioTrack:FilmMediaTrack={id:cmd.trackId,title:'声音 · '+track.title,kind:'media',hidden:false,muted:false,locked:false,clips:[audio]};doc.tracks.splice(doc.tracks.indexOf(track)+1,0,audioTrack);clip.audio={...clip.audio,muted:true};clip.linkGroup=cmd.groupId;break;
 }
 case 'film.clip.replace':{
  const {clip}=locate(doc,cmd.clipId),old=doc.sources.find(s=>s.id===clip.sourceId)!,source=doc.sources.find(s=>s.id===cmd.sourceId);filmAssert(source&&source.id!==old.id,'Choose a different source');filmAssert((source.kind==='audio')===(old.kind==='audio'),'Replace sound with sound, picture with picture');filmAssert(!clip.timing?.map?.length,'Reset the time map before replacing this source');
  clip.sourceId=source.id;clip.title=source.title;clip.in=0;const rate=clip.timing?.rate??1,step=frameSeconds(1,doc.frameRate);if(source.duration!==undefined){if(rate<0)clip.in=Math.max(0,source.duration-step);const available=rate===0?clip.duration:Math.floor(source.duration/(step*Math.abs(rate))+1e-7);filmAssert(available>0,'Replacement is shorter than one frame');clip.duration=Math.min(clip.duration,available);}
  delete clip.objects;delete clip.overlayHtml;if(!['video','image'].includes(source.kind))delete clip.color;if(!['audio','video'].includes(source.kind))delete clip.audio;
  if(clip.openfilm){clip.openfilm.original.overrides=clip.openfilm.original.overrides?.filter(o=>!('at' in o));clip.openfilm.original.src=source.uri;}
  break;
 }
 case 'film.gaps.close':{
  filmAssert(cmd.trackIds.length>0&&new Set(cmd.trackIds).size===cmd.trackIds.length,'No tracks selected or duplicate track');filmAssert(cmd.at===undefined||Number.isSafeInteger(cmd.at)&&cmd.at>=0,'Invalid gap position');const tracks=cmd.trackIds.map(id=>{const t=doc.tracks.find(t=>t.id===id);filmAssert(t&&!t.locked,'Track is unavailable or locked');return t;});const intervals=tracks.flatMap(t=>(t.kind==='media'?t.clips:t.cues).map(c=>({at:c.at,end:clipEnd(c)}))).sort((a,b)=>a.at-b.at);let end=0;const gaps:{from:number;to:number}[]=[];for(const interval of intervals){if(interval.at>end&&(cmd.at===undefined||cmd.at>=end&&cmd.at<interval.at))gaps.push({from:end,to:interval.at});end=Math.max(end,interval.end);}
  for(const gap of gaps.reverse()){const amount=gap.to-gap.from;for(const t of tracks)for(const c of t.kind==='media'?t.clips:t.cues)if(c.at>=gap.to)c.at-=amount;if(tracks.length===doc.tracks.length)for(const m of doc.markers)if(m.at>=gap.to)m.at-=amount;}break;
 }
 case 'film.attributes.paste':{
  const geometry=new Set(['x','y','width','height','rotation','skewX','scaleX','scaleY']),from=cmd.from;
  for(const id of cmd.clipIds){const {clip}=locate(doc,id),source=doc.sources.find(s=>s.id===clip.sourceId)!;for(const group of cmd.groups){
   if(group==='geometry'||group==='look'){if(source.kind==='audio')continue;clip.appearance??={};for(const collection of ['values','keyframes'] as const){const old:Record<string,unknown>={...clip.appearance[collection]},next:Record<string,unknown>=from.appearance?.[collection]??{};const keys=new Set([...Object.keys(old),...Object.keys(next)]);for(const key of keys)if(geometry.has(key)===(group==='geometry')){delete old[key];if(next[key]!==undefined)old[key]=collection==='keyframes'?(next[key] as import('@notale/format/film').FilmKeyframe[]).map(k=>({...structuredClone(k),frame:k.frame-(from.animationOffset??0)+(clip.animationOffset??0)})):structuredClone(next[key]);}(clip.appearance as Record<string,unknown>)[collection]=old;}
    if(group==='look'){clip.masks=structuredClone(from.masks);for(const mask of clip.masks??[])for(const keys of Object.values(mask.keyframes??{}))for(const key of keys??[])key.frame+= (clip.animationOffset??0)-(from.animationOffset??0);if(['video','image'].includes(source.kind))clip.color=structuredClone(from.color);}
   }else if(group==='audio'&&['audio','video'].includes(source.kind)){clip.audio=structuredClone(from.audio);if(clip.audio){clip.audio.span=clip.duration+(clip.animationOffset??0);for(const key of clip.audio.keys??[])key.frame+=(clip.animationOffset??0)-(from.animationOffset??0);}}
   else if(group==='fade'){clip.fade=structuredClone(from.fade);if(clip.fade){clip.fade.span=clip.duration+(clip.animationOffset??0);clip.fade.start=clip.animationOffset??0;}}
  }}break;
 }
 }
}
