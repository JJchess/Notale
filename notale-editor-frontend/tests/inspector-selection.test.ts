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

test('the selection reports the type its format panel must serve',()=>{
 const objects=[
  object('shape',{tag:'div',attributes:{'data-notale-shape':'rect'}}),
  object('icon',{tag:'svg',attributes:{'data-notale-icon':'star'}}),
  object('picture',{tag:'img'}),
  object('movie',{tag:'video'}),
  object('scene',{tag:'canvas'}),
  object('drawing',{tag:'svg'}),
  object('heading',{tag:'h1'}),
  object('box',{tag:'div'}),
 ];
 const kind=(id:string)=>inspectSelection(objects,[id]).kind;
 assert.equal(kind('shape'),'shape');assert.equal(kind('icon'),'icon');assert.equal(kind('picture'),'image');
 assert.equal(kind('movie'),'video');assert.equal(kind('scene'),'canvas');assert.equal(kind('drawing'),'vector');
 assert.equal(kind('heading'),'text');assert.equal(kind('box'),'object');
 assert.equal(inspectSelection(objects,['shape','picture']).kind,'multiple');
 assert.equal(inspectSelection(objects,['missing']).kind,'none');
});
test('authored types are read from the ancestor that owns them',()=>{
 const objects=[
  object('math',{tag:'div',attributes:{'data-notale-tex':'x^2'}}),object('math-part',{tag:'span',parent:'math'}),
  object('table',{tag:'table'}),object('row',{tag:'tr',parent:'table'}),object('cell',{tag:'td',parent:'row'}),
  object('chart',{tag:'div',attributes:{'data-notale-chart':'bar'}}),object('chart-part',{tag:'span',parent:'chart'}),
  object('smart',{tag:'div',attributes:{'data-notale-smart':'process'}}),object('card',{tag:'div',parent:'smart'}),
  object('code',{tag:'pre',attributes:{'data-notale-code':'print(1)'}}),
 ];
 const kind=(id:string)=>inspectSelection(objects,[id]).kind;
 assert.equal(kind('math-part'),'equation');assert.equal(kind('cell'),'table');
 assert.equal(kind('chart-part'),'chart');assert.equal(kind('card'),'diagram');assert.equal(kind('code'),'code');
});
test('a parent cycle cannot hang the type walk',()=>{
 assert.equal(inspectSelection([object('a',{parent:'b'}),object('b',{parent:'a'})],['a']).kind,'object');
});
