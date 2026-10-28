import {clipEnd,filmAssert,frameSeconds,parseFilmDocument,type FilmClip,type FilmCue,type FilmDocument,type FilmMediaTrack,type FilmTrack,type FilmTiming} from '@notale/format/film';
import {applyFilmCommands,type FilmCommand} from './commands.js';
import {applyFilmNle,linkedFilmIds} from './nle.js';
import {clipSourceTime,reversedClipTiming} from './timing.js';
import {syncSourceCaptions,projectSourceCaptions} from './source-captions.js';

export interface FilmTimelinePreferences {magnet:boolean;follow:'current'|'main'|'all';linkage:boolean;mainTrackId?:string}
export type FilmTimelineEdit =
 | {type:'move';ids:string[];anchorId?:string;delta:number;destination?:string}
 | {type:'remove';ids:string[];ripple?:boolean}
 | {type:'trim';clipId:string;edge:'in'|'out';delta:number;ripple?:boolean}
 | {type:'slip';clipId:string;delta:number}
 | {type:'roll';leftId:string;rightId:string;delta:number}
 | {type:'slide';clipId:string;delta:number}
 | {type:'timing';clipId:string;timing:FilmTiming;sourceIn?:number;duration?:number;mode?:'reverse'|'freeze';localFrame?:number;ripple?:boolean}
 | {type:'split';ids:string[];at:number;idPrefix:string}
 | {type:'duplicate';ids:string[];at?:number;idPrefix:string}
 | {type:'place';trackId:string;clip:FilmClip;mode:'insert'|'overwrite'|'magnet';idPrefix:string};
export interface FilmTimelinePlan {document:FilmDocument;commands:FilmCommand[];selectedIds:string[];affectedIds:string[]}
type Item=FilmClip|FilmCue;
type Entry={track:FilmTrack;item:Item};
type Span={from:number;to:number};
const rows=(doc:FilmDocument):Entry[]=>doc.tracks.flatMap(track=>(track.kind==='media'?track.clips:track.cues).map(item=>({track,item})));
const index=(doc:FilmDocument)=>new Map(rows(doc).map(row=>[row.item.id,row]));
const integral=(value:number)=>filmAssert(Number.isSafeInteger(value),'剪辑位置必须是整数帧');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const derived=(track:FilmTrack)=>track.kind==='subtitle'&&!!(track.sourceClipId||track.wordSourceId);
const writable=(track:FilmTrack)=>filmAssert(!track.locked,'轨道已锁定','LOCKED');

/** Main track is a picture track, never a subtitle or a sound-only row. */
export function mainFilmTrack(doc:FilmDocument,wanted?:string):FilmMediaTrack|undefined {
 const sources=new Map(doc.sources.map(source=>[source.id,source]));
 const pictures=doc.tracks.filter((track):track is FilmMediaTrack=>track.kind==='media'&&(!track.clips.length||track.clips.some(clip=>sources.get(clip.sourceId)?.kind!=='audio')));
 return pictures.find(track=>track.id===wanted)??pictures.at(-1);
}
function mergeSpans(spans:Span[]):Span[]{const result:Span[]=[];for(const span of [...spans].sort((a,b)=>a.from-b.from)){const last=result.at(-1);if(last&&span.from<=last.to)last.to=Math.max(last.to,span.to);else result.push({...span});}return result;}
function shiftHead(doc:FilmDocument,clip:FilmClip,delta:number){
 clip.in=clipSourceTime(clip,delta,doc.frameRate);
 if(clip.animationOffset!==undefined||clip.timing?.map||clip.fade||clip.audio?.keys?.length||clip.audio?.fadeIn||clip.audio?.fadeOut||Object.keys(clip.appearance?.keyframes??{}).length||Object.values(clip.objects??{}).some(o=>Object.keys(o.keyframes??{}).length)||clip.masks?.some(m=>Object.keys(m.keyframes??{}).length))clip.animationOffset=(clip.animationOffset??0)+delta;
 clip.at+=delta;clip.duration-=delta;
}
/** The relationship is frozen at gesture start. A long music bed stays on film time. */
function followers(doc:FilmDocument,main:FilmMediaTrack|undefined,linked:boolean):Map<string,string>{
 const result=new Map<string,string>();if(!main)return result;
 const cuts=[...new Set(main.clips.flatMap(clip=>[clip.at,clipEnd(clip)]))];
 for(const {track,item} of rows(doc)){
  if(track===main||derived(track))continue;
  const host=main.clips.find(clip=>item.at>=clip.at&&item.at<clipEnd(clip));
  if(host&&cuts.filter(at=>at>item.at&&at<clipEnd(item)).length<=1){
   // Turning linked editing off must allow an AV member to stay independent,
   // rather than immediately inferring the same relationship as an automatic rider.
   if(!linked&&'linkGroup' in item&&item.linkGroup&&item.linkGroup===host.linkGroup)continue;
   result.set(item.id,host.id);
  }
 }
 if(linked){const groups=new Map<string,string[]>(),mainIds=new Set(main.clips.map(c=>c.id));for(const {item} of rows(doc))if('linkGroup' in item&&item.linkGroup)groups.set(item.linkGroup,[...(groups.get(item.linkGroup)??[]),item.id]);for(const ids of groups.values()){const hosts=ids.map(id=>mainIds.has(id)?id:result.get(id)),host=hosts[0];if(!host||hosts.some(value=>value!==host))for(const id of ids)result.delete(id);}}
 return result;
}

/** Plans against one immutable revision. No intermediate overlapping edit is committed. */
export function planFilmTimeline(input:FilmDocument,edit:FilmTimelineEdit,prefs:FilmTimelinePreferences):FilmTimelinePlan {
 const before=parseFilmDocument(input),doc=structuredClone(before),original=index(before),main=mainFilmTrack(before,prefs.mainTrackId);
 const touched=edit.type==='place'?[]:'ids' in edit?edit.ids:edit.type==='roll'?[edit.leftId,edit.rightId]:[edit.clipId];
 const mainTouched=(prefs.linkage?linkedFilmIds(before,touched):touched).some(id=>original.get(id)?.track.id===main?.id)||edit.type==='place'&&edit.trackId===main?.id||edit.type==='move'&&edit.destination===main?.id;
 const following=prefs.follow==='main'&&mainTouched?followers(before,main,prefs.linkage):new Map<string,string>();
 let selectedIds:string[]=[],serial=0;
 const generated=new Set<string>([...before.sources.map(s=>s.id),...before.tracks.map(t=>t.id),...original.keys(),...before.markers.map(m=>m.id),...rows(before).flatMap(({item})=>'linkGroup' in item&&item.linkGroup?[item.linkGroup]:[])]);
 const fresh=(prefix:string)=>{filmAssert(prefix.length>0&&prefix.length<=180,'缺少有效的剪辑标识');let id:string;do{id=`${prefix}:${++serial}`;}while(generated.has(id));generated.add(id);return id;};
 const find=(id:string):Entry=>{const row=index(doc).get(id);filmAssert(row,'片段不存在','NOT_FOUND');writable(row.track);return row;};
 const media=(id:string):{track:FilmMediaTrack;clip:FilmClip}=>{const row=find(id);filmAssert(row.track.kind==='media'&&'sourceId' in row.item,'请选择画面或声音片段');return {track:row.track,clip:row.item};};
 const expand=(ids:string[])=>{filmAssert(ids.length>0,'请选择片段');const expanded=prefs.linkage?linkedFilmIds(before,ids):[...new Set(ids)];for(const id of expanded){const row=original.get(id);filmAssert(row,'片段不存在','NOT_FOUND');writable(row.track);if(derived(row.track))filmAssert(row.track.kind==='subtitle'&&!!row.track.sourceClipId&&expanded.includes(row.track.sourceClipId),'请先解除字幕关联再编辑','CAPTIONS_LINKED');}return expanded.filter(id=>!derived(original.get(id)!.track));};
 const aligned=(id:string)=>{const ids=expand([id]),anchor=media(id).clip;for(const member of ids){const clip=media(member).clip;filmAssert(clip.at===anchor.at&&clipEnd(clip)===clipEnd(anchor),'链接片段的边界不同，请关闭链接片段后单独编辑');}return ids;};
 const targets=(own:Set<string>)=>new Set(prefs.follow==='all'?doc.tracks.filter(t=>!t.locked&&!derived(t)).map(t=>t.id):own);
 const erase=(ids:Set<string>)=>{for(const track of doc.tracks){if(track.kind==='media')track.clips=track.clips.filter(c=>!ids.has(c.id));else if(!derived(track))track.cues=track.cues.filter(c=>!ids.has(c.id));}};
 const shift=(point:number,delta:number,tracks:Set<string>,skip:Set<string>)=>{
  if(!delta)return;
  for(const {track,item} of rows(doc)){
   if(!tracks.has(track.id)||skip.has(item.id)||derived(track)||following.has(item.id))continue;writable(track);
   filmAssert(!(item.at<point&&clipEnd(item)>point),'联动跨过未拆分的片段，请先在此处拆分','RIPPLE_CROSSING');
   if(item.at>=point)item.at+=delta;
  }
  if(prefs.follow==='all')for(const marker of doc.markers)if(marker.at>=point)marker.at+=delta;
 };
 const close=(spans:Map<string,Span[]>,skip:Set<string>):{point:number;delta:number;tracks:Set<string>}[]=>{
  const changes:{point:number;delta:number;tracks:Set<string>}[]=[];
  const groups=prefs.follow==='all'?[{spans:[...spans.values()].flat(),tracks:targets(new Set())}]:[...spans].map(([id,ranges])=>({spans:ranges,tracks:new Set([id])}));
  for(const group of groups)for(const span of mergeSpans(group.spans).reverse()){const delta=span.from-span.to;shift(span.to,delta,group.tracks,skip);changes.push({point:span.to,delta,tracks:group.tracks});}
  return changes;
 };
 const spanMap=(ids:string[],onlyMain=false)=>{const spans=new Map<string,Span[]>();for(const id of ids){const row=original.get(id)!;if(onlyMain&&row.track.id!==main?.id)continue;spans.set(row.track.id,[...(spans.get(row.track.id)??[]),{from:row.item.at,to:clipEnd(row.item)}]);}return spans;};
 const rippleFor=(ids:string[],explicit=false)=>explicit||prefs.magnet&&ids.some(id=>original.get(id)?.track.id===main?.id);
 const cloneCaptions=(oldId:string,newId:string,prefix:string)=>{for(const track of [...doc.tracks])if(track.kind==='subtitle'&&track.sourceClipId===oldId){writable(track);doc.tracks.push({...structuredClone(track),id:fresh(prefix),sourceClipId:newId,cues:[]});}};
 const splitAt=(id:string,at:number,prefix:string,groups:Map<string,string>)=>{
  const {track,clip}=media(id);if(at<=clip.at||at>=clipEnd(clip))return undefined;
  const right=structuredClone(clip),finish=clipEnd(clip);right.id=fresh(prefix);shiftHead(doc,right,at-clip.at);right.duration=finish-at;delete right.transitionIn;
  if(right.linkGroup){if(!groups.has(right.linkGroup))groups.set(right.linkGroup,fresh(prefix+'-group'));right.linkGroup=groups.get(right.linkGroup);}
  clip.duration=at-clip.at;track.clips.push(right);cloneCaptions(id,right.id,prefix+'-captions');return right.id;
 };
 const makeRoom=(at:number,amount:number,own:Set<string>,skip:Set<string>,prefix?:string)=>{
  const reached=targets(own),groups=new Map<string,string>();
  for(const {track,item} of [...rows(doc)])if(reached.has(track.id)&&!derived(track)&&!skip.has(item.id)&&!following.has(item.id)&&item.at<at&&clipEnd(item)>at){
   filmAssert(prefix,'联动跨过未拆分的片段，请先在此处拆分','RIPPLE_CROSSING');
   filmAssert(!prefs.linkage||!('linkGroup' in item&&item.linkGroup),'插入点跨过链接片段，请先在此处拆分','RIPPLE_CROSSING');
   if('sourceId' in item)splitAt(item.id,at,prefix,groups);
   else{filmAssert(track.kind==='subtitle','无效字幕轨道');const right={...structuredClone(item),id:fresh(prefix),at,duration:clipEnd(item)-at};item.duration=at-item.at;track.cues.push(right);}
  }
  shift(at,amount,reached,skip);
 };
 const insertPoint=(track:FilmMediaTrack,at:number,skip:Set<string>)=>{const clips=track.clips.filter(c=>!skip.has(c.id));const over=clips.find(c=>c.at<=at&&clipEnd(c)>at);if(over)return at<(over.at+clipEnd(over))/2?over.at:clipEnd(over);return Math.min(at,Math.max(0,...clips.map(clipEnd)));};

 switch(edit.type){
 case 'move':{
  integral(edit.delta);const ids=expand(edit.ids),hand=new Set(ids),anchor=original.get(edit.anchorId??ids[0]);filmAssert(anchor&&hand.has(anchor.item.id),'请选择拖动的片段');selectedIds=ids;
  const mediaTracks=before.tracks.filter((t):t is FilmMediaTrack=>t.kind==='media');let rowDelta=0;
  if(edit.destination){const destination=doc.tracks.find(t=>t.id===edit.destination);filmAssert(destination?.kind==='media'&&anchor.track.kind==='media','不能移动到此轨道');writable(destination);rowDelta=mediaTracks.findIndex(t=>t.id===destination.id)-mediaTracks.findIndex(t=>t.id===anchor.track.id);}
  const destinations=new Map<string,string>();for(const id of ids){const row=original.get(id)!;if(row.track.kind==='subtitle'){filmAssert(!rowDelta,'字幕只能在原轨道内移动');destinations.set(id,row.track.id);continue;}const target=mediaTracks[mediaTracks.findIndex(t=>t.id===row.track.id)+rowDelta];filmAssert(target,'没有可容纳全部链接片段的目标轨道');writable(target);destinations.set(id,target.id);}
  const anchorTarget=destinations.get(anchor.item.id)!,magnetic=prefs.magnet&&anchorTarget===main?.id;
  let landing=anchor.item.at+edit.delta;if(magnetic)landing=insertPoint(main!,landing,hand);
  const lifted=ids.map(id=>({id,item:find(id).item}));erase(hand);
  if(prefs.magnet&&ids.some(id=>original.get(id)!.track.id===main?.id))for(const change of close(spanMap(ids,true),hand))if(change.tracks.has(anchorTarget)&&landing>=change.point)landing+=change.delta;
  if(magnetic){const offset=Math.min(...lifted.map(({item})=>item.at-anchor.item.at));const end=Math.max(...lifted.map(({item})=>clipEnd(item)-anchor.item.at));makeRoom(landing+offset,end-offset,new Set(destinations.values()),hand);}
  for(const {id,item} of lifted){item.at=landing+item.at-anchor.item.at;const track=doc.tracks.find(t=>t.id===destinations.get(id))!;if(track.kind==='media'&&'sourceId' in item)track.clips.push(item);else if(track.kind==='subtitle'&&!('sourceId' in item))track.cues.push(item);}
  break;
 }
 case 'remove':{
  const ids=expand(edit.ids),gone=new Set(ids);for(const [id,host] of following)if(gone.has(host)){writable(original.get(id)!.track);gone.add(id);}erase(gone);
  if(rippleFor(ids,edit.ripple))close(spanMap(ids,!edit.ripple&&prefs.magnet),gone);break;
 }
 case 'trim':{
  integral(edit.delta);const ids=aligned(edit.clipId),skip=new Set(ids),anchor=media(edit.clipId).clip,boundary=clipEnd(anchor),ripple=rippleFor(ids,edit.ripple),own=new Set(ids.map(id=>media(id).track.id));selectedIds=ids;
  for(const id of ids){const {clip}=media(id);if(edit.edge==='out')clip.duration+=edit.delta;else{shiftHead(doc,clip,edit.delta);if(ripple)clip.at-=edit.delta;}}
  if(ripple)shift(boundary,edit.edge==='out'?edit.delta:-edit.delta,targets(own),skip);break;
 }
 case 'slip':{
  integral(edit.delta);const ids=aligned(edit.clipId),amount=frameSeconds(edit.delta,doc.frameRate);selectedIds=ids;
  for(const id of ids){const {clip}=media(id);clip.in+=amount;for(const key of clip.timing?.map??[])key.value+=amount;}break;
 }
 case 'roll':{
  integral(edit.delta);const left=media(edit.leftId),right=media(edit.rightId),point=clipEnd(left.clip);filmAssert(left.track===right.track&&point===right.clip.at,'滚动修剪需要相邻片段');
  const leftIds=expand([edit.leftId]),rightIds=expand([edit.rightId]),leftSet=new Set(leftIds),rightSet=new Set(rightIds);
  for(const id of leftIds){const row=media(id);filmAssert(clipEnd(row.clip)===point,'链接片段的切点不同，请关闭链接片段后单独编辑');const next=row.track.clips.find(c=>c.at===point);filmAssert(next,'链接轨道缺少相邻片段');rightSet.add(next.id);}
  for(const id of rightIds){const row=media(id);filmAssert(row.clip.at===point,'链接片段的切点不同，请关闭链接片段后单独编辑');const previous=row.track.clips.find(c=>clipEnd(c)===point);filmAssert(previous,'链接轨道缺少相邻片段');leftSet.add(previous.id);}
  if(prefs.linkage){for(const id of linkedFilmIds(before,leftSet))filmAssert(leftSet.has(id),'相邻片段的链接不完整，请先解除链接');for(const id of linkedFilmIds(before,rightSet))filmAssert(rightSet.has(id),'相邻片段的链接不完整，请先解除链接');}
  for(const id of leftSet){filmAssert(!rightSet.has(id),'同一链接组跨过切点，请先拆分链接组');media(id).clip.duration+=edit.delta;}
  for(const id of rightSet)shiftHead(doc,media(id).clip,edit.delta);selectedIds=[edit.leftId,edit.rightId];break;
 }
 case 'slide':{
  integral(edit.delta);const ids=aligned(edit.clipId),left=new Set<string>(),right=new Set<string>();selectedIds=ids;
  for(const id of ids){const {clip,track}=media(id),a=track.clips.find(c=>clipEnd(c)===clip.at),b=track.clips.find(c=>c.at===clipEnd(clip));filmAssert(a&&b,'滑动需要两侧相邻片段');left.add(a.id);right.add(b.id);}
  if(prefs.linkage){for(const id of linkedFilmIds(before,left))filmAssert(left.has(id),'前方片段的链接不完整，请先解除链接');for(const id of linkedFilmIds(before,right))filmAssert(right.has(id),'后方片段的链接不完整，请先解除链接');}
  for(const id of left){filmAssert(!right.has(id)&&!ids.includes(id),'链接组跨过滑动边界，请先拆分链接组');media(id).clip.duration+=edit.delta;}
  for(const id of ids)media(id).clip.at+=edit.delta;for(const id of right)shiftHead(doc,media(id).clip,edit.delta);break;
 }
 case 'timing':{
  const ids=aligned(edit.clipId),anchor=structuredClone(media(edit.clipId).clip),boundary=clipEnd(anchor),duration=edit.duration??anchor.duration;integral(duration);selectedIds=ids;
  const base=clipSourceTime(anchor,0,doc.frameRate),offset=anchor.animationOffset??0;
  for(const id of ids){const {clip}=media(id),originalClip=original.get(id)!.item as FilmClip,ownBase=clipSourceTime(originalClip,0,doc.frameRate);let timing=structuredClone(edit.timing),sourceIn=edit.sourceIn;
   if(edit.mode==='reverse'){const reversed=reversedClipTiming(originalClip,doc.frameRate);timing=reversed.timing;sourceIn=reversed.sourceIn;}
   else if(edit.mode==='freeze'){timing={rate:0};sourceIn=clipSourceTime(originalClip,edit.localFrame??0,doc.frameRate);}
   else if(id!==edit.clipId){sourceIn=edit.sourceIn===undefined?undefined:edit.sourceIn+ownBase-base;if(timing.map)for(const key of timing.map){key.frame+=(clip.animationOffset??0)-offset;key.value+=ownBase-base;}}
   clip.timing=timing;if(sourceIn!==undefined)clip.in=sourceIn;clip.duration=duration;
  }
  if(duration!==anchor.duration&&rippleFor(ids,edit.ripple))shift(boundary,duration-anchor.duration,targets(new Set(ids.map(id=>media(id).track.id))),new Set(ids));break;
 }
 case 'split':{
  integral(edit.at);const ids=expand(edit.ids),groups=new Map<string,string>();selectedIds=[...ids];
  if(prefs.linkage){const groupCut=new Map<string,boolean>();for(const id of ids){const {clip}=media(id);if(!clip.linkGroup)continue;const cuts=clip.at<edit.at&&clipEnd(clip)>edit.at;filmAssert(!groupCut.has(clip.linkGroup)||groupCut.get(clip.linkGroup)===cuts,'链接片段没有共同切点，请关闭链接片段后单独拆分');groupCut.set(clip.linkGroup,cuts);}}
  for(const id of ids){const right=splitAt(id,edit.at,edit.idPrefix,groups);if(right)selectedIds.push(right);}break;
 }
 case 'duplicate':{
  const ids=expand(edit.ids),start=Math.min(...ids.map(id=>original.get(id)!.item.at)),end=Math.max(...ids.map(id=>clipEnd(original.get(id)!.item)));let at=edit.at??end;integral(at);const groups=new Map<string,string>();
  if(prefs.magnet&&ids.some(id=>original.get(id)!.track.id===main?.id)){at=insertPoint(main!,at,new Set());makeRoom(at,end-start,new Set(ids.map(id=>original.get(id)!.track.id)),new Set(),edit.idPrefix);}
  for(const id of ids){const {track}=find(id),copy=structuredClone(original.get(id)!.item);copy.id=fresh(edit.idPrefix);copy.at+=at-start;if('sourceId' in copy){delete copy.transitionIn;if(copy.linkGroup){if(!groups.has(copy.linkGroup))groups.set(copy.linkGroup,fresh(edit.idPrefix+'-group'));copy.linkGroup=groups.get(copy.linkGroup);}filmAssert(track.kind==='media','无效媒体轨道');track.clips.push(copy);cloneCaptions(id,copy.id,edit.idPrefix+'-captions');}else{filmAssert(track.kind==='subtitle','无效字幕轨道');track.cues.push(copy);}selectedIds.push(copy.id);}break;
 }
 case 'place':{
  const track=doc.tracks.find(t=>t.id===edit.trackId);filmAssert(track?.kind==='media','请选择目标轨道');writable(track);const clip=structuredClone(edit.clip);integral(clip.at);
  const insert=edit.mode==='insert'||edit.mode==='magnet'&&prefs.magnet&&track.id===main?.id;
  if(insert){if(edit.mode==='magnet')clip.at=insertPoint(track,clip.at,new Set());makeRoom(clip.at,clip.duration,new Set([track.id]),new Set(),edit.idPrefix);track.clips.push(clip);}
  else if(edit.mode==='overwrite'){if(prefs.linkage)filmAssert(!track.clips.some(c=>c.linkGroup&&c.at<clipEnd(clip)&&clipEnd(c)>clip.at),'覆盖范围包含链接片段，请先关闭链接片段');applyFilmNle(doc,{type:'film.clip.place',trackId:track.id,clip,mode:'overwrite',cutId:edit.idPrefix});}
  else track.clips.push(clip);
  for(const caption of doc.sources.find(s=>s.id===clip.sourceId)?.captions??[])doc.tracks.push(projectSourceCaptions(doc,clip,caption,fresh(edit.idPrefix+'-captions')));
  selectedIds=[clip.id];break;
 }
 }

 // Followers are assigned from the starting revision, so ripple cannot shift one twice.
 const explicit=new Set(edit.type==='move'||edit.type==='remove'||edit.type==='split'||edit.type==='duplicate'?expand(edit.ids):edit.type==='place'?[]:selectedIds);
 for(const [id,hostId] of following){if(explicit.has(id))continue;const old=original.get(id)!,hostBefore=original.get(hostId)!,hostAfter=index(doc).get(hostId),itemAfter=index(doc).get(id);if(!hostAfter){if(itemAfter){writable(old.track);erase(new Set([id]));}continue;}const delta=hostAfter.item.at-hostBefore.item.at;if(itemAfter&&delta){writable(itemAfter.track);itemAfter.item.at=old.item.at+delta;}}
 if(prefs.linkage){const groups=new Map<string,Entry[]>();for(const row of original.values())if('linkGroup' in row.item&&row.item.linkGroup)groups.set(row.item.linkGroup,[...(groups.get(row.item.linkGroup)??[]),row]);const after=index(doc);for(const group of groups.values()){const deltas=group.map(({item})=>after.has(item.id)?after.get(item.id)!.item.at-item.at:null);filmAssert(deltas.every(delta=>delta===deltas[0]),'联动会拆开链接片段，请先在切点拆分或关闭链接片段','LINKED_CROSSING');}}
 // A restore skips the reducer's ordinary new-source-reference hook. Match it
 // here for inserted clips and right-hand remnants, without rebinding old clips.
 for(const track of [...doc.tracks])if(track.kind==='media')for(const clip of track.clips)if(!original.has(clip.id))for(const caption of doc.sources.find(s=>s.id===clip.sourceId)?.captions??[])if(!doc.tracks.some(t=>t.kind==='subtitle'&&t.sourceClipId===clip.id&&t.sourceCaptionId===caption.id))doc.tracks.push(projectSourceCaptions(doc,clip,caption,fresh('timeline-captions')));
 syncSourceCaptions(doc);
 for(const track of doc.tracks)if(track.kind==='media'){track.clips.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));for(let i=0;i<track.clips.length;i++){const clip=track.clips[i],left=track.clips[i-1];if(!clip.transitionIn)continue;if(!left||clipEnd(left)!==clip.at)delete clip.transitionIn;else clip.transitionIn.duration=Math.min(clip.transitionIn.duration,left.duration,clip.duration);}}
 const parsed=parseFilmDocument(doc),document=applyFilmCommands(before,[{type:'film.document.restore',document:parsed,expected:before}]);
 for(const track of before.tracks)if(track.locked)filmAssert(same(track,document.tracks.find(t=>t.id===track.id)),'轨道已锁定','LOCKED');
 const after=index(document),affectedIds=[...new Set([...original.keys(),...after.keys()])].filter(id=>original.get(id)?.track.id!==after.get(id)?.track.id||!same(original.get(id)?.item,after.get(id)?.item));
 return {document,commands:same(before,document)?[]:[{type:'film.document.restore',document,expected:before}],selectedIds:selectedIds.filter(id=>after.has(id)),affectedIds};
}
