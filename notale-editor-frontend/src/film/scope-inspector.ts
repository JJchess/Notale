import {localeStore,translateUi as filmText} from '../i18n/store';
import {timecode,type FilmDocument} from '@notale/editor/film';
import {FilmScope,type ScopePixels} from './color-engine.js';
import {captureFinalScope,type FinalScopePixels} from './scope-capture.js';
import './scopes.css';
export type ColorScopeMode='source'|'final';
export interface ScopeView {document:FilmDocument;frame:number;languages?:string[];revision:string;draft:boolean}
export interface FinalScopeControl {current:()=>ScopeView;mode:ColorScopeMode;changeMode:(mode:ColorScopeMode)=>void}
/** Shared monitor for media grades and Motale; never writes author state. */
export function scopeInspector(o:{pause:()=>void;scope?:()=>ScopePixels|undefined;report:(message:string)=>void;finalScope?:FinalScopeControl}){
 const abort=new AbortController();
 const scopes=document.createElement('section');scopes.className='film-scope-controls';scopes.setAttribute('aria-label',filmText('示波器'));
 const toolbar=document.createElement('div');toolbar.className='film-scope-toolbar';scopes.append(toolbar);
 const sourceMode=document.createElement('select');sourceMode.setAttribute('aria-label',filmText('示波器范围'));sourceMode.title=filmText('示波器范围');if(o.scope)sourceMode.append(new Option(filmText('所选素材（实时）'),'source'));if(o.finalScope)sourceMode.append(new Option(filmText('最终合成'),'final'));sourceMode.value=o.scope?(o.finalScope?.mode??'source'):'final';if(o.scope)toolbar.append(sourceMode);else{const title=document.createElement('strong');title.textContent=filmText('最终合成');toolbar.append(title);}
 const refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.className='film-scope-refresh';refreshButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>';toolbar.append(refreshButton);
 const mode=document.createElement('select');mode.setAttribute('aria-label',filmText('示波器类型'));mode.title=filmText('示波器类型');mode.append(new Option(filmText('RGB 波形'),'waveform'),new Option(filmText('RGB 分量'),'parade'),new Option(filmText('矢量示波器'),'vectorscope'));scopes.append(mode);
 const metadata=document.createElement('div');metadata.className='film-scope-metadata';const stamp=document.createElement('output'),status=document.createElement('span');status.setAttribute('role','status');metadata.append(stamp,status);scopes.append(metadata);
 let scope:FilmScope|undefined;try{scope=new FilmScope();scope.canvas.hidden=true;scopes.append(scope.canvas);}catch(error){o.report(String(error));}
 let previous:ScopePixels|undefined,previousMode='',viewKey='',generation=0,pending:AbortController|undefined,pendingFrame:string|undefined,error='',stale=false;
 let result:{pixels:FinalScopePixels;time:string}|undefined;
 const key=(view:ScopeView)=>JSON.stringify([view.document.id,view.frame,view.revision,view.languages,view.draft,localeStore.getSnapshot()]);
 const frameLabel=(view:ScopeView)=>`${timecode(view.frame,view.document.frameRate)} · ${view.frame} ${filmText('帧')}`;
 const cancel=()=>{generation++;pending?.abort();pending=undefined;pendingFrame=undefined;};
 const text=(node:HTMLElement,value:string)=>{if(node.textContent!==value)node.textContent=value;};
 function refresh(){
  if(abort.signal.aborted)return;
  const final=sourceMode.value==='final',view=o.finalScope?.current();
  if(view){const next=key(view);if(viewKey!==next){cancel();if(result)stale=true;error='';viewKey=next;}}
  refreshButton.hidden=!final;refreshButton.disabled=!!pending||!!view?.draft||!scope;
  refreshButton.title=filmText(view?.draft?'请先完成当前编辑':'暂停并刷新最终合成示波器');refreshButton.setAttribute('aria-label',refreshButton.title);
  scopes.dataset.mode=final?'final':'source';scopes.dataset.stale=String(final&&stale);scopes.setAttribute('aria-busy',String(!!pending));
  const sample=final?result?.pixels:o.scope?.();
  if(scope){scope.canvas.hidden=!sample;scope.canvas.setAttribute('aria-label',filmText(final?'最终合成示波器':'所选片段示波器'));if(sample&&(sample!==previous||previousMode!==mode.value)){scope.draw(sample,mode.value as 'waveform'|'parade'|'vectorscope');previous=sample;previousMode=mode.value;}}
  text(stamp,final?(result?.time??pendingFrame??''):'');
  text(status,final?filmText(error||(view?.draft?'请先完成当前编辑':pending?'正在捕获':stale?'已过期':'')):sample?'':filmText('当前帧素材尚未就绪'));
  metadata.dataset.error=String(!!error);metadata.hidden=!stamp.textContent&&!status.textContent;
 }
 sourceMode.onchange=()=>{cancel();result=undefined;previous=undefined;stale=false;error='';o.finalScope?.changeMode(sourceMode.value as ColorScopeMode);refresh();};
 mode.onchange=refresh;
 refreshButton.onclick=()=>{void (async()=>{
  if(!o.finalScope||sourceMode.value!=='final'||abort.signal.aborted)return;
  o.pause();refresh();const view=o.finalScope.current();
  if(view.draft){error='请先完成当前编辑';refresh();return;}
  cancel();const controller=new AbortController(),requestGeneration=generation,requestKey=key(view);pending=controller;pendingFrame=frameLabel(view);error='';if(result)stale=true;refresh();
  try{
   const pixels=await captureFinalScope({document:structuredClone(view.document),frame:view.frame,languages:view.languages?[...view.languages]:undefined,signal:controller.signal});
   if(abort.signal.aborted||controller.signal.aborted||requestGeneration!==generation||sourceMode.value!=='final'||requestKey!==key(o.finalScope.current()))return;
   result={pixels,time:frameLabel(view)};stale=false;
  }catch(cause){if(!controller.signal.aborted&&requestGeneration===generation&&!abort.signal.aborted){error=cause instanceof Error?cause.message:String(cause);}}
  finally{if(requestGeneration===generation){pending=undefined;pendingFrame=undefined;refresh();}}
 })();};
 refresh();return {node:scopes,refresh,dispose(){cancel();abort.abort();scope?.dispose();}};
}
