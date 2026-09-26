import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopeActions} from '../src/state/action-scope';
test('closing a session revokes captured actions and restores the unbound entry',()=>{
 let calls=0;const fallback=()=>0,target={run:fallback},controller=new AbortController();const scoped=scopeActions(target,controller.signal);scoped.run=()=>++calls;const captured=target.run;assert.equal(captured(),1);controller.abort();assert.equal(target.run,fallback);assert.throws(captured,/已关闭/);assert.equal(calls,1);assert.throws(()=>{scoped.run=()=>2;},/已关闭/);
});
test('old scope disposal cannot overwrite a newer action registration',()=>{
 const target={run:()=>0},first=new AbortController(),second=new AbortController();const old=scopeActions(target,first.signal);old.run=()=>1;const next=scopeActions(target,second.signal);next.run=()=>2;first.abort();assert.equal(target.run(),2);assert.throws(()=>old.run(),/已关闭/);second.abort();assert.equal(target.run(),0);
});
