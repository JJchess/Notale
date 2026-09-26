import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layerRows,type LayerObject} from '../src/state/layers';
const object=(id:string,parent?:string,attributes:Record<string,string>={}):LayerObject=>({id,parent,attributes,tag:'span',text:id,kind:'element',locked:false});
test('layer hierarchy keeps atomic roots, excludes their internals and terminates cycles',()=>{
 const rows=layerRows([object('stage',undefined,{id:'stage'}),object('formula','stage',{'data-notale-tex':'x'}),object('glyph','formula'),object('text','stage',{'data-notale-name':'用户名称'}),object('loop-a','loop-b'),object('loop-b','loop-a')]);
 assert.deepEqual(rows.map(row=>row.id),['formula','text']);assert.equal(rows[1].label,'用户名称');assert.equal(rows[1].depth,1);assert.match(rows[1].search,/用户名称/);
});

test('line break nodes stay in document content but not the layer list',()=>{
 const objects:LayerObject[]=[{...object('heading'),tag:'h1'}, {...object('break','heading'),tag:'br',text:''}, {...object('optional-break','heading'),tag:'wbr',text:''}, {...object('inline','heading'),tag:'span',text:'Emphasis'}, {...object('vector-text'),tag:'text',text:'SVG label'}];
 assert.deepEqual(layerRows(objects).map(row=>row.id),['heading','inline','vector-text']);
 assert.equal(objects.length,5);
});
