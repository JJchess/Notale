import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tableRegion,selectedTable,type TableCell} from '../src/state/table-inspector';
test('table ranges reject partial merged cells row groups and locks',()=>{
 const cell=(id:string,row:number,column:number,extra:Partial<TableCell>={}):TableCell=>({id,row,column,rowSpan:1,colSpan:1,text:id,editable:true,group:0,...extra});
 const cells=[cell('a',0,0),cell('b',0,1),cell('c',1,0),cell('d',1,1)];
 assert.equal(tableRegion(cells,'a','d',[]).valid,true);
 assert.equal(tableRegion(cells,'a','d',[{id:'d',tag:'td',locked:true,html:''}]).valid,false);
 assert.equal(tableRegion([cells[0],{...cells[1],group:1}],'a','b',[]).valid,false);
 assert.equal(tableRegion([cell('a',0,0,{colSpan:2}),cell('b',1,0),cell('c',1,1)],'b','c',[]).valid,true);
 assert.equal(tableRegion([cell('a',0,0,{colSpan:2}),cell('b',1,0)],'a','b',[]).valid,false);
 assert.equal(selectedTable([{id:'loop',parent:'loop',tag:'td',locked:false,html:''}],['loop']),undefined);
});
