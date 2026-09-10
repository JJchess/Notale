import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animationSchema} from '../src/domain/model.js';
import {frames,timeline,isEntrance} from '../src/domain/timeline.js';
test('repeats and reverse participate in chained timing; object triggers remain in their chain',()=>{
 const a=animationSchema.parse({id:'a',target:'object',step:1,effect:'wipe-in',trigger:'object',triggerTarget:'button',duration:800,repeat:2,autoReverse:true,delay:200});
 const b=animationSchema.parse({...a,id:'b',trigger:'after-previous',repeat:1,autoReverse:false,delay:100});
 const cues=timeline({animations:[a,b]});assert.equal(cues[0].end,3400);assert.equal(cues[1].start,3500);assert.equal(cues[1].eventTarget,'button');
 assert.ok(isEntrance(a));assert.equal(frames(a)[1].clipPath,'inset(0 0 0 0)');
});
test('editable paths and directional exit presets retain exact author intent',()=>{
 const a=animationSchema.parse({id:'a',target:'object',step:1,effect:'motion',trigger:'click',path:[{x:0,y:0},{x:100,y:-120},{x:200,y:0}]});
 assert.equal(frames(a)[1].transform,'translate(100px,-120px)');assert.equal(frames(a)[1].offset,.5);
 assert.equal(frames({...a,effect:'wipe-out',effectDirection:'up'})[1].clipPath,'inset(0 0 100% 0)');
 assert.equal(animationSchema.safeParse({...a,repeat:0}).success,false);
});
