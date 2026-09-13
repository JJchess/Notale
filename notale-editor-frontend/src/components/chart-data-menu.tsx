'use client';
import { isComposingKey } from "../keyboard";
import {createPortal} from 'react-dom';
import {useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {chartDataMenuState,closeChartDataMenu,runChartDataMenu,type ChartDataMenu} from '../state/chart-data-menu';
export function ChartDataMenuView(){const menu=useSyncExternalStore(chartDataMenuState.subscribe,chartDataMenuState.getSnapshot,chartDataMenuState.getServerSnapshot);return menu?createPortal(<Menu key={menu.id} menu={menu}/>,document.body):null;}
function Menu({menu}:{menu:ChartDataMenu}){
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useLayoutEffect(()=>{
  const node=host.current!,previous=document.activeElement;
  const bounds=node.getBoundingClientRect();node.style.left=`${Math.max(0,Math.min(menu.x,innerWidth-bounds.width))}px`;node.style.top=`${Math.max(0,Math.min(menu.y,innerHeight-bounds.height))}px`;
  node.querySelector('button')?.focus();
  const outside=(event:PointerEvent)=>{if(!node.contains(event.target as Node))closeChartDataMenu(menu);};
  document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('pointerdown',outside);if(node.contains(document.activeElement)&&previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
 },[menu]);
 return <div ref={host} id="chart-grid-menu" className="chart-grid-menu" role="menu" style={{position:'fixed',left:menu.x,top:menu.y}} onKeyDown={event=>{
  if(isComposingKey(event.nativeEvent))return;
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();closeChartDataMenu(menu);}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const items=[...host.current!.querySelectorAll('button')],index=items.indexOf(document.activeElement as HTMLButtonElement);
   const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
  }
 }}>{menu.actions.map((action,index)=><button key={action.label} role="menuitem" onClick={()=>{try{runChartDataMenu(menu,index);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}}>{action.label}</button>)}{error&&<p role="status">{error}</p>}</div>;
}
