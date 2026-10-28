import {template} from '../templates';
import {cleanOverlayHtml} from './overlay-page';
import {clipEnd,secondsFrame,type FilmDocument,type FilmClip,type FilmCommand,type FilmMediaTrack,type FilmSource} from '@notale/editor/film';

/** The shared catalog only enables types that remain editable after persistence. */
export function filmInsertionReason(kind:string):string|undefined {
 if(['text','vertical-text','date','symbol','code','line','image','video','audio'].includes(kind)||/^(shape|icon|wordart):/.test(kind))return;
 return ({ai:'当前内容暂不支持 AI 编辑','template:page':'当前内容暂不支持页面模板插入','template:diagram':'当前内容暂不支持图示模板的结构编辑',connector:'此内容暂不支持连接对象',equation:'此内容暂不支持公式资源',table:'此内容暂不支持表格结构编辑',chart:'此内容暂不支持动态图表'} as Record<string,string>)[kind]??'此内容暂不支持这种素材的结构编辑';
}
export function navigationTrack(doc:FilmDocument,wanted?:string):FilmMediaTrack|undefined {
 const visual=(track:FilmMediaTrack,overlay=true)=>track.clips.some(clip=>{const source=doc.sources.find(s=>s.id===clip.sourceId);return source&&source.kind!=='audio'&&(overlay||source.kind!=='overlay');});
 const tracks=doc.tracks.filter((t):t is FilmMediaTrack=>t.kind==='media');
 const saved=tracks.find(t=>t.id===wanted&&visual(t));if(saved)return saved;
 return tracks.find(t=>t.id==='v1'&&visual(t,false))??[...tracks].reverse().find(t=>visual(t,false))??[...tracks].reverse().find(t=>visual(t));
}
export function insertionDuration(doc:FilmDocument,at:number,navTrack?:string){
 const scene=navigationTrack(doc,navTrack)?.clips.find(c=>c.at<=at&&clipEnd(c)>at);
 return scene?clipEnd(scene)-at:Math.max(1,secondsFrame(5,doc.frameRate));
}
const sizes:Record<string,[number,number]>={text:[600,60],'vertical-text':[100,420],symbol:[120,90],code:[720,156],line:[400,80],shape:[300,160],icon:[160,160],wordart:[500,90],date:[600,60]};
export function nativeInsertPlan(o:{document:FilmDocument;kind:string;value?:string;at:number;duration:number;point?:{x:number;y:number};trackId?:string;uuid?:()=>string}) {
 const reason=filmInsertionReason(o.kind);if(reason)throw Error(reason);
 const uuid=o.uuid??(()=>crypto.randomUUID()),doc=o.document,sourceId=uuid(),clipId=uuid();
 const target=o.trackId?doc.tracks.find(t=>t.id===o.trackId):undefined;
 if(o.trackId&&(!target||target.kind!=='media'))throw Error('请选择画面轨道');
 if(target?.locked)throw Error('轨道已锁定，请选择可写轨道');
 const [w,h]=sizes[o.kind]??sizes[o.kind.split(':')[0]]??[300,160];
 const point=o.point??{x:doc.width/2,y:doc.height/2};
 const x=Math.round(Math.max(0,Math.min(doc.width-40,point.x-w/2))),y=Math.round(Math.max(0,Math.min(doc.height-40,point.y-h/2)));
 const html=cleanOverlayHtml(template(o.kind,o.value).replace('left:120px;top:160px;',`left:${x}px;top:${y}px;`));
 const fragment=new DOMParser().parseFromString(html,'text/html'),first=fragment.body.firstElementChild;
 if(!first?.getAttribute('data-notale-id'))throw Error('素材未能创建可编辑对象');
 const title=first.getAttribute('data-notale-name')??({text:'文字','vertical-text':'竖排文字',symbol:'符号',date:'日期'} as Record<string,string>)[o.kind]??'对象';
 const source:FilmSource={id:sourceId,kind:'overlay',uri:`overlay:${sourceId}`,title,html,width:doc.width,height:doc.height};
 const clip:FilmClip={id:clipId,sourceId,title,at:o.at,in:0,duration:Math.max(1,o.duration)};
 const commands:FilmCommand[]=[{type:'film.source.add',source}];
 const trackId=target?.id??uuid();
 if(target)commands.push({type:'film.clip.add',trackId,clip});
 else commands.push({type:'film.track.add',index:0,track:{id:trackId,title,kind:'media',locked:false,hidden:false,muted:false,clips:[clip]}});
 return {commands,clipId,trackId,sourceId,target:first.getAttribute('data-notale-id')!,text:['text','vertical-text','wordart','symbol','date'].includes(o.kind.split(':')[0])};
}
