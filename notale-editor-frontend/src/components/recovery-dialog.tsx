'use client';
import {KeyboardRecoveries} from './keyboard-recoveries';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {editorSession} from '../state/editor-session';
import {recoveryState,recoveryActions} from '../state/recovery';
export function RecoveryDialog(){
 const ref=useRef<HTMLDialogElement>(null),state=useSyncExternalStore(recoveryState.subscribe,recoveryState.getSnapshot,recoveryState.getServerSnapshot),[busy,setBusy]=useState(false),[error,setError]=useState(''),running=useRef(false);
 const close=()=>{if(!running.current)editorSession.update({documentDialog:undefined});};
 useLayoutEffect(()=>{const node=ref.current!;node.showModal();return()=>node.close();},[]);
 useEffect(()=>{void recoveryActions.refresh();},[]);
 const run=async(action:()=>Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);setError('');try{await action();}catch(error){setError(error instanceof Error?error.message:String(error));}finally{running.current=false;setBusy(false);}};
 return <dialog ref={ref} id="recovery-dialog" className="settings-dialog" aria-label="恢复修改" onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();close();}}><header><h2>恢复修改</h2><button aria-label="关闭" disabled={busy} onClick={close}>×</button></header><div id="recovery-panel"><div id="recovery-list">{state.rows.map(row=><div key={row.id} className="recovery-row" data-recovery={row.legacyKey}><p>{row.label}</p>{row.action&&<button data-recover={row.legacyKey} disabled={busy||row.disabled} onClick={()=>void run(()=>recoveryActions.run(row.id))}>{row.action}</button>}<button data-export-recovery={row.legacyKey} disabled={busy} onClick={()=>void run(async()=>{const raw=recoveryActions.download(row.id),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='notale-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>{row.download}</button></div>)}</div></div>{!state.rows.length&&<p id="recovery-empty">没有待恢复的命令草稿</p>}<KeyboardRecoveries refresh={state}/><label className="button">导入待恢复修改<input id="import-recovery" type="file" accept=".json,application/json" hidden disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{if(file.size>50*1024*1024)throw Error('恢复文件超过当前 50 MB 读取上限');await recoveryActions.import(await file.text());});}}/></label><p className="settings-status" role="status">{error||state.error}</p></dialog>;
}
