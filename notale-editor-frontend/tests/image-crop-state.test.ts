import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveCrop,nudgeCrop} from '../src/state/image-crop';
test('crop movement preserves size and clamps edge and keyboard changes',()=>{
 const crop={top:10,right:20,bottom:30,left:40};
 assert.deepEqual(moveCrop(crop,100,-100),{top:0,right:0,bottom:40,left:60});
 assert.deepEqual(crop,{top:10,right:20,bottom:30,left:40});
 assert.equal(moveCrop(crop,200,0,'left').left,79);
 assert.equal(nudgeCrop(crop,'right','ArrowRight',true)?.right,10);
 assert.equal(nudgeCrop(crop,'bottom','ArrowDown')?.bottom,29);
 assert.equal(nudgeCrop(crop,'bottom','ArrowRight'),undefined);
 assert.deepEqual(moveCrop(crop,Infinity,0),crop);
});
