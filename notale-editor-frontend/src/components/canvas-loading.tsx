'use client';
import {useI18n} from '../i18n/react';

import {useSyncExternalStore} from 'react';
import {canvasLoadingState,canvasLoadingActions} from '../state/canvas-loading';
export function CanvasLoading(){
 const t=useI18n();

 const state=useSyncExternalStore(canvasLoadingState.subscribe,canvasLoadingState.getSnapshot,canvasLoadingState.getServerSnapshot);
 const status=state.mode==='replacement'
  ? state.timedOut ? t('画布更新尚未完成，可继续等待或重试。') : t('正在更新画布…')
  : state.timedOut ? t("讲义尚未加载完成，请检查连接后重试。") : t("正在加载讲义…");
 return <aside id="canvas-loading" data-mode={state.mode} hidden={!state.visible} aria-live="polite"><p id="canvas-loading-status">{status}</p><button id="retry-canvas" hidden={!state.timedOut} disabled={state.retrying} onClick={()=>void canvasLoadingActions.retry()}>{t("重新加载画布")}</button></aside>;
}
