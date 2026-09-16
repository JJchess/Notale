import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableCommands} from '../src/state/table-commands';
test('table border commands preserve inner edges and validate locked selection',()=>{
 const cells=[0,1,2].map(column=>({id:String(column),row:0,column,rowSpan:1,colSpan:1,text:'',editable:true,group:0}));
 const source={slideId:'page',table:{id:'table',tag:'table',html:'',locked:false},cells,chosen:'0',rangeEnd:'2',objects:[]};
 const commands=tableCommands(source,{kind:'border',mode:'outer',width:'2',color:'#123456'}) as any[];
 assert.equal(commands.length,3);assert.equal(commands[1].patch.style['border-left-style'],undefined);assert.equal(commands[1].patch.style['border-top-width'],'2px');
 assert.throws(()=>tableCommands(source,{kind:'text',value:'x'}),/单个/);
 assert.deepEqual(tableCommands({...source,rangeEnd:''},{kind:'text',value:''}),[]);
 assert.throws(()=>tableCommands(source,{kind:'font',value:'NaN'}),/字号/);
 assert.throws(()=>tableCommands({...source,table:{...source.table,locked:true}},{kind:'structure',action:'merge'}),/可编辑/);
 assert.equal((tableCommands(source,{kind:'structure',action:'merge'})[0] as any).colSpan,3);
});
