import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkAttributes} from '../src/state/link-editor';
test('link addresses accept common domain input and reject unsupported or malformed schemes',()=>{
 const attrs=(url:string)=>linkAttributes({} as any,{} as any,{kind:'url',pageId:'',url});
 assert.equal(attrs('example.com/lesson?step=1').href,'https://example.com/lesson?step=1');
 assert.equal(attrs('example.com:8080/a').href,'https://example.com:8080/a');
 assert.equal(attrs(' https://example.com/a ').href,'https://example.com/a');
 assert.equal(attrs('mailto:teacher@example.com').href,'mailto:teacher@example.com');
 assert.equal(attrs('tel:+123456').href,'tel:+123456');
 for(const url of ['', 'not a url','javascript:alert(1)','data:text/html,hello','file:///tmp/a'])assert.throws(()=>attrs(url),/请输入/);
});
