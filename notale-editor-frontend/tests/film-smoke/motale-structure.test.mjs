import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../../../notale-editor-frontend/node_modules/typescript/lib/typescript.js';
const moduleUrl=async path=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const format=await moduleUrl('../../../notale-format/src/film-motale.ts');
const code=ts.transpileModule((await readFile(new URL('../../../notale-editor-frontend/src/film/motale-structure.ts',import.meta.url),'utf8')).replace('@notale/editor/film',format),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {motaleStructure,motaleStructureKey}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function fixture(){
 let author,ids=['title'],locked=false,scope='a',reject=false,commits=0,cancels=0,prefix=0,reason='',lastOptions;
 const clipboard={schema:'motale-clip/1',film:'f',act:'a',revision:'r',engine:'motion',roots:[{source:'title',objects:{title:{text:'copied',x:{keys:[[0,0],[5,30]]}}},removed:[]}]};
 const context={instance:{},hello:{film:'f'},act:{id:'a',revision:'r',engine:'motion',structure:true},time:1,bridge:{mode:()=> 'author',objects:()=>[{id:'title',parent:null,can:{duplicate:true,remove:true}},{id:'child',parent:'title',can:{duplicate:'part',remove:'part'}},{id:'blocked',parent:null,can:{duplicate:true,remove:'ambiguous grab'}}],author:{check:()=>reject?[{path:'a.title',message:'rejected'}]:[],cancelPreview:()=>{cancels++;}},structure:{copy:(_a,_ids,options)=>{lastOptions=options;return structuredClone(clipboard);},paste:(_a,clip,options)=>{lastOptions=options;return{author:{schema:'motale-author/2',acts:{a:{objects:{[options.prefix+':title']:clip.roots[0].objects.title},structure:{copies:[{prefix:options.prefix,source:'title'}]}}}},roots:[options.prefix+':title'],idMap:{title:options.prefix+':title'}};},remove:()=>({author:{schema:'motale-author/2',acts:{a:{structure:{removed:['title']}}}}})}}};
 const actions=motaleStructure({context:()=>context,author:()=>author,selected:()=>ids,scope:()=>scope,locked:()=>locked,editing:()=>true,commit:value=>{author=value;commits++;return true;},select:value=>{ids=value;},report:value=>{reason=value;},prefix:()=> 'p'+(++prefix)});
 return {actions,context,get author(){return author;},get commits(){return commits;},get cancels(){return cancels;},get ids(){return ids;},set ids(value){ids=value;},get reason(){return reason;},get options(){return lastOptions;},set reject(value){reject=value;},set locked(value){locked=value;}};
}
test('copy never writes, paste/duplicate/removal each commit once; selection uses roots and curves remain intact',()=>{
 const f=fixture();assert.equal(f.actions.run('copy'),true);assert.equal(f.commits,0);assert.equal(f.cancels,0);assert.equal(f.options.author,null);
 assert.equal(f.actions.run('paste'),true);assert.equal(f.commits,1);assert.deepEqual(f.ids,['p1:title']);assert.deepEqual(f.author.acts.a.objects['p1:title'].x.keys,[[0,0],[5,30]]);assert.equal(JSON.stringify(f.author).includes('idMap'),false);
 f.ids=['title','child'];assert.equal(f.actions.run('duplicate'),true);assert.equal(f.commits,2);assert.deepEqual(f.ids,['p2:title']);f.ids=['title'];assert.equal(f.actions.run('remove'),true);assert.equal(f.commits,3);assert.deepEqual(f.ids,[]);
});
test('mixed rejection, locked edits and foreign-act paste never write or lose selection/clipboard',()=>{
 const f=fixture();f.actions.run('copy');f.ids=['title','blocked'];assert.equal(f.actions.run('cut'),false);assert.match(f.reason,/ambiguous/);assert.equal(f.commits,0);assert.equal(f.cancels,0);assert.deepEqual(f.ids,['title','blocked']);
 f.ids=['title'];f.reject=true;assert.equal(f.actions.run('cut'),false);assert.match(f.reason,/a.title.*rejected/);assert.equal(f.commits,0);f.reject=false;f.locked=true;assert.equal(f.actions.run('paste'),false);f.locked=false;
 f.context.act.id='b';assert.equal(f.actions.run('paste'),false);assert.equal(f.commits,0);f.context.act.id='a';assert.equal(f.actions.run('paste'),true,'previous clipboard survives a failed cut');
});
test('modifier keys preserve native text/alternate combinations and work on macOS',()=>{
 const key=(key,extra={})=>motaleStructureKey({key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,...extra});
 assert.equal(key('c',{ctrlKey:true}),'copy');assert.equal(key('D',{metaKey:true}),'duplicate');assert.equal(key('Delete'),'remove');assert.equal(key('Backspace'),'remove');
 for(const extra of [{ctrlKey:true,altKey:true},{ctrlKey:true,shiftKey:true},{ctrlKey:true,isComposing:true}])assert.equal(key('v',extra),undefined);
});
