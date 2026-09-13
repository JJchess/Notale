'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {closingSessions} from '../state/closing-sessions';
export function ClosingSessionNotice(){
 const notices=useSyncExternalStore(closingSessions.subscribe,closingSessions.getSnapshot,closingSessions.getServerSnapshot),[error,setError]=useState('');
 useEffect(()=>{if(!notices.length)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[notices.length]);
 if(!notices.length)return null;
 return <aside className="closing-session-notice" role="status" style={{position:'fixed',bottom:16,right:16,zIndex:2147483647,maxWidth:440,padding:16,borderRadius:8,background:'#fff3df',color:'#553715',boxShadow:'0 4px 24px #0002',font:'14px system-ui'}}>{notices.map(notice=><div key={notice.id}><strong>{notice.title||'讲义'}</strong><p>{notice.pending?'正在保留修改，请暂时保持此窗口打开。':'修改仍保留在当前窗口，请重试保存到本机，或导出草稿。'}</p>{notice.error&&<p>{notice.error}</p>}<button disabled={notice.pending} onClick={()=>void closingSessions.retry(notice.id)}>重试保存到本机</button>{' '}<button disabled={notice.pending} onClick={async()=>{setError('');try{const raw=await closingSessions.exportDraft(notice.id),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='notale-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){setError(error instanceof Error?error.message:String(error));}}}>导出草稿</button></div>)}{error&&<p role="alert">{error}</p>}</aside>;
}
