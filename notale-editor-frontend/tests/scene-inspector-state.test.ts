import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSceneInspector,sceneInspectorState,sceneDraftValues,type SceneContext,type SceneInspection} from '../src/state/scene-inspector';
const source=():SceneContext=>({documentId:'doc',pageId:'a',runtimeId:'runtime-a',target:'root',ready:true,saved:[],scenes:[{id:'demo',name:'Scene',root:'root',targets:['root'],parameters:[{key:'count',label:'数量',value:2,control:{target:'count',event:'input',min:0,max:10,step:2}},{key:'active',label:'启用',value:true},{key:'mode',label:'模式',value:'a',choices:[{label:'A',value:'a'},{label:'B',value:'b'}]}]}]});
test('scene drafts survive ordinary renders and save typed values to the captured page',async()=>{
 const state=source();let commands:any[]=[];const inspector=createSceneInspector({source:()=>state,inspect:async()=>({values:{count:4,active:false,mode:'b'}}),commands:async value=>{commands=value;},select:()=>{}});
 inspector.render();await sceneInspectorState.getSnapshot().run?.('read');sceneInspectorState.getSnapshot().change?.('count','6');inspector.render();assert.equal(sceneInspectorState.getSnapshot().draft.count,'6');await sceneInspectorState.getSnapshot().run?.('save');assert.deepEqual(commands,[{type:'scene.set',slideId:'a',sceneId:'demo',values:{count:6,active:false,mode:'b'}}]);inspector.dispose();assert.equal(sceneInspectorState.getSnapshot().run,undefined);
});
test('late scene inspections cannot update a new runtime or use an old callback',async()=>{
 const state=source();let release!:(value:SceneInspection)=>void,writes=0;const inspector=createSceneInspector({source:()=>state,inspect:async()=>new Promise(resolve=>{release=resolve;}),commands:async()=>{writes++;},select:()=>{}});
 inspector.render();const old=sceneInspectorState.getSnapshot();const reading=old.run?.('read');state.pageId='b';state.runtimeId='runtime-b';inspector.render();release({values:{count:8}});await reading;assert.equal(sceneInspectorState.getSnapshot().captured,false);assert.equal(sceneInspectorState.getSnapshot().draft.count,'2');await old.run?.('reset');assert.equal(writes,0);inspector.dispose();
});
test('scene validation rejects empty numbers, invalid choices, range and step mismatches',()=>{
 const scene=source().scenes[0];const valid={count:'2',active:true,mode:'a'};
 for(const patch of [{count:''},{count:'NaN'},{count:'12'},{count:'3'},{mode:'missing'}])assert.throws(()=>sceneDraftValues(scene,{...valid,...patch}));
 assert.deepEqual(sceneDraftValues(scene,valid),{count:2,active:true,mode:'a'});
});
