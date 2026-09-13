export interface InspectorObject {id:string;parent?:string;tag:string;locked:boolean;attributes:Record<string,string>;}
export interface InspectorSelection {count:number;editableCount:number;single:boolean;locked:boolean;text:boolean;typography:boolean;binding:boolean;label:string;}
export const emptyInspector:InspectorSelection={count:0,editableCount:0,single:false,locked:false,text:false,typography:false,binding:false,label:'对象属性'};
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
 const name=one?(one.attributes['data-notale-name']||(one.attributes['data-notale-shape']?'形状':one.attributes['data-notale-icon']?'图标':one.attributes['data-notale-smart']?'图示':one.attributes['data-notale-tex']!==undefined?'公式':'')||({img:'图片',video:'视频',audio:'音频',canvas:'互动画布',svg:'图形'} as Record<string,string>)[one.tag]||(styledText(one)?'文字':'对象')):'';
 return {count:selected.length,editableCount:selected.filter(object=>!object.locked).length,single:!!one,locked,text:selected.every(isText),typography:selected.every(styledText),binding:!!one&&['input','select','textarea'].includes(one.tag),label:one?name+(locked?' · 已锁定':''):`已选择 ${selected.length} 个对象`};
}
export interface TextFieldState {key:string;documentId:string;slideId:string;target:string;value:string;editable:boolean;}
export interface BindingFieldState extends TextFieldState {before:string;checkbox:boolean;}
export interface NameFieldState extends Omit<TextFieldState,'target'> {targets:string[];before:Record<string,string>;}
