import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreviewLeases} from '../src/canvas/preview-leases';
test('one grant is renewed until its last runtime releases it, independently of newer grants',()=>{
 const started:string[]=[],stopped:string[]=[];
 const pool=new PreviewLeases((_id,grant)=>{started.push(grant.channel);return {stop:()=>{stopped.push(grant.channel);}};});
 const grant=(channel:string)=>({channel,version:1,expiresAt:Date.now()+3600000,renewAfterMs:1800000});
 const one=pool.retain('doc',grant('old')),two=pool.retain('doc',grant('old')),newer=pool.retain('doc',grant('new'));
 assert.deepEqual(started,['old','new']);one();one();assert.deepEqual(stopped,[]);newer();assert.deepEqual(stopped,['new']);two();assert.deepEqual(stopped,['new','old']);
 const stale=pool.retain('doc',grant('same'));pool.clear();const current=pool.retain('doc',grant('same'));stale();assert.equal(stopped.filter(x=>x==='same').length,1);current();assert.equal(stopped.filter(x=>x==='same').length,2);
});
