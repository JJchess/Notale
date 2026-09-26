import {test} from 'node:test';import assert from 'node:assert/strict';import {rewriteSrcset} from '../src/domain/srcset.js';
test('srcset rewriting retains descriptors, spacing and data URL commas',()=>{
 const map=(url:string)=>url.startsWith('data:')?url:'https://example.test/'+url;
 assert.equal(rewriteSrcset('small.png 1x, large.png 2x',map),'https://example.test/small.png 1x, https://example.test/large.png 2x');
 assert.equal(rewriteSrcset('data:image/png;base64,AAAA 1x, other.png 2x',map),'data:image/png;base64,AAAA 1x, https://example.test/other.png 2x');
 assert.equal(rewriteSrcset(' first.png,  second.png 640w ',map),' https://example.test/first.png,  https://example.test/second.png 640w ');
 assert.equal(rewriteSrcset('',map),'');
});

import {references} from '../src/domain/resources.js';
import {rebaseElements} from '../src/domain/layouts.js';
import {parse,elements,attr} from '../src/domain/html.js';
test('mixed inline and file candidates are collected and rebased independently',()=>{
 const html='<img srcset="data:image/png;base64,AAAA 1x, ../media/large.png 2x">';
 assert.deepEqual(references('pages/one.html',html,'html').map(ref=>ref.path),['media/large.png']);
 const root=parse(html);rebaseElements(elements(root),'pages/one.html','nested/pages/two.html');
 assert.equal(attr(elements(root).find(el=>el.tagName==='img')!,'srcset'),'data:image/png;base64,AAAA 1x, ../../media/large.png 2x');
});
