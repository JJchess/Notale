import type {Asset,Command,DeckDocument} from '@notale/editor/browser';
export interface AssetEntry {path:string;asset:Asset;kind:string;url:string;}
interface Model {scope:string;entries:AssetEntry[];query:string;kind:string;selectedPath:string;limit:number;busy:boolean;canReplace:boolean;error:string;search?:(query:string)=>void;filter?:(kind:string)=>void;select?:(path:string)=>void;more?:()=>void;use?:(replace:boolean)=>Promise<void>;}
const initial:Model={scope:'',entries:[],query:'',kind:'all',selectedPath:'',limit:36,busy:false,canReplace:false,error:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const assetLibraryState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
interface Context {document:()=>DeckDocument;slide:()=>{id:string;sourcePath:string};selection:()=>{id:string;tag:string;locked:boolean}[];insert:(kind:string,src:string)=>string;commands:(commands:Command[])=>Promise<unknown>;error:(cause:unknown)=>void;}
export function createAssetLibrary(context:Context){
 const token=Symbol();owner=token;let current=initial,generation=0,base='';
 let assets:DeckDocument['assets']|undefined;
 const entriesFor=(source:DeckDocument['assets'])=>Object.entries(source).filter(([,asset])=>['image','video','audio'].includes(asset.mime.split('/')[0])).sort(([a],[b])=>a.localeCompare(b)).map(([path,asset])=>({path,asset,kind:asset.mime.split('/')[0],url:new URL(path.split('/').map(encodeURIComponent).join('/'),base).href}));
 const active=()=>owner===token;
 function publish(patch:Partial<Model>){if(!active())return;current={...current,...patch};model=current;listeners.forEach(fn=>fn());}
 const scope=()=>JSON.stringify([context.document().id,context.slide().id]);
 function replaceable(entry:AssetEntry|undefined){const selected=context.selection();return !!entry&&selected.length===1&&!selected[0].locked&&selected[0].tag===(entry.kind==='image'?'img':entry.kind);}
 function render(){
  if(!active()||!current.scope)return;
  if(scope()===current.scope&&assets!==context.document().assets){assets=context.document().assets;const entries=entriesFor(assets);publish({entries,...(!entries.some(entry=>entry.path===current.selectedPath)?{selectedPath:''}:{})});}
  const captured=scope(),stamp=generation,selectedPath=current.selectedPath;
  publish({canReplace:replaceable(current.entries.find(entry=>entry.path===selectedPath)),
   search:query=>{if(active()&&current.scope===captured){publish({query,limit:36});render();}},
   filter:kind=>{if(active()&&current.scope===captured){publish({kind,limit:36});render();}},
   select:path=>{if(active()&&current.scope===captured){publish({selectedPath:path,error:''});render();}},
   more:()=>{if(active()&&current.scope===captured)publish({limit:current.limit+36});},
   use:async replace=>{
    if(!active()||generation!==stamp||current.busy||current.scope!==captured||scope()!==captured||current.selectedPath!==selectedPath)return;
    const entry=current.entries.find(entry=>entry.path===selectedPath);if(!entry||context.document().assets[entry.path]?.hash!==entry.asset.hash||replace&&!replaceable(entry))return;
    const selected=context.selection(),page=context.slide();
    const src='../'.repeat(page.sourcePath.split('/').length-1)+entry.path.split('/').map(encodeURIComponent).join('/');
    publish({busy:true,error:''});
    try{await context.commands([replace?{type:'media.update',slideId:page.id,target:selected[0].id,patch:{src}}:{type:'element.insert',slideId:page.id,html:context.insert(entry.kind,src)}]);}
    catch(cause){if(active()&&generation===stamp&&scope()===captured){publish({error:cause instanceof Error?cause.message:String(cause)});context.error(cause);}}
    finally{if(active()&&generation===stamp&&current.scope===captured){publish({busy:false});render();}}
   },
  });
 }
 publish({...initial});
 return {
  update(previewUrl:string,sourcePath:string){
   if(!active())return;const doc=context.document(),next=scope(),changed=next!==current.scope;
   if(changed)generation++;
   const documentChanged=JSON.parse(current.scope||'[null]')[0]!==doc.id;
   base=new URL('../'.repeat(sourcePath.split('/').length-1)||'.',previewUrl).href;
   assets=doc.assets;const entries=entriesFor(assets);
   publish({scope:next,entries,...(changed?{busy:false,error:''}:{}),...(documentChanged?{selectedPath:'',query:'',kind:'all',limit:36}:{}),...(!entries.some(entry=>entry.path===current.selectedPath)?{selectedPath:''}:{})});render();
  },
  selection:render,
  dispose(){if(active()){publish({...initial});owner=undefined;}},
 };
}
