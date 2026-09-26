import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AnimationDraft} from '../src/state/animation-draft';
test('animation drafts convert units once and reject incomplete numbers before saving',()=>{
 const draft=new AnimationDraft();draft.set('duration','0.85');draft.set('delay','0.15');draft.reverse=true;
 const saved=draft.read('animation','target',[]);assert.equal(saved.duration,850);assert.equal(saved.delay,150);assert.equal(saved.autoReverse,true);
 draft.set('duration','');assert.throws(()=>draft.read('animation','target',[]),/有效数字/);
 draft.set('duration','NaN');assert.throws(()=>draft.read('animation','target',[]),/有效数字/);
});
test('animation drafts keep motion and custom data specific to their effect',()=>{
 const draft=new AnimationDraft(),path=[{x:0,y:0},{x:100,y:50}];draft.set('effect','motion');
 const saved=draft.read('animation','target',path);path[1].x=999;assert.equal(saved.path?.[1].x,100);
 draft.set('effect','custom');draft.set('keyframes','invalid');assert.throws(()=>draft.read('animation','target',[]));
 draft.set('effect','fade-in');const plain=draft.read('animation','target',[]);assert.equal(plain.path,undefined);assert.equal(plain.keyframes,undefined);
});

import {editAnimationField} from '../src/state/animation-draft';
test('editing one cue field preserves newer unrelated timing and targeting',()=>{
 const draft=new AnimationDraft(),incoming=draft.read('cue','old-target',[]);
 const current={...incoming,target:'new-target',delay:1250,easing:'linear' as const};
 const changed=editAnimationField(current,{...incoming,duration:2000},'duration');
 assert.equal(changed.duration,2000);assert.equal(changed.delay,1250);assert.equal(changed.easing,'linear');assert.equal(changed.target,'new-target');
 const triggered=editAnimationField({...current,trigger:'object',triggerTarget:'button'}, {...incoming,trigger:'click',step:3},'trigger');
 assert.equal(triggered.trigger,'click');assert.equal(triggered.step,3);assert.equal(triggered.triggerTarget,undefined);assert.equal(triggered.delay,1250);
 const directed=editAnimationField(current,{...incoming,effectDirection:'right',dx:240,dy:0},'effect-direction');assert.equal(directed.dx,240);assert.equal(directed.effectDirection,'right');assert.equal(directed.easing,'linear');assert.throws(()=>editAnimationField({...current,effect:'pulse'},incoming,'path'),/动画效果已变化/);
});
