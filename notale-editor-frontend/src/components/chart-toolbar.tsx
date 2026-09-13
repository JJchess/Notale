'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {chartToolbarState,runChartToolbar,type ChartToolbar} from '../state/chart-toolbar';
export function ChartToolbarView(){const model=useSyncExternalStore(chartToolbarState.subscribe,chartToolbarState.getSnapshot,chartToolbarState.getServerSnapshot);return model?createPortal(<Toolbar key={model.id} model={model}/>,model.container):null;}
function Toolbar({model}:{model:ChartToolbar}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),running=useRef(false),picker=useRef<HTMLInputElement>(null),receiveFile=useRef<((file:File)=>Promise<void>)|undefined>(undefined);
 async function run(index:number){if(running.current)return;running.current=true;setBusy(true);setError('');try{const action=model.actions[index];if(action.file){if(chartToolbarState.getSnapshot()!==model)throw Error('图表工具栏已关闭');receiveFile.current=action.file.prepare();const input=picker.current;if(input){input.click();}}else await runChartToolbar(model,index);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{running.current=false;setBusy(false);}}
 async function importFile(file:File){const receive=receiveFile.current;receiveFile.current=undefined;if(!receive||running.current||chartToolbarState.getSnapshot()!==model)return;running.current=true;setBusy(true);setError('');try{await receive(file);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{running.current=false;setBusy(false);}}
 return <><input ref={picker} type="file" accept={model.actions.find(action=>action.file)?.file?.accept} hidden onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void importFile(file);}}/>{model.actions.map((action,index)=><button key={action.label} type="button" title={action.label} aria-label={action.label} disabled={busy} onClick={()=>void run(index)}>{action.label}</button>)}{error&&<span role="status">{error}</span>}</>;
}
