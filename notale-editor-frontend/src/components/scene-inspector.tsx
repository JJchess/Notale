'use client';
import {useSyncExternalStore} from 'react';
import {sceneInspectorState} from '../state/scene-inspector';
export function SceneInspector(){
 const model=useSyncExternalStore(sceneInspectorState.subscribe,sceneInspectorState.getSnapshot,sceneInspectorState.getServerSnapshot);
 const scene=model.scenes.find(scene=>scene.id===model.selected);
 return <fieldset id="scene-panel" hidden={!scene} disabled={model.busy}>
  <legend>互动场景参数</legend><p id="scene-status" className="hint" role="status">{model.status}</p>
  <label>状态组<select id="scene-choice" value={model.selected} onChange={e=>model.select?.(e.target.value)}>{model.scenes.map(scene=><option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>
  <button id="select-scene-root" hidden={!scene?.root} onClick={()=>void model.run?.('root')}>选择完整互动区域</button>
  <button id="read-scene" onClick={()=>void model.run?.('read')}>读取当前互动状态</button>
  <div id="scene-parameters">{!scene?.checkpoint&&scene?.parameters.filter(p=>!p.readonly).map(p=><label key={p.key}>{p.label==='seed'?'随机种子':p.label}{p.choices?<select data-scene-key={p.key} value={String(model.draft[p.key]??'')} onChange={e=>model.change?.(p.key,e.target.value)}>{p.choices.map(choice=><option key={String(choice.value)} value={String(choice.value)}>{choice.label}</option>)}</select>:typeof p.value==='boolean'?<input data-scene-key={p.key} type="checkbox" checked={model.draft[p.key]===true} onChange={e=>model.change?.(p.key,e.target.checked)}/>:<input data-scene-key={p.key} type={typeof p.value==='number'?'number':'text'} value={String(model.draft[p.key]??'')} min={p.control?.min} max={p.control?.max} step={p.control?.step??'any'} onChange={e=>model.change?.(p.key,e.target.value)}/>}</label>)}</div>
  <button id="save-scene" disabled={!model.captured} onClick={()=>void model.run?.('save')}>{scene?.checkpoint?'保存完整场景状态':'保存场景参数'}</button>
  <button id="reset-scene" onClick={()=>void model.run?.('reset')}>恢复源稿参数</button>{model.error&&<p role="alert">{model.error}</p>}
 </fieldset>;
}
