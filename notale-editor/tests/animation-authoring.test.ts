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

test('multi-object authoring and reorder keep click groups and authored steps coherent', async()=>{
 const {sequenceAnimations,animationOrderCommands}=await import('../../notale-editor-frontend/src/animation-authoring.js');
 const base=animationSchema.parse({id:'a',target:'one',step:1,effect:'fade-in',trigger:'click',duration:600,delay:100});
 let id=0;const makeId=()=>String(++id);
 const together=sequenceAnimations(base,['one','two'],'together',makeId);
 assert.deepEqual(timeline({animations:together}).map(c=>c.start),[100,100]);
 const after=sequenceAnimations(base,['one','two'],'after',makeId);
 assert.deepEqual(timeline({animations:after}).map(c=>c.start),[100,800]);
 const clicks=sequenceAnimations(base,['one','two'],'click',makeId);
 assert.deepEqual(clicks.map(a=>a.step),[1,2]);
 const slide={id:'slide',animations:[...clicks,{...after[1],step:2}],stepMap:[],nativeStepCount:0,components:[]} as any;
 const reordered=[slide.animations[1],slide.animations[2],slide.animations[0]];
 const edits=animationOrderCommands(slide,reordered);
 assert.deepEqual(edits.filter(c=>c.type==='animation.set').map(c=>(c as any).animation.step),[1,1,2]);
 const structured={...slide,steps:[{id:'start',name:'开始',notes:'',advanceAfter:null}]};
 assert.equal(animationOrderCommands(structured,reordered).length,1);
 assert.throws(()=>sequenceAnimations({...base,step:500},['one','two'],'click',makeId),/500/);
});
