'use client';
import {useSyncExternalStore} from 'react';
import {nativeChartInspectorState,type NativeChartDraft} from '../state/native-chart-inspector';
export function NativeChartInspector(){
 const model=useSyncExternalStore(nativeChartInspectorState.subscribe,nativeChartInspectorState.getSnapshot,nativeChartInspectorState.getServerSnapshot),draft=model.draft;
 const field=(key:keyof NativeChartDraft,id:string,label:string,type='text')=><label>{label}<input id={id} type={type} min={type==='number'?0:undefined} max={type==='number'?50:undefined} step={type==='number'?'.5':undefined} value={String(draft[key])} onChange={e=>model.change?.({[key]:e.target.value})}/></label>;
 const run=(action:Parameters<NonNullable<typeof model.run>>[0])=>void model.run?.(action);
 return <fieldset id="native-chart-panel" className="chart-legacy-replaced" hidden={!model.available} disabled={model.busy}>
  <legend>原生图表</legend><p className="hint" id="native-chart-status" role="status">{model.status}</p><button id="inspect-native-chart" onClick={()=>run('inspect')}>读取当前图表</button>
  <label>序列<select id="native-chart-series" value={model.inspection?.series.length?String(model.index):''} onChange={e=>model.series?.(Number(e.target.value))}>{model.inspection?.series.map((s,index)=><option key={index} value={index}>{s.name||`序列 ${index+1}`}</option>)}</select></label>
  {field('name','native-chart-name','序列名称')}{field('color','native-chart-color','颜色')}{field('width','native-chart-width','线宽','number')}
  <label><input id="native-chart-symbols" type="checkbox" checked={draft.showSymbol} onChange={e=>model.change?.({showSymbol:e.target.checked})}/>显示数据点</label>
  <label>序列数据 JSON<textarea id="native-chart-data" rows={5} value={draft.data} onChange={e=>model.change?.({data:e.target.value})}/></label>
  <label><input id="native-chart-save-data" type="checkbox" checked={draft.saveData} onChange={e=>model.change?.({saveData:e.target.checked})}/>固定为这组数据</label>
  <button id="save-native-chart-series" disabled={!model.inspection?.series.length} onClick={()=>run('series')}>应用序列编辑</button>
  <details><summary>图表配置</summary><label>配置补丁 JSON<textarea id="native-chart-option" rows={6} value={draft.option} onChange={e=>model.change?.({option:e.target.value})}/></label><button id="save-native-chart-option" onClick={()=>run('option')}>应用配置</button></details>
  <button id="reset-native-chart" onClick={()=>run('reset')}>恢复原生图表配置</button>
  <div id="native-chart-interaction" hidden={!model.component}>
   <label>学习率<select id="native-chart-value" value={draft.value} onChange={e=>model.change?.({value:e.target.value})}><option value="1.0">1.0 过冲</option><option value="0.1">0.1 推荐</option><option value="0.02">0.02 保守</option></select></label><button id="save-native-chart-state" onClick={()=>run('value')}>保存互动选择</button>
   <label>按钮状态<select id="native-chart-appearance-state" value={draft.appearanceState} onChange={e=>model.change?.({appearanceState:e.target.value as 'active'|'inactive'})}><option value="active">选中</option><option value="inactive">未选中</option></select></label>
   {field('backgroundColor','native-chart-backgroundColor','背景色')}{field('textColor','native-chart-color-state','文字颜色')}{field('borderColor','native-chart-borderColor','边框颜色')}{field('fontWeight','native-chart-fontWeight','字重')}<button id="save-native-chart-appearance" onClick={()=>run('appearance')}>保存状态样式</button>
  </div>{model.error&&<p role="alert">{model.error}</p>}
 </fieldset>;
}
