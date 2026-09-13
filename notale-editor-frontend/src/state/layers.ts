export interface LayerObject {id:string;parent?:string;tag:string;text:string;kind:string;locked:boolean;attributes:Record<string,string>;}
export interface LayerRow {id:string;tag:string;label:string;title:string;search:string;depth:number;locked:boolean;}
export interface LayerState {documentId:string;pageId:string;rows:readonly LayerRow[];}
/** Linear lookup construction; ancestor traversal also terminates for malformed cyclic input. */
export function layerRows(objects:readonly LayerObject[]):LayerRow[]{
 const byId=new Map(objects.map(object=>[object.id,object]));
 return objects.flatMap(object=>{
  if(object.attributes.id==='stage'||['aside','defs','lineargradient','stop','link','br','wbr'].includes(object.tag.toLowerCase()))return [];
  let depth=0,parent=object.parent;const seen=new Set([object.id]);
  while(parent){if(seen.has(parent))return [];seen.add(parent);const ancestor=byId.get(parent);if(ancestor&&(ancestor.attributes['data-notale-tex']!==undefined||ancestor.attributes['data-notale-chart']!==undefined))return [];depth=Math.min(5,depth+1);parent=ancestor?.parent;}
  return [{id:object.id,tag:object.tag,label:(object.attributes['data-notale-name']||object.text.trim()||object.attributes.alt||object.attributes.id||object.kind).slice(0,28),title:object.attributes.id||object.id,search:`${object.attributes['data-notale-name']??''} ${object.tag} ${object.text} ${object.attributes.id??''}`.toLocaleLowerCase(),depth,locked:object.locked}];
 });
}
