'use client';
import {useI18n} from '../i18n/react';

import {useSyncExternalStore} from 'react';
import {viewportViewState} from '../state/viewport-view';
import {DockIcon} from './dock-controls';
const presets=[.25,.5,.75,1,1.5,2];
function useView(){return useSyncExternalStore(viewportViewState.subscribe,viewportViewState.getSnapshot,viewportViewState.getServerSnapshot);}
export function ZoomOut(){
 const t=useI18n();
const view=useView();return <button id="zoom-out" className="icon-button" title={t("缩小画布")} aria-label={t("缩小画布")} disabled={!view.available||view.actual<=.1} onClick={()=>view.step?.(-1)}><DockIcon name="zoomOut"/></button>;}
export function ZoomIn(){
 const t=useI18n();
const view=useView();return <button id="zoom-in" className="icon-button" title={t("放大画布")} aria-label={t("放大画布")} disabled={!view.available||view.actual>=16} onClick={()=>view.step?.(1)}><DockIcon name="zoomIn"/></button>;}
export function ZoomSelect(){
 const t=useI18n();
const view=useView();return <select id="canvas-zoom" aria-label={t("画布缩放")} title={view.mode==='fit' ? t("适合窗口 · {0}%", {"0": Math.round(view.fit*100)}) : t("画布缩放 · {0}%", {"0": Math.round(view.actual*100)})} disabled={!view.available} value={String(view.mode)} onChange={event=>view.zoom?.(event.target.value==='fit'?'fit':Number(event.target.value))}><option value="fit">{t("适合 · ")}{Math.round(view.fit*100)}%</option>{presets.map(value=><option key={value} value={String(value)}>{Math.round(value*100)}%</option>)}{view.mode!=='fit'&&!presets.includes(view.mode) && <option data-current value={String(view.mode)}>{Math.round(view.mode*100)}%</option>}</select>;}
export function PanMode(){
 const t=useI18n();
const view=useView();return <button id="pan-canvas" aria-pressed={view.hand} disabled={!view.available} title={t("拖动画布视图，不移动页面中的对象；再次点击或按 Esc 退出")} onClick={()=>view.panMode?.(!view.hand)}>{t("平移画布")}</button>;}
