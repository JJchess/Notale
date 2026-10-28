import type {FilmDocument} from '@notale/editor/film';
import type {ScopePixels} from './color-engine.js';
export interface FinalScopePixels extends ScopePixels {frame:number;requestId:string;documentId:string}
/** Captures one immutable request's final composition. Callers invalidate it when the view changes. */
export async function captureFinalScope(options:{document:FilmDocument;frame:number;languages?:string[];signal?:AbortSignal}):Promise<FinalScopePixels>{
 const requestId=crypto.randomUUID(),documentId=options.document.id,frame=options.frame;
 const response=await fetch('/film-export/scope-frame',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId,document:options.document,frame,languages:options.languages}),signal:options.signal});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error??'最终合成采样失败');}
 const width=Number(response.headers.get('X-Scope-Width')),height=Number(response.headers.get('X-Scope-Height'));
 if(response.headers.get('X-Scope-Request-Id')!==requestId||response.headers.get('X-Scope-Frame')!==String(frame)||decodeURIComponent(response.headers.get('X-Scope-Document-Id')??'')!==documentId)throw Error('采样结果已过期，请刷新');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>256||height>256||Number(response.headers.get('Content-Length'))!==width*height*4)throw Error('采样像素尺寸无效');
 const pixels=new Uint8Array(await response.arrayBuffer());options.signal?.throwIfAborted();
 if(pixels.byteLength!==width*height*4)throw Error('采样像素不完整');
 return {pixels,width,height,frame,requestId,documentId};
}
