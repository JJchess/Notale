import {linkAddress} from './link-address';
import type {DeckDocument,Slide} from '@notale/editor/browser';
export interface LinkObject {id:string;parent?:string;tag:string;locked:boolean;attributes:Record<string,string>;}
export interface LinkSource {documentId:string;pageId:string;target?:string;href?:string;selected:string[];}
export function selectedLink(objects:LinkObject[],selected:string[]){
 if(selected.length!==1)return;const index=new Map(objects.map(object=>[object.id,object])),seen=new Set<string>();let node=index.get(selected[0]);
 while(node&&!seen.has(node.id)){seen.add(node.id);if(node.tag==='a')return node;node=node.parent?index.get(node.parent):undefined;}
}
export function linkAttributes(doc:DeckDocument,page:Slide,draft:{kind:string;pageId:string;url:string}){
 if(draft.kind==='page'){const target=doc.slides.find(page=>page.id===draft.pageId);if(!target)throw Error('请选择目标页面');return {href:'../'.repeat(page.sourcePath.split('/').length-1)+target.sourcePath.split('/').map(encodeURIComponent).join('/'),target:null,rel:null};}
 return {href:linkAddress(draft.url),target:'_blank',rel:'noopener noreferrer'};
}
export function validateLink(source:LinkSource,doc:DeckDocument,page:Slide,objects:LinkObject[],selected:string[]){
 if(source.documentId!==doc.id||source.pageId!==page.id)throw Error('页面已切换，输入已保留');
 if(source.selected.length!==selected.length||source.selected.some((id,index)=>selected[index]!==id))throw Error('选区已变化，请重新选择链接');
 const target=selectedLink(objects,selected);
 if(!target||target.id!==source.target||target.attributes.href!==source.href)throw Error('链接已变化，输入已保留，请重新选择后编辑');
 if(target.locked||selected.some(id=>objects.find(object=>object.id===id)?.locked))throw Error('选中的链接已锁定');
 return target;
}

export interface LinkModel extends LinkSource {key:string;value:string;creating:boolean;locked:boolean;pages:{id:string;name:string}[];}
let owner:symbol|undefined;
let model:LinkModel|undefined,creating=false;const listeners=new Set<()=>void>();
export const linkEditorState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export const linkActions={open:()=>{},close:()=>{},save:async(_source:LinkModel,_raw:string)=>{},remove:async(_source:LinkModel)=>{}};
export function bindLinkEditor(context:{document:()=>DeckDocument;slide:()=>Slide;objects:()=>LinkObject[];selected:()=>string[];commands:(commands:import('@notale/editor/browser').Command[])=>Promise<unknown>}){
 const identity=Symbol('link-editor');owner=identity;creating=false;
 let disposed=false,signature='';
 const active=()=>!disposed&&owner===identity;
 function render(){if(!active())return;const doc=context.document(),page=context.slide(),selected=context.selected(),anchor=creating?undefined:selectedLink(context.objects(),selected);let next:LinkModel|undefined;
  if(creating||anchor){let kind='page',pageId=doc.slides.find(s=>s.id!==page.id)?.id??page.id,url='';if(anchor?.attributes.href){let destination:URL|undefined;try{destination=new URL(anchor.attributes.href,'https://notale.invalid/'+page.sourcePath);}catch{}let path='';try{path=decodeURIComponent(destination?.pathname.slice(1)??'');}catch{}const target=destination?.origin==='https://notale.invalid'?doc.slides.find(s=>s.sourcePath===path):undefined;if(target)pageId=target.id;else{kind='url';url=anchor.attributes.href;}}
   next={documentId:doc.id,pageId:page.id,target:anchor?.id,href:anchor?.attributes.href,selected:[...selected],key:JSON.stringify([doc.id,page.id,anchor?.id,creating,selected]),value:JSON.stringify({kind,pageId,url,label:'继续探索'}),creating,locked:!creating&&(!!anchor?.locked||selected.some(id=>context.objects().find(o=>o.id===id)?.locked)),pages:doc.slides.map(s=>({id:s.id,name:s.name}))};
  }
  const nextSignature=JSON.stringify(next)??'';if(signature===nextSignature)return;signature=nextSignature;model=next;for(const listener of listeners)listener();
 }
 const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 linkActions.open=()=>{if(active()){creating=true;render();}};linkActions.close=()=>{if(active()){creating=false;render();}};
 linkActions.save=async(source,raw)=>{if(!active())throw Error('编辑器已关闭');const doc=context.document(),page=context.slide(),draft=JSON.parse(raw);if(source.documentId!==doc.id||source.pageId!==page.id)throw Error('页面已切换，输入已保留');const attrs=linkAttributes(doc,page,draft);
  if(source.creating){if(typeof draft.label!=='string'||!draft.label.trim())throw Error('请输入按钮文字');const attributes=Object.entries(attrs).filter(([,v])=>v!==null).map(([key,value])=>`${key}="${escape(value!)}"`).join(' ');await context.commands([{type:'element.insert',slideId:source.pageId,html:`<a ${attributes} style="position:absolute;left:120px;top:160px;z-index:1000;display:inline-block;padding:16px 24px;background:#6638dc;color:white;border-radius:8px;text-decoration:none;font:600 26px system-ui">${escape(draft.label)}</a>`}]);if(active())creating=false;}
  else{const anchor=validateLink(source,doc,page,context.objects(),context.selected());await context.commands([{type:'element.patch',slideId:source.pageId,target:anchor.id,patch:{attributes:attrs}}]);}render();
 };
 linkActions.remove=async source=>{if(!active())throw Error('编辑器已关闭');const anchor=validateLink(source,context.document(),context.slide(),context.objects(),context.selected());await context.commands([{type:'element.patch',slideId:source.pageId,target:anchor.id,patch:{attributes:{href:null,target:null,rel:null}}}]);render();};
 model=undefined;for(const listener of listeners)listener();
 return {render,dispose(){if(disposed)return;disposed=true;if(owner!==identity)return;owner=undefined;creating=false;model=undefined;for(const listener of listeners)listener();}};
}
