'use client';
import {useSyncExternalStore,type ReactNode} from 'react';
import {formatView,type FormatScope,type FormatTab} from '../state/format-tabs';
import {formatPanelState,chooseFormatTab} from '../state/format-panel';
import {connectorInspectorState} from '../state/connector-inspector';
import {sceneInspectorState} from '../state/scene-inspector';
import {vectorInspectorState} from '../state/vector-inspector';
import {nativeChartInspectorState} from '../state/native-chart-inspector';
import {chartPropertiesState} from '../state/chart-properties';
import {revealPresetState} from '../state/reveal-preset';
import {useEditorSelector} from '../state/use-editor-selector';
/** The facet icons, in PowerPoint's order: fill and line, effects, size and properties,
 * then whatever the selected type adds. */
const icons:Record<FormatTab,ReactNode>={
 fill:<path d="m12 3 7 7-7 7-7-7ZM19 14c1.6 2 2.4 3.3 2.4 4a2.4 2.4 0 0 1-4.8 0c0-.7.8-2 2.4-4Z"/>,
 effects:<path d="m12 3 8.5 6.2-3.2 10H6.7l-3.2-10Z"/>,
 layout:<path d="M4 4h16v16H4ZM4 10h16M10 4v16"/>,
 special:<path d="M4 5h16v14H4Zm3 9 3.5-4 3 3.5 2-2L17 14"/>,
 font:<path d="M5 20h5m4 0h5M9 20 12 4l3 16M9.8 15h4.4"/>,
 textbox:<path d="M3 5h18v14H3Zm4 4h10M7 13h6"/>,
 background:<path d="M4 4h16v16H4Zm0 10 4.5-4.5 4 4L16 10l4 4"/>,
 theme:<path d="M12 3a9 9 0 1 0 0 18c1.7 0 2-1.3 1.2-2.2-.8-1-.2-2.3 1-2.3H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5Z"/>,
 page:<path d="M6 3h8l4 4v14H6Zm8 0v4h4"/>,
};
function Icon({tab}:{tab:FormatTab}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[tab]}</svg>;}
function useFormat(){
 const selected=useEditorSelector(state=>state.selectedIds.length>0);
 const inspector=useEditorSelector(state=>state.inspector);
 const connector=!!useSyncExternalStore(connectorInspectorState.subscribe,connectorInspectorState.getSnapshot,connectorInspectorState.getServerSnapshot).draft;
 const scene=useSyncExternalStore(sceneInspectorState.subscribe,sceneInspectorState.getSnapshot,sceneInspectorState.getServerSnapshot);
 const reveal=useSyncExternalStore(revealPresetState.subscribe,revealPresetState.getSnapshot,revealPresetState.getServerSnapshot);
 const chosen=useSyncExternalStore(formatPanelState.subscribe,formatPanelState.getSnapshot,formatPanelState.getServerSnapshot);
 const vector=useSyncExternalStore(vectorInspectorState.subscribe,vectorInspectorState.getSnapshot,vectorInspectorState.getServerSnapshot).state.active;
 const nativeChart=useSyncExternalStore(nativeChartInspectorState.subscribe,nativeChartInspectorState.getSnapshot,nativeChartInspectorState.getServerSnapshot).available;
 const chartProperties=useSyncExternalStore(chartPropertiesState.subscribe,chartPropertiesState.getSnapshot,chartPropertiesState.getServerSnapshot).visible;
 const interactive=inspector.binding||!!reveal.draft||scene.scenes.some(entry=>entry.id===scene.selected);
 return formatView(selected,inspector.kind,inspector.typography,chosen.scope,chosen.tab,{connector,interactive,vector,chart:nativeChart||chartProperties});
}
/** The tab rows. Both stay mounted so the panel keeps its scroll position and so the
 * imperative controllers that mount into these panes by id never lose their host. */
export function FormatTabs({of}:{of:'object'|'page'}){
 const view=useFormat();
 const scope=view.scopes.find(entry=>entry.id===view.scope)??view.scopes[0];
 // One row per style scope, and each renders only while its scope is the one on screen, so
 // the two instances never both claim the same tab id.
 if(!scope||(of==='page')!==(scope.id==='page'))return null;
 return <div className="format-tabs">
  <div className="format-scopes" role="tablist" aria-label="格式范围" hidden={view.scopes.length<2}>
   {view.scopes.map(entry=><button key={entry.id} type="button" role="tab" id={'format-scope-'+entry.id} data-format-scope={entry.id} aria-selected={entry.id===view.scope} className={entry.id===view.scope?'active':undefined} onClick={()=>chooseFormatTab(entry.id,entry.tabs[0].id)}>{entry.label}</button>)}
  </div>
  <div className="format-facets" role="tablist" aria-label="格式分类">
   {scope?.tabs.map(tab=><button key={tab.id} type="button" role="tab" id={'format-tab-'+tab.id} data-format-tab={tab.id} className="icon-button" title={tab.title} aria-label={tab.label} aria-selected={tab.id===view.tab} onClick={()=>chooseFormatTab(scope.id,tab.id)}><Icon tab={tab.id}/></button>)}
  </div>
 </div>;
}
/** True when the panel is currently showing this facet, so a group can gate itself without
 * being moved into a different parent -- the imperative controllers mount by id and must
 * keep the host they already know. */
export function useFormatFacet(facets:FormatTab|FormatTab[]){
 const view=useFormat();
 const wanted=Array.isArray(facets)?facets:[facets];
 const offered=view.scopes.find(entry=>entry.id===view.scope)?.tabs.some(entry=>entry.id===view.tab&&wanted.includes(entry.id));
 return !!offered;
}
export function FormatPane({facet,children}:{facet:FormatTab|FormatTab[];children:ReactNode}){
 const active=useFormatFacet(facet);
 return <div className="format-pane" data-format-pane={Array.isArray(facet)?facet.join(' '):facet} hidden={!active}>{children}</div>;
}
