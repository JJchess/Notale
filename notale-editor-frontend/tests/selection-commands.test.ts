import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSelectionEditable,deleteSelectionCommands,groupingPlan} from '../src/state/selection-commands';
const objects=[{id:'parent',tag:'div'},{id:'child',parent:'parent',tag:'p'},{id:'other',tag:'p'}];
test('delete planning removes duplicate descendants without depending on a live canvas',()=>{
 assert.deepEqual(deleteSelectionCommands('page',['child','parent','parent','other'],objects),[{type:'element.delete',slideId:'page',target:'parent'},{type:'element.delete',slideId:'page',target:'other'}]);
 assert.throws(()=>deleteSelectionCommands('page',['missing'],objects),/已变化/);
 assert.throws(()=>assertSelectionEditable(['parent'],objects.map(o=>({...o,locked:o.id==='child'}))),/锁定/);
});
test('group planning returns document commands or an explicit vector runtime action',()=>{
 const slide={id:'page',groups:[{id:'group',name:'组合',members:['parent','other']}]};
 const targets=['parent','other'];const plan=groupingPlan('group',slide,targets,objects,()=> 'new');targets.length=0;
 assert.deepEqual(plan,{kind:'commands',commands:[{type:'group.set',slideId:'page',id:'new',name:'组合',members:['parent','other']}]});
 assert.deepEqual(groupingPlan('ungroup',slide,['other'],objects,()=> ''),{kind:'commands',commands:[{type:'group.remove',slideId:'page',id:'group'}]});
 assert.deepEqual(groupingPlan('group',slide,['parent','other'],objects.map(o=>({...o,namespace:'http://www.w3.org/2000/svg'})),()=> ''),{kind:'canvas',action:'group'});
});
