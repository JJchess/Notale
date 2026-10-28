import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../../notale-editor/node_modules/esbuild/lib/main.js';
const bundle=await build({entryPoints:[new URL('../../../notale-editor-frontend/src/film/motale-handles-geometry.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});
const {transformMotaleSelection,motaleSelectionRoots,motaleSelectionPivot,inverseMotalePoint,transformMotalePoint}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function object(id,parent,matrix,pivot,values={},bounds=[pivot[0]-5,pivot[1]-5,pivot[0]+5,pivot[1]+5]){return{id,parent,matrix,pivot,bounds,visible:true,editable:true,name:id,kind:'Shape',order:1,text:null,drawn:'vector',props:Object.fromEntries(Object.entries({x:0,y:0,scale:1,rotate:0,...values}).map(([name,value])=>[name,{type:'number',base:name==='scale'?1:0,value,keyable:true,...(name==='scale'?{min:.01}:{})}]))};}
test('v1 child movement uses rotated/scaled parent inverse; keys stay keyed and parent+child never transform twice',()=>{
  const parent=object('group',null,[0,1.5,-1.5,0,500,20],[300,250],{scale:1.5,rotate:90}),child=object('child','group',[0,1.5,-1.5,0,500,20],[400,300],{x:10,y:20});
  const author={schema:'motale-author/1',acts:{flat:{objects:{group:{scale:1.5,rotate:90},child:{x:{keys:[[0,0,'smooth'],[2,20]]},y:20,text:'keep'}}}}};
  const next=transformMotaleSelection(author,'flat',1,[parent,child],['child'],{dx:40,dy:-25,scale:1,rotate:0},[]),props=next.acts.flat.objects.child;
  close(props.x.keys.find(key=>key[0]===1)[1],10-25/1.5);close(props.y,20-40/1.5);assert.deepEqual(props.x.keys[0],[0,0,'smooth']);assert.equal(props.text,'keep');assert.deepEqual(next.acts.flat.objects.group,author.acts.flat.objects.group);
  assert.deepEqual(motaleSelectionRoots([parent,child],['group','child']).map(object=>object.id),['group']);
  const group=transformMotaleSelection(author,'flat',1,[parent,child],['group','child'],{dx:5,dy:0,scale:2,rotate:30},[]);
  assert.deepEqual(group.acts.flat.objects.child,author.acts.flat.objects.child);close(group.acts.flat.objects.group.scale,3);close(group.acts.flat.objects.group.rotate,120);
});
test('single asymmetrical objects use the public pivot; mixed-parent groups preserve their shared center',()=>{
  const one=object('one',null,[1,0,0,1,0,0],[20,10],{},[0,0,100,80]),author={schema:'motale-author/1',acts:{flat:{objects:{one:{text:'content'}}}}};
  assert.deepEqual(motaleSelectionPivot([one]),{x:20,y:10});
  const rotated=transformMotaleSelection(author,'flat',0,[one],['one'],{dx:0,dy:0,scale:2,rotate:90},[]).acts.flat.objects.one;
  assert.equal(rotated.x,undefined);assert.equal(rotated.y,undefined);assert.equal(rotated.scale,2);assert.equal(rotated.rotate,90);assert.equal(rotated.text,'content');
  const parent=object('parent',null,[0,2,-2,0,10,20],[200,200]),a=object('a','parent',[0,2,-2,0,10,20],[100,200]),b=object('b',null,[1,0,0,1,0,0],[300,200]);
  const group=transformMotaleSelection({schema:'motale-author/1',acts:{}},'flat',0,[parent,a,b],['a','b'],{dx:0,dy:0,scale:2,rotate:90},[]).acts.flat.objects;
  close(group.a.x,-100);close(group.a.y,-50);close(group.b.x,-100);close(group.b.y,200);assert.equal(group.parent,undefined);
  const matrix={a:0,b:.75,c:-1.5,d:0,e:80,f:120},point={x:400,y:200};const restored=inverseMotalePoint(matrix,transformMotalePoint(matrix,point));close(restored.x,point.x);close(restored.y,point.y);
});
