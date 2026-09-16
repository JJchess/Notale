export interface InspectorObject {id:string;parent?:string;tag:string;locked:boolean;attributes:Record<string,string>;}
/** What the selection is, so the format panel can offer the sections that type actually has.
 * 'none' also covers a selection the object list does not describe, such as a connector. */
export type SelectionKind='none'|'multiple'|'equation'|'code'|'chart'|'table'|'diagram'|'icon'|'shape'|'image'|'video'|'audio'|'canvas'|'vector'|'text'|'object';
export interface InspectorSelection {count:number;editableCount:number;single:boolean;locked:boolean;text:boolean;typography:boolean;binding:boolean;label:string;kind:SelectionKind;}
export const emptyInspector:InspectorSelection={count:0,editableCount:0,single:false,locked:false,text:false,typography:false,binding:false,label:'对象属性',kind:'none'};
/** Selection semantics are independent of the panel DOM and safe for malformed parent chains. */
export function inspectSelection(objects:readonly InspectorObject[],ids:readonly string[]):InspectorSelection {
 const wanted=new Set(ids),selected=objects.filter(object=>wanted.has(object.id));
 if(!selected.length)return emptyInspector;
 const byId=new Map(objects.map(object=>[object.id,object])),parents=new Set(objects.flatMap(object=>object.parent?[object.parent]:[]));
 function atomic(object:InspectorObject){const visited=new Set<string>();let node:InspectorObject|undefined=object;while(node){if(visited.has(node.id))return true;visited.add(node.id);if(node.attributes['data-notale-tex']!==undefined||node.attributes['data-notale-chart']!==undefined)return true;node=node.parent?byId.get(node.parent):undefined;}return false;}
 const isText=(object:InspectorObject)=>/^(h[1-6]|p|pre|span|a|button|label|li|td|th|blockquote|text|tspan)$/.test(object.tag)&&!parents.has(object.id)&&!atomic(object);
 const children=new Map<string,InspectorObject[]>();for(const object of objects)if(object.parent){const list=children.get(object.parent)??[];list.push(object);children.set(object.parent,list);}
 const styledText=(object:InspectorObject)=>{
  if(!/^(h[1-6]|p|pre|span|a|button|label|li|td|th|blockquote|text|tspan)$/.test(object.tag)||atomic(object))return false;
  const seen=new Set([object.id]),pending=[...(children.get(object.id)??[])];
  while(pending.length){const child=pending.pop()!;if(seen.has(child.id)||! /^(span|br|strong|b|em|i|u|s|del|sub|sup|code|a|mark|small|tspan)$/.test(child.tag)||atomic(child))return false;seen.add(child.id);pending.push(...(children.get(child.id)??[]));}return true;
 };
 const one=selected.length===1?selected[0]:undefined,locked=selected.some(object=>object.locked);
 // Authored types sit on an ancestor, so a selected child of an equation or a table cell
 // reports the type its panel edits, the same walk each feature store already does.
 const kindOf=(object:InspectorObject):SelectionKind=>{
  const chain:InspectorObject[]=[],visited=new Set<string>();let node:InspectorObject|undefined=object;
  while(node&&!visited.has(node.id)){visited.add(node.id);chain.push(node);node=node.parent?byId.get(node.parent):undefined;}
  const carries=(attribute:string)=>chain.some(step=>step.attributes[attribute]!==undefined);
  if(carries('data-notale-tex'))return 'equation';
  if(carries('data-notale-code'))return 'code';
  if(carries('data-notale-chart'))return 'chart';
  if(chain.some(step=>step.tag==='table'))return 'table';
  if(carries('data-notale-smart'))return 'diagram';
  if(object.attributes['data-notale-icon']!==undefined)return 'icon';
  if(object.attributes['data-notale-shape']!==undefined)return 'shape';
  return ({img:'image',video:'video',audio:'audio',canvas:'canvas',svg:'vector'} as Record<string,SelectionKind>)[object.tag]??(styledText(object)?'text':'object');
 };
 const name=one?(one.attributes['data-notale-name']||(one.attributes['data-notale-shape']?'形状':one.attributes['data-notale-icon']?'图标':one.attributes['data-notale-smart']?'图示':one.attributes['data-notale-tex']!==undefined?'公式':'')||({img:'图片',video:'视频',audio:'音频',canvas:'互动画布',svg:'图形'} as Record<string,string>)[one.tag]||(styledText(one)?'文字':'对象')):'';
 return {count:selected.length,editableCount:selected.filter(object=>!object.locked).length,single:!!one,locked,text:selected.every(isText),typography:selected.every(styledText),binding:!!one&&['input','select','textarea'].includes(one.tag),label:one?name+(locked?' · 已锁定':''):`已选择 ${selected.length} 个对象`,kind:one?kindOf(one):'multiple'};
}
export interface TextFieldState {key:string;documentId:string;slideId:string;target:string;value:string;editable:boolean;}
export interface BindingFieldState extends TextFieldState {before:string;checkbox:boolean;}
export interface NameFieldState extends Omit<TextFieldState,'target'> {targets:string[];before:Record<string,string>;}
