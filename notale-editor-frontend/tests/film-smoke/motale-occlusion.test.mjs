import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../../notale-editor/node_modules/esbuild/lib/main.js';

const bundle=await build({entryPoints:[new URL('../../../notale-editor-frontend/src/film/motale-occlusion.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});
const {motaleOcclusion,clipOcclusionPolygon}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const rect=(x=0,y=0,width=20,height=20)=>({x,y,width,height});
const quad=(x=0,y=0,width=20,height=20)=>[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
const layer=(clipId,shape=rect(),extra={})=>({clipId,title:clipId,shapes:[shape],...extra});
const target=(shape=rect(5,5,5,5),extra={})=>({clipId:'scene',actId:'act',regions:[{key:'drag',label:'Height',shape}],...extra});
const run=(layers,targets=[target()])=>motaleOcclusion({layers,targets});

test('only upper visible layers warn; compound geometry and duplicate regions do not duplicate notices',()=>{
 const input={layers:[layer('title',rect(),{title:'Title',shapes:[rect(),rect()]}),layer('scene'),layer('behind')],targets:[target(undefined,{title:'Interactive scene'}),target(undefined,{title:'Interactive scene'})]},before=structuredClone(input);
 const result=motaleOcclusion(input);
 assert.deepEqual(result,{warnings:[{clipId:'title',targetClipId:'scene',actId:'act',regionKey:'drag',regionLabel:'Height',coverTitle:'Title',targetTitle:'Interactive scene',uncertain:false}],unknown:[]});
 assert.deepEqual(input,before,'geometry and input states remain immutable');
 assert.deepEqual(run([layer('scene'),layer('title')]),{warnings:[],unknown:[]});
});

test('touching edges and subpixel slivers do not warn, while positive coverage above one square pixel does',()=>{
 const scene=layer('scene'),region=target(rect(0,0,10,100));
 assert.equal(run([layer('edge',rect(10,0,20,100)),scene],[region]).warnings.length,0);
 assert.equal(run([layer('sliver',rect(9.995,0,20,100)),scene],[region]).warnings.length,0);
 assert.equal(run([layer('cover',rect(9.98,0,20,100)),scene],[region]).warnings.length,1);
 assert.deepEqual(clipOcclusionPolygon(quad(0,0,10,10),quad(10,0,10,10)),[]);
 assert.deepEqual(run([layer('collapsed',rect(0,0,0,30)),scene]),{warnings:[],unknown:[]});
});

test('rotated polygons avoid AABB false positives and accept either winding and reflected common coordinates',()=>{
 const diamond=[{x:10,y:0},{x:20,y:10},{x:10,y:20},{x:0,y:10}],scene=layer('scene');
 assert.deepEqual(run([layer('rotated',diamond),scene],[target(rect(0,0,3,3))]),{warnings:[],unknown:[]});
 for(const points of [diamond,[...diamond].reverse()])assert.equal(run([layer('rotated',points),scene],[target(rect(9,9,2,2))]).warnings.length,1);
 // Rotate 90 degrees, mirror one axis and move both polygons far from the origin.
 const mapped=points=>points.map(({x,y})=>({x:10000-2*y,y:-5000-2*x}));
 assert.equal(run([layer('mapped',mapped(diamond)),scene],[target(mapped(quad(9,9,2,2)))]).warnings.length,1);
 assert.equal(run([layer('mapped',mapped(diamond)),scene],[target(mapped(quad(0,0,3,3)))]).warnings.length,0);
 const clipped=clipOcclusionPolygon(diamond,quad(0,0,10,10));
 assert.ok(clipped);const area=Math.abs(clipped.reduce((sum,p,i)=>{const q=clipped[(i+1)%clipped.length];return sum+p.x*q.y-p.y*q.x;},0))/2;assert.equal(area,50);
});

test('hidden, departed and fully transparent layers are irrelevant; partial opacity still overlaps',()=>{
 const hidden=[layer('hidden',rect(),{hidden:true,unknown:'loading'}),layer('departed',rect(),{active:false,unknown:'nested'}),layer('transparent',rect(),{opacity:0,uncertain:true})];
 assert.deepEqual(run([...hidden,layer('scene')]),{warnings:[],unknown:[]});
 assert.equal(run([layer('fading',rect(),{opacity:.01}),layer('scene')]).warnings.length,1);
 for(const extra of [{active:false},{hidden:true},{opacity:0}])assert.deepEqual(run([layer('cover'),layer('scene',rect(),extra)]),{warnings:[],unknown:[]});
 assert.deepEqual(run([layer('cover')]),{warnings:[],unknown:[]},'a target absent from this frame is departed');
});

test('unready, masks, nested sources and unavailable regions cannot produce a false clear state',()=>{
 const unready=run([{clipId:'loading',title:'Loading'},layer('scene')]);assert.equal(unready.warnings.length,0);assert.equal(unready.unknown.length,1);
 const masked=run([layer('masked',rect(),{uncertain:true,unknown:'complex mask'}),layer('scene')]);assert.equal(masked.warnings[0].uncertain,true);assert.equal(masked.unknown[0].reason,'complex mask');
 const nested=run([layer('nested',rect(100,100,20,20),{unknown:'nested content'}),layer('scene')]);assert.equal(nested.warnings.length,0);assert.equal(nested.unknown[0].reason,'nested content');
 assert.deepEqual(run([layer('scene'),layer('below',rect(),{unknown:'nested'})]),{warnings:[],unknown:[]},'unknown layers below the target are not blockers');
 assert.equal(run([layer('scene')],[target(undefined,{regions:undefined})]).unknown.length,1);
 assert.deepEqual(run([layer('scene')],[target(undefined,{regions:[]})]),{warnings:[],unknown:[]});
 assert.equal(run([layer('scene')],[target(undefined,{regions:[],unknown:'engine regions unavailable'})]).unknown[0].reason,'engine regions unavailable');
});

test('invalid geometry and opacity stay unknown, and explicit clipping removes discarded coverage',()=>{
 const concave=[{x:0,y:0},{x:20,y:0},{x:5,y:5},{x:20,y:20},{x:0,y:20}],crossed=[{x:0,y:0},{x:20,y:20},{x:0,y:20},{x:20,y:0}];
 for(const points of [concave,crossed,[{x:NaN,y:0},{x:20,y:0},{x:20,y:20}]]){
  assert.equal(clipOcclusionPolygon(points,quad()),undefined);
  const result=run([layer('invalid',points),layer('scene')]);assert.equal(result.warnings.length,0);assert.equal(result.unknown.length,1);
 }
 assert.equal(run([layer('scene')],[target(concave)]).unknown[0].regionKey,'drag');
 const invalidAlpha=run([layer('alpha',rect(),{opacity:NaN}),layer('scene')]);assert.equal(invalidAlpha.unknown.length,1);assert.equal(invalidAlpha.warnings[0].uncertain,true);
 const cropped=clipOcclusionPolygon(quad(),quad(12,0,8,20));assert.ok(cropped);
 assert.deepEqual(run([layer('cropped',cropped),layer('scene')]),{warnings:[],unknown:[]},'interaction region lies entirely in the cropped-away part');
});
