import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindViewportView,viewportViewState} from '../src/state/viewport-view';
test('viewport controls use reported scale, clamp inputs and ignore retired bindings',()=>{
 const calls:unknown[]=[];const first=bindViewportView({zoom:mode=>calls.push(mode),hand:hand=>calls.push(hand)});
 first.update({mode:'fit',actual:.63,fit:.63,hand:false});const stale=viewportViewState.getSnapshot();stale.step!(1);stale.zoom!(Infinity);stale.zoom!(20);stale.zoom!(0);assert.deepEqual([...calls],[.73,16,.1]);
 const second=bindViewportView({zoom:mode=>calls.push(mode),hand:hand=>calls.push(hand)});first.dispose();stale.zoom!(1);assert.equal(viewportViewState.getSnapshot().available,true);assert.equal(calls.length,3);viewportViewState.getSnapshot().zoom!('fit');assert.equal(calls.at(-1),'fit');second.dispose();assert.equal(viewportViewState.getSnapshot().available,false);
});
