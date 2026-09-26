import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindTeachingSteps,teachingStepsState} from '../src/state/teaching-steps';
function fixture(){let scope='doc/page';const commands:any[]=[];const slide:any={id:'page',steps:[{id:'first',name:'Initial',notes:'',advanceAfter:null},{id:'second',name:'Reveal',notes:'',advanceAfter:null}],animations:[],components:[]};const binding=bindTeachingSteps({scope:()=>scope,slide:()=>slide,step:()=>0,nativeMax:()=>1,ready:()=>true,whenReady:async()=>{},preview:()=>{},chooseAnimationStep:()=>{},commands:async value=>{commands.push(...value);}});binding.render();return {binding,slide,commands,switch(){scope='other/page';binding.render();}};}
test('teaching drafts survive unrelated animation changes and reject conflicting step edits',async()=>{
 const f=fixture();try{teachingStepsState.getSnapshot().change!({name:'Draft'});f.slide.animations.push({step:1});f.binding.render();assert.equal(teachingStepsState.getSnapshot().draft.name,'Draft');f.slide.steps[0].name='Remote';f.binding.render();await teachingStepsState.getSnapshot().run!('save');assert.equal(f.commands.length,0);assert.match(teachingStepsState.getSnapshot().error,/已变化/);assert.equal(teachingStepsState.getSnapshot().draft.name,'Draft');}finally{f.binding.dispose();}
});
test('step commands preserve units, fixed initial step and stale-scope boundaries',async()=>{
 const f=fixture();try{await teachingStepsState.getSnapshot().run!('remove');assert.equal(f.commands.length,0);teachingStepsState.getSnapshot().choose!('second');teachingStepsState.getSnapshot().change!({advance:'1.5'});await teachingStepsState.getSnapshot().run!('save');assert.equal(f.commands[0].patch.advanceAfter,1500);const old=teachingStepsState.getSnapshot();f.switch();await old.run!('remove');assert.equal(f.commands.length,1);f.binding.dispose();await teachingStepsState.getSnapshot().run?.('insert');assert.equal(f.commands.length,1);}finally{f.binding.dispose();}
});
