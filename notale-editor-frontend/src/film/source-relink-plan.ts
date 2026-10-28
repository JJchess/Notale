import {parseFilmDocument,type FilmDocument,type FilmSource,type FilmClip} from '@notale/editor/film';
export function sourceReferences(document:FilmDocument,uri:string):{document:FilmDocument;source:FilmSource;clip:FilmClip}[]{
 const result:{document:FilmDocument;source:FilmSource;clip:FilmClip}[]=[];
 for(const source of document.sources){if(source.uri===uri)for(const track of document.tracks)if(track.kind==='media')for(const clip of track.clips)if(clip.sourceId===source.id)result.push({document,source,clip});if(source.sequence)result.push(...sourceReferences(source.sequence,uri));}return result;
}
/** Resource replacement preserves the complete authored timeline. Nested copies
 * and detached audio aliases sharing the original URI participate atomically. */
export function planSourceRelink(document:FilmDocument,sourceId:string,replacement:FilmSource,sameContent:boolean):FilmDocument{
 const next=structuredClone(document),original=next.sources.find(s=>s.id===sourceId);if(!original)throw Error('素材已不存在');
 if(original.kind!==replacement.kind)throw Error('请选择相同类型的素材');if(['overlay','sequence','lecture'].includes(original.kind))throw Error('此素材不支持重新定位文件');const uri=original.uri,kind=original.kind;
 function visit(doc:FilmDocument):boolean{
  const aliases=doc.sources.filter(s=>s.uri===uri&&(s.kind===kind||['video','audio'].includes(kind)&&['video','audio'].includes(s.kind))),ids=new Set(aliases.map(s=>s.id));
  for(const source of doc.sources)if(source.sequence&&visit(source.sequence))ids.add(source.id);
  const clips=doc.tracks.flatMap(t=>t.kind==='media'?t.clips.filter(c=>ids.has(c.sourceId)):[]),clipIds=new Set(clips.map(c=>c.id));
  for(const track of doc.tracks){const affected=track.kind==='media'?track.clips.some(c=>clipIds.has(c.id)):!!track.sourceClipId&&clipIds.has(track.sourceClipId)||!!track.wordSourceId&&ids.has(track.wordSourceId);if(affected&&track.locked)throw Error('素材用于锁定轨道，请先解锁');if(!sameContent&&track.kind==='subtitle'&&affected){delete track.sourceClipId;delete track.sourceCaptionId;delete track.wordSourceId;delete track.wordGroupSize;for(const cue of track.cues)delete cue.words;}}
  for(const alias of aliases){const retained={id:alias.id,kind:alias.kind,title:alias.title,bin:alias.bin},captions=alias.captions,words=alias.words,rhythm=alias.rhythm;Object.assign(alias,structuredClone(replacement),retained);for(const name of ['width','height','duration','frameRate','markers','captions','words','rhythm'] as const)if(replacement[name]===undefined)delete alias[name];if(sameContent){alias.captions=captions;alias.words=words;alias.rhythm=rhythm;}else{delete alias.words;delete alias.rhythm;}}
  for(const clip of clips)if(aliases.some(source=>source.id===clip.sourceId)&&clip.openfilm)clip.openfilm.original.src=replacement.uri;
  return !!ids.size;
 }
 visit(next);
 // The parser checks complete reverse/map/rate source ranges, including nested
 // sequences. A short replacement cannot silently trim clips or transitions.
 try{return parseFilmDocument(next);}catch(error){throw Error('新素材无法覆盖现有片段的源时间范围：'+(error instanceof Error?error.message:String(error)));}
}
