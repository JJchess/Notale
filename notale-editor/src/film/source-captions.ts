import {filmAssert,validFilmCaptions,type FilmSourceCaption,type FilmDocument,type FilmClip,type FilmSubtitleTrack} from '@notale/format/film';
import {sourceIntervals} from './timing.js';
import type {FilmCommand} from './commands.js';
/** Keep sidecar times in source seconds; quantize only when projecting into a sequence. */
export function parseSourceCaptions(raw:string,options:{id:string;title:string;language?:string;format:'vtt'|'srt'}):FilmSourceCaption {
 const blocks=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n[ \t]*\n/),result:FilmSourceCaption={id:options.id,title:options.title,language:options.language??'und',cues:[]};
 if(options.format==='vtt'){const header=blocks.shift()??'';filmAssert(/^WEBVTT(?:[ \t][^\n]*)?$/.test(header),'Missing or invalid WEBVTT header');result.vttHeader=header.slice(6);result.vttBlocks=[];}
 const stamp=(s:string)=>{const m=/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(s);filmAssert(m&&+m[2]<60&&+m[3]<60,'Invalid subtitle timestamp');return +(m[1]??0)*3600+(+m[2])*60+(+m[3])+(+m[4])/1000;};
 for(const block of blocks){if(!block.trim())continue;if(options.format==='vtt'&&/^(NOTE(?:[ \t\n]|$)|STYLE\n|REGION\n)/.test(block)){result.vttBlocks!.push(block);continue;}const lines=block.split('\n'),vttId=lines[0].includes('-->')?undefined:lines.shift(),m=/^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/.exec(lines.shift()??'');filmAssert(m&&lines.join('\n').trim(),'Invalid subtitle cue');result.cues.push({start:stamp(m[1]),end:stamp(m[2]),text:lines.join('\n'),...(options.format==='vtt'&&vttId?{vttId}:{}),...(m[3]?{settings:m[3]}:{})});}
 filmAssert(validFilmCaptions([result]),'Invalid source captions');return result;
}
export function projectSourceCaptions(doc:FilmDocument,clip:FilmClip,caption:FilmSourceCaption,trackId:string):FilmSubtitleTrack {
 const cues:FilmSubtitleTrack['cues']=[];
 caption.cues.forEach((cue,index)=>sourceIntervals(clip,cue.start,cue.end,doc.frameRate).forEach(({from,to},part)=>{const at=Math.max(0,Math.round(from)),until=Math.min(clip.duration,Math.round(to));if(until>at)cues.push({id:`${trackId}:cue:${index}:${part}`,at:clip.at+at,duration:until-at,text:cue.text,settings:cue.settings,vttId:cue.vttId});}));
 return {id:trackId,title:caption.title,kind:'subtitle',language:caption.language,locked:false,hidden:false,muted:false,sourceClipId:clip.id,sourceCaptionId:caption.id,cues,vttHeader:caption.vttHeader,vttBlocks:structuredClone(caption.vttBlocks)};
}
export function sourceCaptionCommands(doc:FilmDocument,clip:FilmClip):FilmCommand[]{return (doc.sources.find(s=>s.id===clip.sourceId)?.captions??[]).map((caption,index)=>({type:'film.caption.attach',clipId:clip.id,captionId:caption.id,trackId:`caption:${clip.id}:${index}`}));}
export function detachSourceCaptions(track:FilmSubtitleTrack){delete track.sourceClipId;delete track.sourceCaptionId;delete track.wordSourceId;delete track.wordGroupSize;}
export function syncSourceCaptions(doc:FilmDocument){
 doc.tracks=doc.tracks.filter(t=>{if(t.kind!=='subtitle'||!t.sourceClipId)return true;const clip=doc.tracks.flatMap(t=>t.kind==='media'?t.clips:[]).find(c=>c.id===t.sourceClipId),caption=doc.sources.find(s=>s.id===clip?.sourceId)?.captions?.find(c=>c.id===t.sourceCaptionId);if(!clip||!caption){filmAssert(!t.locked,'Linked subtitle track is locked','LOCKED');return false;}const next=projectSourceCaptions(doc,clip,caption,t.id);filmAssert(!t.locked||JSON.stringify(t.cues)===JSON.stringify(next.cues),'Linked subtitle track is locked','LOCKED');t.cues=next.cues;return true;});
}
