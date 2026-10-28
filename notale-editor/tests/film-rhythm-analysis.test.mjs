import test from 'node:test';
import assert from 'node:assert/strict';
import {createRhythmAnalyzer} from '../src/server/film/rhythm-analysis.mjs';
const fingerprint='a'.repeat(64);
function analyze(times,duration=12){const pcm=Buffer.alloc(duration*8000*4);for(const time of times)for(let i=0;i<160;i++){const at=Math.round(time*8000)+i;if(at*4>=pcm.length)break;pcm.writeFloatLE(Math.sin(i*1.7)*Math.exp(-i/24)*.8,at*4);}const detector=createRhythmAnalyzer();for(let offset=0;offset<pcm.length;offset+=7919)detector.write(pcm.subarray(offset,offset+7919));return detector.finish(fingerprint);}
test('periodic transients produce measured beats and stable tempo',()=>{const expected=Array.from({length:22},(_,i)=>.5+i*.5),result=analyze(expected);assert.ok(result.onsets.length>=20);assert.ok(result.beats.length>=18,JSON.stringify(result));assert.ok(Math.abs(result.bpm-120)<.5);assert.ok(result.confidence>.58);assert.ok(result.beats.every(t=>result.onsets.includes(t)));assert.ok(result.onsets.every(t=>expected.some(v=>Math.abs(v-t)<.05)));});
test('silence and irregular sparse onsets never fabricate a regular grid',()=>{assert.deepEqual(analyze([]).beats,[]);assert.deepEqual(analyze([]).onsets,[]);const result=analyze([.2,.77,1.91,2.13,3.8,5.42,5.61,7.31,8.83,9.11,11.02]);assert.ok(result.onsets.length>=8);assert.deepEqual(result.beats,[],JSON.stringify(result));});
