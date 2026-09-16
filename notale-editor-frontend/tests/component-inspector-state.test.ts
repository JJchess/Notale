import {test} from 'node:test';
import assert from 'node:assert/strict';
import {componentSchema} from '@notale/editor/browser';
import {createComponentInspector,componentInspectorState} from '../src/state/component-inspector';
test('component form preserves unrelated drafts, detects conflicts and rejects stale document actions',async()=>{
 let documentId='one';const component=componentSchema.parse({id:'component',root:'root',name:'Original',initial:'base',states:[{id:'base',name:'Base',patches:{}}]});
 const page={id:'page',components:[component]} as any,doc={id:documentId,componentLibrary:[],slides:[page]} as any;let sent=0;
 const binding=createComponentInspector({slide:()=>page,document:()=>({...doc,id:documentId}),objects:()=>[{id:'root',tag:'section',text:''},{id:'text',parent:'root',tag:'p',text:'Hello'}],selected:()=>['root'],choose:()=>{},capture:async()=>({rectangles:[],computedStyles:{}}),openPage:async()=>{},commands:async commands=>{sent++;for(const command of commands)if(command.type==='component.set')page.components=[command.component];},preview:()=>{},error:()=>{}});
 binding.render();componentInspectorState.getSnapshot().change!('author-component-name','Draft');binding.render();assert.equal(componentInspectorState.getSnapshot().controls['author-component-name'].value,'Draft');
 componentInspectorState.getSnapshot().change!('author-target','text');assert.equal(componentInspectorState.getSnapshot().controls['author-component-name'].value,'Draft');
 await componentInspectorState.getSnapshot().run!('author-patch-save');assert.equal(sent,1);assert.equal(componentInspectorState.getSnapshot().controls['author-component-name'].value,'Draft');
 page.components[0]={...page.components[0],duration:500};binding.render();await componentInspectorState.getSnapshot().run!('author-behavior-save');assert.equal(sent,1);assert.match(componentInspectorState.getSnapshot().error,/已变化/);
 componentInspectorState.getSnapshot().reset!();assert.equal(componentInspectorState.getSnapshot().controls['author-component-name'].value,'Original');
 const stale=componentInspectorState.getSnapshot().run!;documentId='two';binding.render();await stale('author-behavior-save');assert.equal(sent,1);binding.dispose();
});
