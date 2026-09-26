'use client';
import {useI18n} from '../i18n/react';

/*
 * Ported from Beautiful UI's ToolChips primitive — an agent run as compact rows: one line per
 * tool call (icon, label, argument chip), each expanding to what the call actually did, then a
 * strip of change chips whose hover reveals the diff.
 *
 * Copyright (c) 2026 Shane Levine. MIT. Full notice: docs/release/PORTED-CODE-NOTICES.md
 *
 * The structure is theirs; the styling is not. Their version is Tailwind v4 over a foundation.css
 * token layer this repo does not have, so every utility class became a rule in editor.css, and
 * the hover preview uses the @floating-ui/dom already installed here rather than hand-rolled
 * viewport arithmetic.
 */
import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {computePosition,flip,shift,offset} from '@floating-ui/dom';
import {diffChips,type AiStep,type DiffRow,type DiffChip} from '../state/ai-edits';
const ICONS:Record<string,string>={
 read:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
 model:'M12 3v4M12 17v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5',
 check:'M4 12.5l5 5L20 6.5',
 run:'M5 4l14 8-14 8z',
};
const CHEVRON='M6 9l6 6 6-6';
/** Which icon a pipeline node gets. Unknown labels fall back to the check. */
function iconFor(label:string){
 if(label.startsWith('读取'))return ICONS.read;
 if(label.startsWith('请求模型'))return ICONS.model;
 if(label.startsWith('服务端'))return ICONS.run;
 return ICONS.check;
}
function Row({step}:{step:AiStep}){
 const t=useI18n();

 const [open,setOpen]=useState(false);
 const detail=step.detail??[];
 return <li className="ai-tool" data-status={step.status}>
  <button type="button" className="ai-tool-row" aria-expanded={detail.length?open:undefined}
   disabled={!detail.length} onClick={()=>setOpen(!open)}>
   <span className="ai-tool-icon" data-open={open||undefined}>
    <svg className="ai-tool-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconFor(step.label)}/></svg>
    {!!detail.length && <svg className="ai-tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={CHEVRON}/></svg>}
   </span>
   <span className="ai-tool-label">{t(step.messageKey??step.label,step.messageParams)}</span>
   {step.chip && <span className="ai-tool-chip">{step.chipMessage?t(step.chipMessage.messageKey,step.chipMessage.messageParams):step.label.startsWith('请求模型')?step.chip:t(step.chip)}</span>}
  </button>
  {open&&!!detail.length && <ul className="ai-tool-detail">
   {detail.map((line,index)=><li key={line}>{step.detailMessages?.[index]?t(step.detailMessages[index].messageKey,step.detailMessages[index].messageParams):t(line)}</li>)}
  </ul>}
 </li>;
}
/** A colour reads as a colour, not as six hex digits. Ours, not ported -- but it lives here
 * because both the approval table and the chip preview render values through it. */
export function Value({text,kind}:{text:string;kind:'from'|'to'}){


 const colour=/^#[0-9a-f]{3,8}$/i.test(text.trim());
 return <span className={'ai-diff-'+kind}>{colour && <span className="ai-diff-swatch" style={{background:text.trim()}} aria-hidden="true"/>}{text}</span>;
}
/** The diff for one object, anchored to its chip. */
function Preview({chip,anchor,onClose}:{chip:DiffChip;anchor:HTMLElement;onClose:()=>void}){
 const t=useI18n();

 const surface=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState<{left:number;top:number}>();
 useLayoutEffect(()=>{
  let live=true;
  void computePosition(anchor,surface.current!,{strategy:'fixed',placement:'bottom-start',middleware:[offset(6),flip(),shift({padding:8})]})
   .then(value=>{if(live)setPosition({left:value.x,top:value.y});});
  return()=>{live=false;};
 },[anchor,chip]);
 return createPortal(
  <div ref={surface} className="ai-chip-preview" style={{left:position?.left??0,top:position?.top??0,visibility:position?'visible':'hidden'}} onPointerLeave={onClose}>
   <div className="ai-chip-preview-head">{chip.label}</div>
   {chip.rows.map((row,index)=><div key={row.what+index} className="ai-chip-preview-row">
    <span className="ai-chip-preview-what">{t(row.what)}</span>
    {row.from!==undefined && <><Value text={row.from} kind="from"/><span className="ai-diff-arrow" aria-hidden="true">{'→'}</span></>}
    <Value text={row.to ?? '—'} kind="to"/>
   </div>)}
  </div>,document.body);
}
function Chips({rows}:{rows:DiffRow[]}){
 const t=useI18n();

 const chips=diffChips(rows);
 const [shown,setShown]=useState<{chip:DiffChip;anchor:HTMLElement}>();
 if(!chips.length)return null;
 return <div className="ai-chip-strip">
  {chips.map(chip=><button key={chip.target+chip.label} type="button" className="ai-chip"
   aria-label={t("{0} 的改动", {"0": chip.label})}
   onPointerEnter={event=>setShown({chip,anchor:event.currentTarget})}
   onPointerLeave={()=>setShown(undefined)}
   onFocus={event=>setShown({chip,anchor:event.currentTarget})}
   onBlur={()=>setShown(undefined)}>
   <span className="ai-chip-name">{chip.label}</span>
   <span className="ai-chip-count">{`+${chip.count}`}</span>
  </button>)}
  {shown && <Preview chip={shown.chip} anchor={shown.anchor} onClose={()=>setShown(undefined)}/>}
 </div>;
}
/** A finished turn's record: what ran, and what it changed. */
export function ToolChips({steps,rows,live}:{steps:AiStep[];rows:DiffRow[];live?:boolean}){


 if(!steps.length)return null;
 return <div className="ai-tools">
  <ul {...(live?{id:'ai-steps'}:{})} className="ai-tool-list" role={live?'status':undefined}>
   {steps.map(step=><Row key={step.label} step={step}/>)}
  </ul>
  {!live && <Chips rows={rows}/>}
 </div>;
}
