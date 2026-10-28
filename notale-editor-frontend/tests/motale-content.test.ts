import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseContent,contentText,contentProperty} from '../src/film/motale-content';
import type {MotaleBridgeObject,MotalePropState} from '../src/film/motale-bridge';
const number:MotalePropState={type:'number',keyable:false,base:0,value:0,min:0,max:10};
test('content input preserves multiline text and rejects invalid numerical input',()=>{
 assert.equal(parseContent('中文\n第二行','text',{type:'string',keyable:false,base:'',value:'',maxLength:20}),'中文\n第二行');
 assert.equal(parseContent(' 3.5 ','value',number),3.5);
 for(const raw of ['', ' ', 'NaN','Infinity','12'])assert.throws(()=>parseContent(raw,'value',number));
});
test('array parsing accepts the existing formats and enforces the engine capability',()=>{
 const spec:MotalePropState={...number,type:'numbers',length:3};
 for(const raw of ['1, 2, 3','[1,2,3]','1，2，3','1\n2 3'])assert.deepEqual(parseContent(raw,'values',spec),[1,2,3]);
 for(const raw of ['1,2','[1,null,3]','[1,"2",3]','1 2 99','{}'])assert.throws(()=>parseContent(raw,'values',spec));
 assert.equal(contentText([1,2,3]),'1, 2, 3');
});
test('double click chooses an explicit content property, not an arbitrary geometry field',()=>{
 const object:Pick<MotaleBridgeObject,'props'>={props:{x:number}};assert.equal(contentProperty(object),undefined);
 object.props.value=number;assert.equal(contentProperty(object),'value');
 object.props.text={type:'string',keyable:false,base:'',value:''};assert.equal(contentProperty(object),'text');
});
