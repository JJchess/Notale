import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSelection,type InspectorObject} from '../src/state/inspector';
const object=(id:string,patch:Partial<InspectorObject>={}):InspectorObject=>({id,tag:'span',locked:false,attributes:{},...patch});
test('plain text replacement is restricted to leaves outside atomic content',()=>{
 const objects=[object('parent'),object('leaf',{parent:'parent'}),object('math',{attributes:{'data-notale-tex':'x'}}),object('child',{parent:'math'})];
 assert.equal(inspectSelection(objects,['parent']).text,false);assert.equal(inspectSelection(objects,['leaf']).text,true);
 assert.equal(inspectSelection(objects,['math']).text,false);assert.equal(inspectSelection(objects,['child']).text,false);
});
test('multi-selection, binding and lock state share one consistent model',()=>{
 const objects=[object('text'),object('input',{tag:'input',locked:true})];
 const selection=inspectSelection(objects,['text','input']);assert.equal(selection.count,2);assert.equal(selection.editableCount,1);assert.equal(selection.locked,true);assert.equal(selection.text,false);assert.equal(selection.binding,false);
 assert.equal(inspectSelection(objects,['input']).binding,true);assert.equal(inspectSelection(objects,['missing']).count,0);
});
test('cycles in imported parent links cannot hang the inspector',()=>{
 assert.equal(inspectSelection([object('a',{parent:'b'}),object('b',{parent:'a'})],['a']).text,false);
});

test('formatted headings expose typography without permitting destructive plain replacement',()=>{
 const objects=[object('heading',{tag:'h1'}),object('break',{tag:'br',parent:'heading'}),object('bold',{tag:'strong',parent:'heading'})];
 const selected=inspectSelection(objects,['heading']);assert.equal(selected.typography,true);assert.equal(selected.text,false);assert.equal(selected.label,'文字');
 assert.equal(inspectSelection([...objects,object('image',{tag:'img',parent:'heading'})],['heading']).typography,false);
});
