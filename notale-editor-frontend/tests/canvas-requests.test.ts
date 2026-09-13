import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CanvasRequests} from '../src/canvas/request-session';
test('requests match both request ID and response type and are cancelled across page lifetimes',async()=>{
 const sent:{type:string;data:Record<string,unknown>}[]=[];const session=new CanvasRequests((type,data)=>sent.push({type,data}));session.markReady();
 const first=session.request<{value:number}>('capture',{});await Promise.resolve();const old=sent[0].data.requestId;
 session.receive('scene-inspect',{requestId:old,value:9});const cancelled=assert.rejects(first,/页面已切换/);session.reset();await cancelled;
 session.markReady();const next=session.request<{value:number}>('capture',{});await Promise.resolve();session.receive('capture',{requestId:old,value:99});session.receive('capture',{requestId:sent[1].data.requestId,value:2});assert.equal((await next).value,2);session.dispose();
});
test('ready waits and unanswered requests clean up on timeout or disposal',async()=>{
 const session=new CanvasRequests(()=>{});await assert.rejects(session.whenReady(1),/未加载完成/);
 const waiting=session.whenReady();const ended=assert.rejects(waiting,/关闭/);session.dispose();await ended;await assert.rejects(session.whenReady(),/关闭/);
 const live=new CanvasRequests(()=>{});live.markReady();await assert.rejects(live.request('capture',{},'capture',1),/未响应/);live.dispose();
});
test('text flush uses the bridge id field and closes with its page instance',async()=>{
 const sent:Record<string,unknown>[]=[];const session=new CanvasRequests((_type,data)=>sent.push(data));session.markReady();
 const request=session.request('flush-editor',{},'editor-flushed',5000,'id');await Promise.resolve();let resolved=false;void request.then(()=>{resolved=true;});
 session.receive('editor-flushed',{requestId:sent[0].id});await Promise.resolve();assert.equal(resolved,false);
 session.receive('editor-flushed',{id:sent[0].id});await request;
 const pending=session.request('flush-editor',{},'editor-flushed',5000,'id');await Promise.resolve();const cancelled=assert.rejects(pending,/关闭/);session.dispose();await cancelled;
});
