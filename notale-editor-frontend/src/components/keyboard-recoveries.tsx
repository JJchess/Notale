'use client';
import {useEffect,useRef,useState} from 'react';
import {editorActions} from '../state/editor-session';
import type {KeyboardRecovery} from '../state/keyboard-queue';
const labels:Record<string,string>={nudge:'移动对象',delete:'删除对象',duplicate:'复制对象',group:'编组',ungroup:'取消编组',undo:'撤销',redo:'重做',paste:'粘贴',copy:'复制',cut:'剪切',front:'置顶',back:'置底',forward:'上移一层',backward:'下移一层'};
export function KeyboardRecoveries({refresh}:{refresh:unknown}){
 const [rows,setRows]=useState<KeyboardRecovery[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),active=useRef(false);
 useEffect(()=>{let live=true;active.current=true;void editorActions.keyboardRecoveries().then(rows=>{if(live)setRows(rows);},cause=>{if(live)setError(String(cause));});return()=>{live=false;active.current=false;};},[refresh]);
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(cause){if(active.current)setError(cause instanceof Error?cause.message:String(cause));}finally{if(active.current)setBusy(false);}};
 const download=(row:KeyboardRecovery)=>{const raw=JSON.stringify({schema:'notale-sync-v1',documentId:row.intent.documentId,operations:[],keyboard:[row]},null,2),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='notale-keyboard-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if(!rows.length&&!error)return null;
 return <section aria-label="待检查的快捷键操作"><h3>待检查的快捷键操作</h3><p className="hint">这些操作未完整结束。先查看原页面，确认后标记已处理。</p>{rows.map(row=><div key={row.id} className="recovery-row"><p>{labels[row.intent.action.type]??row.intent.action.type} · {row.intent.ids.length} 个对象</p><p>{row.phase==='queued'?'尚未执行，请在原页面重新操作。':'可能已产生修改，请核对页面，避免重复操作。'}</p>{row.error&&<p>{row.error}</p>}<button disabled={busy} onClick={()=>void run(()=>editorActions.inspectKeyboardRecovery(row))}>查看原页面</button><button disabled={busy} onClick={()=>download(row)}>导出记录</button><button disabled={busy} onClick={()=>void run(async()=>{await editorActions.dismissKeyboardRecovery(row.id);if(active.current)setRows(current=>current.filter(item=>item.id!==row.id));})}>标记已处理</button></div>)}{error&&<p role="alert">{error}</p>}</section>;
}
