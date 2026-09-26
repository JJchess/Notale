'use client';
import {useI18n} from '../i18n/react';

import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {toolPanelState,toolPanelActions,clamp} from '../state/tool-panel';
/** Drags the tool panel's right edge. The width rides a CSS variable on <body>, so the workspace
 * grid reflows and the canvas column takes up the slack. The drag listens on the window rather
 * than on the handle: the pointer crosses into the canvas iframe, which swallows the events. */
export function ToolPanelSash(){
 const t=useI18n();

 const model=useSyncExternalStore(toolPanelState.subscribe,toolPanelState.getSnapshot,toolPanelState.getServerSnapshot);
 const drag=useRef<{x:number;width:number}|undefined>(undefined);
 const [dragging,setDragging]=useState(false);
 useEffect(()=>{toolPanelActions.restore();},[]);
 useLayoutEffect(()=>{document.body.style.setProperty('--tool-panel-width',`${model.width}px`);},[model.width]);
 useEffect(()=>{
  if(!dragging)return;
  // The canvas iframe eats pointer events once the cursor crosses into it.
  document.body.classList.add('resizing-tool-panel');
  const move=(event:PointerEvent)=>{if(drag.current)toolPanelActions.resize(drag.current.width+event.clientX-drag.current.x);};
  const stop=()=>{drag.current=undefined;setDragging(false);toolPanelActions.persist();};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop);
  window.addEventListener('pointercancel',stop);
  return()=>{document.body.classList.remove('resizing-tool-panel');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
 },[dragging]);
 return <div className="tool-panel-sash" role="separator" aria-label={t("调整工具面板宽度")} aria-orientation="vertical" aria-valuenow={model.width} tabIndex={0}
  onPointerDown={event=>{event.preventDefault();drag.current={x:event.clientX,width:model.width};setDragging(true);}}
  onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();toolPanelActions.resize(clamp(model.width+(event.key==='ArrowRight'?20:-20)));toolPanelActions.persist();}}}/>;
}
