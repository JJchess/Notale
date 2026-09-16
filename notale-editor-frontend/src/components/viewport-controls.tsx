'use client';
import {useSyncExternalStore} from 'react';
import {viewportViewState} from '../state/viewport-view';
import {DockIcon} from './dock-controls';
const presets=[.25,.5,.75,1,1.5,2];
function useView(){return useSyncExternalStore(viewportViewState.subscribe,viewportViewState.getSnapshot,viewportViewState.getServerSnapshot);}
export function ZoomOut(){const view=useView();return <button id="zoom-out" className="icon-button" title="缩小画布" aria-label="缩小画布" disabled={!view.available||view.actual<=.1} onClick={()=>view.step?.(-1)}><DockIcon name="zoomOut"/></button>;}
export function ZoomIn(){const view=useView();return <button id="zoom-in" className="icon-button" title="放大画布" aria-label="放大画布" disabled={!view.available||view.actual>=16} onClick={()=>view.step?.(1)}><DockIcon name="zoomIn"/></button>;}
export function ZoomSelect(){const view=useView();return <select id="canvas-zoom" aria-label="画布缩放" title={view.mode==='fit'?`适合窗口 · ${Math.round(view.fit*100)}%`:`画布缩放 · ${Math.round(view.actual*100)}%`} disabled={!view.available} value={String(view.mode)} onChange={event=>view.zoom?.(event.target.value==='fit'?'fit':Number(event.target.value))}><option value="fit">适合 · {Math.round(view.fit*100)}%</option>{presets.map(value=><option key={value} value={String(value)}>{Math.round(value*100)}%</option>)}{view.mode!=='fit'&&!presets.includes(view.mode)&&<option data-current value={String(view.mode)}>{Math.round(view.mode*100)}%</option>}</select>;}
export function PanMode(){const view=useView();return <button id="pan-canvas" aria-pressed={view.hand} disabled={!view.available} title="拖动画布视图，不移动页面中的对象；再次点击或按 Esc 退出" onClick={()=>view.panMode?.(!view.hand)}>平移画布</button>;}
