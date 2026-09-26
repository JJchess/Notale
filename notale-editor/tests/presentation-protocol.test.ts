import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergePresentationRuntime,presentationOrder} from '../src/domain/presentation.js';
test('presentation order rejects old owners and detects gaps',()=>{assert.equal(presentationOrder({term:3,sequence:4},{term:2,sequence:99}),'stale');assert.equal(presentationOrder({term:3,sequence:4},{term:3,sequence:4}),'stale');assert.equal(presentationOrder({term:3,sequence:4},{term:3,sequence:6}),'gap');assert.equal(presentationOrder({term:3,sequence:4},{term:4,sequence:0}),'next');});
test('runtime deltas preserve unrelated author-independent state',()=>{const previous=mergePresentationRuntime(undefined,{controls:{a:{value:'12'},b:{value:'20'}},scenes:{simulation:{seed:7}}});const next=mergePresentationRuntime(previous,{controls:{a:{value:'40'}}});assert.equal(previous.controls.a.value,'12');assert.deepEqual(next.scenes,{simulation:{seed:7}});assert.equal(next.controls.b.value,'20');});
