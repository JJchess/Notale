import {sidebar} from './state/sidebar';
import type {InspectorTab} from './state/sidebar-state';
import {createViewportController} from './canvas/viewport-controller';
/** Mount adapter for viewport geometry and inspector focus. */
export function createEditorShell(onZoom:(scale:number)=>void=()=>{}){
 const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const viewport=createViewportController({viewport:element('canvas-viewport'),stage:element('canvas-stage'),canvas:document.querySelector<HTMLElement>('.canvas-wrap')!,panSurface:element('canvas-pan-surface'),frame:()=>element<HTMLIFrameElement>('canvas'),onZoom});
 let disposed=false;
 function inspect(tab:string){if(!disposed&&['format','objects','animation'].includes(tab))sidebar.inspect(tab as InspectorTab);}
 /** Open a drawer tool, e.g. to hand the current selection to the 互动 tab. */
 function openTool(tool:string){if(!disposed)sidebar.tool(tool);}
 return {...viewport,inspect,openTool,dispose(){if(disposed)return;disposed=true;viewport.dispose();}};
}
