import {importOpenFilmHtml,readOpenFilmHtml,type FilmDocument,type FilmSource} from '@notale/editor/film';
import {loadOpenFilm} from './openfilm-page.js';
const hidden=(node:HTMLElement,w=1280,h=720)=>{node.style.cssText=`position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;pointer-events:none;overscroll-behavior:none`;document.body.append(node);return node;};
export async function mediaMetadata(uri:string,kind:FilmSource['kind'],size?:{w:number;h:number}){
 if(kind==='openfilm'){const frame=hidden(document.createElement('iframe'),size?.w,size?.h) as HTMLIFrameElement,abort=new AbortController();try{const loaded=await loadOpenFilm(frame,uri,abort.signal,message=>{throw Error(message);});loaded.transport.dispose();return {duration:loaded.duration,width:loaded.width,height:loaded.height};}finally{abort.abort();frame.remove();}}
 const media=kind==='image'?new Image():document.createElement(kind==='audio'?'audio':'video');
 try{return await new Promise<{duration?:number;width?:number;height?:number}>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('读取素材超时：'+uri)),15000);const end=(fn:()=>void)=>{clearTimeout(timer);fn();};media.onerror=()=>end(()=>reject(Error('无法读取素材：'+uri)));const loaded=()=>end(()=>{if(media instanceof HTMLImageElement)resolve({width:media.naturalWidth,height:media.naturalHeight});else resolve({duration:media.duration,...(media instanceof HTMLVideoElement?{width:media.videoWidth,height:media.videoHeight}:{})});});media.addEventListener(kind==='image'?'load':'loadedmetadata',loaded,{once:true});if(media instanceof HTMLMediaElement)media.preload='metadata';media.src=uri;});}finally{media.removeAttribute('src');if(media instanceof HTMLMediaElement)media.load();}
}
/** Resolve static film head CSS in an inert viewport, preserving selector/track order.
 * Only visual properties are copied; placement is owned by the timeline. */
async function resolveLook(doc:FilmDocument){
 const raw=readOpenFilmHtml(doc.openfilm!.html),parsed=new DOMParser().parseFromString(doc.openfilm!.html,'text/html');
 for(const node of parsed.querySelectorAll('script,base,meta[http-equiv]'))node.remove();
 for(const node of parsed.querySelectorAll<HTMLElement>('*'))for(const attr of [...node.attributes])if(attr.name.startsWith('on'))node.removeAttribute(attr.name);
 for(const iframe of parsed.querySelectorAll('iframe'))iframe.setAttribute('srcdoc','');
 for(const media of parsed.querySelectorAll<HTMLMediaElement>('video,audio')){media.preload='none';media.removeAttribute('autoplay');}
 const base=parsed.createElement('base');base.href=doc.openfilm!.baseUrl;parsed.head.prepend(base);
 // Assign generated missing clip ids without rewriting the author's kept HTML.
 const sections=[...parsed.body.children].filter(e=>e.localName==='section');sections.forEach((section,i)=>[...section.children].forEach((el,j)=>el.id=raw.tracks[i].clips[j].id));
 const frame=hidden(document.createElement('iframe'),doc.width,doc.height) as HTMLIFrameElement;frame.setAttribute('sandbox','allow-same-origin');
 try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('film.html 样式载入超时')),15000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;});
  const win=frame.contentWindow!,page=frame.contentDocument!,props='opacity mix-blend-mode filter backdrop-filter clip-path mask-image mask-mode mask-size mask-position mask-repeat mask-composite border-top-left-radius border-top-right-radius border-bottom-left-radius border-bottom-right-radius border-top-width border-right-width border-bottom-width border-left-width border-top-style border-right-style border-bottom-style border-left-style border-top-color border-right-color border-bottom-color border-left-color box-shadow background-color background-image background-size background-position background-repeat color object-fit object-position'.split(' ');
  for(const track of doc.tracks)if(track.kind==='media')for(const clip of track.clips){const element=page.getElementById(clip.id);if(!element)continue;const css=win.getComputedStyle(element);clip.openfilm!.resolvedStyle=Object.fromEntries(props.map(p=>[p,css.getPropertyValue(p)]));if(!element.style.objectFit&&css.objectFit==='fill')clip.openfilm!.resolvedStyle['object-fit']='contain';}
 }finally{frame.remove();}
}
export async function openFilmFile(html:string,baseUrl:string,id:string,title:string){const result=await importOpenFilmHtml(html,{id,title,baseUrl:new URL(baseUrl,location.href).href,metadata:mediaMetadata});await resolveLook(result.document);return result;}
