'use client';
import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {useEditorSelector} from '../state/use-editor-selector';
export function StyleScope({scope,children}:{scope:'global'|'object';children:ReactNode}){
 const selected=useEditorSelector(state=>state.selectedIds.length>0);
 return <section id={scope+'-style'} hidden={scope==='object'?!selected:selected}>{children}</section>;
}
/** Scroll position is view-local; author state never contains DOM references. */
export function StyleScopeScroll(){
 const selected=useEditorSelector(state=>state.selectedIds.length>0),format=useEditorSelector(state=>state.sidebar.tab==='format');
 const positions=useRef({global:0,object:0});
 useLayoutEffect(()=>{
  if(!format)return;
  const panel=document.getElementById('property-panel');if(!panel)return;
  const scope=selected?'object':'global';panel.scrollTop=positions.current[scope];
  const remember=()=>{positions.current[scope]=panel.scrollTop;};
  panel.addEventListener('scroll',remember,{passive:true});
  return()=>panel.removeEventListener('scroll',remember);
 },[selected,format]);
 return null;
}
