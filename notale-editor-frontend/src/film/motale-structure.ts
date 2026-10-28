import {validFilmMotaleAuthor,type FilmMotaleAuthor} from '@notale/editor/film';
import type {MotaleContext,MotaleObjectClipboard} from './motale-bridge';
export type MotaleStructureAction='copy'|'cut'|'paste'|'duplicate'|'remove';
export function motaleStructureKey(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'|'isComposing'>):MotaleStructureAction|undefined {
 if(event.isComposing||event.altKey||event.shiftKey)return;
 if(event.ctrlKey||event.metaKey)return ({c:'copy',x:'cut',v:'paste',d:'duplicate'} as const)[event.key.toLowerCase() as 'c'];
 if(event.key==='Delete'||event.key==='Backspace')return 'remove';
}
/** One editor-local clipboard; candidates never mutate an iframe or the document.
 * Only a validated complete result enters the existing save/undo command. */
export function motaleStructure(o:{context:()=>MotaleContext|undefined;author:()=>FilmMotaleAuthor|undefined;selected:()=>string[];scope:()=>string;locked:()=>boolean;editing:()=>boolean;commit:(author:FilmMotaleAuthor)=>boolean;select:(ids:string[])=>void;report:(message:string)=>void;prefix?:()=>string}){
 let clipboard:MotaleObjectClipboard|undefined;
 function reason(action:MotaleStructureAction):string|undefined {
  const context=o.context();
  if(!context||context.error)return context?.error??'场景尚未就绪';
  if(!o.editing()||context.bridge.mode()!=='author')return '请先进入场景对象编辑';
  if(o.locked())return '轨道已锁定或正在载入';
  if(!context.act.structure||!context.bridge.structure)return '此素材尚不支持对象复制和删除，请使用 v2 桥接素材';
  if(action==='paste'){
   if(!clipboard)return '请先复制场景对象';
   if(clipboard.film!==context.hello.film||clipboard.act!==context.act.id||clipboard.revision!==context.act.revision||clipboard.engine!==context.act.engine)return '只能粘贴到同一影片、同一幕和同一修订的片段';
   return;
  }
  const ids=[...new Set(o.selected())];if(!ids.length)return '请选择场景对象';
  if(ids.length>32)return '每次最多操作 32 个场景对象';
  const objects=context.bridge.objects(context.act.id,context.time,{parameters:'film'}),byId=new Map(objects.map(object=>[object.id,object]));
  for(const id of ids){
   const object=byId.get(id);if(!object)return '所选对象已变化，请重新选择';
   let parent=object.parent,covered=false;const seen=new Set<string>();
   while(parent&&!seen.has(parent)){seen.add(parent);if(ids.includes(parent)){covered=true;break;}parent=byId.get(parent)?.parent??null;}
   if(covered)continue;
   const capabilities=action==='cut'?['duplicate','remove'] as const:action==='remove'?['remove'] as const:['duplicate'] as const;
   for(const capability of capabilities)if(object.can?.[capability]!==true)return `${object.name??object.id}：${object.can?.[capability]??'不支持此操作'}`;
  }
 }
 function run(action:MotaleStructureAction):boolean {
  try{
   const unavailable=reason(action);if(unavailable)throw Error(unavailable);
   const context=o.context()!,structure=context.bridge.structure!,scope=o.scope(),ids=[...o.selected()],author=structuredClone(o.author()??null);
   const copy=action==='copy'||action==='cut'||action==='duplicate'?structuredClone(structure.copy(context.act.id,ids,{author})):undefined;
   if(action==='copy'){clipboard=copy;o.report('');return true;}
   const result:{author:FilmMotaleAuthor;roots?:string[]}=action==='remove'||action==='cut'?structure.remove(context.act.id,ids,{author}):structure.paste(context.act.id,structuredClone(action==='duplicate'?copy!:clipboard!),{author,prefix:o.prefix?.()??'c'+crypto.randomUUID().replaceAll('-','').slice(0,30)});
   if(!validFilmMotaleAuthor(result.author)||result.author.schema!=='motale-author/2')throw Error('场景返回了无效的对象结构，未保存');
   const errors=context.bridge.author.check(result.author);if(errors.length)throw Object.assign(Error('场景对象修改被拒绝'),{detail:errors});
   const now=o.context();if(now?.instance!==context.instance||now.act.id!==context.act.id||now.time!==context.time||scope!==o.scope()||o.locked()||!o.editing())throw Error('场景或编辑位置已变化，请重新操作');
   context.bridge.author.cancelPreview();
   if(!o.commit(structuredClone(result.author)))return false;
   if(action==='cut')clipboard=copy;
   o.select(result.roots??[]);o.report('');return true;
  }catch(error){
   const detail=(error as {detail?:{path:string;message:string}[]})?.detail;
   o.report(Array.isArray(detail)&&detail.length?detail.map(item=>[item.path,item.message].filter(Boolean).join('：')).join('；'):error instanceof Error?error.message:String(error));return false;
  }
 }
 return {run,reason};
}
