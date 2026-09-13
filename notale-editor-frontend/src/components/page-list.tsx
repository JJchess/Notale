'use client';
import { isComposingKey } from "../keyboard";

import {PageThumbnail} from './page-thumbnail';
import {pageSettingsActions} from '../page-settings';
import {useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {editorActions,editorSession} from '../state/editor-session';

import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';
const useSession=()=>useEditorSelector(state=>({document:state.document,activePageId:state.activePageId,pageQuery:state.pageQuery,overview:state.overview,overviewPage:state.overviewPage}),shallowEqual);
export function PageSearch(){
  const {pageQuery}=useSession();
  return <label className="slide-search">查找页面<input id="slide-search" type="search" placeholder="标题或章节" autoComplete="off" value={pageQuery} onKeyDown={event=>{if(!isComposingKey(event.nativeEvent)&&event.key==='Escape'&&pageQuery){event.preventDefault();event.stopPropagation();editorSession.update({pageQuery:'',overviewPage:0});}}} onChange={e=>editorSession.update({pageQuery:e.target.value,overviewPage:0})}/></label>;
}
export function PageList() {
  const state=useSession(),pages=state.document?.document.slides.filter(page=>!page.layoutSourceId)??[];
  const query=state.pageQuery.trim().toLocaleLowerCase();
  const matching=pages.filter((page,index)=>!query||`${String(index+1).padStart(2,'0')} ${page.name} ${page.section||'未分章节'} ${page.animations.length} 动画 ${page.hidden?'已隐藏':''}`.toLocaleLowerCase().includes(query));
  const group=Math.min(state.overviewPage,Math.max(0,Math.ceil(matching.length/8)-1));
  const displayed=state.overview?matching.slice(group*8,group*8+8):matching;
  const visible=new Set(displayed.map(page=>page.id));
  const cards=useRef(new Map<string,HTMLButtonElement>());
  const moving=useRef<{id:string;documentId:string}|undefined>(undefined);
  const moveSequence=useRef(0);
  const [drop,setDrop]=useState<{id:string;after:boolean}>();
  const [announcement,setAnnouncement]=useState('');
  const documentId=state.document?.document.id;
  useLayoutEffect(()=>{document.body.classList.toggle('overview-mode',state.overview);return()=>document.body.classList.remove('overview-mode');},[state.overview]);
  useLayoutEffect(()=>{editorActions.pagesCommitted();},[state.document,state.activePageId,state.pageQuery,state.overview,group]);
  useLayoutEffect(()=>{moving.current=undefined;setDrop(undefined);setAnnouncement('');},[documentId]);
  const run=(task:Promise<unknown>)=>{void task.catch(editorActions.reportError);};
  async function move(id:string,index:number){
    const sequence=++moveSequence.current;
    const origin=editorSession.getSnapshot(),card=cards.current.get(id);
    const focused=document.activeElement===card;
    await editorActions.movePage(id,index);
    const latest=editorSession.getSnapshot();
    if(sequence!==moveSequence.current||latest.document?.document.id!==origin.document?.document.id)return;
    // A settled reorder must not interrupt a newer page selection or field input.
    if(focused&&latest.activePageId===origin.activePageId&&(document.activeElement===card||document.activeElement===document.body))cards.current.get(id)?.focus({preventScroll:true});
    setAnnouncement(`页面已移动到第 ${index+1} 页`);
  }
  function keydown(event:KeyboardEvent<HTMLButtonElement>,id:string){
    if(isComposingKey(event.nativeEvent))return;
    if(event.key==='F2'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopPropagation();pageSettingsActions.open(id);return;}
    if(event.ctrlKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const list=event.altKey?pages:displayed,from=list.findIndex(page=>page.id===id);
    const to=event.key==='Home'?0:event.key==='End'?list.length-1:Math.max(0,Math.min(list.length-1,from+(event.key==='ArrowUp'?-1:1)));
    if(to===from||!list[to])return;
    if(event.altKey)run(move(id,to));
    else {cards.current.get(list[to].id)?.focus();run(editorActions.showPage(list[to].id));}
  }
  return <>
    <p id="slide-search-empty" className="hint" hidden={matching.length>0}>没有匹配的页面</p>
    <div id="overview-pagination" hidden={!state.overview}>
      <button id="overview-prev" disabled={group===0} onClick={()=>editorSession.update({overviewPage:group-1})}>← 上一组</button>
      <span id="overview-range" role="status">{matching.length?`${group*8+1}–${Math.min(matching.length,group*8+8)} / ${matching.length}`:'0 / 0'}</span>
      <button id="overview-next" disabled={(group+1)*8>=matching.length} onClick={()=>editorSession.update({overviewPage:group+1})}>下一组 →</button>
      <button id="overview-close" onClick={()=>editorSession.update({overview:false})}>返回编辑</button>
    </div>
    <div id="slides">{pages.map((page,index)=><button key={page.id}
      ref={node=>{if(node)cards.current.set(page.id,node);else cards.current.delete(page.id);}}
      className={'slide-card'+(page.id===state.activePageId?' active':'')+(drop?.id===page.id?(drop.after?' drop-after':' drop-before'):'')}
      data-slide={page.id} hidden={!visible.has(page.id)} draggable title="拖动排序 · Alt + ↑ / ↓ 调整顺序"
      onContextMenu={event=>{event.preventDefault();pageSettingsActions.open(page.id);}}
      aria-current={page.id===state.activePageId} onClick={()=>run(editorActions.showPage(page.id))} onKeyDown={event=>keydown(event,page.id)}
      onDragStart={event=>{if(!documentId)return;moving.current={id:page.id,documentId};event.dataTransfer.setData('application/x-notale-page',page.id);event.dataTransfer.effectAllowed='move';}}
      onDragOver={event=>{if(!moving.current||moving.current.documentId!==documentId)return;event.preventDefault();event.dataTransfer.dropEffect='move';const r=event.currentTarget.getBoundingClientRect();setDrop(moving.current.id===page.id?undefined:{id:page.id,after:event.clientY>=r.top+r.height/2});}}
      onDragEnd={()=>{moving.current=undefined;setDrop(undefined);}}
      onDrop={event=>{const source=moving.current;moving.current=undefined;setDrop(undefined);if(!source||source.documentId!==documentId||source.id===page.id)return;event.preventDefault();const remaining=pages.filter(p=>p.id!==source.id),at=remaining.findIndex(p=>p.id===page.id);if(at>=0&&pages.some(p=>p.id===source.id))run(move(source.id,at+(drop?.id===page.id&&drop.after?1:0)));}}>
      <span className="number">{String(index+1).padStart(2,'0')}{page.hidden?' · 已隐藏':''}</span>
      {/* The thumbnail renderer exclusively owns the contents of this empty host. */}
      <PageThumbnail documentId={documentId!} pageId={page.id}/>
      <span className="name">{page.name}</span>{(page.section||page.animations.length>0)&&<span className="meta">{[page.section,page.animations.length?`${page.animations.length} 动画`:null].filter(Boolean).join(" · ")}</span>}
    </button>)}</div>
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
