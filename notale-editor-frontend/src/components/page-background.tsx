'use client';
import {NumberField} from './ui/number-field';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {backgroundState,backgroundActions,type BackgroundModel,type BackgroundPaint} from '../state/page-background';
export function PageBackground(){const source=useSyncExternalStore(backgroundState.subscribe,backgroundState.getSnapshot,backgroundState.getServerSnapshot);return source?<BackgroundFields key={source.key} source={source}/>:null;}
function BackgroundFields({source}:{source:BackgroundModel}){
 const [value,setValue]=useState(source.value),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const baseline=useRef(source),dirty=useRef(false),running=useRef(false),mounted=useRef(true),current=useRef(source.value);
 const queued=useRef<{value:BackgroundPaint|undefined;all:boolean}|undefined>(undefined);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;queued.current=undefined;};},[]);
 useEffect(()=>{if(!dirty.current&&!running.current){baseline.current=source;const next=source.value.gradient?source.value:{...source.value,end:current.current.end,angle:current.current.angle};current.current=next;setValue(next);}},[source]);
 async function save(next:BackgroundPaint|undefined,all=false){
  queued.current={value:next,all};if(running.current)return;
  running.current=true;setBusy(true);setError('');
  try{while(queued.current&&mounted.current){const request=queued.current;queued.current=undefined;await backgroundActions.save(baseline.current,request.value,request.all);if(!mounted.current)return;const confirmed=backgroundState.getSnapshot();if(!confirmed||confirmed.key!==baseline.current.key)return;baseline.current=confirmed;
   if(!queued.current){dirty.current=false;const value=request.value??confirmed.value;current.current=value;setValue(value);}
  }}catch(e){queued.current=undefined;if(mounted.current)setError(e instanceof Error?e.message:String(e));}finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 function change(patch:Partial<BackgroundPaint>){const next={...current.current,...patch};dirty.current=true;current.current=next;setValue(next);void save(next);}
 return <fieldset id="page-background" className="property-group" aria-busy={busy}><legend>页面背景</legend><div className="paint-row"><label>底色<input id="background-color" type="color" value={value.base} onChange={e=>change({base:e.target.value})}/></label><label>渐变终点<input id="background-color-2" type="color" value={value.end} onChange={e=>change({end:e.target.value})}/></label><NumberField id="background-angle" label="角度" min={0} max={360} step={15} value={value.angle} onCommit={angle=>change({angle})}/></div><label className="inline"><input id="background-gradient" type="checkbox" checked={value.gradient} onChange={e=>change({gradient:e.target.checked})}/> 渐变背景</label><div className="inline"><button id="background-apply-all" disabled={busy} onClick={()=>void save(value,true)}>应用到全部页面</button><button id="background-reset" disabled={busy||!source.overridden} onClick={()=>void save(undefined)}>恢复讲义底色</button></div>{error&&<p role="alert">{error}</p>}</fieldset>;
}
