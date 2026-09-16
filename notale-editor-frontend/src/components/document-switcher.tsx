'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {editorSession,editorActions} from '../state/editor-session';
import {useEditorSelector,shallowEqual} from '../state/use-editor-selector';

/** The catalogue is auxiliary; a slow catalogue never gates the open author document. */
export function DocumentSwitcher(){
  const {documents,busy,open,current,notice}=useEditorSelector(state=>({documents:state.documents,busy:state.busy,open:state.switchingDocument,current:state.document?.document.id??'',notice:state.catalogueNotice}),shallowEqual);
  const dialog=useRef<HTMLDialogElement>(null),request=useRef(false);
  const [pending,setPending]=useState(false),[selected,setSelected]=useState(current),[error,setError]=useState('');
  useLayoutEffect(()=>{const node=dialog.current!;if(open&&!node.open){setError('');setSelected(current);node.showModal();}else if(!open&&node.open)node.close();},[open,current]);
  useLayoutEffect(()=>{if(!pending)setSelected(current);},[current,pending]);
  async function change(id:string){
    if(request.current||busy)return;
    request.current=true;setPending(true);setSelected(id);setError('');
    try{await editorActions.loadDocument(id);editorSession.update({switchingDocument:false});}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
    finally{request.current=false;setPending(false);setSelected(editorSession.getSnapshot().document?.document.id??'');}
  }
  return <>
    <dialog ref={dialog} id="switch-document-dialog" className="settings-dialog" aria-label="切换讲义" data-busy={pending}
      onClose={()=>editorSession.update({switchingDocument:false})} onCancel={event=>{if(pending)event.preventDefault();}} onKeyDown={event=>event.stopPropagation()}>
      <header><h2>切换讲义</h2><button type="button" aria-label="关闭" disabled={pending} onClick={()=>editorSession.update({switchingDocument:false})}>×</button></header>
      <label>讲义<select id="documents" aria-label="选择讲义" value={selected} disabled={busy||pending} title={notice} onChange={event=>void change(event.target.value)}>
        {documents.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <p className="settings-status" role="status">{error||notice}</p>
    </dialog>
  </>;
}
