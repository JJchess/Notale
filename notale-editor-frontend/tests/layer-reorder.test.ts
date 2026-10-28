import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relativeLayerCommands,stackingOrder,type OrderObject,type LayerStyles} from '../src/state/layer-reorder';
import {layerRows} from '../src/state/layers';
const html='http://www.w3.org/1999/xhtml',svg='http://www.w3.org/2000/svg';
const node=(id:string,parent='root',namespace=html,tag='div'):OrderObject=>({id,parent,namespace,tag,locked:false});
function applyStyles(styles:LayerStyles,commands:ReturnType<typeof relativeLayerCommands>){const result=structuredClone(styles);for(const command of commands)if(command.type==='element.patch')Object.assign(result[command.target]??={},command.patch.style);return result;}
test('HTML block drop changes stacking without moving flow layout and preserves selection order',()=>{
 const objects:OrderObject[]=[node('root','',html),node('a'),node('b'),node('c'),node('d')],styles:LayerStyles={root:{display:'flex'},a:{'z-index':'0'},b:{'z-index':'1'},c:{'z-index':'2'},d:{'z-index':'3'}};
 const edits=relativeLayerCommands('page',objects,styles,['b','a'],'d','before');
 assert.ok(edits.length);for(const edit of edits){assert.equal(edit.type,'element.patch');if(edit.type==='element.patch')assert.deepEqual(Object.keys(edit.patch.style??{}),['z-index']);}
 const next=applyStyles(styles,edits);assert.deepEqual(stackingOrder(objects.slice(1),next).map(object=>object.id),['c','d','a','b']);
 assert.deepEqual(styles.a,{'z-index':'0'});
 const rows=layerRows(objects.map(object=>({...object,text:object.id,kind:object.tag,locked:false,attributes:{}})),next);assert.deepEqual(rows.map(row=>row.id),['root','b','a','d','c']);
});
test('reorder rejects cross-parent, normal-flow and protected descendants without partial commands',()=>{
 const objects:OrderObject[]=[node('a'),node('b'),node('else','different'),{...node('locked','a'),locked:true}],styles:LayerStyles={a:{position:'absolute'},b:{position:'absolute'},else:{position:'absolute'}};
 assert.throws(()=>relativeLayerCommands('page',objects,styles,['b'],'else','before'),/同一容器/);
 assert.throws(()=>relativeLayerCommands('page',objects,styles,['a'],'b','before'),/锁定/);
 assert.throws(()=>relativeLayerCommands('page',[node('a'),node('b')],{},['a'],'b','before'),/普通文字流/);
 assert.deepEqual(relativeLayerCommands('page',objects,styles,['b'],'b','before'),[]);
});
test('locked z-index anchors remain untouched',()=>{
 const objects:OrderObject[]=[{...node('a'),locked:true},node('b'),{...node('c'),locked:true}],styles:LayerStyles={root:{display:'grid'},a:{'z-index':'0'},b:{'z-index':'0'},c:{'z-index':'0'}};
 const edits=relativeLayerCommands('page',objects,styles,['b'],'c','before');assert.ok(edits.every(command=>command.type==='element.patch'&&command.target==='b'));
 const next=applyStyles(styles,edits);assert.deepEqual(stackingOrder(objects,next).map(object=>object.id),['a','c','b']);
});
test('SVG multi-selection is compiled into one ordered command batch, excluding definitions',()=>{
 const objects:OrderObject[]=[node('root','',svg,'svg'),node('a','root',svg,'rect'),node('defs','root',svg,'defs'),node('b','root',svg,'path'),node('c','root',svg,'g'),node('d','root',svg,'circle')];
 const edits=relativeLayerCommands('page',objects,{},['a','c'],'b','after');
 let order=['a','b','c','d'];for(const edit of edits){assert.equal(edit.type,'elements.order');if(edit.type!=='elements.order')continue;const chosen=new Set(edit.targets);assert.ok(!chosen.has('defs'));if(edit.action==='front')order=[...order.filter(id=>!chosen.has(id)),...order.filter(id=>chosen.has(id))];else for(let i=1;i<order.length;i++)if(chosen.has(order[i])&&!chosen.has(order[i-1]))[order[i-1],order[i]]=[order[i],order[i-1]];}
 assert.deepEqual(order,['a','c','b','d']);
});
