import {htmlLayerCommands,isSvgLayer,type Command} from '@notale/editor/browser';
import {assertSelectionEditable,type SelectionObject} from './selection-commands';
type LayerObject=SelectionObject&{namespace:string};
export interface LayerPlan {slideId:string;action:'front'|'back'|'forward'|'backward';svg:string[];html:string[];captureIds:string[];objects:LayerObject[];}
/** Capture the structural plan now; only computed CSS needs a live canvas response. */
export function captureLayerPlan(slideId:string,targets:string[],source:LayerObject[],action:LayerPlan['action']):LayerPlan{
 const objects=source.map(({id,parent,locked,namespace,tag})=>({id,parent,locked,namespace,tag}));
 const unique=[...new Set(targets)];assertSelectionEditable(unique,objects);const byId=new Map(objects.map(object=>[object.id,object]));
 const svg=unique.filter(id=>{const object=byId.get(id)!;return isSvgLayer(object,byId.get(object.parent??''));}),html=unique.filter(id=>!svg.includes(id));
 if(html.some(id=>{const object=byId.get(id)!;return object.namespace==='http://www.w3.org/2000/svg'&&(object.tag!=='svg'||byId.get(object.parent??'')?.namespace===object.namespace);}))throw Error('请选择完整 SVG 图形或图形组合，文字片段和条件分支不能作为独立图层排序');
 const parents=new Set(html.map(id=>byId.get(id)?.parent));
 return {slideId,action,svg,html,objects,captureIds:objects.filter(object=>parents.has(object.parent)||parents.has(object.id)).map(object=>object.id)};
}
export function layerPlanCommands(plan:LayerPlan,styles:Record<string,Record<string,string>>={}):Command[]{
 const commands:Command[]=plan.svg.length?[{type:'elements.order',slideId:plan.slideId,targets:[...plan.svg],action:plan.action}]:[];
 if(plan.html.length)commands.push(...htmlLayerCommands(plan.slideId,plan.html,plan.objects,styles,plan.action));return commands;
}
