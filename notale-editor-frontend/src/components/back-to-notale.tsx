'use client';
import {useEffect,useState} from 'react';
import {useEditorSelector} from '../state/use-editor-selector';

const key=(id:string)=>`notale-editor-back:${id}`,HOME='notale-viewer-home';
// Captured before the workbench rewrites the address to ?document=<id>: a lecture opened from Notale
// carries the session page to return to, remembered per document so a reload or a switch keeps it.
if(typeof window!=='undefined'){
  const query=new URLSearchParams(location.search),id=query.get('document'),back=query.get('back');
  if(id&&back&&/^https?:\/\//.test(back))try{localStorage.setItem(key(id),back);localStorage.setItem(HOME,new URL(back).origin+'/');}catch{}
}

/** Where the Notale mark leads: the session this lecture was opened from, else the Notale home last
 * seen, else nothing (a lecture only ever imported here). */
export function useNotaleHome(){
  const id=useEditorSelector(state=>state.document?.document.id??'');
  const [home,setHome]=useState<string>();
  useEffect(()=>{try{setHome((id&&localStorage.getItem(key(id)))||localStorage.getItem(HOME)||undefined);}catch{setHome(undefined);}},[id]);
  return home;
}
