export interface LayerObject {id:string;parent?:string;namespace?:string;tag:string;text:string;kind:string;locked:boolean;attributes:Record<string,string>;}
export interface LayerRow {id:string;parent?:string;tag:string;label:string;title:string;search:string;depth:number;locked:boolean;}
export interface LayerState {documentId:string;pageId:string;scope?:string;rows:readonly LayerRow[];reorder?:(ids:string[],target:string,placement:'before'|'after')=>Promise<void>;}
/** Linear lookup construction; ancestor traversal also terminates for malformed cyclic input. */
export function layerRows(objects:readonly LayerObject[],styles?:Record<string,Record<string,string>>):LayerRow[]{
 const byId=new Map(objects.map(object=>[object.id,object]));
 const rows=objects.flatMap(object=>{
  if(object.attributes.id==='stage'||['aside','defs','lineargradient','stop','link','br','wbr'].includes(object.tag.toLowerCase()))return [];
  let depth=0,parent=object.parent;const seen=new Set([object.id]);
  while(parent){if(seen.has(parent))return [];seen.add(parent);const ancestor=byId.get(parent);if(ancestor&&(ancestor.attributes['data-notale-tex']!==undefined||ancestor.attributes['data-notale-chart']!==undefined))return [];depth=Math.min(5,depth+1);parent=ancestor?.parent;}
  return [{id:object.id,parent:object.parent,tag:object.tag,label:(object.attributes['data-notale-name']||object.text.trim()||object.attributes.alt||object.attributes.id||object.kind).slice(0,28),title:object.attributes.id||object.id,search:`${object.attributes['data-notale-name']??''} ${object.tag} ${object.text} ${object.attributes.id??''}`.toLocaleLowerCase(),depth,locked:object.locked}];
 });
 if(!styles)return rows;
 const rowById=new Map(rows.map(row=>[row.id,row])),order=new Map(objects.map((object,i)=>[object.id,i])),children=new Map<string|undefined,LayerObject[]>();
 for(const object of objects){const parent=byId.has(object.parent??'')?object.parent:undefined;children.set(parent,[...children.get(parent)??[],object]);}
 const result:LayerRow[]=[],seen=new Set<string>();
 const visit=(parent:string|undefined)=>{const original=children.get(parent)??[],flow=/^(inline-)?(flex|grid)$/.test(styles[parent??'']?.display??''),movable=(object:LayerObject)=>flow||object.namespace==='http://www.w3.org/2000/svg'&&object.tag!=='svg'||(styles[object.id]?.position??'static')!=='static',sorted=original.filter(movable).sort((a,b)=>(parseInt(styles[b.id]?.['z-index'])||0)-(parseInt(styles[a.id]?.['z-index'])||0)||order.get(b.id)!-order.get(a.id)!);let index=0;const list=original.map(object=>movable(object)?sorted[index++]:object);for(const object of list){if(seen.has(object.id))continue;seen.add(object.id);const row=rowById.get(object.id);if(row)result.push(row);visit(object.id);}};
 visit(undefined);return result;
}
