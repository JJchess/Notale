'use client';
import { isComposingKey } from "../keyboard";

import {useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {chartSvg} from '@notale/editor/browser';
import {draftChart,importStaticChart,type StaticChartDraft,type StaticChart} from '../state/static-chart';
import {staticChartState,staticChartActions,type StaticChartEditing} from '../state/static-chart-dialog';
const message=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);
function useChart(){return useSyncExternalStore(staticChartState.subscribe,staticChartState.getSnapshot,staticChartState.getServerSnapshot);}
export function StaticChartButtons(){
 const model=useChart(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function convert(){if(busy)return;setBusy(true);setError('');try{await staticChartActions.convert();}catch(cause){setError(message(cause));}finally{setBusy(false);}}
 return <><button id="open-chart-editor" hidden={!model.available} disabled={model.locked||busy} onClick={()=>{setError('');try{staticChartActions.open();}catch(cause){setError(message(cause));}}}>编辑图表数据</button><button id="convert-echarts" hidden={!model.available} disabled={model.locked||busy} onClick={()=>void convert()}>转换为可编辑互动图表</button>{model.available&&error&&<p role="status">{error}</p>}</>;
}
export function StaticChartDialog(){const {editing}=useChart();return editing?<ChartForm key={editing.id} editing={editing}/>:null;}
function ChartForm({editing}:{editing:StaticChartEditing}) {
 const [draft,setDraft]=useState(()=>structuredClone(editing.draft));
 const [paste,setPaste]=useState(''),[pasteStatus,setPasteStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),running=useRef(false);
 useLayoutEffect(()=>{const node=dialog.current!;node.showModal();node.querySelector<HTMLInputElement>('#visual-chart-title')?.focus();return()=>node.close();},[]);
 const preview=useMemo(()=>{try{return {html:chartSvg(draftChart(draft)),error:''};}catch(cause){return {html:'',error:cause instanceof Error&&cause.name!=='ZodError'?cause.message:'图表数据不符合要求，请检查分类、系列和数值。'};}},[draft]);
 function change(update:(draft:StaticChartDraft)=>void){setDraft(previous=>{const next=structuredClone(previous);update(next);return next;});setError('');}
 const close=()=>{if(!running.current)staticChartActions.close();};
 async function save(){if(running.current||preview.error)return;running.current=true;setBusy(true);setError('');try{await staticChartActions.save(editing,draft);}catch(cause){setError(message(cause));}finally{running.current=false;setBusy(false);}}
 function importData(){try{const next=importStaticChart(draft,paste);setDraft(next);setError('');setPasteStatus(`已载入 ${next.chart.labels.length} 个分类、${next.chart.series!.length} 个系列`);}catch(cause){setPasteStatus(`未替换原数据：${message(cause)}`);}}
 const {chart}=draft,series=chart.series!;
 return <dialog ref={dialog} id="chart-editor-dialog" aria-labelledby="chart-editor-title" onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{event.stopPropagation();if(!isComposingKey(event.nativeEvent)&&(event.ctrlKey||event.metaKey)&&(event.key==='Enter'||event.key.toLowerCase()==='s')){event.preventDefault();void save();}}}>
  <header><h2 id="chart-editor-title">图表数据</h2><button id="close-chart-editor" aria-label="关闭图表编辑" disabled={busy} onClick={close}>×</button></header>
  <div className="field-grid"><label>标题<input id="visual-chart-title" disabled={busy} value={chart.title} onChange={event=>change(draft=>{draft.chart.title=event.target.value;})}/></label><label>图表类型<select id="visual-chart-kind" disabled={busy} value={chart.kind} onChange={event=>change(draft=>{draft.chart.kind=event.target.value as StaticChart['kind'];})}>{[['bar','柱状图'],['line','折线图'],['area','面积图'],['pie','饼图'],['doughnut','环形图']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
  <div id="visual-chart-preview" aria-label="图表预览" dangerouslySetInnerHTML={{__html:preview.html}}/>
  <details id="chart-paste-panel"><summary>粘贴表格数据</summary><p className="hint">第一行为系列名称，第一列为分类。应用后替换当前数据。</p><textarea id="chart-paste-data" rows={4} aria-label="表格数据" disabled={busy} value={paste} onChange={event=>setPaste(event.target.value)}/><button id="chart-paste-apply" disabled={busy} onClick={importData}>应用到图表预览</button><p id="chart-paste-status" role="status">{pasteStatus}</p></details>
  <div id="chart-data-grid"><table><thead><tr><td>分类</td>{series.map((series,index)=><td key={index}><textarea data-series-name={index} rows={series.name.includes('\n')?2:1} aria-label={`系列 ${index+1} 名称`} disabled={busy} value={series.name} onChange={event=>change(draft=>{draft.chart.series![index].name=event.target.value;})}/><button data-remove-series={index} disabled={busy||chart.series!.length===1} onClick={()=>change(draft=>{draft.chart.series!.splice(index,1);draft.values.splice(index,1);})}>删除系列</button></td>)}<td/></tr></thead>
   <tbody>{chart.labels.map((label,row)=><tr key={row}><td><textarea data-chart-label={row} rows={label.includes('\n')?2:1} aria-label={`分类 ${row+1}`} disabled={busy} value={label} onChange={event=>change(draft=>{draft.chart.labels[row]=event.target.value;})}/></td>{series.map((_,index)=><td key={index}><input type="number" step="any" data-chart-value={`${index}:${row}`} aria-invalid={!draft.values[index][row].trim()||!Number.isFinite(Number(draft.values[index][row]))} aria-label={`分类 ${row+1} 系列 ${index+1} 数值`} disabled={busy} value={draft.values[index][row]} onChange={event=>change(draft=>{draft.values[index][row]=event.target.value;})}/></td>)}<td><button data-remove-category={row} disabled={busy||chart.labels.length===1} onClick={()=>change(draft=>{draft.chart.labels.splice(row,1);for(const values of draft.values)values.splice(row,1);for(const series of draft.chart.series!)series.values.splice(row,1);})}>删除分类</button></td></tr>)}</tbody>
  </table></div>
  <div className="inline"><button id="chart-add-row" disabled={busy||chart.labels.length>=100} onClick={()=>change(draft=>{draft.chart.labels.push('新分类');for(const values of draft.values)values.push('0');for(const series of draft.chart.series!)series.values.push(0);})}>添加分类</button><button id="chart-add-series" disabled={busy||series.length>=8||['pie','doughnut'].includes(chart.kind)} onClick={()=>change(draft=>{draft.chart.series!.push({name:`系列 ${draft.chart.series!.length+1}`,values:draft.chart.labels.map(()=>0)});draft.values.push(draft.chart.labels.map(()=>'0'));})}>添加系列</button></div>
  <p id="chart-editor-status" role="status">{error||preview.error}</p><footer><button id="save-chart-editor" className="primary" disabled={busy||!!preview.error} onClick={()=>void save()}>保存图表</button></footer>
 </dialog>;
}
