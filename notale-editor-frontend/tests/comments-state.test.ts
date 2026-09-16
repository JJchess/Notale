import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commentMutation,newComment} from '../src/state/comments';
test('comment replies preserve remote replies and stale deletion is rejected',()=>{
 const comment={id:'c',slideId:'page',text:'Review',author:'Me',createdAt:'2026-09-11T00:00:00Z',resolved:false,replies:[]};const source={documentId:'doc',comment};
 const reply={id:'remote',author:'Other',text:'remote',createdAt:comment.createdAt};const doc={id:'doc',slides:[{id:'page'}],comments:[{...comment,replies:[reply]}]};
 const result=commentMutation(doc as any,source,'reply',{...reply,id:'local',text:' local '}) as any;assert.deepEqual(result.comment.replies.map((r:any)=>r.text),['remote','local']);
 assert.throws(()=>commentMutation(doc as any,source,'remove'),/批注已变化/);
 assert.equal((commentMutation(doc as any,source,'resolve') as any).comment.replies.length,1);
 assert.throws(()=>commentMutation({...doc,id:'other'} as any,source,'resolve'),/讲义已切换/);
 assert.throws(()=>newComment(doc as any,{documentId:'doc',slideId:'missing'},{id:'new',author:'Me',text:'Review',createdAt:comment.createdAt}),/页面已变化/);
});
