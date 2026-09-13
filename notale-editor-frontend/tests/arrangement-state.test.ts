import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindArrangement,arrangementState,changeArrangement,arrangementSettings} from '../src/state/arrangement';
test('arrangement defaults follow selection units and stale actions cannot arrange another selection',async()=>{
 let scope='a',calls=0;const controller=bindArrangement({scope:()=>scope,arrange:async()=>{calls++;}});
 controller.update({scope,units:1,disabled:false});assert.equal(arrangementState.getSnapshot().reference,'slide');changeArrangement({reference:'selection',angle:'',factor:'-1'});controller.update({scope,units:1,disabled:false});assert.equal(arrangementState.getSnapshot().reference,'selection');assert.doesNotThrow(()=>arrangementSettings('left'));assert.throws(()=>arrangementSettings('rotate'));assert.throws(()=>arrangementSettings('scale'));
 const old=arrangementState.getSnapshot();await old.run?.('distribute-x');assert.equal(calls,0);scope='b';await old.run?.('left');assert.equal(calls,0);controller.update({scope,units:3,disabled:false});await arrangementState.getSnapshot().run?.('distribute-x');assert.equal(calls,1);controller.dispose();
});
test('layer buttons use the layer action and respect disabled selections',async()=>{
 const layers:string[]=[];const controller=bindArrangement({scope:()=> 'selection',arrange:async()=>{throw Error('wrong action route');},layer:async action=>{layers.push(action);}});
 controller.update({scope:'selection',units:1,disabled:true});await arrangementState.getSnapshot().run?.('front');assert.deepEqual(layers,[]);
 controller.update({scope:'selection',units:1,disabled:false});await arrangementState.getSnapshot().run?.('forward');assert.deepEqual(layers,['forward']);controller.dispose();
});
