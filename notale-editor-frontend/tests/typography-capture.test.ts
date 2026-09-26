import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TypographyCapture} from '../src/state/typography-capture';
test('typography capture isolates ids and ignores obsolete success and errors',async()=>{
 let key='a';const pending:{resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[];const capture=new TypographyCapture({key:()=>key,capture:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 const ids=['a'],old=capture.read(ids);ids[0]='changed';key='b';const next=capture.read(['b']);pending[0].reject(new Error('old'));assert.equal(await old,undefined);pending[1].resolve({computedStyles:{b:{'font-size':'24px'}}});assert.equal((await next)?.fields['font-size'].value,'24');
 const last=capture.read(['b']);capture.dispose();pending[2].resolve({computedStyles:{b:{'font-size':'99px'}}});assert.equal(await last,undefined);
});
