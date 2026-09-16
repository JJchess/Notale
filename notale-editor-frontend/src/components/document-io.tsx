'use client';
import {useSyncExternalStore} from 'react';
import {documentIOState} from '../state/document-io';
import {useEditorSelector} from '../state/use-editor-selector';
function useIO(){return useSyncExternalStore(documentIOState.subscribe,documentIOState.getSnapshot,documentIOState.getServerSnapshot);}
export function ImportControls(){const io=useIO(),disabled=!io.available||io.busy;return <>{([['pptx','import-pptx','导入 PPTX','.pptx'],['project','import','导入Notale','.notale']] as const).map(([kind,id,label,accept])=><label key={id} className="button" tabIndex={disabled?-1:0} aria-disabled={disabled}>{label}<input id={id} type="file" accept={accept} hidden disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void io.importFile?.(file,kind);}}/></label>)}</>;}
export function ExportControls(){const io=useIO(),loaded=useEditorSelector(state=>!!state.document),disabled=!io.available||io.busy||!loaded;return <><button id="export-pdf" title="把每一页按讲义尺寸打印为 PDF" disabled={disabled} onClick={()=>void io.exportFile?.('pdf')}>导出 PDF</button><button id="export" disabled={disabled} onClick={()=>void io.exportFile?.('project')}>导出Notale</button></>;}
export function DocumentIOStatus(){const io=useIO();return <span role="status" id="document-io-status" hidden={!io.message}>{io.message}{io.result&&<button disabled={io.busy} onClick={()=>void io.openResult?.()}>打开导入的讲义</button>}</span>;}
