import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CanvasController} from '../src/canvas/controller';

test('speculative runtimes stay isolated, reuse on navigation and obey revision and capacity',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 let receive:(event:any)=>void=()=>{};
 const messages:any[]=[];
 globalThis.window={addEventListener:(_type:string,handler:any)=>{receive=handler;},removeEventListener(){}} as any;
 globalThis.document={createElement:()=>({style:{},inert:false,removed:false,setAttribute(){},removeAttribute(){},remove(){this.removed=true;},contentWindow:{postMessage(message:any){messages.push(message);}}})} as any;
 try{
  const frames:any[]=[];
  const controller=new CanvasController({append(frame:any){frames.push(frame);}} as any,3);
  const page=(id:string,version=1)=>({documentId:'doc',version,pageId:id,url:`https://content.example/${id}`,channel:'secret'});
  let delivered=0;controller.subscribe(()=>delivered++);
  const active=controller.activate(page('a')).frame;
  controller.preload(page('b'));const warm=frames.at(-1);
  assert.equal(controller.frame,active);assert.equal(warm.inert,true);assert.equal(warm.style.display,'none');
  receive({source:warm.contentWindow,origin:'https://content.example',data:{source:'notale-slide',channel:'secret',type:'ready',data:{slideId:'b'}}});
  assert.equal(delivered,0);assert.deepEqual(messages.at(-1).data,{visible:false});
  controller.preload(page('c'));controller.preload(page('d'));
  assert.equal(warm.removed,true);assert.equal((active as any).removed,false);
  const candidate=frames.at(-1);const result=controller.activate(page('d'));
  assert.equal(result.reused,true);assert.equal(result.frame,candidate);
  const count=frames.length;controller.preload(page('e',2));assert.equal(frames.length,count);
  controller.activate(page('e',2));assert.equal(candidate.removed,true);
  controller.dispose();controller.preload(page('f',2));assert.equal(frames.length,count+1);
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
