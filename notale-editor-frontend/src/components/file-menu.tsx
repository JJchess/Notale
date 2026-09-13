'use client';
import { isComposingKey } from "../keyboard";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {computePosition,flip,shift,offset} from '@floating-ui/dom';
import {editorActions,editorSession} from '../state/editor-session';
import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';

export function FileMenu(){
  const current=useEditorSelector(state=>({id:state.document?.document.id??'',title:state.document?.document.title??'未打开讲义'}),shallowEqual);
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [position,setPosition]=useState({left:0,top:0});
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),source=useRef({id:'',title:''}),saving=useRef(false);
  useLayoutEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  useEffect(()=>{if(!open)return;let active=true;const button=trigger.current!,popup=menu.current!;
    void computePosition(button,popup,{strategy:'fixed',placement:'bottom-start',middleware:[offset(6),flip(),shift({padding:8})]}).then(value=>{if(active)setPosition({left:value.x,top:value.y});});
    popup.querySelector<HTMLButtonElement>('button')?.focus();
    const outside=(event:PointerEvent)=>{if(!popup.contains(event.target as Node)&&!button.contains(event.target as Node))setOpen(false);};
    const close=()=>setOpen(false);
    const message=(event:MessageEvent)=>{if(event.source===document.querySelector<HTMLIFrameElement>('#canvas')?.contentWindow&&event.data?.type==='context-dismiss')close();};
    document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('message',message);
    return()=>{active=false;document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('message',message);};
  },[open]);
  useEffect(()=>{setOpen(false);setEditing(false);},[current.id]);
  function rename(){setOpen(false);source.current={id:current.id,title:current.title};setDraft(current.title);setError('');setEditing(true);}
  async function submit(){if(saving.current)return;saving.current=true;setPending(true);setError('');try{await editorActions.renameDocument(source.current,draft);setEditing(false);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{saving.current=false;setPending(false);}}
  function choose(action:string){setOpen(false);if(action==='rename')rename();if(action==='switch')editorSession.update({switchingDocument:true});if(action==='history')void editorActions.openHistory().catch(editorActions.reportError);if(action==='recovery')editorActions.openRecovery();}
  return <>
    <button ref={trigger} id="file-menu-trigger" className="file-title-button" hidden={editing} disabled={!current.id} aria-haspopup="menu" aria-expanded={open} title="文件菜单" onClick={()=>setOpen(value=>!value)} onDoubleClick={rename}><span id="file-title">{current.title}</span><span aria-hidden="true">⌄</span></button>
    <form id="rename-document-form" hidden={!editing} data-busy={pending} onSubmit={event=>{event.preventDefault();void submit();}} onKeyDown={event=>{event.stopPropagation();if(isComposingKey(event.nativeEvent))return;if(event.key==='Escape'){event.preventDefault();if(!pending){setEditing(false);requestAnimationFrame(()=>trigger.current?.focus());}}}}>
      <input ref={input} id="deck-title" required maxLength={300} aria-label="文件名" value={draft} disabled={pending} onChange={event=>setDraft(event.target.value)}/><span role="status">{error}</span>
    </form>
    {open&&createPortal(<div ref={menu} id="file-menu" className="editor-popup" role="menu" style={{position:'fixed',...position}} onKeyDown={event=>{
      event.stopPropagation();if(isComposingKey(event.nativeEvent))return;const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}if(event.key==='Tab')setOpen(false);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
    }}>
      <button data-file="rename" role="menuitem" onClick={()=>choose('rename')}>重命名</button><button data-file="switch" role="menuitem" onClick={()=>choose('switch')}>切换讲义…</button><hr/>
      <button data-file="history" role="menuitem" onClick={()=>choose('history')}>历史版本…</button><button data-file="recovery" role="menuitem" onClick={()=>choose('recovery')}>恢复修改…</button>
    </div>,document.body)}
  </>;
}
