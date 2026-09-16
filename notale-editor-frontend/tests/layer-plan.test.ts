import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureLayerPlan,layerPlanCommands} from '../src/state/layer-commands';
import {groupingPlan} from '../src/state/selection-commands';
const html='http://www.w3.org/1999/xhtml',svg='http://www.w3.org/2000/svg';
test('layer plans retain their source topology and request only the related CSS capture',()=>{
 const objects=[{id:'parent',tag:'div',namespace:html},{id:'a',parent:'parent',tag:'div',namespace:html},{id:'b',parent:'parent',tag:'div',namespace:html},{id:'unrelated',parent:'elsewhere',tag:'div',namespace:html}];
 const plan=captureLayerPlan('page',['a','a'],objects,'front');objects[1].parent='elsewhere';
 assert.deepEqual(plan.html,['a']);assert.deepEqual(plan.captureIds,['parent','a','b']);assert.equal(plan.objects[1].parent,'parent');
 assert.ok(layerPlanCommands(plan,{parent:{display:'flex'},a:{'z-index':'0'},b:{'z-index':'1'}}).length>0);
 assert.deepEqual(groupingPlan('group',{id:'page',groups:[]},['a','a'],objects,()=> 'group'),{kind:'commands',commands:[]});
});
test('SVG layer planning needs no runtime CSS and rejects semantic text fragments',()=>{
 const objects=[{id:'svg',tag:'svg',namespace:svg},{id:'shape',parent:'svg',tag:'path',namespace:svg},{id:'text',parent:'svg',tag:'text',namespace:svg},{id:'fragment',parent:'text',tag:'tspan',namespace:svg}];
 const plan=captureLayerPlan('page',['shape'],objects,'back');assert.deepEqual(plan.captureIds,[]);assert.deepEqual(layerPlanCommands(plan),[{type:'elements.order',slideId:'page',targets:['shape'],action:'back'}]);
 assert.throws(()=>captureLayerPlan('page',['fragment'],objects,'front'),/完整 SVG/);
});
