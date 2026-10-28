import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolvePreviewMedia,setPreviewMode,queueMediaProxy,mediaPreviewState} from '../src/film/media-preview';
import {reverseAudioWindow,reverseWindowIndex} from '../src/film/audio-windows';
test('normal preview is immediate and a late proxy cannot replace original preference',async()=>{
 const original=globalThis.fetch,storage=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value)}});
 let complete:(value:Response)=>void=()=>{};globalThis.fetch=async()=>new Promise<Response>(resolve=>{complete=resolve;});
 try{const source={id:'preview-test',kind:'video' as const,title:'sample',uri:'/sample-preview-test.mp4',duration:20};const initial=await resolvePreviewMedia(source);assert.equal(initial.uri,source.uri);const force=resolvePreviewMedia(source,{force:true});setPreviewMode(source.uri,'original');complete(new Response(JSON.stringify({state:'complete',uri:'/proxy-test.mp4',sourceKey:'test'}),{headers:{'content-type':'application/json'}}));assert.equal((await force).uri,source.uri);assert.equal(mediaPreviewState.get(source.uri)?.state,'original');}finally{globalThis.fetch=original;Reflect.deleteProperty(globalThis,'localStorage');}
});
test('reverse PCM requests are bounded, correctly reversed and evict old windows',async()=>{
 const original=globalThis.fetch,requests:string[]=[];globalThis.fetch=async input=>{requests.push(String(input));const data=new Float32Array([1,2,3,4,5,6]);return new Response(data.buffer);};
 const context={createBuffer:(channels:number,length:number,sampleRate:number)=>{const samples=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate,duration:length/sampleRate,getChannelData:(channel:number)=>samples[channel]};}} as unknown as BaseAudioContext;
 try{assert.equal(reverseWindowIndex(8),0);assert.equal(reverseWindowIndex(8.01),1);const first=await reverseAudioWindow('/test.wav',0,context);assert.deepEqual([...first.buffer.getChannelData(0)],[5,3,1]);assert.deepEqual([...first.buffer.getChannelData(1)],[6,4,2]);for(let i=1;i<=4;i++)await reverseAudioWindow('/test.wav',i,context);await reverseAudioWindow('/test.wav',0,context);assert.equal(requests.length,6);for(const uri of requests){const url=new URL(uri,'http://localhost');assert.equal(url.searchParams.get('sampleCount'),'384000');}}finally{globalThis.fetch=original;}
});
