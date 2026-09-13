'use client';
import {useSyncExternalStore} from 'react';
import {resourceNotices,type ResourceScope} from '../state/resource-notices';
export function ResourceNotice({scope}:{scope:ResourceScope}){
 const notices=useSyncExternalStore(resourceNotices.subscribe,resourceNotices.getSnapshot,resourceNotices.getServerSnapshot),notice=notices.find(item=>item.scope===scope);
 if(!notice)return null;
 return <aside data-notale-preview-access="" role="status" style={{position:'fixed',bottom:70,left:12,zIndex:2147483647,background:'#fff3df',color:'#553715',padding:12,border:'1px solid #c29d64',borderRadius:6,font:'14px system-ui',maxWidth:480}}>
  资源连接续期失败，当前画面已保留。连接恢复后可重试。{' '}
  <button disabled={notice.pending} onClick={()=>void resourceNotices.retry(scope)}>{notice.pending?'正在重试…':'重试资源连接'}</button>
 </aside>;
}
