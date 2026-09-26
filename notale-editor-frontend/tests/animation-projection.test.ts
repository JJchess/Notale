import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Snapshot,AnimationSpec} from '@notale/editor/browser';
import {projectCommands} from '../src/author-projection';
test('editing an existing animation preserves its position and does not mutate the source',()=>{
 const first={id:'first',target:'title',step:1,effect:'pulse',trigger:'click',delay:0,duration:1000} as AnimationSpec;
 const second={...first,id:'second'};
 const source={version:1,document:{id:'doc',slides:[{id:'page',animations:[first,second]}]}} as Snapshot;
 const changed=projectCommands(source,[{type:'animation.set',slideId:'page',animation:{...first,duration:2000}}]);
 assert.deepEqual(changed.document.slides[0].animations.map(a=>a.id),['first','second']);
 assert.equal(changed.document.slides[0].animations[0].duration,2000);
 assert.equal(source.document.slides[0].animations[0].duration,1000);
 const added=projectCommands(changed,[{type:'animation.set',slideId:'page',animation:{...first,id:'third'}}]);
 assert.deepEqual(added.document.slides[0].animations.map(a=>a.id),['first','second','third']);
});
