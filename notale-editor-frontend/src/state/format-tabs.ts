import type {SelectionKind} from './inspector';
/** The format panel follows PowerPoint's 设置形状格式 pane: a text tab picks 对象 or 文本,
 * an icon row picks a facet of it, and a facet the selection has nothing to say about is
 * never offered. Deriving that here keeps it a pure function the panel only renders. */
export type FormatScope='object'|'text'|'page';
export type FormatTab=
 |'fill'|'effects'|'layout'|'special'   // 对象选项
 |'font'|'textbox'                      // 文本选项
 |'background'|'theme'|'page';          // 页面选项（无选中）
export interface TabView {id:FormatTab;label:string;title:string;}
export interface ScopeView {id:FormatScope;label:string;tabs:TabView[];}
export interface FormatView {scopes:ScopeView[];scope:FormatScope;tab:FormatTab;}
/** Which type-specific tab a kind owns, and what to call it. Kinds absent here have none. */
const SPECIAL:Partial<Record<SelectionKind,[label:string,title:string]>>={
 image:['图片','图片的替换、裁剪与填充方式'],
 video:['视频','视频的播放、封面与音量'],
 audio:['音频','音频的播放与音量'],
 chart:['图表','图表的数据、类型与外观'],
 table:['表格','表格的单元格、边框与合并'],
 diagram:['图示','图示的卡片数量与增删'],
 vector:['矢量','路径、顶点与渐变'],
 equation:['公式','编辑 LaTeX 公式'],
 code:['代码','编辑代码与语言'],
 canvas:['互动','互动画布的参数与初始值'],
};
/** Availability the panel cannot derive from the object list alone: connectors are not
 * objects, and scene/component/reveal panels are driven by their own runtime stores. */
export interface FormatAvailability {connector?:boolean;interactive?:boolean;vector?:boolean;chart?:boolean;}
const OBJECT_TABS:TabView[]=[
 {id:'fill',label:'填充与线条',title:'填充与线条'},
 {id:'effects',label:'效果',title:'阴影与透明度'},
 {id:'layout',label:'大小与属性',title:'大小、位置、排列与属性'},
];
const TEXT_TABS:TabView[]=[
 {id:'font',label:'文字',title:'字体与段落'},
 {id:'textbox',label:'文本框',title:'文本框的自动调整'},
];
const PAGE_TABS:TabView[]=[
 {id:'background',label:'背景',title:'页面背景'},
 {id:'theme',label:'主题',title:'主题配色与字体'},
 {id:'page',label:'页面',title:'页面尺寸与版式'},
];
const KIND_SCOPE_LABEL:Partial<Record<SelectionKind,string>>={
 shape:'形状选项',icon:'图标选项',image:'图片选项',video:'视频选项',audio:'音频选项',
 chart:'图表选项',table:'表格选项',diagram:'图示选项',vector:'图形选项',
 equation:'公式选项',code:'代码选项',canvas:'互动选项',text:'对象选项',multiple:'对象选项',
};
export function formatScopes(selected:boolean,kind:SelectionKind,typography:boolean,availability:FormatAvailability={}):ScopeView[]{
 if(!selected)return [{id:'page',label:'页面选项',tabs:PAGE_TABS}];
 const special=(availability.vector?['矢量','路径、顶点与渐变'] as const:undefined)??SPECIAL[kind]??(availability.chart?['图表','图表的数据、类型与外观'] as const:undefined)??(availability.connector?['连接线','连接线的端点、箭头与线型'] as const:availability.interactive?['互动','互动参数与初始值'] as const:undefined);
 const tabs=[...OBJECT_TABS,...(special?[{id:'special' as const,label:special[0],title:special[1]}]:[])];
 const scopes:ScopeView[]=[{id:'object',label:KIND_SCOPE_LABEL[kind]??'对象选项',tabs}];
 if(typography)scopes.push({id:'text',label:'文本选项',tabs:TEXT_TABS});
 return scopes;
}
/** Keep the chosen facet across selections the way PowerPoint does, and fall back to the
 * first tab of the first scope when the new selection does not have it. */
export function resolveFormatTab(scopes:ScopeView[],scope:FormatScope,tab:FormatTab):{scope:FormatScope;tab:FormatTab}{
 const wanted=scopes.find(entry=>entry.id===scope);
 if(wanted?.tabs.some(entry=>entry.id===tab))return {scope,tab};
 if(wanted?.tabs.length)return {scope,tab:wanted.tabs[0].id};
 const first=scopes[0];
 return first?.tabs.length?{scope:first.id,tab:first.tabs[0].id}:{scope:'object',tab:'fill'};
}
export function formatView(selected:boolean,kind:SelectionKind,typography:boolean,scope:FormatScope,tab:FormatTab,availability?:FormatAvailability):FormatView{
 const scopes=formatScopes(selected,kind,typography,availability);
 return {scopes,...resolveFormatTab(scopes,scope,tab)};
}
