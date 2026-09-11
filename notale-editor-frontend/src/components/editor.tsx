'use client';

import {useEffect} from 'react';
import {EditorChrome} from './editor-chrome';

// The root layout preserves this host across navigation. Canvas controllers run
// once per browser document; their pointer sessions never go through React state.
export function Editor(){
  useEffect(()=>{
    let active=true;
    void import('../workbench').then(({mountWorkbench})=>{
      if(active)mountWorkbench();
    }).catch(cause=>{
      if(!active)return;
      const status=document.getElementById('save-status');
      if(status)status.textContent='编辑器加载失败，请刷新重试';
      console.error(cause);
    });
    return ()=>{active=false;};
  },[]);
  return <EditorChrome/>;
}
