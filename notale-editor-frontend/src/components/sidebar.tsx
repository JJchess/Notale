'use client';
import {useLayoutEffect,useRef,type ReactNode,type HTMLAttributes,type ButtonHTMLAttributes} from 'react';
import {sidebar} from '../state/sidebar';
import type {InspectorTab,PanelName} from '../state/sidebar-state';
import {useEditorSelector} from '../state/use-editor-selector';
export function SidebarEffects(){
  const view=useEditorSelector(state=>state.sidebar),restored=useRef(false);
  useLayoutEffect(()=>{
    const first=!restored.current;
    if(first){restored.current=true;try{sidebar.restore(JSON.parse(localStorage.getItem('notale-editor-view-v1')??'null'));}catch{}}
    for(const name of ['pages','inspector','notes'] as const)document.body.classList.toggle('hide-'+name,!view[name]);
    document.body.classList.toggle('tools-open',!!view.tool);
    if(!first)try{localStorage.setItem('notale-editor-view-v1',JSON.stringify(view.beforeFocus??{pages:view.pages,inspector:view.inspector,notes:view.notes}));}catch{}
    return()=>{for(const name of ['pages','inspector','notes'])document.body.classList.remove('hide-'+name);document.body.classList.remove('tools-open');};
  },[view]);return null;
}
export function SidebarPanel({as:Tag='aside',...props}:HTMLAttributes<HTMLElement>&{as?:'aside'|'div'|'section';children?:ReactNode}){
 const visible=useEditorSelector(state=>{const s=state.sidebar;switch(props.id){case 'page-panel':return s.pages;case 'property-panel':return s.inspector;case 'notes-panel':return s.notes;case 'tool-panel':return !!s.tool;case 'insert-drawer':return s.tool==='insert';case 'template-drawer':return s.tool==='templates';default:return true;}});
 return <Tag {...props} hidden={!visible}/>;
}
export function InspectorPanel({tab,children}: {tab:InspectorTab;children:ReactNode}){const visible=useEditorSelector(state=>state.sidebar.tab===tab);return <section data-panel={tab} hidden={!visible}>{children}</section>;}
export function InspectorTabButton({tab,children}:{tab:InspectorTab;children:ReactNode}){const active=useEditorSelector(state=>state.sidebar.tab===tab);return <button data-tab={tab} className={active?'active':undefined} onClick={()=>sidebar.tab(tab)}>{children}</button>;}
export function ToolButton({tool,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{tool:string}){const pressed=useEditorSelector(state=>{const s=state.sidebar;return tool===s.tool||tool==='pages'&&s.pages||s.inspector&&(tool==='style'?'format':tool)===s.tab;});return <button {...props} data-tool={tool} aria-pressed={pressed} onClick={()=>sidebar.tool(tool)}/>;}
export function SidebarControl({action,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{action:PanelName|'close-tools'|'close-inspector'|'focus'}){const pressed=useEditorSelector(state=>action==='focus'?!!state.sidebar.beforeFocus:action==='pages'||action==='inspector'||action==='notes'?state.sidebar[action]:false);return <button {...props} aria-expanded={action==='focus'?undefined:pressed} aria-pressed={action==='focus'?pressed:undefined} onClick={()=>{if(action==='close-tools')sidebar.closeTools();else if(action==='close-inspector')sidebar.closeInspector();else if(action==='focus')sidebar.focus();else sidebar.toggle(action);}}/>;}
