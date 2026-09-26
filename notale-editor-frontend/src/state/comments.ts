import type {Command,DeckDocument} from '@notale/editor/browser';
export type ReviewComment=NonNullable<DeckDocument['comments']>[number];
export interface CommentSource {documentId:string;comment:ReviewComment;}
export function commentMutation(doc:DeckDocument,source:CommentSource,action:'resolve'|'remove'|'reply',reply?:{id:string;author:string;text:string;createdAt:string}):Command{
 if(doc.id!==source.documentId)throw Error('讲义已切换，输入已保留');
 const current=doc.comments?.find(c=>c.id===source.comment.id);if(!current)throw Error('批注已删除，输入已保留');
 if(action==='remove'){if(JSON.stringify(current)!==JSON.stringify(source.comment))throw Error('批注已变化，请检查后重试');return {type:'comment.remove',id:current.id};}
 if(action==='resolve'){if(current.resolved!==source.comment.resolved)throw Error('批注状态已变化，请检查后重试');return {type:'comment.set',comment:{...current,resolved:!current.resolved}};}
 if(!reply?.text.trim())throw Error('请输入回复内容');
 return {type:'comment.set',comment:{...current,replies:[...current.replies,{...reply,text:reply.text.trim()}]}};
}
export function newComment(doc:DeckDocument,source:{documentId:string;slideId:string;target?:string},input:{id:string;author:string;text:string;createdAt:string}):Command{
 if(doc.id!==source.documentId||!doc.slides.some(s=>s.id===source.slideId))throw Error('讲义或页面已变化，输入已保留');
 if(!input.text.trim())throw Error('请输入批注内容');
 return {type:'comment.set',comment:{...input,text:input.text.trim(),author:input.author.trim()||'我',slideId:source.slideId,target:source.target,resolved:false,replies:[]}};
}
