'use client';
import {useI18n} from '../i18n/react';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {computePosition,flip,shift,offset} from '@floating-ui/dom';
import {isComposingKey} from '../keyboard';
import {findModel,type AiMention,type AiModelRef,type AiProvider} from '../state/ai-edits';

/** A popup above the composer, positioned the way the file menu is (fixed, flipped and shifted into
 * view); closes on a click outside `keep` or on resize. */
function usePopup(anchor:RefObject<HTMLElement|null>,popup:RefObject<HTMLElement|null>,open:boolean,close:()=>void,keep:RefObject<HTMLElement|null>[]=[]){
 const [position,setPosition]=useState<{left:number;top:number;width?:number}>({left:-9999,top:-9999});
 useLayoutEffect(()=>{
  if(!open||!anchor.current||!popup.current)return;let live=true;
  void computePosition(anchor.current,popup.current,{strategy:'fixed',placement:'top-start',middleware:[offset(6),flip(),shift({padding:8})]})
   // Only a real move re-renders: a new object every time would recompute, re-render, forever.
   .then(value=>{if(live)setPosition(prev=>prev.left===value.x&&prev.top===value.y?prev:{left:value.x,top:value.y});});
  return()=>{live=false;};
 });
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{const target=event.target as Node;if(![popup,anchor,...keep].some(ref=>ref.current?.contains(target)))close();};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);};
 },[open]);
 return position;
}
/** One highlight that slides to the active row instead of each row lighting up on its own. */
function useGlide(list:RefObject<HTMLElement|null>,index:number,deps:unknown[]){
 const [box,setBox]=useState<{top:number;height:number}|null>(null);
 useLayoutEffect(()=>{
  const row=list.current?.querySelectorAll<HTMLElement>('[data-row]')[index];
  setBox(row?{top:row.offsetTop,height:row.offsetHeight}:null);
  row?.scrollIntoView({block:'nearest'});
 },[index,...deps]);
 return <span className="ai-glide" aria-hidden="true" style={{top:box?.top??0,height:box?.height??0,opacity:box?1:0}}/>;
}
const Check=()=><svg className="ai-picker-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>;
const Eye=()=><svg className="ai-picker-vision" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
const SEARCH_FROM=12;

/** The model under the composer: grouped by service, a service without a key greyed out with why
 * (pi lists only what has auth; showing the rest tells the author it exists). */
export function ModelPicker({providers,choice,fallback,disabled,onPick}:{providers:AiProvider[];choice?:AiModelRef;fallback?:AiModelRef;disabled?:boolean;onPick:(ref:AiModelRef)=>void}){
 const t=useI18n();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
 const close=()=>{setOpen(false);setQuery('');};
 const position=usePopup(trigger,menu,open,close);
 const current=choice??fallback,name=findModel(providers,current)?.name??current?.id??'';
 const searching=providers.reduce((sum,group)=>sum+group.models.length,0)>SEARCH_FROM;
 const needle=query.trim().toLowerCase();
 const groups=providers.map(group=>({...group,models:group.models.filter(entry=>!needle||entry.name.toLowerCase().includes(needle)||entry.id.toLowerCase().includes(needle))}));
 const rows=groups.flatMap(group=>group.available?group.models.map(entry=>({provider:group.provider,model:entry})):[]);
 const glide=useGlide(list,active,[open,needle,rows.length]);
 useLayoutEffect(()=>{
  if(!open)return;
  const selected=rows.findIndex(row=>row.provider===current?.provider&&row.model.id===current?.id);
  setActive(Math.max(0,selected));
  (searching?search.current:list.current?.querySelectorAll<HTMLElement>('[data-row]')[Math.max(0,selected)])?.focus();
 },[open]);
 useEffect(()=>{if(needle)setActive(0);},[needle]);
 const pick=(index:number)=>{const row=rows[index];if(!row)return;onPick({provider:row.provider,id:row.model.id});close();trigger.current?.focus();};
 let index=-1;
 return <>
  <button ref={trigger} type="button" id="ai-model" className="ai-model-trigger" disabled={disabled||!providers.length} aria-haspopup="listbox" aria-expanded={open}
   aria-label={t('选择模型')} title={t('选择模型')} onClick={()=>open?close():setOpen(true)}>
   <span className="ai-model-name">{name}</span>
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  {open && createPortal(<div ref={menu} id="ai-model-menu" className="editor-popup ai-picker" style={{position:'fixed',left:position.left,top:position.top}}
   onKeyDown={event=>{
    event.stopPropagation();if(isComposingKey(event.nativeEvent))return;
    if(event.key==='Escape'){event.preventDefault();close();trigger.current?.focus();}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(rows.length)setActive(value=>(value+(event.key==='ArrowDown'?1:rows.length-1))%rows.length);}
    else if(event.key==='Enter'){event.preventDefault();pick(active);}
    else if(event.key==='Tab')close();
   }}>
   {searching && <input ref={search} className="ai-picker-search" type="search" aria-label={t('搜索模型')} placeholder={t('搜索模型')} value={query} onChange={event=>setQuery(event.target.value)}/>}
   <div ref={list} className="ai-picker-list" role="listbox" aria-label={t('选择模型')}>
    {glide}
    {groups.map(group=><div key={group.provider} className={'ai-picker-group'+(group.available?'':' is-off')} aria-disabled={!group.available||undefined}>
     <div className="ai-picker-head"><span>{group.name}</span>{!group.available && <span className="ai-picker-note">{t(group.reason??'未配置密钥')}</span>}</div>
     {group.available && group.models.map(entry=>{
      const at=++index,selected=current?.provider===group.provider&&current.id===entry.id;
      return <button key={entry.id} type="button" role="option" aria-selected={selected} data-row tabIndex={-1} className="ai-picker-row"
       title={entry.id} onMouseEnter={()=>setActive(at)} onMouseDown={event=>event.preventDefault()} onClick={()=>pick(at)}>
       <span className="ai-picker-name">{entry.name}</span>
       {entry.vision && <span title={t('能看图片')} aria-label={t('能看图片')}><Eye/></span>}
       {selected ? <Check/> : <span className="ai-picker-check" aria-hidden="true"/>}
      </button>;
     })}
    </div>)}
    {!!needle && !rows.length && <p className="ai-picker-empty">{t('没有匹配的模型')}</p>}
   </div>
  </div>,document.body)}
 </>;
}

/** The @ menu: pages as files, then this page's objects. Keys stay in the textarea, so the composer
 * drives `active`; the menu only shows the list and takes a click. */
export function MentionMenu({anchor,items,active,onPick,onHover}:{anchor:RefObject<HTMLElement|null>;items:AiMention[];active:number;onPick:(item:AiMention)=>void;onHover:(index:number)=>void}){
 const t=useI18n();
 const menu=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null);
 const position=usePopup(anchor,menu,true,()=>{},[anchor]);
 const glide=useGlide(list,active,[items.length]);
 const [width,setWidth]=useState(0);
 useLayoutEffect(()=>{setWidth(anchor.current?.offsetWidth??0);},[]);
 let lastKind='';
 return createPortal(<div ref={menu} id="ai-mention-menu" className="editor-popup ai-picker ai-mentions" style={{position:'fixed',left:position.left,top:position.top,width}}>
  <div ref={list} className="ai-picker-list" role="listbox" aria-label={t('引用页面或对象')}>
   {glide}
   {items.map((item,index)=>{
    const head=item.kind!==lastKind;lastKind=item.kind;
    return <div key={item.insert} role="presentation">
     {head && <div className="ai-picker-head"><span>{t(item.kind==='page'?'页面':'本页对象')}</span></div>}
     <button type="button" role="option" aria-selected={index===active} data-row tabIndex={-1} className="ai-picker-row"
      onMouseEnter={()=>onHover(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>onPick(item)}>
      <span className="ai-picker-name">{item.label}</span><span className="ai-picker-detail">{item.detail}</span>
     </button>
    </div>;
   })}
   {!items.length && <p className="ai-picker-empty">{t('没有匹配的页面或对象')}</p>}
  </div>
 </div>,document.body);
}
