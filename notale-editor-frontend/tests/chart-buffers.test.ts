import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChartBuffers} from '../src/state/chart-buffers';
test('invalid chart data survives failed storage and remains isolated by chart identity',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('quota');}},buffers=new ChartBuffers(()=>storage);
 const data={edgeMode:false,buffer:[{value:'not a number'}],bufferBase:[{value:1}]};
 assert.throws(()=>buffers.set('doc:page:chart',data),/quota/);data.buffer[0].value='changed externally';
 assert.equal(buffers.get('doc:page:chart')?.buffer[0].value,'not a number');assert.equal(buffers.get('other:page:chart'),undefined);
 assert.equal(buffers.pending().length,1);buffers.clear('doc:page:chart');assert.equal(buffers.get('doc:page:chart'),undefined);assert.equal(buffers.pending().length,0);
});
test('stored drafts are validated before being restored',()=>{
 let raw='{"edgeMode":false,"buffer":"bad","bufferBase":[]}';const buffers=new ChartBuffers(()=>({getItem:()=>raw,setItem:()=>{},removeItem:()=>{}}));
 assert.equal(buffers.get('bad'),undefined);raw=JSON.stringify({edgeMode:true,buffer:[{value:'x'}],bufferBase:[]});assert.equal(buffers.get('good')?.edgeMode,true);
});

test('base and teaching-step drafts are isolated and clearing one preserves the others',async()=>{
 const {chartBufferKey}=await import('../src/state/chart-buffers');
 const storage=new Map<string,string>();const buffers=new ChartBuffers(()=>({getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value);},removeItem:key=>{storage.delete(key);}}));
 const base=chartBufferKey('doc:page:chart'),first=chartBufferKey('doc:page:chart','one'),second=chartBufferKey('doc:page:chart','two');
 for(const [key,value] of [[base,'base'],[first,'first'],[second,'second']])buffers.set(key,{edgeMode:false,buffer:[{value}],bufferBase:[]});
 buffers.clear(first);assert.equal(buffers.get(base)?.buffer[0].value,'base');assert.equal(buffers.get(second)?.buffer[0].value,'second');assert.equal(buffers.get(first),undefined);assert.equal(base,'doc:page:chart');
});
