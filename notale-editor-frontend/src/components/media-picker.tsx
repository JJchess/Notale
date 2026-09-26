'use client';
import {useLayoutEffect,useRef} from 'react';
import {bindMediaPicker} from '../state/media-picker';
import {editorActions} from '../state/editor-session';
export function MediaPicker(){
 const input=useRef<HTMLInputElement>(null);
 useLayoutEffect(()=>bindMediaPicker(kind=>{const node=input.current;if(!node)return;node.accept=kind==='image'?'image/*':`${kind}/*`;node.click();}),[]);
 return <input ref={input} id="media-file" type="file" hidden onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;try{void editorActions.importMedia(file).catch(editorActions.reportError);}catch(cause){editorActions.reportError(cause);}}}/>;
}
