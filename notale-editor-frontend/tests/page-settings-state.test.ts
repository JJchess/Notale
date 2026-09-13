import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageSettings,pageSettingsState,pageSettingsActions} from '../src/page-settings';
test('page settings preserve unrelated changes and reject conflicting fields or changed documents',async()=>{
 const page={id:'page',name:'原名',section:'章节',hidden:false,transition:'none',advanceAfter:0},doc={id:'doc',slides:[page],layouts:[]};const calls:any[]=[];
 const controller=createPageSettings({document:()=>doc as any,current:()=>page.id,commands:async cmds=>{calls.push(...cmds);},editMaster:async()=>{}});controller.open();const source=pageSettingsState.getSnapshot()!;
 const draft={name:'新名',section:'章节',hidden:false,transition:'none' as const,advanceAfter:0};page.section='外部章节';await pageSettingsActions.save(source,draft);assert.deepEqual(calls[0].patch,{name:'新名'});
 await assert.rejects(pageSettingsActions.save(source,{...draft,advanceAfter:3600001}),/0–3600/);assert.equal(calls.length,1);page.name='外部名称';await assert.rejects(pageSettingsActions.save(source,draft),/已被更新/);assert.equal(calls.length,1);
 doc.id='other';await assert.rejects(pageSettingsActions.save(source,draft),/讲义已变化/);assert.equal(calls.length,1);pageSettingsState.set(undefined);
});
