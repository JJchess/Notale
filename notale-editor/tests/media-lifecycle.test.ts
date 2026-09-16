import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaController} from '../src/browser/media.js';
import {mediaSettingsSchema} from '../src/domain/media.js';
test('removed media stops playback and late play rejection cannot restore controls',async()=>{
 const reports:unknown[]=[];let reject!: (cause:Error)=>void;
 const el=Object.assign(new EventTarget(),{dataset:{notaleId:'audio',notaleMedia:JSON.stringify(mediaSettingsSchema.parse({controls:false,startStep:0}))},isConnected:true,readyState:1,duration:10,currentTime:0,paused:true,controls:false,hasAttribute:()=>true,pause(){this.paused=true;},play(){this.paused=false;return new Promise<void>((_,fail)=>{reject=fail;});}});
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldCancel=globalThis.cancelAnimationFrame;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelectorAll:()=>el.isConnected?[el]:[]}});globalThis.cancelAnimationFrame=()=>{};
 try{const controller=mediaController((...args)=>reports.push(args));controller.seek(0,true,true);assert.equal(el.paused,false);el.isConnected=false;controller.update();assert.equal(el.paused,true);reject(Error('obsolete playback'));await Promise.resolve();assert.deepEqual(reports,[]);assert.equal(el.controls,false);controller.stop();}
 finally{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');globalThis.cancelAnimationFrame=oldCancel;}
});
