'use client';
import {Fragment,useSyncExternalStore,type ReactNode} from 'react';
import {alignmentLabels,layerLabels,arrangementState,changeArrangement} from '../state/arrangement';
// Alignment and stacking read faster as shapes than as words, the way PowerPoint's Arrange
// group does; the Chinese label moves to the tooltip and the accessible name.
const icons:Record<string,ReactNode>={
 left:<path d="M4 3v18M8 6h11v4H8zM8 14h7v4H8z"/>,
 center:<path d="M12 3v18M5 6h14v4H5zM8 14h8v4H8z"/>,
 right:<path d="M20 3v18M5 6h11v4H5zM9 14h7v4H9z"/>,
 top:<path d="M3 4h18M6 8h4v11H6zM14 8h4v7h-4z"/>,
 middle:<path d="M3 12h18M6 5h4v14H6zM14 8h4v8h-4z"/>,
 bottom:<path d="M3 20h18M6 5h4v11H6zM14 9h4v7h-4z"/>,
 'distribute-x':<path d="M3 3v18M21 3v18M8 7h8v10H8z"/>,
 'distribute-y':<path d="M3 3h18M3 21h18M7 8h10v8H7z"/>,
 front:<path d="M4 4h12v12H4zM20 8v12H8"/>,
 back:<path d="M8 8h12v12H8zM4 16V4h12"/>,
 forward:<path d="M4 10h10v10H4zM19 3v6M16 6l3-3 3 3"/>,
 backward:<path d="M4 4h10v10H4zM19 21v-6M16 18l3 3 3-3"/>,
};
function Icon({name}:{name:string}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;}
export function Arrangement(){const model=useSyncExternalStore(arrangementState.subscribe,arrangementState.getSnapshot,arrangementState.getServerSnapshot);return <>
 <label>对齐基准<select id="arrange-reference" value={model.reference} onChange={e=>changeArrangement({reference:e.target.value as 'selection'|'slide'})}><option value="selection">选区</option><option value="slide">页面</option></select></label>
 <div id="arrange-tools" className="inline" role="group" aria-label="对齐与分布">{Object.entries(alignmentLabels).map(([action,label])=><Fragment key={action}>{action==='distribute-x'&&<i className="group-rule"/>}<button id={'arrange-'+action} className="icon-button" title={label} aria-label={label} disabled={model.disabled||action.startsWith('distribute')&&model.units<3} onClick={()=>void model.run?.(action)}><Icon name={action}/></button></Fragment>)}</div>
 <div className="field-grid"><label>组旋转角度<input id="group-angle" type="number" value={model.angle} onChange={e=>changeArrangement({angle:e.target.value})}/></label><label>组缩放倍数<input id="group-factor" type="number" value={model.factor} onChange={e=>changeArrangement({factor:e.target.value})}/></label></div>
 <button id="rotate-group" disabled={model.disabled} onClick={()=>void model.run?.('rotate')}>整体旋转</button><button id="scale-group" disabled={model.disabled} onClick={()=>void model.run?.('scale')}>整体缩放</button>{model.error&&<p role="alert">{model.error}</p>}
 <div id="layer-tools" className="inline" role="group" aria-label="叠放次序">{Object.entries(layerLabels).map(([action,label])=><button key={action} id={action==='front'||action==='back'?action:'layer-'+action} className="icon-button" title={label} aria-label={label} disabled={model.disabled} onClick={()=>void model.run?.(action)}><Icon name={action}/></button>)}</div>
 </>;}
