'use client';
import {useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {chartNames,type ChartKind} from '@notale/editor/browser';
import {chartGalleryState,chooseChartGallery,closeChartGallery,type ChartGallery} from '../state/chart-gallery';
const groups:[string,ChartKind[]][]=[
 ['常用',['column','bar','line','area','pie','doughnut']],
 ['组合与比较',['combo','stacked','percent','stacked-area','waterfall','rose']],
 ['统计',['scatter','bubble','histogram','boxplot','radar','heatmap']],
 ['结构与流程',['tree','treemap','sunburst','graph','sankey','funnel','gauge']],
];
export function ChartGalleryDialog(){const gallery=useSyncExternalStore(chartGalleryState.subscribe,chartGalleryState.getSnapshot,chartGalleryState.getServerSnapshot);return gallery?<Gallery key={gallery.id} gallery={gallery}/>:null;}
function Gallery({gallery}:{gallery:ChartGallery}){
 const dialog=useRef<HTMLDialogElement>(null),running=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useLayoutEffect(()=>{const node=dialog.current!;node.showModal();return()=>node.close();},[]);
 const close=()=>{if(!running.current)closeChartGallery(gallery);};
 async function choose(kind:ChartKind){if(running.current)return;running.current=true;setBusy(true);setError('');try{await chooseChartGallery(gallery,kind);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{running.current=false;setBusy(false);}}
 return <dialog ref={dialog} id="chart-type-gallery" className="chart-gallery" aria-label="选择图表类型" onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>event.stopPropagation()}>
 <header><h2>{gallery.mode==='insert'?'插入图表':'更改图表类型'}</h2><button aria-label="关闭" disabled={busy} onClick={close}>×</button></header>
 {groups.map(([name,kinds])=><section key={name}><h3>{name}</h3><div className="chart-type-grid">{kinds.map(kind=><button key={kind} className="chart-type-card" disabled={busy} aria-pressed={gallery.mode==='change'&&gallery.kind===kind} onClick={()=>void choose(kind)}><div className={`chart-mini chart-mini-${kind}`} aria-hidden="true">{['pie','doughnut','rose','sunburst'].includes(kind)?<i className="chart-mini-circle"/>:['line','area','stacked-area'].includes(kind)?<svg viewBox="0 0 100 50"><path d="M5 42L30 24L50 32L75 10L95 17"/></svg>:[40,75,55,90].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div>{chartNames[kind]}</button>)}</div></section>)}
 {error&&<p className="chart-type-hint" role="status">{error}</p>}
 </dialog>;
}
