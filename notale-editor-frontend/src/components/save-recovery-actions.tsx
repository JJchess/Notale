'use client';
import {useI18n} from '../i18n/react';

import {useState,useSyncExternalStore} from 'react';
import {saveRecoveryState} from '../state/save-recovery-actions';
export function SaveRecoveryActions(){
 const t=useI18n();
const model=useSyncExternalStore(saveRecoveryState.subscribe,saveRecoveryState.getSnapshot,saveRecoveryState.getServerSnapshot);const [pending,setPending]=useState<string[]>([]);const run=async(action:'retry'|'reload'|'export')=>{setPending(before=>[...before,action]);try{await model.run?.(action);}finally{setPending(before=>before.filter(value=>value!==action));}};return <>
 <button id="retry-save" hidden={!model.visible} disabled={model.busy||pending.some(value=>value!=='export')} onClick={()=>void run('retry')}>{t("立即同步")}</button>
 <button id="reload-head" hidden={!model.visible} disabled={model.busy||pending.some(value=>value!=='export')} onClick={()=>void run('reload')}>{t("保留草稿并重载")}</button>
 <button id="export-draft" hidden={!model.visible} disabled={pending.includes('export')} onClick={()=>void run('export')}>{t("导出草稿")}</button>
 {model.visible&&model.error && <span role="alert">{t(model.error)}</span>}
 </>;}
