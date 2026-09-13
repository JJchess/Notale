'use client';
import {useLayoutEffect,useRef} from 'react';
import {disposeCanvasHost} from '../canvas/controller';
/** React owns the host; CanvasController exclusively owns its iframe children. */
export function CanvasHost(){
  const host=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const node=host.current!;return()=>disposeCanvasHost(node);},[]);
  return <div id="canvas-host" ref={host} style={{width:'100%',height:'100%'}}/>;
}
