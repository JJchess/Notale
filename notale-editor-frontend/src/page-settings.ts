import type {Command,Slide,DeckDocument} from '@notale/editor/browser';
export type PageBasics=Pick<Slide,'name'|'section'|'hidden'|'transition'|'advanceAfter'>;
export interface PageSource {documentId:string;page:Slide;}
let source:PageSource|undefined;
const listeners=new Set<()=>void>();
export const pageSettingsState={getSnapshot:()=>source,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},set(next:PageSource|undefined){source=next;for(const listener of listeners)listener();}};
export const pageSettingsActions={open:(_id?:string)=>{},save:async(_source:PageSource,_draft:PageBasics)=>{},applyMaster:async(_source:PageSource,_id:string)=>{},detachMaster:async(_source:PageSource)=>{},editMaster:async(_source:PageSource,_id:string)=>{},renderValues:()=>{},resetValues:()=>{}};
export function createPageSettings(context:{document:()=>DeckDocument;current:()=>string;commands:(commands:Command[])=>Promise<unknown>;editMaster:(id:string,pageId:string)=>Promise<unknown>}){
 const target=()=>{const captured=source;return captured&&context.document().id===captured.documentId?context.document().slides.find(page=>page.id===captured.page.id):undefined;};
 const current=(captured:PageSource)=>{if(context.document().id!==captured.documentId)throw Error('讲义已变化，请重新打开设置');const page=context.document().slides.find(page=>page.id===captured.page.id);if(!page)throw Error('页面已变化，请重新打开设置');return page;};
 const open=(id=context.current())=>{const page=context.document().slides.find(page=>page.id===id);if(page&&!page.layoutSourceId)pageSettingsState.set({documentId:context.document().id,page:structuredClone(page)});};
 pageSettingsActions.open=open;
 pageSettingsActions.save=async(captured,draft)=>{const page=current(captured);if(!draft.name.trim()||draft.name.length>300||draft.section.length>300)throw Error('页面名称不能为空，名称和章节最多 300 字');if(!Number.isFinite(draft.advanceAfter)||draft.advanceAfter<0||draft.advanceAfter>3600000)throw Error('停留时间应在 0–3600 秒之间');const patch:Partial<PageBasics>={};for(const key of Object.keys(draft) as (keyof PageBasics)[])if(draft[key]!==captured.page[key]){if(page[key]!==captured.page[key])throw Error('页面设置已被更新，输入已保留，请核对后重新打开设置');Object.assign(patch,{[key]:draft[key]});}if(Object.keys(patch).length)await context.commands([{type:'slide.update',slideId:page.id,patch}]);};
 pageSettingsActions.applyMaster=async(captured,id)=>{const page=current(captured);if(id&&!context.document().layouts.some(layout=>layout.id===id))throw Error('母版已不存在');await context.commands([{type:'slide.update',slideId:page.id,patch:{layoutId:id||null}}]);};
 pageSettingsActions.detachMaster=async captured=>{await context.commands([{type:'layout.detach',slideId:current(captured).id}]);};
 pageSettingsActions.editMaster=async(captured,id)=>{if(!context.document().layouts.some(layout=>layout.id===id))throw Error('母版已不存在');await context.editMaster(id,current(captured).id);};
 return {open,target,bindValues(render:()=>void,reset:()=>void){pageSettingsActions.renderValues=render;pageSettingsActions.resetValues=reset;},render(){if(source&&target())pageSettingsActions.renderValues();}};
}
