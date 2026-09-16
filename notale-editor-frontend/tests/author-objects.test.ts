import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AuthorObjects} from '../src/canvas/author-objects';

test('author object cache reuses unchanged HTML while refreshing locks and protecting drafts',()=>{
 const original=globalThis.DOMParser;let parses=0;
 globalThis.DOMParser=class {parseFromString(html:string){parses++;return {querySelectorAll:()=>[{tagName:'P',dataset:{notaleId:'text'},namespaceURI:'html',parentElement:null,textContent:html,outerHTML:html,attributes:[{name:'title',value:'original'}],style:[]} ]};}} as any;
 try{
  const cache=new AuthorObjects(2),slide={id:'one',html:'first',locked:[] as string[]};
  const first=cache.read('doc',slide,[]);first[0].attributes.title='draft';first[0].kind='text';
  const second=cache.read('doc',{...slide,locked:['text']},first);
  assert.equal(parses,1);assert.equal(second[0].locked,true);assert.equal(second[0].kind,'text');assert.equal(second[0].attributes.title,'original');
  assert.equal(cache.read('doc',{...slide,html:'changed'},second)[0].text,'changed');assert.equal(parses,2);
  cache.read('other',slide,[]);assert.equal(parses,3);
  cache.read('doc',{...slide,html:'changed'},[]);assert.equal(parses,3);
  cache.read('doc',{...slide,id:'two'},[]);assert.equal(parses,4);
  cache.read('other',slide,[]);assert.equal(parses,5);
  cache.clear();cache.read('other',slide,[]);assert.equal(parses,6);
 }finally{globalThis.DOMParser=original;}
});
