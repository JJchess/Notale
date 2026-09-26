import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNativeChartInspector,nativeChartInspectorState,type NativeChartSource} from '../src/state/native-chart-inspector';
import type {NativeChartInspection} from '@notale/editor/browser';
const result=(target='chart'):NativeChartInspection=>({target,available:true,series:[{name:'A',type:'line',data:[1,2],color:'#123456',width:2,showSymbol:true}]});
const source=():NativeChartSource=>({documentId:'doc',pageId:'page',target:'chart',runtimeId:'runtime',available:true,chart:{adapter:'echarts',option:{series:[{data:[3,4]}]}}});
test('native chart editor builds immutable series edits and preserves unpinned runtime data',async()=>{
 const state=source(),commands:any[]=[];const editor=createNativeChartInspector({source:()=>state,inspect:async()=>result(),commands:async cmds=>{commands.push(...cmds);},discovered:()=>{},supports:()=>true});
 editor.render();await editor.inspect();nativeChartInspectorState.getSnapshot().change?.({name:'Edited',width:'3',saveData:false});editor.render();assert.equal(nativeChartInspectorState.getSnapshot().draft.name,'Edited');await nativeChartInspectorState.getSnapshot().run?.('series');assert.equal(commands[0].option.series[0].name,'Edited');assert.equal(commands[0].option.series[0].data,undefined);assert.deepEqual(state.chart?.option.series?.[0].data,[3,4]);
 nativeChartInspectorState.getSnapshot().change?.({width:''});await nativeChartInspectorState.getSnapshot().run?.('series');assert.equal(commands.length,1);assert.match(nativeChartInspectorState.getSnapshot().error,/线宽/);editor.dispose();
});
test('native inspections and command callbacks are fenced to their object and runtime',async()=>{
 const state=source();let resolve!:(value:NativeChartInspection)=>void,writes=0;const editor=createNativeChartInspector({source:()=>state,inspect:async()=>new Promise(done=>{resolve=done;}),commands:async()=>{writes++;},discovered:()=>{},supports:()=>true});
 editor.render();const old=nativeChartInspectorState.getSnapshot(),reading=editor.inspect();state.target='other';state.runtimeId='replacement';editor.render();resolve(result());assert.equal(await reading,undefined);assert.equal(nativeChartInspectorState.getSnapshot().inspection,undefined);await old.run?.('reset');assert.equal(writes,0);editor.dispose();assert.equal(nativeChartInspectorState.getSnapshot().run,undefined);
});
