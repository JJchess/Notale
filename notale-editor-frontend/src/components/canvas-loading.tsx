'use client';
import {useSyncExternalStore} from 'react';
import {canvasLoadingState,canvasLoadingActions} from '../state/canvas-loading';
export function CanvasLoading(){
 const state=useSyncExternalStore(canvasLoadingState.subscribe,canvasLoadingState.getSnapshot,canvasLoadingState.getServerSnapshot);
 return <aside id="canvas-loading" hidden={!state.visible} aria-live="polite"><p id="canvas-loading-status">{state.timedOut?'讲义尚未加载完成，请检查连接后重试。':'正在加载讲义…'}</p><button id="retry-canvas" hidden={!state.timedOut} disabled={state.retrying} onClick={()=>void canvasLoadingActions.retry()}>重新加载画布</button></aside>;
}
