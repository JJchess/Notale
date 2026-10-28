import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {emptyFilm,parseFilmDocument,validFilmMotaleAuthor,type FilmDocument,type FilmMediaTrack,type FilmMotaleAuthor} from '../../../notale-format/src/film.js';
import {applyFilmCommands,type FilmCommand} from '../../src/film/commands.js';
import {clipSourceTime} from '../../src/film/timing.js';
function author():FilmMotaleAuthor{return {schema:'motale-author/0',film:'source-signature',acts:{sum:{revision:'revision-1',objects:{'Text#1':{x:{keys:[[1.25,0,'linear'],[3.5,120,'smooth']]},y:-20,scale:1.5,rotate:15,opacity:.5,color:{keys:[[0,'#f00','step'],[2,'#00ff00']]},visible:true}},windows:{n2:{from:1,until:8,handback:2,range:[1,2],step:.1}}}}};}
function authorV1():FilmMotaleAuthor{return {schema:'motale-author/1',film:'source-signature-v1',acts:{sum:{revision:'revision-v1',objects:{title:{text:'保存再打开',x:{keys:[[1.25,0,'linear'],[3.5,120,'smooth']]}},eq:{tex:'\\frac{1}{2}'},counter:{value:-2.5},chart:{values:[0,-1,2.5]},'title/3':{color:'#abc'}}}}};}
function fixture():FilmDocument{const doc=emptyFilm('motale-test');doc.sources=[{id:'source',kind:'motale',title:'Source',uri:'/fixture/index.html',duration:30,markers:[{id:'sum',title:'Sum',time:10,end:20}]}];(doc.tracks[0] as FilmMediaTrack).clips=[{id:'a',sourceId:'source',title:'A',at:0,in:10,duration:150},{id:'b',sourceId:'source',title:'B',at:150,in:10,duration:150}];return doc;}
const clips=(doc:FilmDocument)=>(doc.tracks[0] as FilmMediaTrack).clips;
test('Motale author JSON roundtrips per clip; command payload and sibling instances stay independent',()=>{
 const doc=fixture(),payload=author(),next=applyFilmCommands(doc,[{type:'film.motale.author',clipId:'a',author:payload}]);
 assert.deepEqual(clips(parseFilmDocument(JSON.parse(JSON.stringify(next))))[0].motale,payload);
 assert.equal(clips(next)[1].motale,undefined);assert.equal(clips(doc)[0].motale,undefined);
 payload.acts.sum.objects!['Text#1'].y=900;assert.equal(clips(next)[0].motale!.acts.sum.objects!['Text#1'].y,-20);
 const clear=applyFilmCommands(next,[{type:'film.motale.author',clipId:'a'}]);assert.equal(Object.hasOwn(clips(clear)[0],'motale'),false);assert.ok(clips(next)[0].motale);
});
test('author validation rejects malformed types, keys, interpolation and window ranges',()=>{
 const invalid:unknown[]=[null,{}, {...author(),schema:'motale-author/3'}, {...author(),extra:true}, {...author(),film:'x'.repeat(257)}];
 for(const bad of [{spin:1},{opacity:1.01},{scale:.001},{x:Infinity},{color:'red'},{visible:1},{x:{keys:[]}},{x:{keys:[[1,2],[1,3]]}},{x:{keys:[[-1,2]]}},{x:{keys:[[0,2,'bezier']]}},{x:{keys:[[0,2,undefined]]}},{color:{keys:[[0,null]]}},{visible:{keys:[[0,true,'smooth']]}}])invalid.push({schema:'motale-author/0',acts:{sum:{objects:{'Text#1':bad}}}});
 for(const bad of [{from:2,until:1},{from:1,until:1},{handback:-1},{range:[2,1]},{range:[1,1]},{range:[1,2,3]},{step:0},{unknown:1}])invalid.push({schema:'motale-author/0',acts:{sum:{windows:{n2:bad}}}});
 for(const bad of invalid)assert.equal(validFilmMotaleAuthor(bad),false,JSON.stringify(bad));
 assert.equal(validFilmMotaleAuthor({schema:'motale-author/0',acts:{sum:{windows:{n2:{from:5}}}}}),true,'partial window validation belongs to the live bridge');
 assert.equal(validFilmMotaleAuthor({schema:'motale-author/0',acts:{sum:{objects:{'Text#1':{color:null,visible:{keys:[[0,true],[1,false,'step']]}}}}}}),true);
});
test('author payloads reject pollution, getters and unbounded collections without executing accessors',()=>{
 for(const key of ['__proto__','constructor','prototype'])assert.equal(validFilmMotaleAuthor(JSON.parse(`{"schema":"motale-author/0","acts":{"sum":{"objects":{"${key}":{"x":1}}}}}`)),false);
 assert.equal(validFilmMotaleAuthor(Object.assign(Object.create({hidden:true}),author())),false);
 let read=false;const accessor={...author()};Object.defineProperty(accessor,'film',{enumerable:true,get(){read=true;return 'film';}});assert.equal(validFilmMotaleAuthor(accessor),false);assert.equal(read,false);
 assert.equal(validFilmMotaleAuthor(runInNewContext('('+JSON.stringify(author())+')')),true,'plain iframe realm objects are supported');
 assert.equal(validFilmMotaleAuthor({schema:'motale-author/0',acts:Object.fromEntries(Array.from({length:257},(_,i)=>['a'+i,{}]))}),false);
 assert.equal(validFilmMotaleAuthor({schema:'motale-author/0',acts:{sum:{objects:{o:{x:{keys:Array.from({length:10001},(_,i)=>[i,i])}}}}}}),false);
 const oversized={schema:'motale-author/0',acts:{sum:{objects:Object.fromEntries(Array.from({length:9000},(_,i)=>['o'+String(i).padStart(4,'0')+'x'.repeat(245),{x:1}]))}}};assert.equal(validFilmMotaleAuthor(oversized),false,'serialized author document has a bounded size');
});
test('invalid author commands and locked tracks reject the entire batch',()=>{
 const doc=fixture(),before=structuredClone(doc),bad={...author(),schema:'motale-author/3'} as unknown as FilmMotaleAuthor;
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.source.update',sourceId:'source',patch:{title:'changed'}},{type:'film.motale.author',clipId:'a',author:bad}]),/Invalid Motale/);assert.deepEqual(doc,before);
 const locked=applyFilmCommands(doc,[{type:'film.track.update',trackId:'v1',patch:{locked:true}}]);assert.throws(()=>applyFilmCommands(locked,[{type:'film.motale.author',clipId:'a',author:author()}]),/locked/);
 const native=fixture();native.sources[0].kind='video';assert.throws(()=>applyFilmCommands(native,[{type:'film.motale.author',clipId:'a',author:author()}]),/Motale source/);
 clips(native)[0].motale=author();assert.throws(()=>parseFilmDocument(native),/Invalid Motale/);
});
test('v1 content roundtrips independently beside unchanged v0 author data',()=>{
 const legacy=author(),payload=authorV1(),doc=applyFilmCommands(fixture(),[{type:'film.motale.author',clipId:'a',author:legacy},{type:'film.motale.author',clipId:'b',author:payload}]);
 const reopened=parseFilmDocument(JSON.parse(JSON.stringify(doc)));
 assert.deepEqual(clips(reopened)[0].motale,legacy,'v0 schema, IDs and source-act key times are not migrated');
 assert.deepEqual(clips(reopened)[1].motale,payload,'v1 named and child IDs remain exact');
 payload.acts.sum.objects!.chart.values![0]=999;
 assert.deepEqual(clips(doc)[1].motale!.acts.sum.objects!.chart.values,[0,-1,2.5],'command payload arrays are cloned');
 for(const commands of [[{type:'film.clip.split',clipId:'b',at:210,rightId:'right'}],[{type:'film.clip.trim',clipId:'b',edge:'in',delta:30}]] satisfies FilmCommand[][]){
  const changed=applyFilmCommands(reopened,commands),at240=clips(changed).find(c=>c.at<=240&&c.at+c.duration>240)!;
  assert.deepEqual(at240.motale,clips(reopened)[1].motale);assert.equal(clipSourceTime(at240,240-at240.at,changed.frameRate),13);assert.equal(at240.animationOffset,undefined);
 }
});
test('v1 content validates static types and bounded sizes without enabling content in v0',()=>{
 const payload=(object:unknown,schema='motale-author/1')=>({schema,acts:{sum:{objects:{o:object}}}});
 const valid:unknown[]=[{text:'',tex:'',value:0,values:[]},{text:'x'.repeat(2000),tex:'x'.repeat(2000),value:-Number.MAX_VALUE,values:[Number.MIN_VALUE,Number.MAX_VALUE]},{values:Array<number>(10000).fill(0)}];
 for(const object of valid)assert.equal(validFilmMotaleAuthor(payload(object)),true);
 for(const [name,data] of Object.entries({text:'saved',tex:'x^2',value:1,values:[1]})){
  assert.equal(validFilmMotaleAuthor(payload({[name]:data},'motale-author/0')),false,`${name} cannot reinterpret a v0 author document`);
  assert.equal(validFilmMotaleAuthor(payload({[name]:{keys:[[0,data]]}})),false,`${name} is not keyable`);
  assert.equal(validFilmMotaleAuthor(payload({[name]:null})),false);
  assert.equal(validFilmMotaleAuthor(payload({[name]:undefined})),false);
 }
 const invalid:unknown[]=[{text:'x'.repeat(2001)},{tex:'x'.repeat(2001)},{text:42},{tex:[]},{value:'1'},{value:NaN},{value:Infinity},{values:[1,NaN]},{values:[1,-Infinity]},{values:['1']},{values:{0:1,length:1}},{values:Array<number>(10001).fill(0)},{content:'unknown'}];
 for(const object of invalid)assert.equal(validFilmMotaleAuthor(payload(object)),false);
 const bounded:FilmMotaleAuthor={schema:'motale-author/1',acts:{sum:{objects:Object.fromEntries(Array.from({length:10},(_,i)=>['chart'+i,{values:Array<number>(10000).fill(0)}]))}}};
 assert.equal(validFilmMotaleAuthor(bounded),true);bounded.acts.sum.objects!.extra={values:[1]};assert.equal(validFilmMotaleAuthor(bounded),false,'100k numbers limit applies across objects');
});
test('v1 numeric content rejects sparse/accessor arrays and invalid commands atomically',()=>{
 const payload=(values:unknown)=>({schema:'motale-author/1',acts:{sum:{objects:{chart:{values}}}}});
 let read=false;const accessor=[1];Object.defineProperty(accessor,'0',{enumerable:true,get(){read=true;return 1;}});
 const extra=[1];Object.defineProperty(extra,'extra',{value:1});
 for(const values of [new Array<number>(1),accessor,extra])assert.equal(validFilmMotaleAuthor(payload(values)),false);
 assert.equal(read,false,'array accessors are never evaluated');
 assert.equal(validFilmMotaleAuthor(runInNewContext('('+JSON.stringify(authorV1())+')')),true,'v1 arrays from the iframe realm are accepted');
 const doc=applyFilmCommands(fixture(),[{type:'film.motale.author',clipId:'a',author:authorV1()}]),before=structuredClone(doc),bad=authorV1();bad.acts.sum.objects!.title.text='x'.repeat(2001);
 assert.throws(()=>applyFilmCommands(doc,[{type:'film.source.update',sourceId:'source',patch:{title:'changed'}},{type:'film.motale.author',clipId:'b',author:bad}]),/Invalid Motale/);assert.deepEqual(doc,before);
 const locked=applyFilmCommands(doc,[{type:'film.track.update',trackId:'v1',patch:{locked:true}}]);assert.throws(()=>applyFilmCommands(locked,[{type:'film.motale.author',clipId:'a',author:authorV1()}]),/locked/);
});
test('split, head trim and copied clips retain source-act keys without shifting their clock',()=>{
 const payload=author(),doc=applyFilmCommands(fixture(),[{type:'film.motale.author',clipId:'a',author:payload}]);
 const edits:FilmCommand[][]=[[{type:'film.clip.split',clipId:'a',at:60,rightId:'right'}],[{type:'film.clip.trim',clipId:'a',edge:'in',delta:30}]];
 for(const commands of edits){const changed=applyFilmCommands(doc,commands),at90=clips(changed).find(c=>c.at<=90&&c.at+c.duration>90)!;assert.deepEqual(at90.motale,payload);assert.equal(clipSourceTime(at90,90-at90.at,changed.frameRate),13);assert.equal(at90.animationOffset,undefined);}
 const copied=applyFilmCommands(doc,[{type:'film.clip.add',trackId:'v1',clip:{...structuredClone(clips(doc)[0]),id:'copy',at:300}}]);assert.deepEqual(clips(copied)[2].motale,payload);
 const split=applyFilmCommands(doc,edits[0]);const replacement=author();replacement.acts.sum.objects!['Text#1'].x=500;const edited=applyFilmCommands(split,[{type:'film.motale.author',clipId:'right',author:replacement}]);assert.deepEqual(clips(edited).find(c=>c.id==='a')!.motale,payload);assert.deepEqual(clips(doc)[0].motale,payload);
});

test('v2 structure persists, splits and restores independently without storing a dynamic ID map',()=>{
 const payload=authorV1();payload.schema='motale-author/2';payload.acts.sum.structure={copies:[{prefix:'p1',source:'title'},{prefix:'p1',source:'chart'}],removed:['title','p1:chart/2']};payload.acts.sum.objects!['p1:title']={text:'独立副本',x:{keys:[[0,10],[4,70]]}};
 const original=fixture(),next=applyFilmCommands(original,[{type:'film.motale.author',clipId:'a',author:payload}]);
 const opened=parseFilmDocument(JSON.parse(JSON.stringify(next)));assert.deepEqual(clips(opened)[0].motale,payload);assert.equal(clips(opened)[1].motale,undefined);
 const split=applyFilmCommands(opened,[{type:'film.clip.split',clipId:'a',at:60,rightId:'right'}]);assert.deepEqual(clips(split).find(c=>c.id==='right')!.motale,payload);
 const copied=applyFilmCommands(opened,[{type:'film.clip.add',trackId:'v1',clip:{...structuredClone(clips(opened)[0]),id:'copy',at:300}}]);
 const edited=structuredClone(payload);edited.acts.sum.structure!.copies!.pop();edited.acts.sum.objects!['p1:title'].text='改变副本';
 const changed=applyFilmCommands(copied,[{type:'film.motale.author',clipId:'copy',author:edited}]);assert.deepEqual(clips(changed)[0].motale,payload);
 const undo=applyFilmCommands(changed,[{type:'film.document.restore',document:copied,expected:changed}]);assert.deepEqual(undo,copied);
 payload.acts.sum.structure!.removed!.push('chart');assert.equal(clips(next)[0].motale!.acts.sum.structure!.removed!.length,2);
});
test('v2 structure strictly bounds copy/removal records and rejects an entire malformed batch',()=>{
 const doc=(structure:unknown,schema='motale-author/2')=>({schema,acts:{sum:{structure}}});
 assert.equal(validFilmMotaleAuthor(doc({copies:[{prefix:'p',source:'title'},{prefix:'p',source:'chart'}],removed:['p:title/3']})),true);
 const invalid:unknown[]=[{copies:[{prefix:'2bad',source:'title'}]},{copies:[{prefix:'a'.repeat(33),source:'title'}]},{copies:[{prefix:'p',source:'__proto__'}]},{copies:[{prefix:'p',source:'title',idMap:{}}]},{copies:[{prefix:'p',source:'title'},{prefix:'p',source:'title'}]},{removed:['title','title']},{removed:['constructor']},{removed:new Array(1)},{removed:Array.from({length:257},(_,i)=>'o'+i)},{copies:Array.from({length:65},(_,i)=>({prefix:'p'+i,source:'title'}))},{unknown:[]},null];
 for(const value of invalid)assert.equal(validFilmMotaleAuthor(doc(value)),false,JSON.stringify(value));
 for(const schema of ['motale-author/0','motale-author/1'])assert.equal(validFilmMotaleAuthor(doc({},schema)),false);
 let read=false;const copy={source:'title'};Object.defineProperty(copy,'prefix',{enumerable:true,get(){read=true;return 'p';}});assert.equal(validFilmMotaleAuthor(doc({copies:[copy]})),false);assert.equal(read,false);
 const before=fixture();assert.throws(()=>applyFilmCommands(before,[{type:'film.source.update',sourceId:'source',patch:{title:'changed'}},{type:'film.motale.author',clipId:'a',author:doc(invalid[0]) as FilmMotaleAuthor}]),/Invalid Motale/);assert.equal(before.sources[0].title,'Source');
});
