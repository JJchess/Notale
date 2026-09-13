import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AppearanceCapture} from '../src/state/appearance-capture';
test('appearance capture rejects old results failures and disposed instances',async()=>{
 let key='one';const requests:{resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[],accepted:any[]=[];
 const capture=new AppearanceCapture({key:()=>key,capture:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),accept:value=>accepted.push(value)});
 const object={id:'one',tag:'div',locked:false,style:{'background-color':'#112233'},attributes:{}};
 const old=capture.read([object]);key='two';const next=capture.read([{...object,id:'two'}]);requests[1].resolve({computedStyles:{two:{'background-color':'#abcdef'}}});await next;requests[0].reject(new Error('old'));await old;assert.equal(accepted.length,1);assert.equal(accepted[0].fields['appearance-fill'],'#abcdef');
 const pending=capture.read([object]);capture.dispose();requests[2].resolve({computedStyles:{}});await pending;assert.equal(accepted.length,1);
});
