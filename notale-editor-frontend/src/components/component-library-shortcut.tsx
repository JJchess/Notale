'use client';
import {unavailableFeature} from '../feature-availability';
import {useLayoutEffect,useState} from 'react';
import {sidebar} from '../state/sidebar';
export function ComponentLibraryShortcut(){
 const [request,setRequest]=useState(0),[message,setMessage]=useState('');
 useLayoutEffect(()=>{if(!request)return;const field=document.getElementById('author-components');if(!field||field.closest('[hidden]')){setMessage('请先在画布上选择相应的互动对象。');return;}setMessage('');for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;field.scrollIntoView({block:'start',behavior:'instant'});},[request]);
 return <><button data-inspect="author-components" {...unavailableFeature} disabled onClick={()=>{sidebar.inspect('format');setRequest(value=>value+1);}}>打开组件与共享库</button>{message&&<p className="hint" role="status">{message}</p>}</>;
}
