'use client';
import {useEffect,useRef,useState} from 'react';
import type {Snapshot} from '@notale/editor/browser';
import {EditorChrome} from './editor-chrome';
import {FilmWorkspace,FilmTimeline,FilmImports,FilmExports,FilmViewControls,FilmMediaSources,FilmClipInspector,FilmPageNavigation,FilmNativeProperties,FilmLayers,FilmAnimation,FilmAnimationTools} from '../film/surface';
import {bindEditorNavigation} from '../editor-navigation';
import {setSaveStatus} from '../save-status';
type OpenDocument={id?:string;kind:'deck'|'film'};
type Controller={dispose:()=>void;beforeLeave?:()=>Promise<void>};
/** One route and one chrome; document controllers provide capabilities inside it. */
export function Editor(){
 const host=useRef<HTMLDivElement>(null),controller=useRef<Controller|undefined>(undefined);
 const [opened,setOpened]=useState<OpenDocument>(),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,serial=0;const abort=new AbortController();
  async function open(id?:string,initial=false){const token=++serial;setError('');
   try{
    if(!initial)await controller.current?.beforeLeave?.();
    let chosen=id;
    if(!chosen){const response=await fetch('/api/documents',{signal:abort.signal});if(!response.ok)throw Error('无法读取文件列表');const rows=await response.json() as {id:string}[];chosen=rows[0]?.id;}
    let kind:OpenDocument['kind']='deck';
    if(chosen){const response=await fetch(`/api/documents/${encodeURIComponent(chosen)}`,{signal:abort.signal});if(!response.ok)throw Error('无法打开此文件');const snapshot=await response.json() as Snapshot;kind=snapshot.document.kind==='film'?'film':'deck';}
    if(!active||token!==serial)return;
    const url=new URL(location.href);url.pathname='/';url.searchParams.delete('film');if(chosen)url.searchParams.set('document',chosen);else url.searchParams.delete('document');history.replaceState(null,'',url);
    setOpened({id:chosen,kind});
   }catch(cause){if(active&&token===serial){setError(cause instanceof Error?cause.message:String(cause));throw cause;}}
  }
  const unbind=bindEditorNavigation(id=>open(id));
  const pop=()=>{void open(new URL(location.href).searchParams.get('document')??undefined).catch(()=>{});};window.addEventListener('popstate',pop);
  void open(new URL(location.href).searchParams.get('document')??undefined,true).catch(()=>{});
  return()=>{active=false;serial++;abort.abort();unbind();window.removeEventListener('popstate',pop);};
 },[]);
 useEffect(()=>{
  if(!opened)return;let active=true,work:Controller|undefined;
  const start=async()=>{
   if(opened.kind==='film'){
    const {mountFilmWorkbench}=await import('../film/workbench');if(active)work=mountFilmWorkbench(host.current!.querySelector<HTMLElement>('.film-surface')!,{documentId:opened.id!});
   }else{const {mountWorkbench}=await import('../workbench');if(active)work=mountWorkbench({documentId:opened.id});}
   if(active)controller.current=work;
  };
  void start().catch(cause=>{if(active){console.error(cause);setError(String(cause));setSaveStatus({label:'加载失败',detail:'编辑器加载失败，请刷新重试',state:'failed'});}});
  return()=>{active=false;if(controller.current===work)controller.current=undefined;work?.dispose();};
 },[opened]);
 return <div ref={host} className="notale-editor"><EditorChrome surface={opened?.kind==='film'?{workspace:<FilmWorkspace/>,timeline:<FilmTimeline/>,media:<FilmMediaSources/>,inspector:<FilmClipInspector/>,animation:<FilmAnimation/>,animationTools:<FilmAnimationTools/>,layers:<FilmLayers/>,nativeProperties:FilmNativeProperties,pageList:<FilmPageNavigation/>,imports:<FilmImports/>,exports:<FilmExports/>,present:<FilmViewControls/>}:undefined}/>{error&&<div className="editor-open-error" role="alert">{error}<button onClick={()=>location.reload()}>重试</button></div>}</div>;
}
