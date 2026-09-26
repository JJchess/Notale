'use client';
import {useEffect,useRef} from 'react';
import {useI18n,useLocale} from '../i18n/react';
import {setLocale,type Locale} from '../i18n/store';
import './language-menu.css';
export function LanguageMenu(){
 const t=useI18n(),locale=useLocale(),ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const dismiss=(event:PointerEvent)=>{if(event.target instanceof Node&&ref.current&&!ref.current.contains(event.target))ref.current.open=false;};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss);},[]);
 const close=()=>{if(ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
 return <details className="language-menu" ref={ref} onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))ref.current!.open=false;}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();ref.current!.open=true;const items=[...ref.current!.querySelectorAll('button')],index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowUp'?-1:1)+2)%2]?.focus();}
 }}><summary aria-label={t('语言 / Language')} title={t('语言 / Language')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg></summary><div className="language-options" role="group" aria-label={t('语言')}>
 {([['zh-CN','中文'],['en-US','English']] as const).map(([value,label])=><button key={value} type="button" lang={value} aria-pressed={locale===value} onClick={()=>{setLocale(value as Locale);close();}}><span>{label}</span><span aria-hidden="true">{locale===value?'✓':''}</span></button>)}
 </div></details>;
}
