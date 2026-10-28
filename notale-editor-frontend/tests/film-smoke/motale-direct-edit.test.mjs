import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../../notale-editor/node_modules/esbuild/lib/main.js';
import {mkdir} from 'node:fs/promises';
const root=new URL('../../../',import.meta.url).pathname,out=root+'.local/motale-film/direct-edit-unit/';await mkdir(out,{recursive:true});
await build({entryPoints:['motale-keyframes','motale-handles-geometry'].map(n=>root+'notale-editor-frontend/src/film/'+n+'.ts'),outdir:out,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},alias:{'@notale/editor/film':root+'notale-editor/src/film/index.ts','@notale/format/film':root+'notale-format/src/film.ts'}});
const {motaleKeyFrames,writeMotaleValue,editMotaleKey}=await import(out+'motale-keyframes.mjs');
const {transformMotaleSelection,motaleSelectionRoots,inverseMotalePoint,transformMotalePoint}=await import(out+'motale-handles-geometry.mjs');
const rate={numerator:30,denominator:1},clip={id:'c',sourceId:'s',title:'clip',at:90,in:10,duration:120};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
test('source seconds invert rate, reverse, offset, repeated maps and held ranges without inventing jump frames',()=>{
 near(motaleKeyFrames(clip,rate,12)[0],60);
 near(motaleKeyFrames({...clip,in:14,timing:{rate:-1}},rate,12)[0],60);
 near(motaleKeyFrames({...clip,animationOffset:30,timing:{map:[{frame:0,value:8},{frame:120,value:12}]}},rate,10)[0],30);
 const repeated=motaleKeyFrames({...clip,timing:{map:[{frame:0,value:10},{frame:60,value:14},{frame:120,value:10}]}},rate,12);assert.equal(repeated.length,2);near(repeated[0],30);near(repeated[1],90);
 assert.deepEqual(motaleKeyFrames({...clip,timing:{map:[{frame:0,value:10,easing:'hold'},{frame:60,value:12}]}},rate,11),[]);
 const held=motaleKeyFrames({...clip,timing:{map:[{frame:0,value:10,easing:'hold'},{frame:60,value:12}]}},rate,10,20);assert.ok(held.some(f=>Math.abs(f-20)<1e-4));
 assert.deepEqual(motaleKeyFrames({...clip,timing:{rate:0}},rate,10,37),[37]);assert.deepEqual(motaleKeyFrames(clip,rate,16),[]);
});
test('editing a key preserves other values/easing, rejects collisions and keeps last value on delete',()=>{
 const props={x:{keys:[[0,0,'smooth'],[1,10,'step']]},y:7};writeMotaleValue(props,'x',8,.5);assert.deepEqual(props.x.keys,[[0,0,'smooth'],[.5,8,'linear'],[1,10,'step']]);
 editMotaleKey(props,'x',.5,{time:.6,easing:'smooth'});const before=structuredClone(props);assert.throws(()=>editMotaleKey(props,'x',.6,{time:1}),/已有关键帧/);assert.deepEqual(props,before);
 editMotaleKey(props,'x',.6,null);assert.equal(props.y,7);const single={visible:{keys:[[0,false,'step']]}};editMotaleKey(single,'visible',0,null);assert.equal(single.visible,false);
});
const object=(id,bounds,parent=null)=>({id,bounds,parent,editable:true,visible:true,kind:'rectangle',name:id,text:null,drawn:'canvas',order:0});
test('group transforms share a pivot, preserve keyed values, filter selected descendants and invert clip transforms',()=>{
 const objects=[object('a',[0,0,20,20]),object('b',[40,0,60,20])],author={schema:'motale-author/0',acts:{act:{objects:{}}}},before=structuredClone(author);
 const scale=transformMotaleSelection(author,'act',0,objects,['a','b'],{dx:0,dy:0,scale:2,rotate:0},objects).acts.act.objects;near(scale.a.x,-20);near(scale.b.x,20);assert.equal(scale.a.scale,2);
 const rotation=transformMotaleSelection(author,'act',0,objects,['a','b'],{dx:0,dy:0,scale:1,rotate:90},objects).acts.act.objects;near(rotation.a.x,20);near(rotation.a.y,-20);near(rotation.b.x,-20);near(rotation.b.y,20);assert.equal(rotation.b.rotate,90);assert.deepEqual(author,before);
 assert.deepEqual(motaleSelectionRoots([...objects,object('child',[2,2,8,8],'a')],['a','child']).map(o=>o.id),['a']);
 const keyed={schema:'motale-author/0',acts:{act:{objects:{a:{x:{keys:[[0,0,'smooth'],[1,10,'step']]}}}}}};const moved=transformMotaleSelection(keyed,'act',.5,objects,['a'],{dx:5,dy:0,scale:1,rotate:0},objects);assert.deepEqual(moved.acts.act.objects.a.x.keys,[[0,0,'smooth'],[.5,10,'linear'],[1,10,'step']]);
 const matrix={a:0,b:.5,c:-.5,d:0,e:700,f:50},point={x:82,y:39},back=inverseMotalePoint(matrix,transformMotalePoint(matrix,point));near(back.x,point.x);near(back.y,point.y);
});
