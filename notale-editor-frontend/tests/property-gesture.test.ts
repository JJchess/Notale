import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PropertyGesture} from '../src/state/property-gesture';
import type {Command} from '@notale/editor/browser';
const command=(target:string,opacity:string):Command[]=>[{type:'element.patch',slideId:'page',target,patch:{style:{opacity}}}];
test('property gestures commit latest value once and fence changed targets',async()=>{
 const commits:any[]=[],previews:any[]=[],cancels:string[]=[];let id=0;
 const gesture=new PropertyGesture('opacity',{preview:(key,commands)=>previews.push({key,commands}),commit:async(key,commands)=>{commits.push({key,commands});},cancel:async key=>{cancels.push(key);},error:error=>{throw error;}},()=>String(++id));
 const initial=command('a','.2');gesture.update(initial,'1');(initial[0] as any).patch.style.opacity='tampered';gesture.update(command('a','.4'),'1');await gesture.finish();await gesture.finish();assert.equal(commits.length,1);assert.equal(commits[0].commands[0].patch.style.opacity,'.4');assert.equal(previews[0].commands[0].patch.style.opacity,'.2');
 gesture.update(command('a','.6'),'1');gesture.update(command('b','.8'),'1');assert.equal(commits.length,2);assert.equal(commits[1].commands[0].target,'a');assert.equal(previews.length,3);
 gesture.update(command('b','.5'),'.8');const cancelled=gesture.cancel()!;assert.equal(cancelled.value,'.8');await cancelled.done;assert.equal(cancels.length,1);assert.equal(gesture.pending,false);
});
