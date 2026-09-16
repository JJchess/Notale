import type {Command,DeckDocument} from '@notale/editor/browser';
import {commentMutation,newComment,type ReviewComment,type CommentSource} from './comments';
export interface CommentsModel {documentId:string;pageId:string;selected:string[];comments:(ReviewComment&{label:string})[];}
interface State {open:boolean;model?:CommentsModel;}
const empty:State={open:false};let state=empty,owner:symbol|undefined;const listeners=new Set<()=>void>();
const publish=(next:State)=>{state=next;for(const f of listeners)f();};
export const commentsState={getSnapshot:()=>state,getServerSnapshot:()=>empty,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};}};
export const commentsActions={toggle:(_show?:boolean)=>false,add:async(_source:CommentsModel,_author:string,_text:string,_anchor:boolean)=>{},mutate:async(_source:CommentSource,_action:'resolve'|'remove'|'reply',_author:string,_text='')=>{},go:async(_source:CommentSource)=>{}};
export function bindComments(context:{document:()=>DeckDocument;slideId:()=>string;objects:()=>{id:string;tag:string;text:string;attributes:Record<string,string>}[];selected:()=>string[];commands:(commands:Command[])=>Promise<unknown>;show:(id:string)=>Promise<unknown>;select:(id:string)=>void;uuid:()=>string}){
 const identity=Symbol('comments');owner=identity;let disposed=false,signature='';const active=()=>!disposed&&owner===identity;const check=()=>{if(!active())throw Error('编辑器已关闭');};publish(empty);
 function render(){if(!active())return;const doc=context.document(),pageId=context.slideId(),objects=context.objects();const model:CommentsModel={documentId:doc.id,pageId,selected:[...context.selected()],comments:(doc.comments??[]).map(comment=>{const object=comment.slideId===pageId?objects.find(o=>o.id===comment.target):undefined;return {...comment,label:!comment.target?'整页':comment.slideId!==pageId?'其他页面对象':object?object.attributes['data-notale-name']||object.text.trim().slice(0,12)||object.tag:'已删除对象'};})};const next=JSON.stringify(model);if(next===signature)return;signature=next;publish({...state,model});}
 const toggle=(show?:boolean)=>{if(!active())return false;render();publish({...state,open:show??!state.open});return state.open;};commentsActions.toggle=toggle;
 commentsActions.add=async(source,author,text,anchor)=>{check();const target=anchor&&source.selected.length===1?source.selected[0]:undefined;if(target&&(context.slideId()!==source.pageId||!context.objects().some(o=>o.id===target)))throw Error('关联对象已变化，输入已保留');await context.commands([newComment(context.document(),{documentId:source.documentId,slideId:source.pageId,target},{id:context.uuid(),author,text,createdAt:new Date().toISOString()})]);render();};
 commentsActions.mutate=async(source,action,author,text='')=>{check();await context.commands([commentMutation(context.document(),source,action,action==='reply'?{id:context.uuid(),author:author.trim()||'我',text,createdAt:new Date().toISOString()}:undefined)]);render();};
 commentsActions.go=async source=>{check();if(context.document().id!==source.documentId)throw Error('讲义已切换');await context.show(source.comment.slideId);if(active()&&context.document().id===source.documentId&&source.comment.target)context.select(source.comment.target);};
 return {render,toggle,dispose(){disposed=true;if(owner===identity){owner=undefined;publish(empty);}}};
}
