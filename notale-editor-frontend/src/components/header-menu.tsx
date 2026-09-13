'use client';
import { isComposingKey } from "../keyboard";
import {useEffect,useLayoutEffect,useRef,type ReactNode} from 'react';
import {editorSession} from '../state/editor-session';
import {useEditorSelector} from '../state/use-editor-selector';
export function HeaderMenu({id,label,title,children}:{id:'import'|'export';label:string;title:string;children:ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null),focusIndex=useRef<number|undefined>(undefined),open=useEditorSelector(state=>state.headerMenu===id);
 const items=()=>[...ref.current!.querySelectorAll<HTMLElement>('.editor-popup > button,.editor-popup > label')].filter(node=>!node.hidden&&!node.hasAttribute('disabled'));
 const close=(focus=false)=>{if(editorSession.getSnapshot().headerMenu===id)editorSession.update({headerMenu:undefined});if(focus)ref.current?.querySelector('summary')?.focus();};
 useLayoutEffect(()=>{if(open&&focusIndex.current!==undefined){items().at(focusIndex.current)?.focus();focusIndex.current=undefined;}},[open]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))close();},blur=()=>close();document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',blur);return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',blur);};},[open]);
 useEffect(()=>()=>{if(editorSession.getSnapshot().headerMenu===id)editorSession.update({headerMenu:undefined});},[id]);
 return <details ref={ref} className="header-menu" data-header-menu={id} open={open} onKeyDown={event=>{
  if(isComposingKey(event.nativeEvent))return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close();return;}
  const target=event.target as HTMLElement;
  if((event.key==='Enter'||event.key===' ')&&target.tagName==='LABEL'){event.preventDefault();target.querySelector('input')?.click();close();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const keys=items(),direction=event.key==='ArrowUp'?-1:1;
  if(!open){focusIndex.current=event.key==='ArrowUp'||event.key==='End'?-1:0;editorSession.update({headerMenu:id});return;}
  const index=keys.indexOf(document.activeElement as HTMLElement);keys[event.key==='Home'?0:event.key==='End'?keys.length-1:(index+direction+keys.length)%keys.length]?.focus();
 }}><summary title={title} aria-expanded={open} onClick={event=>{event.preventDefault();editorSession.update({headerMenu:open?undefined:id});}}>{label}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div className="editor-popup" onClick={event=>{if((event.target as HTMLElement).closest('button,label'))close();}}>{children}</div></details>;
}
