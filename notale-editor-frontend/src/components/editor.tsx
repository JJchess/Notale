'use client';

import {useEffect} from 'react';
import {setSaveStatus} from '../save-status';
import {EditorChrome} from './editor-chrome';

// Workbench disposal is idempotent and retains pending saves outside this tree.
// Each mount attaches a fresh session; shutdown retains the previous session independently.
export function Editor(){
  useEffect(()=>{
    let active=true;
    let workbench:{dispose:()=>void}|undefined;
    void import('../workbench').then(({mountWorkbench})=>{
      if(active)workbench=mountWorkbench();
    }).catch(cause=>{
      if(!active)return;
      setSaveStatus({label:'加载失败',detail:'编辑器加载失败，请刷新重试',state:'failed'});
      console.error(cause);
    });
    return ()=>{active=false;workbench?.dispose();};
  },[]);
  return <EditorChrome/>;
}
