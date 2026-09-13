'use client';
import {useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {chartDockState,chartDockActions} from '../state/chart-dock';
export function ChartDataDock(){
 const model=useSyncExternalStore(chartDockState.subscribe,chartDockState.getSnapshot,chartDockState.getServerSnapshot),host=useRef<HTMLElement>(null),drag=useRef<{y:number;height:number}|undefined>(undefined);
 const previous=useRef(false),scroll=useRef({left:0,top:0});
 useLayoutEffect(()=>{
  const parent=host.current?.parentElement,viewport=document.getElementById('canvas-viewport');
  if(model.visible){if(!previous.current&&viewport)scroll.current={left:viewport.scrollLeft,top:viewport.scrollTop};parent?.style.setProperty('--chart-dock-height',`${model.height}px`);}
  else{parent?.style.removeProperty('--chart-dock-height');if(previous.current)viewport?.scrollTo(scroll.current.left,scroll.current.top);}
  previous.current=model.visible;
  return()=>{parent?.style.removeProperty('--chart-dock-height');};
 },[model.visible,model.height]);
 const clamp=(height:number)=>Math.max(180,Math.min(height,(host.current?.parentElement?.clientHeight??560)*.5));
 function finish(){drag.current=undefined;try{localStorage.setItem('notale-chart-dock-height',String(chartDockState.getSnapshot().height));}catch{}}
 return <section ref={host} id="chart-data-dock" className="chart-data-dock" aria-label="图表数据" hidden={!model.visible} style={{height:model.height}}>
 <div className="chart-data-resizer" role="separator" aria-label="调整数据面板高度" aria-orientation="horizontal" aria-valuenow={model.height} tabIndex={0}
 onPointerDown={event=>{event.preventDefault();drag.current={y:event.clientY,height:model.height};event.currentTarget.setPointerCapture(event.pointerId);}}
 onPointerMove={event=>{if(drag.current)chartDockActions.resize(clamp(drag.current.height+drag.current.y-event.clientY));}}
 onPointerUp={finish} onPointerCancel={()=>{if(drag.current)chartDockActions.resize(drag.current.height);drag.current=undefined;}}
 onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();chartDockActions.resize(clamp(model.height+(event.key==='ArrowUp'?20:-20)));finish();}}}/>
 <div className="chart-data-toolbar"><strong>图表数据</strong><div className="chart-data-actions"/><button className="chart-data-close" aria-label="收起图表数据" title="收起图表数据" onClick={()=>chartDockActions.close()}>×</button></div>
 <div className="chart-data-bindings"/><div className="chart-data-grid"/><p className={`chart-data-status${model.error?' is-error':''}`} role="status">{model.status}</p>
 </section>;
}
