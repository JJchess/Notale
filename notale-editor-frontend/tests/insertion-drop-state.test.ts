import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindInsertionDrop,insertionDropState} from '../src/state/insertion-drop';
test('insertion drops capture the destination and ignore cancelled or superseded drags',async()=>{
 let scope='page-a';const writes:any[]=[],errors:string[]=[];const controller=bindInsertionDrop({scope:()=>scope,bounds:()=>({left:1,top:2,width:100,height:80}),insert:async(...args)=>{writes.push(args);},error:cause=>errors.push(String(cause))});
 controller.show(true);const first=insertionDropState.getSnapshot();scope='page-b';await first.drop?.('{"kind":"text"}',20,30);assert.equal(writes.length,0);assert.match(errors[0],/页面已切换/);assert.equal(insertionDropState.getSnapshot().visible,false);
 controller.show(true);const cancelled=insertionDropState.getSnapshot();controller.show(false);await cancelled.drop?.('{"kind":"text"}',20,30);assert.equal(writes.length,0);
 controller.show(true);await insertionDropState.getSnapshot().drop?.('{"kind":"text"}',20,30);assert.deepEqual(writes,[['text',undefined,{x:20,y:30}]]);controller.dispose();assert.equal(insertionDropState.getSnapshot().visible,false);
});
