'use client';
import { isComposingKey } from "../keyboard";
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {editorActions} from '../state/editor-session';
import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';

const paths={
  undo:<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2"/>,redo:<path d="m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7v2"/>,
  copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
  trash:<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>,
  up:<path d="m6 10 6-6 6 6M12 4v16"/>,down:<path d="m6 14 6 6 6-6M12 4v16"/>,
  plus:<><circle cx="12" cy="12" r="9"/><path d="M7 12h10M12 7v10"/></>,
};
function Icon({children}:{children:ReactNode}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;}
function run(action:()=>unknown){try{void Promise.resolve(action()).catch(editorActions.reportError);}catch(error){editorActions.reportError(error);}}
export function SaveStatus(){const report=useEditorSelector(state=>state.save);return <span id="save-status" role="status" data-state={report.state} title={report.detail}>{report.label}</span>;}
export function HistoryControls(){
  const {canUndo,canRedo}=useEditorSelector(state=>({canUndo:state.canUndo,canRedo:state.canRedo}),shallowEqual);
  return <><button id="undo" className="icon-button" aria-label="撤销" title="撤销 · Ctrl/⌘ + Z" disabled={!canUndo} onClick={()=>run(editorActions.undo)}><Icon>{paths.undo}</Icon></button><button id="redo" className="icon-button" aria-label="重做" title="重做 · Ctrl/⌘ + Shift + Z" disabled={!canRedo} onClick={()=>run(editorActions.redo)}><Icon>{paths.redo}</Icon></button></>;
}
export function PageCommands(){
  const disabled=useEditorSelector(state=>{const page=state.document?.document.slides.find(page=>page.id===state.activePageId);return !page||!!page.layoutSourceId;});
  const buttons=[['add-slide','plus','添加页面','addPage'],['copy-slide','copy','复制页面','copyPage'],['delete-slide','trash','删除页面','deletePage'],['up-slide','up','页面上移','previousPageOrder'],['down-slide','down','页面下移','nextPageOrder']] as const;
  return <>{buttons.map(([id,icon,label,action])=><button key={id} id={id} className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={()=>run(editorActions[action])}><Icon>{paths[icon]}</Icon></button>)}</>;
}
export function PresentControls(){
  const enabled=useEditorSelector(state=>!!state.document?.document.slides.length);
  const [open,setOpen]=useState(false),host=useRef<HTMLDivElement>(null),summary=useRef<HTMLElement>(null);
  const focusFirst=useRef<'first'|'last'|undefined>(undefined);
  useLayoutEffect(()=>{if(open&&focusFirst.current){const buttons=host.current!.querySelectorAll<HTMLButtonElement>('details button:not(:disabled)');buttons[focusFirst.current==='first'?0:buttons.length-1]?.focus();focusFirst.current=undefined;}},[open]);
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!host.current?.contains(e.target as Node))setOpen(false);};const blur=()=>setOpen(false);document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',blur);return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',blur);};},[open]);
  const present=(speaker=false,beginning=false)=>{setOpen(false);run(()=>editorActions.present(speaker,beginning));};
  return <div className="present-actions" ref={host} onKeyDown={event=>{
  if(isComposingKey(event.nativeEvent))return;
    if(event.key==='Escape'){event.stopPropagation();setOpen(false);summary.current?.focus();return;}
    if(event.key==='Tab'){setOpen(false);return;}
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();
    if(!open){focusFirst.current=event.key==='ArrowDown'?'first':'last';setOpen(true);return;}
    const buttons=[...host.current!.querySelectorAll<HTMLButtonElement>('details button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }}>
    <button id="present" title="从当前页开始放映" disabled={!enabled} onClick={()=>present()}><Icon><path d="M3 4h18M5 4v12h14V4M12 16v4m-4 1 4-1 4 1"/><path d="m10 8 4 2-4 2Z" fill="currentColor" strokeWidth="1.2"/></Icon><span>放映</span></button>
    <details id="present-menu" open={open}><summary ref={summary} aria-label="放映选项" title="放映选项" aria-expanded={open} onClick={event=>{event.preventDefault();setOpen(value=>!value);}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div>
      <button id="present-beginning" disabled={!enabled} onClick={()=>present(false,true)}>从头开始</button>
      <button id="present-current" disabled={!enabled} onClick={()=>present()}>从当前页开始</button>
      <button id="present-speaker" disabled={!enabled} onClick={()=>present(true)}>演讲者视图</button>
    </div></details>
  </div>;
}
