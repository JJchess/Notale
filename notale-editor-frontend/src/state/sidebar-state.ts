export type PanelName='pages'|'inspector'|'notes';
export type InspectorTab='objects'|'format'|'animation';
export interface SidebarState {pages:boolean;inspector:boolean;notes:boolean;tool:string;tab:InspectorTab;beforeFocus?:Record<PanelName,boolean>;}
export const initialSidebar:SidebarState={pages:false,inspector:false,notes:false,tool:'',tab:'objects'};
