import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasPresentationSceneState,samePresentationMedia,subscribePresentationChart} from '../src/browser/presentation-runtime.js';
test('canvas synchronization requires an actual captured checkpoint or adapter',()=>{
 for(const value of [undefined,null,{}, {kind:'values',value:{x:1}}])assert.equal(hasPresentationSceneState(value),false);
 for(const kind of ['checkpoint','adapter'])assert.equal(hasPresentationSceneState({kind,value:{x:1}}),true);
});

test('paused media ignores capture timestamps but retains every playback change',()=>{
 const a={time:2,paused:true,rate:1,volume:.5,muted:false,at:100};
 assert.equal(samePresentationMedia(a,{...a,at:200}),true);
 for(const change of [{time:3},{paused:false},{rate:2},{volume:.2},{muted:true}])assert.equal(samePresentationMedia(a,{...a,...change,at:200}),false);
 assert.equal(samePresentationMedia({...a,paused:false},{...a,paused:false,at:200}),false);
 assert.equal(samePresentationMedia(undefined,a),false);
});

test('partial chart registration rolls back and cleanup attempts every listener once',()=>{
 const off:string[]=[];assert.throws(()=>subscribePresentationChart({on:type=>{if(type==='datazoom')throw Error('registration');},off:type=>{off.push(type);throw Error('cleanup');}},()=>{}),/registration/);assert.deepEqual(off,['legendselectchanged','datazoom']);
 const removed:string[]=[];const stop=subscribePresentationChart({on:()=>{},off:type=>{removed.push(type);if(type==='datazoom')throw Error('cleanup');}},()=>{});assert.throws(stop,/cleanup/);assert.equal(removed.length,4);stop();assert.equal(removed.length,4);
});
