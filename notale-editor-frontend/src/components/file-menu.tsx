'use client';
import {useI18n} from '../i18n/react';

import { isComposingKey } from "../keyboard";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {computePosition,flip,shift,offset} from '@floating-ui/dom';
import {editorActions} from '../state/editor-session';
import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';

/** The title is the lecture picker: click it for the other lectures, the pencil (or a double click)
 * to rename this one. */
export function FileMenu(){
 const t=useI18n();

  const current=useEditorSelector(state=>({id:state.document?.document.id??'',title:state.document?.document.title??'未打开讲义',documents:state.documents,busy:state.busy}),shallowEqual);
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [position,setPosition]=useState({left:0,top:0}),[query,setQuery]=useState('');
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),source=useRef({id:'',title:''}),saving=useRef(false);
  useLayoutEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  useEffect(()=>{if(!open)return;let active=true;const button=trigger.current!,popup=menu.current!;
    void computePosition(button,popup,{strategy:'fixed',placement:'bottom-start',middleware:[offset(6),flip(),shift({padding:8})]}).then(value=>{if(active)setPosition({left:value.x,top:value.y});});
    setQuery('');popup.querySelector<HTMLInputElement>('input')?.focus();
    const outside=(event:PointerEvent)=>{if(!popup.contains(event.target as Node)&&!button.contains(event.target as Node))setOpen(false);};
    const close=()=>setOpen(false);
    const message=(event:MessageEvent)=>{if(event.source===document.querySelector<HTMLIFrameElement>('#canvas')?.contentWindow&&event.data?.type==='context-dismiss')close();};
    document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('message',message);
    return()=>{active=false;document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('message',message);};
  },[open]);
  useEffect(()=>{setOpen(false);setEditing(false);},[current.id]);
  function rename(){setOpen(false);source.current={id:current.id,title:current.title};setDraft(current.title);setError('');setEditing(true);}
  async function submit(){if(saving.current)return;saving.current=true;setPending(true);setError('');try{await editorActions.renameDocument(source.current,draft);setEditing(false);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{saving.current=false;setPending(false);}}
  // A library can hold thousands of lectures: a search box, and only the first matches listed.
  const needle=query.trim().toLowerCase(),matches=current.documents.filter(item=>!needle||item.title.toLowerCase().includes(needle)).slice(0,50);
  async function choose(id:string){setOpen(false);if(id===current.id||current.busy)return;try{await editorActions.loadDocument(id);}catch(cause){editorActions.reportError(cause);}}
  return <>
    <div className="file-title" hidden={editing}>
      <button ref={trigger} id="file-menu-trigger" className="file-title-button" disabled={!current.id} aria-haspopup="menu" aria-expanded={open} title={t("切换讲义")} onClick={()=>setOpen(value=>!value)} onDoubleClick={rename}><span id="file-title">{current.id?current.title:t(current.title)}</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></button>
      <button type="button" id="rename-document" className="file-rename" disabled={!current.id} aria-label={t("重命名")} title={t("重命名")} onClick={rename}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4"/></svg></button>
    </div>
    <form id="rename-document-form" hidden={!editing} data-busy={pending} onSubmit={event=>{event.preventDefault();void submit();}} onKeyDown={event=>{event.stopPropagation();if(isComposingKey(event.nativeEvent))return;if(event.key==='Escape'){event.preventDefault();if(!pending){setEditing(false);requestAnimationFrame(()=>trigger.current?.focus());}}}}>
      <input ref={input} id="deck-title" required maxLength={300} aria-label={t("文件名")} value={draft} disabled={pending} onChange={event=>setDraft(event.target.value)}/><span role="status">{t(error)}</span>
    </form>
    {open && createPortal(<div ref={menu} id="file-menu" className="editor-popup" role="menu" aria-label={t("切换讲义")} style={{position:'fixed',...position}} onKeyDown={event=>{
      event.stopPropagation();if(isComposingKey(event.nativeEvent))return;const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}if(event.key==='Tab')setOpen(false);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
    }}>
      <input type="search" className="file-menu-search" aria-label={t("搜索")} placeholder={t("搜索")} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!isComposingKey(event.nativeEvent)&&matches[0]){event.preventDefault();void choose(matches[0].id);}}}/>
      {matches.map(item=><button key={item.id} role="menuitemradio" aria-checked={item.id===current.id} title={item.title} data-document={item.id} onClick={()=>void choose(item.id)}><span>{item.title}</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.5 3.6"/></svg></button>)}
    </div>,document.body)}
  </>;
}
