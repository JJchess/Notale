import type {FormatScope,FormatTab} from './format-tabs';
/** The facet the author last chose. Kept out of the document session because it is a view
 * preference, and kept out of the component so it survives every panel re-render. */
let chosen:{scope:FormatScope;tab:FormatTab}={scope:'object',tab:'fill'};
const listeners=new Set<()=>void>();
const initial=chosen;
export const formatPanelState={getSnapshot:()=>chosen,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function chooseFormatTab(scope:FormatScope,tab:FormatTab){
 if(chosen.scope===scope&&chosen.tab===tab)return;
 chosen={scope,tab};for(const fn of listeners)fn();
}
