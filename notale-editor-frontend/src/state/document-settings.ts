import {scopeActions} from './action-scope';
import type {Command,DeckDocument} from '@notale/editor/browser';
import {editorActions as publicEditorActions,editorSession} from './editor-session';
export interface SettingSource {key:string;value:string;}
export interface HistoryRevision {version:number;created_at:string;}
export function sizeValue(width:number,height:number){return JSON.stringify({width:String(width),height:String(height)});}

export function bindDocumentSettings(context:{signal?:AbortSignal;document:()=>DeckDocument;commands:(commands:Command[])=>Promise<unknown>;history:()=>Promise<HistoryRevision[]>;restore:(version:number)=>Promise<unknown>;flush:()=>Promise<unknown>}){
 const controller=new AbortController();
 const stop=()=>controller.abort();
 if(context.signal?.aborted)stop();else context.signal?.addEventListener('abort',stop,{once:true});
 const editorActions=scopeActions(publicEditorActions,controller.signal);
 const current=()=>{if(controller.signal.aborted)throw Error('编辑会话已关闭');return context.document();};
 editorActions.saveTheme=async(source,text)=>{const doc=current();if(source.key!==doc.id||source.value!==JSON.stringify(doc.theme))throw Error('主题已变化，输入已保留，请核对后重新打开设置');const value=JSON.parse(text);if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(v=>typeof v!=='string'))throw Error('请输入属性名与字符串值组成的 JSON 对象');if(JSON.stringify(value)!==JSON.stringify(doc.theme))await context.commands([{type:'deck.update',theme:value}]);};
 editorActions.saveDeckSize=async(source,text)=>{const doc=current();if(source.key!==doc.id||source.value!==sizeValue(doc.width,doc.height))throw Error('页面尺寸已变化，输入已保留；在尺寸输入框按 Esc 载入最新尺寸');const value=JSON.parse(text),width=Number(value.width),height=Number(value.height);if(![width,height].every(v=>Number.isInteger(v)&&v>=100&&v<=10000))throw Error('宽高须为 100–10000 之间的整数');if(width!==doc.width||height!==doc.height)await context.commands([{type:'deck.update',width,height}]);};
 editorActions.loadHistory=async(id)=>{if(current().id!==id)throw Error('讲义已切换');const rows=await context.history();if(current().id!==id)throw Error('讲义已切换');return rows;};
 editorActions.restoreHistory=async(id,version)=>{if(current().id!==id)throw Error('讲义已切换');if(!Number.isInteger(version)||version<1)throw Error('请选择有效的历史版本');await context.flush();if(current().id!==id)throw Error('讲义已切换');await context.restore(version);};
 editorActions.openHistory=async()=>{current();editorSession.update({documentDialog:'history'});};
 editorActions.renameDocument=async(source,title)=>{const doc=current();title=title.trim();if(!title)throw Error('文件名不能为空');if(doc.id!==source.id||doc.title!==source.title)throw Error('文件名已变化，输入已保留，请核对后重新打开');if(title!==doc.title)await context.commands([{type:'deck.update',title}]);};
 return {dispose(){context.signal?.removeEventListener('abort',stop);stop();}};
}
