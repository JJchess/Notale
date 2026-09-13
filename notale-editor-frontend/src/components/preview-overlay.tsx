'use client';
import {viewportViewState} from '../state/viewport-view';
import {ResourceNotice} from './resource-notice';
import {useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {PreviewController} from '../canvas/preview-controller';
import {previewSession,previewActions} from '../state/preview-session';
function usePreview(){return useSyncExternalStore(previewSession.subscribe,previewSession.getSnapshot,previewSession.getServerSnapshot);}
function ModeIcons(){return <>
 <span className="mode-pencil"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 3 6 6-12 12H3v-6ZM13 5l6 6"/></svg></span>
 <span className="mode-eye"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></span>
 </>;}
function Arrow({right=false}:{right?:boolean}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={right?'m10 5 7 7-7 7':'m14 5-7 7 7 7'}/></svg>;}
export function PreviewToggle(){const state=usePreview();return <button id="interact" className="mode-switch" aria-label="预览讲义" aria-pressed={state.open} aria-busy={state.opening} disabled={state.opening} title="预览讲义" onClick={()=>{viewportViewState.getSnapshot().panMode?.(false);void previewActions.open();}}><ModeIcons/></button>;}
export function PreviewOverlay(){
 const state=usePreview(),dialog=useRef<HTMLDialogElement>(null),host=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 useLayoutEffect(()=>{
  const controller=new PreviewController(host.current!,previewSession,{prepare:()=>previewActions.prepare(),error:error=>previewActions.error(error)});
  const open=(step?:number)=>{if(!previewSession.getSnapshot().open&&!previewSession.getSnapshot().opening)returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;return controller.open(step);};
  previewActions.open=open;previewActions.close=controller.close;previewActions.navigate=controller.navigate;previewActions.retry=controller.retry;
  return()=>{if(previewActions.open===open){previewActions.open=async()=>{};previewActions.close=()=>{};previewActions.navigate=()=>{};previewActions.retry=async()=>{};}controller.dispose();};
 },[]);
 useLayoutEffect(()=>{
  if(!state.open)return;
  const node=dialog.current!,focus=returnFocus.current;
  node.showModal();document.body.classList.add('preview-open');node.querySelector<HTMLButtonElement>('#preview-close')?.focus();
  const keyboard=(event:KeyboardEvent)=>{
   const plain=!event.defaultPrevented&&!event.isComposing&&event.keyCode!==229&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey;
   if(plain&&event.key==='Escape'){event.preventDefault();previewActions.close();}
   else if(plain&&['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();previewActions.navigate(['ArrowRight','PageDown'].includes(event.key)?1:-1);}
   event.stopImmediatePropagation();
  };
  window.addEventListener('keydown',keyboard,true);
  return()=>{window.removeEventListener('keydown',keyboard,true);node.close();document.body.classList.remove('preview-open');if(focus?.isConnected)focus.focus({preventScroll:true});returnFocus.current=null;};
 },[state.open]);
 const ready=state.status==='ready';
 return <dialog id="preview-overlay" ref={dialog} aria-label="讲义预览" onCancel={event=>{event.preventDefault();previewActions.close();}} onClose={()=>{if(previewSession.getSnapshot().open)previewActions.close();}}>
  <header className="preview-header"><span>预览</span><strong id="preview-title">{state.source?.snapshot.document.title}</strong><button id="preview-present" onClick={()=>previewActions.present()}>放映 ↗</button><button id="preview-close" aria-label="返回编辑" onClick={()=>previewActions.close()}>返回编辑 ×</button></header>
  <div className="preview-area"><div id="preview-canvas-host" ref={host} style={{position:'absolute',inset:0}}/><div id="preview-loading" role="status" hidden={ready}>{state.error||'正在加载预览…'}</div><button id="preview-retry" hidden={state.status!=='failed'} onClick={()=>void previewActions.retry()}>重新加载</button></div>
  <nav className="preview-navigation" aria-label="预览导航"><button id="preview-previous" className="icon-button" title="上一步或上一页" aria-label="上一步或上一页" disabled={!ready||(state.index===0&&state.step===0)} onClick={()=>previewActions.navigate(-1)}><Arrow/></button><output id="preview-position">{state.count?`${state.index+1} / ${state.count}${state.max>0?` · ${state.step} / ${state.max}`:''}`:''}</output><button id="preview-next" className="icon-button" title="下一步或下一页" aria-label="下一步或下一页" disabled={!ready||(state.index===state.count-1&&state.step===state.max)} onClick={()=>previewActions.navigate(1)}><Arrow right/></button></nav>
  <button id="preview-edit-toggle" className="mode-switch is-preview" aria-label="返回编辑" title="返回编辑" onClick={()=>previewActions.close()}><ModeIcons/></button>
 <ResourceNotice scope="preview"/>
 </dialog>;
}
