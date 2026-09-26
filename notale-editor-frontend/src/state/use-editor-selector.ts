'use client';
import {useCallback,useRef,useSyncExternalStore} from 'react';
import {editorSession,type EditorSessionState} from './editor-session';
/** Stable selected snapshots keep unrelated session changes out of a component. */
export function useEditorSelector<T>(selector:(state:EditorSessionState)=>T,equal:(a:T,b:T)=>boolean=Object.is):T {
  const cache=useRef<{value:T}|undefined>(undefined);
  const select=useCallback((state:EditorSessionState)=>{
    const value=selector(state);
    if(cache.current&&equal(cache.current.value,value))return cache.current.value;
    cache.current={value};return value;
  },[selector,equal]);
  const getSnapshot=useCallback(()=>select(editorSession.getSnapshot()),[select]);
  const getServerSnapshot=useCallback(()=>select(editorSession.getServerSnapshot()),[select]);
  return useSyncExternalStore(editorSession.subscribe,getSnapshot,getServerSnapshot);
}
export function shallowEqual<T extends object>(a:T,b:T){const keys=Object.keys(a) as (keyof T)[];return keys.length===Object.keys(b).length&&keys.every(key=>Object.is(a[key],b[key]));}
