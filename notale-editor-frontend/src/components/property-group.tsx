'use client';
import {unavailableFeature} from '../feature-availability';
import type {ReactNode} from 'react';
import {useEditorSelector} from '../state/use-editor-selector';
import {useFormatFacet} from './format-tabs';
import type {FormatTab} from '../state/format-tabs';
/** Keep field instances mounted while React owns the group's visibility and lock state.
 * `facet` adds PowerPoint's second gate: a group also waits for its icon tab to be chosen.
 * Secondary groups stay `collapsible`, i.e. a `<details>` that starts closed; the one group
 * a facet exists for stays open, because a facet whose only section is folded shows nothing. */
export function PropertyGroup({id,title,kind='selection',collapsible=false,unavailable=false,facet,children}:{id:string;title:string;kind?:'text'|'binding'|'selection'|'always';collapsible?:boolean;unavailable?:boolean;facet?:FormatTab|FormatTab[];children:ReactNode}){
 const selection=useEditorSelector(state=>state.inspector);
 const inFacet=useFormatFacet(facet??[]);
 const visible=(!facet||inFacet)&&(kind==='always'||(kind==='text'?selection.typography:kind==='binding'?selection.binding:selection.count>0));
 return collapsible
  ? <details id={id} className="property-group" {...(unavailable?unavailableFeature:{hidden:!visible})}><summary>{title}</summary>{children}</details>
  : <fieldset id={id} className="property-group" {...(unavailable?unavailableFeature:{hidden:!visible})} disabled={kind==='text'?selection.editableCount===0:selection.locked} title={kind==='text'&&selection.locked&&selection.editableCount>0?'仅修改未锁定对象':undefined}><legend>{title}</legend>{children}</fieldset>;
}
