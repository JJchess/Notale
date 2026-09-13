'use client';
import {useSyncExternalStore} from 'react';
import {componentForm,type ComponentFormNode} from '../component-form';
import {componentInspectorState} from '../state/component-inspector';
function FormNode({node}:{node:ComponentFormNode|string}){
 const model=useSyncExternalStore(componentInspectorState.subscribe,componentInspectorState.getSnapshot,componentInspectorState.getServerSnapshot);
 if(typeof node==='string')return node;
 const id=node.attrs.id??'',control=model.controls[id],unavailable='data-component-pending' in node.attrs||id==='author-native-value'||node.tag==='label'&&node.children.some(child=>typeof child!=='string'&&child.attrs.id==='author-native-value');
 const props:Record<string,unknown>={};for(const [key,value]of Object.entries(node.attrs)){if(['value','checked','disabled','hidden','open'].includes(key))continue;props[key==='class'?'className':key]=value??'';}
 props.hidden=unavailable||control?.hidden||'hidden' in node.attrs&&control?.hidden===undefined;
 if(unavailable){props.inert=true;props['data-editor-unavailable']='true';}
 const disabled=unavailable||control?.disabled;
 if(node.tag==='input')return <input {...props} disabled={disabled} value={node.attrs.type==='checkbox'?undefined:control?.value??''} checked={node.attrs.type==='checkbox'?!!control?.checked:undefined} onChange={event=>model.change?.(id,event.target.type==='checkbox'?event.target.checked:event.target.value)}/>;
 if(node.tag==='textarea')return <textarea {...props} disabled={disabled} value={control?.value??''} onChange={event=>model.change?.(id,event.target.value)}/>;
 if(node.tag==='select')return <select {...props} disabled={disabled} value={control?.value??''} onChange={event=>model.change?.(id,event.target.value)}>{(control?.options??[]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>;
 const children=control?.text??node.children.map((child,index)=><FormNode key={typeof child==='string'?index:child.attrs.id??index} node={child}/>);
 if(node.tag==='button')return <button {...props} type="button" disabled={disabled} onClick={()=>void model.run?.(id)}>{children}</button>;
 if(node.tag==='details')return <details {...props} open={'open' in node.attrs}>{children}</details>;
 const Tag=node.tag as 'div';return <Tag {...props}>{children}</Tag>;
}
export function ComponentInspector(){const model=useSyncExternalStore(componentInspectorState.subscribe,componentInspectorState.getSnapshot,componentInspectorState.getServerSnapshot);return <fieldset id="author-components" disabled={model.busy||!model.scope} aria-busy={model.busy}>{componentForm.map((node,index)=><FormNode key={node.attrs.id??index} node={node}/>)}{model.error&&<><p role="alert">{model.error}</p><button type="button" onClick={()=>model.reset?.()}>载入最新内容</button></>}</fieldset>;}
