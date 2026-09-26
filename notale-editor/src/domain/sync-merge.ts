import { parse, serialize, attr, parseStyle, type Element } from './html.js';
import { invariant, type DeckDocument } from './model.js';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const object=(v:any):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Preserve concurrent insertions. Only reorder identities moved by this edit. */
function order(base:string[],next:string[],head:string[]) {
  const retained=base.filter(x=>next.includes(x)),wanted=next.filter(x=>base.includes(x));
  const positions=new Map(retained.map((x,i)=>[x,i]));const tails:number[]=[],ends:number[]=[],previous=new Map<string,string>();
  for(let i=0;i<wanted.length;i++){const n=positions.get(wanted[i])!;let lo=0,hi=tails.length;while(lo<hi){const m=(lo+hi)>>1;if(tails[m]<n)lo=m+1;else hi=m;}tails[lo]=n;if(lo)previous.set(wanted[i],wanted[ends[lo-1]]);ends[lo]=i;}
  const stable=new Set<string>();let cursor=wanted[ends.at(-1)!];while(cursor!==undefined){stable.add(cursor);cursor=previous.get(cursor)!;}
  const moved=new Set(next.filter(x=>!stable.has(x)));let out=head.filter(x=>!base.includes(x)||next.includes(x)).filter(x=>!moved.has(x));
  for(let i=0;i<next.length;i++){const id=next[i];if(!moved.has(id))continue;if(base.includes(id)&&!head.includes(id))continue;const before=next.slice(0,i).reverse().find(x=>out.includes(x)),after=next.slice(i+1).find(x=>out.includes(x));const at=before!==undefined?out.indexOf(before)+1:after!==undefined?out.indexOf(after):out.length;out.splice(at,0,id);}
  return out;
}
function merge(base:any,next:any,head:any,path:string[]=[]):any {
  if(equal(base,next))return structuredClone(head);
  if(next===undefined&&object(base)&&object(head)&&(path.at(-1)==='style'||path.at(-2)==='transforms'))next={};
  if(next===undefined)return undefined;
  if(base!==undefined&&head===undefined&&(path.at(-2)==='$entities'||path.at(-2)==='$nodes'))invariant(false,'SYNC_RECOVERY_REQUIRED','修改的对象已被删除，需要保留恢复副本',409);
  if((object(base)||base===undefined)&&(object(head)||head===undefined)&&object(next)){
    base=base??{};head=head??{};
    const out={...head};for(const key of new Set([...Object.keys(base),...Object.keys(next)])){const value=merge(base[key],next[key],head[key],[...path,key]);if(value===undefined)delete out[key];else out[key]=value;}
    const geometry=path.at(-2)==='transforms'?['matrix','x','y','rotate','scaleX','scaleY']:path.at(-1)==='style'?['transform','translate','rotate','scale']:[];
    if(geometry.some(k=>!equal(base[k],next[k])))for(const k of geometry){if(next[k]===undefined)delete out[k];else out[k]=structuredClone(next[k]);}
    // A removed transform must not survive as an empty record: its object may
    // have been deleted by an inverse copy/delete operation. Keep real concurrent
    // properties (e.g. width/height), but not a dangling identity with no values.
    if(path.at(-2)==='transforms'&&!Object.keys(out).length)return undefined;
    return out;
  }
  if(Array.isArray(base)&&Array.isArray(next)&&Array.isArray(head)){
    if([...base,...next,...head].every(v=>object(v)&&typeof v.id==='string')){
      const map=(values:any[])=>Object.fromEntries(values.map(v=>[v.id,v]));const records=merge(map(base),map(next),map(head),[...path,'$entities']);return order(base.map(v=>v.id),next.map(v=>v.id),head.map(v=>v.id)).filter(id=>records[id]).map(id=>records[id]);
    }
    if(['children','locked','members'].includes(path.at(-1)??''))return order(base,next,head);
  }
  return structuredClone(next);
}
type RecordNode={type:string;tag?:string;namespace?:string;namespaces?:Record<string,any>;content?:string;attrs?:Record<string,any>;children?:string[];value?:string;name?:string;publicId?:string;systemId?:string};
function flatten(html:string){
  const records:Record<string,RecordNode>={};
  function walk(node:any,key:string){
    if(node.tagName)key=attr(node as Element,'data-notale-id')??key;
    const record:RecordNode={type:node.nodeName};records[key]=record;
    if(node.tagName){record.tag=node.tagName;record.namespace=node.namespaceURI;record.attrs=Object.fromEntries(node.attrs.map((a:any)=>[a.prefix?`${a.prefix}:${a.name}`:a.name,a.name==='style'?Object.fromEntries(parseStyle(a.value)):a.value]));}
    if(node.attrs)record.namespaces=Object.fromEntries(node.attrs.filter((a:any)=>a.namespace).map((a:any)=>[a.prefix?`${a.prefix}:${a.name}`:a.name,{name:a.name,prefix:a.prefix,namespace:a.namespace}]));
    if(node.content)record.content=walk(node.content,key+'/content');
    if(node.nodeName==='#text')record.value=node.value;
    if(node.nodeName==='#comment')record.value=node.data;
    if(node.nodeName==='#documentType'){record.name=node.name;record.publicId=node.publicId;record.systemId=node.systemId;}
    if(node.childNodes)record.children=node.childNodes.map((n:any,i:number)=>walk(n,`${key}/${n.nodeName}:${i}`));
    return key;
  }
  walk(parse(html),'root');return records;
}
function htmlMerge(base:string,next:string,head:string){
  if(base===next)return head;if(base===head)return next;
  const original=flatten(base),desired=flatten(next),latest=flatten(head);
  for(const [id,node] of Object.entries(desired)){
    const before=original[id],current=latest[id];
    if(node.tag!=='iframe'||!String(node.attrs?.class??'').split(/\s+/).includes('code-workbench-frame')||!before||!current)continue;
    for(const key of ['src','data-src'])if(!equal(before.attrs?.[key],node.attrs?.[key]))invariant(equal(current.attrs?.[key],before.attrs?.[key])||equal(current.attrs?.[key],node.attrs?.[key]),'SYNC_RECOVERY_REQUIRED','课程版本已改变，不能覆盖当前课程',409);
  }

  const parents=(nodes:Record<string,RecordNode>)=>new Map(Object.entries(nodes).flatMap(([id,n])=>(n.children??[]).map(child=>[child,id] as const)));
  const bp=parents(original),hp=parents(latest);
  for(const [id,n] of Object.entries(desired))if(original[id]&&['transform','translate','rotate','scale'].some(k=>!equal(original[id].attrs?.style?.[k],n.attrs?.style?.[k]))){
    let ancestor=bp.get(id);invariant(ancestor===hp.get(id),'SYNC_RECOVERY_REQUIRED','父级位置已变化，几何修改已保留',409);
    while(ancestor){invariant(equal(Object.fromEntries(Object.entries(original[ancestor]?.attrs?.style??{}).filter(([k])=>!['color','background','background-color','border-color','opacity','fill','stroke'].includes(k))),Object.fromEntries(Object.entries(latest[ancestor]?.attrs?.style??{}).filter(([k])=>!['color','background','background-color','border-color','opacity','fill','stroke'].includes(k))))&&original[ancestor]?.attrs?.class===latest[ancestor]?.attrs?.class,'SYNC_RECOVERY_REQUIRED','父级坐标已变化，几何修改已保留',409);ancestor=bp.get(ancestor);}
  }
  const records=merge(original,desired,latest,['$nodes']);const visiting=new Set<string>();
  function build(key:string,parent:any):any {
    invariant(!visiting.has(key),'SYNC_RECOVERY_REQUIRED','对象层级产生循环，修改已保留',409);const r:RecordNode=records[key];invariant(r,'SYNC_RECOVERY_REQUIRED','对象结构已变化，修改已保留',409);visiting.add(key);
    const n:any={nodeName:r.type,parentNode:parent};if(r.tag){n.tagName=r.tag;n.namespaceURI=r.namespace;n.attrs=Object.entries(r.attrs??{}).map(([name,value])=>({name,...r.namespaces?.[name],value:name==='style'?Object.entries(value).map(([k,v])=>`${k}:${v}`).join(';'):value}));}
    if(r.type==='#text')n.value=r.value;if(r.type==='#comment')n.data=r.value;if(r.type==='#documentType')Object.assign(n,{name:r.name,publicId:r.publicId,systemId:r.systemId});
    if(r.content)n.content=build(r.content,undefined);
    if(r.children)n.childNodes=r.children.map(k=>build(k,n));visiting.delete(key);return n;
  }
  return serialize(build('root',undefined));
}
/** Three-way authoring merge. Runtime state and selection never enter this model. */
export function mergeDocuments(base:DeckDocument,next:DeckDocument,head:DeckDocument):DeckDocument {
  const withoutHtml=(d:DeckDocument)=>({...d,slides:d.slides.map(s=>({...s,html:''}))});
  const merged=merge(withoutHtml(base),withoutHtml(next),withoutHtml(head)) as DeckDocument;
  for(const slide of merged.slides){const b=base.slides.find(s=>s.id===slide.id),n=next.slides.find(s=>s.id===slide.id),h=head.slides.find(s=>s.id===slide.id);slide.html=b&&n&&h?htmlMerge(b.html,n.html,h.html):(n??h)!.html;}
  return merged;
}
