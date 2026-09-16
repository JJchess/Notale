'use client';
import { isComposingKey } from "../keyboard";

import {PageMenu, type PageMenuTarget} from './page-menu';
import {PageThumbnail} from './page-thumbnail';
import {pageSettingsActions} from '../page-settings';
import {useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {editorActions,editorSession} from '../state/editor-session';

import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';
const useSession=()=>useEditorSelector(state=>({document:state.document,activePageId:state.activePageId,pageQuery:state.pageQuery}),shallowEqual);
export function PageList() {
  const state=useSession(),pages=state.document?.document.slides.filter(page=>!page.layoutSourceId)??[];
  const query=state.pageQuery.trim().toLocaleLowerCase();
  const matches=(page:(typeof pages)[number],index:number)=>!query||`${String(index+1).padStart(2,'0')} ${page.name} ${page.section||'未分章节'} ${page.animations.length} 动画 ${page.hidden?'已隐藏':''}`.toLocaleLowerCase().includes(query);
  const matching=pages.filter(matches);
  const displayed=matching;
  const visible=new Set(displayed.map(page=>page.id));
  const cards=useRef(new Map<string,HTMLButtonElement>());
  const moving=useRef<{id:string;documentId:string}|undefined>(undefined);
  const moveSequence=useRef(0);
  const pageActionBusy=useRef(false);
  const [drop,setDrop]=useState<{id:string;after:boolean}>();
  const [announcement,setAnnouncement]=useState('');
  const [menu,setMenu]=useState<PageMenuTarget>();
  const documentId=state.document?.document.id;
  useLayoutEffect(()=>{editorActions.pagesCommitted();},[state.document,state.activePageId,state.pageQuery]);
  useLayoutEffect(()=>{moving.current=undefined;setDrop(undefined);setAnnouncement('');setMenu(undefined);},[documentId]);
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
  function openMenu(id:string,x:number,y:number,origin:HTMLButtonElement){
    origin.focus({preventScroll:true});
    setMenu({id,documentId:documentId!,x,y,origin});
    run(editorActions.showPage(id));
  }
  async function act(action:string,id:string,origin:HTMLElement|null){
    if(pageActionBusy.current)return;
    const snapshot=editorSession.getSnapshot(),doc=snapshot.document?.document;
    if(!doc||!doc.slides.some(p=>p.id===id&&!p.layoutSourceId))return;
    const at=pages.findIndex(p=>p.id===id);
    if(action==='delete'&&pages.length<=1)return;
    if(action==='settings'){pageSettingsActions.open(id);return;}
    pageActionBusy.current=true;
    const mayFocus=()=>editorSession.getSnapshot().document?.document.id===doc.id&&(document.activeElement===origin||document.activeElement===document.body);
    try{
      if(action==='up'||action==='down'){
        await move(id,Math.max(0,Math.min(pages.length-1,at+(action==='up'?-1:1))));
        if(mayFocus())cards.current.get(id)?.focus({preventScroll:true});return;
      }
      if(action==='add'||action==='copy')editorSession.update({pageQuery:''});
      const next=await (action==='add'?editorActions.addPage(id):action==='copy'?editorActions.copyPage(id):editorActions.deletePage(id));
      if(!mayFocus()||typeof next!=='string'||editorSession.getSnapshot().activePageId!==next)return;
      let target:string|undefined=next;
      if(action==='delete'&&query){
        const remaining=editorSession.getSnapshot().document!.document.slides.filter(p=>!p.layoutSourceId),available=remaining.filter(matches);
        target=(available.find(p=>remaining.indexOf(p)>=at)??available.at(-1))?.id;
        if(!target){document.getElementById('slide-search')?.focus();return;}
        if(target!==next)await editorActions.showPage(target);
      }
      if(mayFocus()&&editorSession.getSnapshot().activePageId===target)cards.current.get(target)?.focus();
    }catch(error){editorActions.reportError(error);}finally{pageActionBusy.current=false;}
  }
  function keydown(event:KeyboardEvent<HTMLButtonElement>,id:string){
    if(isComposingKey(event.nativeEvent))return;
    const duplicate=(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='d';
    const remove=!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&['Delete','Backspace'].includes(event.key);
    if(duplicate||remove){
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)void act(duplicate?'copy':'delete',id,event.currentTarget);
      return;
    }
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
      event.preventDefault();event.stopPropagation();const r=event.currentTarget.getBoundingClientRect();openMenu(id,r.left+28,r.top+20,event.currentTarget);return;
    }
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
    <div className="page-rail-tools">
      <label className="slide-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="slide-search" type="search" aria-label="查找页面" placeholder="查找页面" autoComplete="off" value={state.pageQuery} onChange={event=>editorSession.update({pageQuery:event.target.value})} onKeyDown={event=>{if(!isComposingKey(event.nativeEvent)&&event.key==='Escape'&&state.pageQuery){event.preventDefault();event.stopPropagation();editorSession.update({pageQuery:''});}}}/></label>
      <button id="add-slide" className="page-add" title="新建页面" aria-label="新建页面" disabled={!pages.some(p=>p.id===state.activePageId)} onClick={event=>void act('add',state.activePageId,event.currentTarget)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button>
    </div>
    <div className="page-rail-scroll">
    <p id="slide-search-empty" className="hint" hidden={matching.length>0}>没有匹配的页面</p>
    <div id="slides">{pages.map((page,index)=><button key={page.id}
      ref={node=>{if(node)cards.current.set(page.id,node);else cards.current.delete(page.id);}}
      className={'slide-card'+(page.id===state.activePageId?' active':'')+(drop?.id===page.id?(drop.after?' drop-after':' drop-before'):'')}
      data-slide={page.id} hidden={!visible.has(page.id)} draggable title={page.name} aria-label={`第 ${index+1} 页：${page.name}`}
      onContextMenu={event=>{event.preventDefault();openMenu(page.id,event.clientX,event.clientY,event.currentTarget);}}
      aria-current={page.id===state.activePageId} onClick={()=>run(editorActions.showPage(page.id))} onKeyDown={event=>keydown(event,page.id)}
      onDragStart={event=>{if(!documentId)return;moving.current={id:page.id,documentId};event.dataTransfer.setData('application/x-notale-page',page.id);event.dataTransfer.effectAllowed='move';}}
      onDragOver={event=>{if(!moving.current||moving.current.documentId!==documentId)return;event.preventDefault();event.dataTransfer.dropEffect='move';const r=event.currentTarget.getBoundingClientRect();setDrop(moving.current.id===page.id?undefined:{id:page.id,after:event.clientY>=r.top+r.height/2});}}
      onDragEnd={()=>{moving.current=undefined;setDrop(undefined);}}
      onDrop={event=>{const source=moving.current;moving.current=undefined;setDrop(undefined);if(!source||source.documentId!==documentId||source.id===page.id)return;event.preventDefault();const remaining=pages.filter(p=>p.id!==source.id),at=remaining.findIndex(p=>p.id===page.id);if(at>=0&&pages.some(p=>p.id===source.id))run(move(source.id,at+(drop?.id===page.id&&drop.after?1:0)));}}>
      <span className="number">{String(index+1).padStart(2,'0')}{page.hidden&&<svg className="page-hidden" viewBox="0 0 24 24" aria-label="已隐藏"><path d="m3 3 18 18M10 5c6-1 10 7 10 7l-3 4M7 7c-2 1-4 5-4 5s5 8 11 6"/></svg>}</span>
      {/* The thumbnail renderer exclusively owns the contents of this empty host. */}
      <PageThumbnail documentId={documentId!} pageId={page.id}/>

    </button>)}</div>
    </div>
    {menu&&menu.documentId===documentId&&<PageMenu target={menu} index={pages.findIndex(p=>p.id===menu.id)} count={pages.length} close={(restore=false)=>{setMenu(undefined);if(restore&&menu.origin.isConnected)menu.origin.focus({preventScroll:true});}} action={action=>{const captured=menu;setMenu(undefined);if(captured.documentId!==editorSession.getSnapshot().document?.document.id)return;captured.origin.focus({preventScroll:true});void act(action,captured.id,captured.origin);}}/>}
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
