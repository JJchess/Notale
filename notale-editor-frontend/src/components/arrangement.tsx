'use client';
import {useSyncExternalStore} from 'react';
import {alignmentLabels,layerLabels,arrangementState,changeArrangement} from '../state/arrangement';
export function Arrangement(){const model=useSyncExternalStore(arrangementState.subscribe,arrangementState.getSnapshot,arrangementState.getServerSnapshot);return <>
 <label>对齐基准<select id="arrange-reference" value={model.reference} onChange={e=>changeArrangement({reference:e.target.value as 'selection'|'slide'})}><option value="selection">选区</option><option value="slide">页面</option></select></label>
 <div id="arrange-tools" className="inline">{Object.entries(alignmentLabels).map(([action,label])=><button key={action} id={'arrange-'+action} disabled={model.disabled||action.startsWith('distribute')&&model.units<3} onClick={()=>void model.run?.(action)}>{label}</button>)}</div>
 <div className="field-grid"><label>组旋转角度<input id="group-angle" type="number" value={model.angle} onChange={e=>changeArrangement({angle:e.target.value})}/></label><label>组缩放倍数<input id="group-factor" type="number" value={model.factor} onChange={e=>changeArrangement({factor:e.target.value})}/></label></div>
 <button id="rotate-group" disabled={model.disabled} onClick={()=>void model.run?.('rotate')}>整体旋转</button><button id="scale-group" disabled={model.disabled} onClick={()=>void model.run?.('scale')}>整体缩放</button>{model.error&&<p role="alert">{model.error}</p>}
 {Object.entries(layerLabels).map(([action,label])=><button key={action} id={action==='front'||action==='back'?action:'layer-'+action} disabled={model.disabled} onClick={()=>void model.run?.(action)}>{label}</button>)}
 </>;}
