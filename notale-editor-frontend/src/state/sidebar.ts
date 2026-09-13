import {editorSession} from './editor-session';
import {type PanelName,type InspectorTab,type SidebarState} from './sidebar-state';
const current=()=>editorSession.getSnapshot().sidebar;
const update=(patch:Partial<SidebarState>)=>editorSession.update({sidebar:{...current(),...patch}});
export const sidebar={
  inspect(tab:InspectorTab){update({pages:false,inspector:true,tool:'',tab,beforeFocus:undefined});},
  tab(tab:InspectorTab){update({tab});},
  openPages(){update({pages:true,inspector:false,tool:'',beforeFocus:undefined});},
  toggle(panel:PanelName){const value=!current()[panel];update({[panel]:value,beforeFocus:undefined,...(value&&panel!=='notes'?{tool:'',[panel==='pages'?'inspector':'pages']:false}:{})});},
  closeInspector(){update({inspector:false,beforeFocus:undefined});},
  closeTools(){update({tool:''});},
  tool(tool:string){const view=current();if(tool==='pages'){this.toggle('pages');return;}if(['style','objects','animation'].includes(tool)){const tab=(tool==='style'?'format':tool) as InspectorTab;if(view.inspector&&view.tab===tab)this.closeInspector();else this.inspect(tab);return;}update({tool:view.tool===tool?'':tool,pages:false,inspector:false,beforeFocus:undefined});},
  focus(){const view=current();update(view.beforeFocus?{...view.beforeFocus,beforeFocus:undefined,tool:''}:{pages:false,inspector:false,notes:false,tool:'',beforeFocus:{pages:view.pages,inspector:view.inspector,notes:view.notes}});},
  restore(value:unknown){if(!value||typeof value!=='object')return;const saved=value as Record<string,unknown>;const patch:Partial<SidebarState>={};for(const key of ['pages','inspector','notes'] as const)if(typeof saved[key]==='boolean')patch[key]=saved[key];if(patch.inspector)patch.pages=false;update(patch);},
};
