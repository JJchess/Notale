import {readFilmFile,filmHtml,clipSpan,pictureRect,kindOf,soundRole} from './vendor/openfilm-doc.js';
import {type FilmDocument,type FilmSource,type FilmClip,type FilmHtmlClip,type FilmRate,filmAssert,emptyFilm,parseFilmDocument,frameSeconds,secondsFrame} from '@notale/format/film';
export interface OpenFilmValue {stage:{w:number;h:number};tracks:{clips:FilmHtmlClip[];hidden?:boolean;muted?:boolean;locked?:boolean;attrs?:Record<string,string>}[]}
export function readOpenFilmHtml(html:string):OpenFilmValue {const result=readFilmFile(html);filmAssert(result.doc,result.problems.join('\n'),'OPENFILM_HTML');return result.doc as OpenFilmValue;}
export interface OpenFilmMedia {duration?:number;width?:number;height?:number}
/** Metadata is supplied by the actual media loader, never guessed from the trim. */
export async function importOpenFilmHtml(html:string,options:{id:string;title:string;baseUrl:string;rate?:FilmRate;metadata:(uri:string,kind:FilmSource['kind'],size?:{w:number;h:number})=>Promise<OpenFilmMedia>}) {
 const raw=readOpenFilmHtml(html),doc=emptyFilm(options.id,options.title,options.rate);doc.width=raw.stage.w;doc.height=raw.stage.h;doc.tracks=[];doc.openfilm={html,baseUrl:options.baseUrl};const warnings:string[]=[];
 const used=new Set(raw.tracks.flatMap(t=>t.clips.map(c=>c.id)));let serial=0;const id=(prefix:string)=>{let key:string;do{key=`${prefix}-${++serial}`;}while(used.has(key));used.add(key);return key;};
 const cache=new Map<string,Promise<OpenFilmMedia>>();
 for(const row of raw.tracks){const track={id:id('html-track'),title:row.attrs?.title??row.attrs?.id??`轨道 ${doc.tracks.length+1}`,kind:'media' as const,hidden:!!row.hidden,muted:!!row.muted,locked:!!row.locked,clips:[] as FilmClip[],...(row.attrs?{openfilmAttrs:row.attrs}:{})};doc.tracks.push(track);let previousEnd=0;
  for(const original of [...row.clips].sort((a,b)=>(a.at??0)-(b.at??0))){
   const kind=kindOf(original) as 'page'|'video'|'sound'|'still',mapped=({page:'openfilm',video:'video',sound:'audio',still:'image'} as const)[kind];const uri=new URL(original.src,options.baseUrl).href;filmAssert(/^https?:/.test(uri),'film.html sources require HTTP(S)');
   const key=JSON.stringify([uri,mapped,original.size]);if(!cache.has(key))cache.set(key,options.metadata(uri,mapped,original.size));const meta=await cache.get(key)!;
   const span=clipSpan(original,meta.duration,original.id) as {from:number;to:number;speed:number;length:number};let start=original.at??0;
   filmAssert(start>=previousEnd-.00100001,`${original.id}: clips overlap on one track`,'OVERLAP');if(Math.abs(start-previousEnd)<=.001)start=previousEnd;previousEnd=start+span.length;
   const at=secondsFrame(start,doc.frameRate);let duration=secondsFrame(start+span.length,doc.frameRate)-at;
   if(['video','audio'].includes(mapped)&&span.speed===1&&meta.duration!==undefined)duration=Math.min(duration,Math.floor((meta.duration-span.from)*doc.frameRate.numerator/doc.frameRate.denominator+1e-7));
   filmAssert(duration>0,`${original.id}: clip is shorter than one timeline frame`);
   if(Math.abs(frameSeconds(at,doc.frameRate)-start)>.001||Math.abs(frameSeconds(duration,doc.frameRate)-span.length)>.001)warnings.push(`${original.id}: 已对齐到影片帧网格`);
   const source:FilmSource={id:id('html-source'),kind:mapped,title:original.attrs?.title??original.id,uri,...(mapped==='video'||mapped==='audio'?{duration:meta.duration}:{}),width:meta.width??original.size?.w??doc.width,height:meta.height??original.size?.h??doc.height};doc.sources.push(source);
   const rect=pictureRect(kind,{w:source.width,h:source.height},raw.stage,original.box) as {x:number;y:number;w:number;h:number;r:number},gain=original.volume??1;
   const baseline={at,duration,in:span.from,x:rect.x+rect.w/2,y:rect.y+rect.h/2,width:rect.w,height:rect.h,rotation:rect.r,gain,speed:span.speed};
   const clip:FilmClip={id:original.id,sourceId:source.id,title:source.title,at,duration,in:span.from,appearance:{values:{x:baseline.x,y:baseline.y,width:rect.w,height:rect.h,rotation:rect.r}},openfilm:{original:structuredClone(original),baseline}};
   if(mapped==='video'||mapped==='audio'){clip.audio={gain,role:({voice:'narration',music:'music',sfx:'sfx'} as const)[soundRole(original.src) as 'voice'|'music'|'sfx']};if(span.speed!==1)clip.timing={rate:span.speed};}
   const fade=original.overrides?.find(o=>'fade' in o);if(fade&&'fade' in fade)clip.fade={in:fade.fade[0]*doc.frameRate.numerator/doc.frameRate.denominator,out:fade.fade[1]*doc.frameRate.numerator/doc.frameRate.denominator,span:duration};
   track.clips.push(clip);
  }
 }
 return {document:parseFilmDocument(doc),warnings};
}
/** Strict interchange: refuse unrepresentable authoring, instead of silently dropping it. */
export function exportOpenFilmHtml(doc:FilmDocument):string {
 filmAssert(doc.background===undefined,'自定义舞台背景需导出互动 HTML 包或视频保留');
 const value:OpenFilmValue={stage:{w:doc.width,h:doc.height},tracks:[]};const sec=(f:number)=>frameSeconds(f,doc.frameRate);
 for(const track of doc.tracks){if(track.kind==='subtitle')continue;const row:OpenFilmValue['tracks'][number]={clips:[],...(track.openfilmAttrs?{attrs:{...track.openfilmAttrs}}:{}),...(track.hidden?{hidden:true}:{}),...(track.muted?{muted:true}:{}),...(track.locked?{locked:true}:{})};value.tracks.push(row);
  for(const c of track.clips){const source=doc.sources.find(s=>s.id===c.sourceId)!;filmAssert(['openfilm','video','audio','image'].includes(source.kind),`${c.title}: 此素材需用“互动 HTML 包”导出`);
   filmAssert(!c.color&&!c.objects&&!c.masks?.length&&!c.transitionIn&&!Object.keys(c.appearance?.keyframes??{}).length&&!c.timing?.map?.length&&!(c.timing?.rate!==undefined&&(c.timing.rate<.25||c.timing.rate>4))&&!c.audio?.effects&&!c.audio?.duck?.enabled&&!c.audio?.keys?.length,`${c.title}: film.html 0.1 无法表示这些特效，请导出互动 HTML 包或 MP4`);
   const o=c.openfilm,base=o?.baseline,raw:FilmHtmlClip=o?structuredClone(o.original):{id:c.id,src:source.uri};raw.id=c.id;
   const baseUrl=doc.openfilm?.baseUrl??'http://notale.invalid/';if(!o||new URL(raw.src,baseUrl).href!==new URL(source.uri,baseUrl).href)raw.src=source.uri;
   if(!base||c.at!==base.at)raw.at=sec(c.at);
   const speed=c.timing?.rate??1;if(!base||c.duration!==base.duration||c.in!==base.in||speed!==base.speed)raw.time=[c.in,c.in+sec(c.duration)*speed];
   if(source.kind==='video'||source.kind==='audio'){if(!base||speed!==base.speed)raw.speed=speed;const gain=c.audio?.muted?0:c.audio?.gain??1;if(!base||gain!==base.gain)raw.volume=gain;if(source.kind==='audio'&&kindOf({src:raw.src})==='video')raw.sound=true;}
   const a=c.appearance?.values??{},num=(key:keyof typeof a,defaultValue:number)=>typeof a[key]==='number'?a[key] as number:defaultValue;
   const w=num('width',source.width??doc.width)*num('scaleX',1),h=num('height',source.height??doc.height)*num('scaleY',1),x=num('x',doc.width/2),y=num('y',doc.height/2),r=num('rotation',0);
   filmAssert(!num('skewX',0)&&w>0&&h>0,`${c.title}: film.html 不支持斜切或镜像，请导出互动 HTML 包`);
   if(source.kind!=='audio'&&(!base||w!==base.width||h!==base.height||x!==base.x||y!==base.y||r!==base.rotation))raw.box={x:x-w/2,y:y-h/2,w,h,r};
   const style=raw.style??'',extra:string[]=[];const css=(p:string,v:unknown)=>{if(v!==undefined)extra.push(`${p}: ${v}`);};
   css('opacity',a.opacity);css('mix-blend-mode',a.blendMode);css('object-fit',a.fit);if(a.radius!==undefined)css('border-radius',`${a.radius}px`);
   if(['blur','brightness','contrast','saturation','hue'].some(k=>a[k as keyof typeof a]!==undefined))css('filter',`blur(${num('blur',0)}px) brightness(${num('brightness',1)}) contrast(${num('contrast',1)}) saturate(${num('saturation',1)}) hue-rotate(${num('hue',0)}deg)`);
   if(a.mask==='ellipse')css('clip-path','ellipse(50% 50% at 50% 50%)');else if(a.mask==='inset')css('clip-path',`inset(${num('cropTop',0)}% ${num('cropRight',0)}% ${num('cropBottom',0)}% ${num('cropLeft',0)}%)`);
   if(extra.length)raw.style=[style,...extra].filter(Boolean).join('; ');
   const fade=c.fade??(c.audio?.fadeIn||c.audio?.fadeOut?{in:c.audio.fadeIn??0,out:c.audio.fadeOut??0,span:c.audio.span??c.duration}:undefined);
   if(fade){filmAssert(!(c.animationOffset??0)&&!('start' in fade&&fade.start)&&fade.span===c.duration,`${c.title}: 修剪后的淡变需互动 HTML 包保留`);raw.overrides=[...(raw.overrides??[]).filter(o=>!('fade' in o)),{fade:[sec(fade.in),sec(fade.out)]}];}
   row.clips.push(raw);
  }
 }
 const html=filmHtml(value,doc.openfilm?.html??'');readOpenFilmHtml(html);return html;
}
