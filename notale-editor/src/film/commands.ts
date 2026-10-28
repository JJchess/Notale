import {ensurePageMetadata} from './page-metadata.js';
import {applyFilmNle,type FilmNleCommand} from './nle.js';
import {nestSelection,type NestSelection} from './sequences.js';
import {filmDuration} from '@notale/format/film';
import {clipSourceTime} from './timing.js';
import {wordSubtitles} from './audio.js';
import {projectSourceCaptions,detachSourceCaptions,syncSourceCaptions} from './source-captions.js';
import {
  type FilmColor,type FilmTiming,type FilmTransition,type FilmAudio,type FilmWord,type FilmMask,type FilmMaskProperty, type FilmDocument, type FilmClip, type FilmMediaTrack, type FilmTrack, type FilmSource,
  validFilmMotaleAuthor,type FilmMotaleAuthor,
  validFilmObjectId, validFilmStyleName, type FilmStyleKeyframe, type FilmCue, type FilmMarker, type FilmProperty, type FilmPropertyValue, type FilmKeyframe, filmAssert, clipEnd, frameSeconds, parseFilmDocument,
} from '@notale/format/film';

/** One command batch = one future Notale revision. IDs are provided by the caller,
 * never generated from randomness/time inside the reducer. No deck/API changes here. */
export type FilmCommand = FilmNleCommand
  | {type:'film.rhythm.set';sourceId:string;expectedUri:string;rhythm:NonNullable<FilmSource['rhythm']>;fingerprint?:FilmSource['fingerprint']}
  | {type:'film.motale.author';clipId:string;author?:FilmMotaleAuthor}
  | {type:'film.font.add';font:import('@notale/format/film').FilmFont}
  | {type:'film.source.update';sourceId:string;patch:Partial<Pick<FilmSource,'title'|'bin'>>}
  | {type:'film.caption.attach';clipId:string;captionId:string;trackId:string}
  | {type:'film.caption.detach';trackId:string}
  | {type:'film.document.restore';document:FilmDocument;expected?:FilmDocument}
  | {type:'film.settings.update';patch:Partial<Pick<FilmDocument,'width'|'height'|'frameRateMode'>>&{background?:string|null}}
  | {type:'film.subtitle.style';trackId:string;style?:import('@notale/format/film').FilmSubtitleStyle}
  | {type:'film.openfilm.overrides';clipId:string;overrides:NonNullable<FilmClip['openfilm']>['original']['overrides']}
  | {type:'film.fade.set';clipId:string;fade?:FilmClip['fade']}
  | ({type:'film.selection.nest'}&NestSelection)
  | {type:'film.sequence.update';sourceId:string;document:FilmDocument}
  | {type:'film.items.move';itemIds:string[];delta:number}
  | {type:'film.color.set';clipId:string;color?:FilmColor}
  | {type:'film.timing.set';clipId:string;timing:FilmTiming;sourceIn?:number;duration?:number;ripple?:boolean;sync?:boolean}
  | {type:'film.transition.set';clipId:string;transition?:FilmTransition}
  | {type:'film.audio.set';clipId:string;audio:FilmAudio}
  | {type:'film.words.set';sourceId:string;words:FilmWord[]}
  | {type:'film.mask.add';clipId:string;mask:FilmMask}
  | {type:'film.mask.delete';clipId:string;maskId:string}
  | {type:'film.mask.move';clipId:string;maskId:string;index:number}
  | {type:'film.mask.property';clipId:string;maskId:string;property:FilmMaskProperty;value?:FilmPropertyValue}
  | {type:'film.mask.key.put';clipId:string;maskId:string;property:FilmMaskProperty;keyframe:FilmKeyframe}
  | {type:'film.mask.key.delete';clipId:string;maskId:string;property:FilmMaskProperty;frame:number}
  | {type:'film.object.lock';clipId:string;target:string;locked:boolean}
  | {type:'film.object.property';clipId:string;target:string;property:string;value?:string}
  | {type:'film.object.key.put';clipId:string;target:string;property:string;keyframe:FilmStyleKeyframe}
  | {type:'film.object.key.delete';clipId:string;target:string;property:string;frame:number}
  | { type: 'film.overlay.set'; clipId: string; html: string; objects?:FilmClip['objects'] }
  | { type: 'film.property.set'; clipId: string; property: FilmProperty; value?: FilmPropertyValue }
  | { type: 'film.keyframe.put'; clipId: string; property: FilmProperty; keyframe: FilmKeyframe }
  | { type: 'film.keyframe.delete'; clipId: string; property: FilmProperty; frame: number }
  | { type: 'film.source.add'; source: FilmSource }
  | { type: 'film.source.remove'; sourceId: string }
  | { type: 'film.track.add'; track: FilmTrack; index?: number }
  | { type: 'film.track.delete'; trackId: string }
  | { type: 'film.track.move'; trackId: string; index: number }
  | { type: 'film.track.update'; trackId: string; patch: Partial<Pick<FilmTrack, 'title' | 'locked' | 'hidden' | 'muted'>> }
  | { type: 'film.clip.add'; trackId: string; clip: FilmClip }
  | { type: 'film.clip.move'; clipId: string; trackId: string; at: number }
  | { type: 'film.clip.trim'; clipId: string; edge: 'in' | 'out'; delta: number; ripple?: boolean; sync?: boolean }
  | { type: 'film.clip.split'; clipId: string; at: number; rightId: string }
  | { type: 'film.clip.delete'; clipId: string; ripple?: boolean; sync?: boolean }
  | { type: 'film.range.delete'; trackIds: string[]; from: number; to: number; ripple: boolean; cutId: string }
  | { type: 'film.clip.reorder'; trackId: string; clipIds: string[]; at?: number }
  | { type: 'film.clip.roll'; leftId: string; rightId: string; delta: number }
  | { type: 'film.clip.slip'; clipId: string; delta: number }
  | { type: 'film.clip.slide'; clipId: string; delta: number }
  | { type: 'film.cue.put'; trackId: string; cue: FilmCue }
  | { type: 'film.cue.delete'; trackId: string; cueId: string }
  | { type: 'film.marker.put'; marker: FilmMarker }
  | { type: 'film.marker.delete'; markerId: string };

function track(doc: FilmDocument, id: string, write = true): FilmTrack {
  const t = doc.tracks.find(t => t.id === id);
  filmAssert(t, `Track not found: ${id}`, 'NOT_FOUND');
  filmAssert(!write || !t.locked, `Track is locked: ${id}`, 'LOCKED');
  return t;
}
function media(doc: FilmDocument, id: string): FilmMediaTrack {
  const t = track(doc, id);
  filmAssert(t.kind === 'media', 'Expected media track');
  return t;
}
function locate(doc: FilmDocument, id: string) {
  for (const t of doc.tracks) if (t.kind === 'media') {
    const clip = t.clips.find(c => c.id === id);
    if (clip) { filmAssert(!t.locked, `Track is locked: ${t.id}`, 'LOCKED'); return { track: t, clip }; }
  }
  throw new Error(`Clip not found: ${id}`);
}
function filmJson(value:FilmDocument){return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
function integral(v: number) { filmAssert(Number.isSafeInteger(v), 'Edit delta must be an integer frame'); }
function shiftFollowing(doc: FilmDocument, own: FilmTrack, boundary: number, delta: number, sync: boolean, skip: string) {
  for (const t of doc.tracks) {
    if (t.locked || (!sync && t !== own)) continue;
    const items = t.kind === 'media' ? t.clips : t.cues;
    // A spanning clip on another track cannot move without changing its timing before
    // the edit. Require an explicit range edit/split instead of silently losing sync.
    if (sync && t !== own) filmAssert(!items.some(c => c.at < boundary && clipEnd(c) > boundary), 'Sync ripple crosses an unsplit clip', 'RIPPLE_CROSSING');
    for (const c of items) if (c.id !== skip && c.at >= boundary) c.at += delta;
  }
  if (sync) for (const m of doc.markers) if (m.at >= boundary) m.at += delta;
}
function animationShift(c: FilmClip, delta: number) {
  return !!c.fade || !!c.timing?.map || !!c.audio && (!!c.audio.fadeIn || !!c.audio.fadeOut || !!c.audio.keys?.length) || c.animationOffset !== undefined || Object.keys(c.appearance?.keyframes ?? {}).length || Object.values(c.objects??{}).some(o=>Object.keys(o.keyframes??{}).length) || c.masks?.some(m=>Object.keys(m.keyframes??{}).length)
    ? { animationOffset: (c.animationOffset ?? 0) + delta } : {};
}
function split(doc: FilmDocument, t: FilmMediaTrack, c: FilmClip, at: number, id: string) {
  filmAssert(at > c.at && at < clipEnd(c), 'Split must be inside the clip'); integral(at);
  const leftLength = at - c.at;
  t.clips.push({ ...structuredClone(c), ...animationShift(c, leftLength), id, at, duration: c.duration - leftLength, in: clipSourceTime(c,leftLength,doc.frameRate),transitionIn:undefined });
  c.duration = leftLength;
  for(const captions of [...doc.tracks])if(captions.kind==='subtitle'&&captions.sourceClipId===c.id){filmAssert(!captions.locked,'Linked subtitle track is locked','LOCKED');doc.tracks.push({...structuredClone(captions),id:`${captions.id}:${id}`.slice(-256),sourceClipId:id,cues:[]});}
}
function trimHead(doc: FilmDocument, c: FilmClip, delta: number) {
  c.in=clipSourceTime(c,delta,doc.frameRate);Object.assign(c, animationShift(c, delta));
  c.at += delta; c.duration -= delta;
}
function applyOne(doc: FilmDocument, cmd: FilmCommand) {
  switch (cmd.type) {
    case 'film.rhythm.set': {const source=doc.sources.find(s=>s.id===cmd.sourceId);filmAssert(source&&source.uri===cmd.expectedUri,'素材已变化，请重新分析','STALE_FILM');filmAssert(source.kind==='video'||source.kind==='audio','Only audio/video sources can contain rhythm analysis');filmAssert(!source.fingerprint||source.fingerprint.sha256===cmd.rhythm.fingerprint,'素材内容已变化，请重新分析','STALE_FILM');if(cmd.fingerprint)source.fingerprint=structuredClone(cmd.fingerprint);source.rhythm=structuredClone(cmd.rhythm);break;}
    case 'film.motale.author': {const {clip}=locate(doc,cmd.clipId);filmAssert(doc.sources.find(s=>s.id===clip.sourceId)?.kind==='motale','Motale author data requires a Motale source');filmAssert(cmd.author===undefined||validFilmMotaleAuthor(cmd.author),'Invalid Motale author document');if(cmd.author===undefined)delete clip.motale;else clip.motale=structuredClone(cmd.author);break;}
    case 'film.font.add': {const existing=doc.fonts?.find(f=>f.id===cmd.font.id||f.family===cmd.font.family);filmAssert(!existing||existing.hash===cmd.font.hash,'Project font identity conflicts');if(!existing)(doc.fonts??=[]).push(structuredClone(cmd.font));break;}
    case 'film.source.update': {const source=doc.sources.find(s=>s.id===cmd.sourceId);filmAssert(source,'Source not found','NOT_FOUND');for(const key of ['title','bin'] as const)if(Object.prototype.hasOwnProperty.call(cmd.patch,key))Object.assign(source,{[key]:cmd.patch[key]});break;}
    case 'film.caption.attach': {const {clip}=locate(doc,cmd.clipId),caption=doc.sources.find(s=>s.id===clip.sourceId)?.captions?.find(c=>c.id===cmd.captionId);filmAssert(caption,'Source captions not found');filmAssert(!doc.tracks.some(t=>t.id===cmd.trackId),'Track already exists');doc.tracks.push(projectSourceCaptions(doc,clip,caption,cmd.trackId));break;}
    case 'film.caption.detach': {const t=track(doc,cmd.trackId);filmAssert(t.kind==='subtitle','Expected subtitle track');detachSourceCaptions(t);break;}
    case 'film.document.restore': {if(cmd.expected)filmAssert(filmJson(doc)===filmJson(parseFilmDocument(cmd.expected)),'影片已更新，拒绝覆盖新修订，请重新打开设置','STALE_FILM');const next=parseFilmDocument(cmd.document);filmAssert(next.id===doc.id,'History restore must keep the document identity');for(const key of Object.keys(doc))delete (doc as unknown as Record<string,unknown>)[key];Object.assign(doc,next);break;}
    case 'film.settings.update': {for(const key of ['width','height','background','frameRateMode'] as const)if(Object.prototype.hasOwnProperty.call(cmd.patch,key))Object.assign(doc,{[key]:cmd.patch[key]??undefined});break;}
    case 'film.subtitle.style': {const t=track(doc,cmd.trackId);filmAssert(t.kind==='subtitle','Expected subtitle track');t.style=structuredClone(cmd.style);break;}
    case 'film.clip.place':case 'film.clips.link':case 'film.clip.detach':case 'film.clip.replace':case 'film.gaps.close':case 'film.attributes.paste':applyFilmNle(doc,cmd);break;
    case 'film.selection.nest': {nestSelection(doc,cmd);break;}
    case 'film.sequence.update': {const source=doc.sources.find(s=>s.id===cmd.sourceId);filmAssert(source?.kind==='sequence','Sequence source not found');filmAssert(!doc.tracks.some(t=>t.kind==='media'&&t.locked&&t.clips.some(c=>c.sourceId===source.id)),'Sequence is used by a locked track');const nested=parseFilmDocument(cmd.document);const oldDuration=source.duration!;source.sequence=nested;source.title=nested.title;source.width=nested.width;source.height=nested.height;source.duration=frameSeconds(Math.max(1,filmDuration(nested)),nested.frameRate);for(const t of doc.tracks)if(t.kind==='media')for(const c of t.clips)if(c.sourceId===source.id&&!c.timing?.map&&(c.timing?.rate??1)===1){const available=Math.floor((source.duration-c.in)*doc.frameRate.numerator/doc.frameRate.denominator+1e-8);filmAssert(available>0,'Nested edit removes the source range used by a parent clip');if(c.duration>available)c.duration=available;else if(c.in===0&&Math.abs(frameSeconds(c.duration,doc.frameRate)-oldDuration)<1e-7){const following=t.clips.filter(other=>other.at>=clipEnd(c)&&other!==c).sort((a,b)=>a.at-b.at)[0];c.duration=Math.min(available,following?following.at-c.at:available);}}break;}
    case 'film.openfilm.overrides': {const {clip}=locate(doc,cmd.clipId);ensurePageMetadata(doc,clip);filmAssert(clip.openfilm,'Missing page metadata');for(const old of clip.openfilm.original.overrides??[])if('at' in old&&old.lock){const next=cmd.overrides?.find(o=>'at' in o&&o.at===old.at&&o.n===old.n);filmAssert(next&&JSON.stringify({...old,lock:undefined})===JSON.stringify({...next,lock:undefined}),'Unlock the selector before editing or deleting it','LOCKED');}clip.openfilm.original.overrides=structuredClone(cmd.overrides);break;}
    case 'film.fade.set': {const {clip}=locate(doc,cmd.clipId);if(cmd.fade)clip.fade=structuredClone(cmd.fade);else delete clip.fade;break;}
    case 'film.items.move': {integral(cmd.delta);const ids=new Set(cmd.itemIds);let count=0;for(const t of doc.tracks)for(const item of t.kind==='media'?t.clips:t.cues)if(ids.has(item.id)){filmAssert(!t.locked,'Track is locked','LOCKED');if(t.kind==='subtitle'&&(t.sourceClipId||t.wordSourceId)){const mediaSelected=t.sourceClipId?ids.has(t.sourceClipId):doc.tracks.some(row=>row.kind==='media'&&row.clips.some(c=>c.sourceId===t.wordSourceId&&ids.has(c.id)));filmAssert(mediaSelected,'请先解除字幕关联再编辑','CAPTIONS_LINKED');}else item.at+=cmd.delta;count++;}filmAssert(count===ids.size&&count>0,'Selection contains missing items');break;}
    case 'film.color.set': {const {clip}=locate(doc,cmd.clipId);if(cmd.color)clip.color=structuredClone(cmd.color);else delete clip.color;break;}
    case 'film.timing.set': {const {clip,track:t}=locate(doc,cmd.clipId),end=clipEnd(clip),duration=cmd.duration??clip.duration;integral(duration);filmAssert(duration>0,'Duration must be positive');if(cmd.ripple&&duration!==clip.duration)shiftFollowing(doc,t,end,duration-clip.duration,!!cmd.sync,clip.id);clip.timing=structuredClone(cmd.timing);if(cmd.sourceIn!==undefined)clip.in=cmd.sourceIn;clip.duration=duration;break;}
    case 'film.transition.set': {const {clip}=locate(doc,cmd.clipId);if(cmd.transition)clip.transitionIn=structuredClone(cmd.transition);else delete clip.transitionIn;break;}

    case 'film.audio.set': {const {clip}=locate(doc,cmd.clipId);filmAssert(['audio','video'].includes(doc.sources.find(s=>s.id===clip.sourceId)!.kind),'Audio requires a video or audio source');clip.audio={...structuredClone(cmd.audio),span:cmd.audio.span??clip.duration+(clip.animationOffset??0)};break;}
    case 'film.words.set': {const source=doc.sources.find(s=>s.id===cmd.sourceId);filmAssert(source,'Source not found');filmAssert(!doc.tracks.some(t=>t.kind==='media'&&t.locked&&t.clips.some(c=>c.sourceId===source.id)),'Source is used by a locked track');source.words=structuredClone(cmd.words);break;}
    case 'film.mask.add': {const {clip}=locate(doc,cmd.clipId);clip.masks??=[];clip.masks.push(structuredClone(cmd.mask));break;}
    case 'film.mask.delete': case 'film.mask.move': case 'film.mask.property': case 'film.mask.key.put': case 'film.mask.key.delete': {
      const {clip}=locate(doc,cmd.clipId),mask=clip.masks?.find(m=>m.id===cmd.maskId);filmAssert(mask,'Mask not found');
      if(cmd.type==='film.mask.delete'){clip.masks=clip.masks!.filter(m=>m.id!==cmd.maskId);break;}
      if(cmd.type==='film.mask.move'){filmAssert(Number.isInteger(cmd.index)&&cmd.index>=0&&cmd.index<clip.masks!.length,'Invalid mask position');clip.masks!.splice(clip.masks!.indexOf(mask),1);clip.masks!.splice(cmd.index,0,mask);break;}
      if(cmd.type==='film.mask.property'){mask.values??={};if(cmd.value===undefined)delete mask.values[cmd.property];else mask.values[cmd.property]=cmd.value;}
      else if(cmd.type==='film.mask.key.put'){mask.keyframes??={};const keys=(mask.keyframes[cmd.property]??[]).filter(k=>k.frame!==cmd.keyframe.frame);keys.push(structuredClone(cmd.keyframe));keys.sort((a,b)=>a.frame-b.frame);mask.keyframes[cmd.property]=keys;}
      else {const keys=mask.keyframes?.[cmd.property];filmAssert(keys&&keys.some(k=>k.frame===cmd.frame),'Mask keyframe not found');const remaining=keys.filter(k=>k.frame!==cmd.frame);if(remaining.length)mask.keyframes![cmd.property]=remaining;else delete mask.keyframes![cmd.property];}break;
    }
    case 'film.object.lock': case 'film.object.property': case 'film.object.key.put': case 'film.object.key.delete': {
      const {clip}=locate(doc,cmd.clipId);
      filmAssert(validFilmObjectId(cmd.target),'Invalid object id');
      filmAssert(doc.sources.find(s=>s.id===clip.sourceId)?.kind==='overlay','Object styles require an overlay');
      clip.objects??={};const object=clip.objects[cmd.target]??={};
      if(cmd.type==='film.object.lock'){object.locked=cmd.locked;break;}
      filmAssert(!object.locked,'Object is locked','LOCKED');filmAssert(validFilmStyleName(cmd.property),'Invalid CSS property');
      if(cmd.type==='film.object.property'){object.values??={};if(cmd.value===undefined)delete object.values[cmd.property];else object.values[cmd.property]=cmd.value;}
      else if(cmd.type==='film.object.key.put'){object.keyframes??={};const keys=(object.keyframes[cmd.property]??[]).filter(k=>k.frame!==cmd.keyframe.frame);keys.push(structuredClone(cmd.keyframe));keys.sort((a,b)=>a.frame-b.frame);object.keyframes[cmd.property]=keys;}
      else {const keys=object.keyframes?.[cmd.property];filmAssert(keys&&keys.some(k=>k.frame===cmd.frame),'Object keyframe not found');const remaining=keys.filter(k=>k.frame!==cmd.frame);if(remaining.length)object.keyframes![cmd.property]=remaining;else delete object.keyframes![cmd.property];}
      break;
    }
    case 'film.overlay.set': { const { clip } = locate(doc, cmd.clipId); clip.overlayHtml = cmd.html;if(cmd.objects!==undefined)clip.objects=structuredClone(cmd.objects); break; }
    case 'film.property.set': {
      const {clip}=locate(doc,cmd.clipId);clip.appearance ??= {};clip.appearance.values ??= {};
      if(cmd.value===undefined)delete clip.appearance.values[cmd.property];else clip.appearance.values[cmd.property]=cmd.value;
      break;
    }
    case 'film.keyframe.put': {
      const {clip}=locate(doc,cmd.clipId);clip.appearance ??= {};clip.appearance.keyframes ??= {};
      const keys=(clip.appearance.keyframes[cmd.property]??[]).filter(k=>k.frame!==cmd.keyframe.frame);
      keys.push(structuredClone(cmd.keyframe));keys.sort((a,b)=>a.frame-b.frame);clip.appearance.keyframes[cmd.property]=keys;break;
    }
    case 'film.keyframe.delete': {
      const {clip}=locate(doc,cmd.clipId),keys=clip.appearance?.keyframes?.[cmd.property];
      filmAssert(keys && keys.some(k=>k.frame===cmd.frame),'Keyframe not found','NOT_FOUND');
      const remaining=keys.filter(k=>k.frame!==cmd.frame);
      if(remaining.length)clip.appearance!.keyframes![cmd.property]=remaining;else delete clip.appearance!.keyframes![cmd.property];break;
    }
    case 'film.source.add': doc.sources.push(structuredClone(cmd.source)); break;
    case 'film.source.remove': {
      filmAssert(doc.sources.some(s => s.id === cmd.sourceId), 'Source not found', 'NOT_FOUND');
      filmAssert(!doc.tracks.some(t => t.kind === 'media' ? t.clips.some(c => c.sourceId === cmd.sourceId) : t.wordSourceId===cmd.sourceId), '素材仍被片段使用，请先删除相关片段', 'SOURCE_IN_USE');
      doc.sources = doc.sources.filter(s => s.id !== cmd.sourceId); break;
    }
    case 'film.track.delete': {
      track(doc, cmd.trackId); doc.tracks = doc.tracks.filter(t => t.id !== cmd.trackId); break;
    }
    case 'film.track.move': {
      const moved = track(doc, cmd.trackId), from = doc.tracks.indexOf(moved);
      filmAssert(Number.isInteger(cmd.index) && cmd.index >= 0 && cmd.index < doc.tracks.length, 'Invalid track position');
      filmAssert(!doc.tracks.slice(Math.min(from, cmd.index), Math.max(from, cmd.index) + 1).some(t => t.locked), '不能跨越锁定轨道重排', 'LOCKED');
      doc.tracks.splice(from, 1); doc.tracks.splice(cmd.index, 0, moved); break;
    }
    case 'film.track.add': {
      const i = cmd.index ?? doc.tracks.length;
      filmAssert(Number.isInteger(i) && i >= 0 && i <= doc.tracks.length, 'Invalid track insertion index');
      doc.tracks.splice(i, 0, structuredClone(cmd.track)); break;
    }
    case 'film.track.update': {
      const t = track(doc, cmd.trackId, false);
      filmAssert(!t.locked || Object.keys(cmd.patch).every(k => k === 'locked'), 'Unlock track before editing it', 'LOCKED');
      filmAssert(Object.keys(cmd.patch).every(k => ['title', 'locked', 'hidden', 'muted'].includes(k)), 'Unsupported track property');
      Object.assign(t, cmd.patch); break;
    }
    case 'film.clip.add': media(doc, cmd.trackId).clips.push(structuredClone(cmd.clip)); break;
    case 'film.clip.move': {
      const found = locate(doc, cmd.clipId), dest = media(doc, cmd.trackId);
      found.track.clips = found.track.clips.filter(c => c.id !== cmd.clipId);
      found.clip.at = cmd.at; dest.clips.push(found.clip); break;
    }
    case 'film.clip.trim': {
      integral(cmd.delta);
      const { track: t, clip: c } = locate(doc, cmd.clipId), end = clipEnd(c);
      filmAssert(cmd.edge === 'in' || cmd.edge === 'out', 'Invalid trim edge');
      if (cmd.edge === 'out') c.duration += cmd.delta;
      else {
        trimHead(doc, c, cmd.delta);
        if (cmd.ripple) c.at -= cmd.delta;
      }
      if (cmd.ripple) shiftFollowing(doc, t, end, cmd.edge === 'out' ? cmd.delta : -cmd.delta, !!cmd.sync, c.id);
      break;
    }
    case 'film.clip.split': {
      const { track: t, clip: c } = locate(doc, cmd.clipId); split(doc, t, c, cmd.at, cmd.rightId); break;
    }
    case 'film.clip.delete': {
      const { track: t, clip: c } = locate(doc, cmd.clipId);
      t.clips = t.clips.filter(x => x !== c);
      if (cmd.ripple) shiftFollowing(doc, t, clipEnd(c), -c.duration, !!cmd.sync, c.id);
      break;
    }
    case 'film.range.delete': {
      integral(cmd.from); integral(cmd.to);
      filmAssert(cmd.from >= 0 && cmd.to > cmd.from && cmd.cutId.length > 0 && cmd.trackIds.length > 0 && new Set(cmd.trackIds).size === cmd.trackIds.length, 'Invalid delete range');
      const amount = cmd.to - cmd.from;
      const linkedTargets=new Map(doc.tracks.filter(t=>t.kind==='subtitle').map(t=>[t.id,doc.tracks.filter(row=>row.kind==='media'&&row.clips.some(c=>c.id===t.sourceClipId||c.sourceId===t.wordSourceId)).map(row=>row.id)]));
      for (const id of cmd.trackIds) {
        const t = track(doc, id);
        if(t.kind==='subtitle'&&(t.sourceClipId||t.wordSourceId)){filmAssert(linkedTargets.get(t.id)?.some(id=>cmd.trackIds.includes(id))||!t.cues.some(c=>clipEnd(c)>cmd.from&&(cmd.ripple||c.at<cmd.to)),'请先解除字幕关联再编辑','CAPTIONS_LINKED');continue;}
        const remove = <T extends FilmClip | FilmCue>(c: T): T[] => {
          const end = clipEnd(c);
          if (end <= cmd.from) return [c];
          if (c.at >= cmd.to) return [{ ...c, at: c.at - (cmd.ripple ? amount : 0) }];
          const pieces: T[] = [];
          if (c.at < cmd.from) pieces.push({ ...structuredClone(c), duration: cmd.from - c.at });
          if (end > cmd.to) pieces.push({ ...structuredClone(c), id: pieces.length ? `${c.id}~${cmd.cutId}` : c.id,
            at: cmd.ripple ? cmd.from : cmd.to, duration: end - cmd.to,
            ...('in' in c ? { in: clipSourceTime(c as FilmClip,cmd.to-c.at,doc.frameRate),transitionIn:undefined, ...animationShift(c, cmd.to - c.at) } : {}) });
          return pieces;
        };
        if (t.kind === 'media') t.clips = t.clips.flatMap(remove);
        else t.cues = t.cues.flatMap(remove);
      }
      // Global markers follow only a global range edit, never one track's local edit.
      if (cmd.ripple && doc.tracks.every(t => cmd.trackIds.includes(t.id))) {
        doc.markers = doc.markers.filter(m => m.at < cmd.from || m.at >= cmd.to).map(m => ({ ...m, at: m.at >= cmd.to ? m.at - amount : m.at }));
      }
      break;
    }
    case 'film.clip.reorder': {
      const t = media(doc, cmd.trackId);
      filmAssert(cmd.clipIds.length === t.clips.length && new Set(cmd.clipIds).size === t.clips.length, 'Reorder must include each track clip once');
      let at = cmd.at ?? (t.clips.length ? Math.min(...t.clips.map(c => c.at)) : 0);
      t.clips = cmd.clipIds.map(id => {
        const c = t.clips.find(c => c.id === id); filmAssert(c, `Unknown clip: ${id}`);
        const moved = { ...c, at }; at += c.duration; return moved;
      }); break;
    }
    case 'film.clip.roll': {
      integral(cmd.delta);
      const l = locate(doc, cmd.leftId), r = locate(doc, cmd.rightId);
      filmAssert(l.track === r.track && l.clip !== r.clip && clipEnd(l.clip) === r.clip.at, 'Roll requires touching clips on one track');
      l.clip.duration += cmd.delta; trimHead(doc, r.clip, cmd.delta); break;
    }
    case 'film.clip.slip': {
      integral(cmd.delta); const {clip}=locate(doc,cmd.clipId),delta=frameSeconds(cmd.delta,doc.frameRate);clip.in+=delta;if(clip.timing?.map)for(const key of clip.timing.map)key.value+=delta;break;
    }
    case 'film.clip.slide': {
      integral(cmd.delta);
      const { track: t, clip: c } = locate(doc, cmd.clipId), ordered = [...t.clips].sort((a, b) => a.at - b.at);
      const i = ordered.indexOf(c), before = ordered[i - 1], after = ordered[i + 1];
      filmAssert(before && after && clipEnd(before) === c.at && clipEnd(c) === after.at, 'Slide requires two touching neighbors');
      before.duration += cmd.delta; c.at += cmd.delta; trimHead(doc, after, cmd.delta); break;
    }
    case 'film.cue.put': {
      const t = track(doc, cmd.trackId); filmAssert(t.kind === 'subtitle', 'Expected subtitle track');
      filmAssert(!t.sourceClipId&&!t.wordSourceId,'请先解除字幕关联再编辑','CAPTIONS_LINKED');
      const i = t.cues.findIndex(c => c.id === cmd.cue.id);
      if (i < 0) t.cues.push(structuredClone(cmd.cue)); else t.cues[i] = structuredClone(cmd.cue);
      break;
    }
    case 'film.cue.delete': {
      const t = track(doc, cmd.trackId); filmAssert(t.kind === 'subtitle', 'Expected subtitle track');
      filmAssert(!t.sourceClipId&&!t.wordSourceId,'请先解除字幕关联再编辑','CAPTIONS_LINKED');
      filmAssert(t.cues.some(c => c.id === cmd.cueId), 'Cue not found', 'NOT_FOUND');
      t.cues = t.cues.filter(c => c.id !== cmd.cueId); break;
    }
    case 'film.marker.put': {
      const i = doc.markers.findIndex(m => m.id === cmd.marker.id);
      if (i < 0) doc.markers.push(structuredClone(cmd.marker)); else doc.markers[i] = structuredClone(cmd.marker);
      break;
    }
    case 'film.marker.delete': {
      filmAssert(doc.markers.some(m => m.id === cmd.markerId), 'Marker not found', 'NOT_FOUND');
      doc.markers = doc.markers.filter(m => m.id !== cmd.markerId); break;
    }
    default: throw new Error('Unknown film command');
  }
}
export function applyFilmCommands(input: FilmDocument, commands: readonly FilmCommand[]): FilmDocument {
  let doc = parseFilmDocument(input);
  for (const command of commands) {
    const previousClips=new Map(doc.tracks.flatMap(t=>t.kind==='media'?t.clips.map(c=>[c.id,c.sourceId] as const):[]));
    applyOne(doc, command);
    if(command.type!=='film.document.restore')for(const clip of doc.tracks.flatMap(t=>t.kind==='media'?t.clips:[]))if(previousClips.get(clip.id)!==clip.sourceId){if(previousClips.has(clip.id)){doc.tracks=doc.tracks.filter(t=>{if(t.kind!=='subtitle'||t.sourceClipId!==clip.id)return true;filmAssert(!t.locked,'Linked subtitle track is locked','LOCKED');return false;});}for(const [index,caption] of (doc.sources.find(s=>s.id===clip.sourceId)?.captions??[]).entries())if(!doc.tracks.some(t=>t.kind==='subtitle'&&t.sourceClipId===clip.id&&t.sourceCaptionId===caption.id))doc.tracks.push(projectSourceCaptions(doc,clip,caption,`caption:${clip.id}:${index}`));}
    syncSourceCaptions(doc);
    for(const subtitles of doc.tracks)if(subtitles.kind==='subtitle'&&subtitles.wordSourceId){const source=doc.sources.find(s=>s.id===subtitles.wordSourceId);subtitles.cues=doc.tracks.flatMap(t=>t.kind==='media'&&!t.hidden&&!t.muted?t.clips.filter(c=>(c.sourceId===source?.id||doc.sources.some(s=>s.id===c.sourceId&&s.kind==='audio'&&s.uri===source?.uri))&&!c.audio?.muted).flatMap(c=>wordSubtitles(doc,c,source!.words??[],{id:subtitles.id+'-'+c.id,language:subtitles.language,groupSize:subtitles.wordGroupSize}).cues):[]);}

    if(command.type!=='film.transition.set')for(const t of doc.tracks)if(t.kind==='media'){const clips=[...t.clips].sort((a,b)=>a.at-b.at);for(let i=0;i<clips.length;i++){const c=clips[i];if(!c.transitionIn)continue;const left=clips[i-1];if(!left||clipEnd(left)!==c.at)delete c.transitionIn;else c.transitionIn.duration=Math.min(c.transitionIn.duration,left.duration,c.duration);}}
    // Per-command validity prevents a later command masking a broken intermediate edit.
    doc = parseFilmDocument(doc);
  }
  for (const t of doc.tracks) {
    if (t.kind === 'media') t.clips.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    else t.cues.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }
  return doc;
}
