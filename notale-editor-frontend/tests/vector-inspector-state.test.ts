import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVectorInspector,vectorInspectorState,type VectorState} from '../src/state/vector-inspector';
test('vector drafts survive unrelated renders, normalize acknowledgements and reject stale file reads',async()=>{
 let scope='doc/page/runtime',resolve!:(value:ArrayBuffer)=>void;const sent:{action:string;data:unknown}[]=[];
 const binding=createVectorInspector({scope:()=>scope,send:(action,data)=>sent.push({action,data})});
 let state:VectorState={active:true,items:[{id:'shape',tag:'rect',locked:false,generated:false,attributes:{},styles:{fill:'rgb(0, 0, 0)'}}]};
 binding.render(state);vectorInspectorState.getSnapshot().change!('fill','#ef4444');binding.render(state);assert.equal(vectorInspectorState.getSnapshot().drafts['style:fill'],'#ef4444');vectorInspectorState.getSnapshot().commit!('fill');assert.equal(sent.length,1);
 state={...state,items:[{...state.items![0],styles:{fill:'rgb(239, 68, 68)'}}]};binding.render(state);assert.deepEqual(vectorInspectorState.getSnapshot().drafts,{});
 const read=vectorInspectorState.getSnapshot().file!({arrayBuffer:()=>new Promise<ArrayBuffer>(done=>{resolve=done;})} as File,'font');scope='other/page/runtime';resolve(new ArrayBuffer(1));await read;assert.equal(sent.length,1);
 binding.render(state);vectorInspectorState.getSnapshot().change!('opacity','');vectorInspectorState.getSnapshot().commit!('opacity',true);assert.equal(sent.length,1);assert.match(vectorInspectorState.getSnapshot().error,/有效数字/);
 vectorInspectorState.getSnapshot().cancel!('opacity');vectorInspectorState.getSnapshot().commit!('opacity',true);assert.equal(sent.length,1);assert.equal(vectorInspectorState.getSnapshot().error,'');assert.deepEqual(vectorInspectorState.getSnapshot().drafts,{});
 vectorInspectorState.getSnapshot().change!('fill','blue');vectorInspectorState.getSnapshot().commit!('fill');vectorInspectorState.getSnapshot().cancel!('fill');assert.equal(vectorInspectorState.getSnapshot().drafts['style:fill'],'blue');assert.equal(sent.length,2);
 const stale=vectorInspectorState.getSnapshot().run!;binding.dispose();stale('style',{property:'fill',value:'red'});assert.equal(sent.length,2);
});

test('vector numeric ranges block invalid sizes while allowing negative coordinates and spacing',()=>{
 const sent:unknown[]=[];const binding=createVectorInspector({scope:()=> 'doc/page',send:(...args)=>sent.push(args)});
 try{binding.render({active:true,items:[{id:'shape',tag:'rect',locked:false,generated:false,attributes:{},styles:{}}]});
 for(const [property,value,attribute] of [['r','-1',true],['width','-2',true],['stroke-width','-1',false],['font-size','-1',false],['opacity','1.1',false]] as const){const m=vectorInspectorState.getSnapshot();m.change!(property,value,attribute);m.commit!(property,true,attribute);assert.equal(sent.length,0);assert.equal(vectorInspectorState.getSnapshot().drafts[(attribute?'attribute:':'style:')+property],value);m.cancel!(property,attribute);}
 const m=vectorInspectorState.getSnapshot();m.change!('x','-20',true);m.commit!('x',true,true);m.change!('letter-spacing','-2');m.commit!('letter-spacing',true);m.change!('opacity','0');m.commit!('opacity',true);assert.equal(sent.length,3);
 }finally{binding.dispose();}
});
