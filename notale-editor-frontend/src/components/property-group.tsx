'use client';
import {unavailableFeature} from '../feature-availability';
import type {ReactNode} from 'react';
import {useEditorSelector} from '../state/use-editor-selector';
/** Keep field instances mounted while React owns the group's visibility and lock state. */
export function PropertyGroup({id,title,kind='selection',collapsible=false,unavailable=false,children}:{id:string;title:string;kind?:'text'|'binding'|'selection'|'always';collapsible?:boolean;unavailable?:boolean;children:ReactNode}){
 const selection=useEditorSelector(state=>state.inspector);
 const visible=kind==='always'||(kind==='text'?selection.typography:kind==='binding'?selection.binding:selection.count>0);
 return collapsible
  ? <details id={id} className="property-group" {...(unavailable?unavailableFeature:{hidden:!visible})}><summary>{title}</summary>{children}</details>
  : <fieldset id={id} className="property-group" {...(unavailable?unavailableFeature:{hidden:!visible})} disabled={kind==='text'?selection.editableCount===0:selection.locked} title={kind==='text'&&selection.locked&&selection.editableCount>0?'仅修改未锁定对象':undefined}><legend>{title}</legend>{children}</fieldset>;
}
