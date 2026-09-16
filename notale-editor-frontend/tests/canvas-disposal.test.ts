import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CanvasController,disposeCanvasHost} from '../src/canvas/controller';
test('canvas disposal continues after a failing cleanup and cannot unregister its replacement',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,oldError=console.error;
 const listeners=new Set<unknown>(),frames:{removed:boolean}[]=[],reports:unknown[]=[];
 globalThis.window={addEventListener:(_type:string,fn:unknown)=>listeners.add(fn),removeEventListener:(_type:string,fn:unknown)=>listeners.delete(fn)} as any;
 globalThis.document={createElement:()=>{const frame={removed:false,setAttribute(){},remove(){this.removed=true;}};frames.push(frame);return frame;}} as any;
 console.error=error=>reports.push(error);
 try{
  const host={append(){}} as any,old=new CanvasController(host);let cleaned=0;
  old.onDispose(()=>{throw Error('tool cleanup failed');});old.onDispose(()=>cleaned++);
  const replacement=new CanvasController(host);old.dispose();old.dispose();
  assert.equal(cleaned,1);assert.equal(frames[0].removed,true);assert.equal(frames[1].removed,false);assert.equal(listeners.size,1);assert.equal(reports.length,1);
  old.onDispose(()=>cleaned++);assert.equal(cleaned,2);
  disposeCanvasHost(host);assert.equal(frames[1].removed,true);assert.equal(listeners.size,0);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;console.error=oldError;}
});
