'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {computePosition,flip,shift,offset} from '@floating-ui/dom';
import {isComposingKey} from '../keyboard';
export type PageMenuTarget={id:string;documentId:string;x:number;y:number;origin:HTMLButtonElement};
export function PageMenu({target,index,count,close,action}:{target:PageMenuTarget;index:number;count:number;close:(restore?:boolean)=>void;action:(action:string)=>void}){
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:target.x,top:target.y});
 const closeRef=useRef(close);closeRef.current=close;
 useLayoutEffect(()=>{
  let live=true;const popup=ref.current!;
  void computePosition({getBoundingClientRect:()=>new DOMRect(target.x,target.y,0,0)},popup,{strategy:'fixed',placement:'bottom-start',middleware:[offset(4),flip(),shift({padding:8})]}).then(p=>{if(live)setPosition({left:p.x,top:p.y});});
  popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  const outside=(event:Event)=>{if(!popup.contains(event.target as Node))closeRef.current();};
  const dismiss=()=>closeRef.current();
  const message=(event:MessageEvent)=>{if(event.source===document.querySelector<HTMLIFrameElement>('#canvas')?.contentWindow&&event.data?.type==='context-dismiss')dismiss();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('scroll',outside,true);window.addEventListener('resize',dismiss);window.addEventListener('message',message);
  return()=>{live=false;document.removeEventListener('pointerdown',outside,true);document.removeEventListener('scroll',outside,true);window.removeEventListener('resize',dismiss);window.removeEventListener('message',message);};
 },[target]);
 const entries=[{id:'add',label:'新建页面'},{id:'copy',label:'复制页面',key:'Ctrl/⌘ D'},{id:'delete',label:'删除页面',key:'Delete',disabled:count<=1},{id:'up',label:'上移',key:'Alt ↑',disabled:index<=0,separator:true},{id:'down',label:'下移',key:'Alt ↓',disabled:index<0||index>=count-1},{id:'settings',label:'页面设置…',key:'F2',separator:true}];
 return createPortal(<div ref={ref} id="page-context-menu" className="editor-popup page-context-menu" role="menu" aria-label="页面快捷菜单" style={{position:'fixed',...position}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
  event.stopPropagation();if(isComposingKey(event.nativeEvent))return;
  if(event.key==='Escape'){event.preventDefault();close(true);return;}
  if(event.key==='Tab'){event.preventDefault();close(true);return;}
  if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}
 }} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))closeRef.current();}}>
 {entries.map(entry=><button key={entry.id} role="menuitem" data-page-action={entry.id} className={(entry.separator?'menu-section ':'')+(entry.id==='delete'?'danger':'')} disabled={index<0||entry.disabled} onClick={()=>action(entry.id)}><span>{entry.label}</span>{entry.key&&<kbd>{entry.key}</kbd>}</button>)}
 </div>,document.body);
}
