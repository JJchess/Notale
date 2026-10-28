import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from '../../../notale-editor-frontend/node_modules/typescript/lib/typescript.js';

// No browser, listener, fixture writes, or Motale checkout dependency. Exercise
// the host adapter with the bridge's documented synchronous event ordering.
const source=await readFile(new URL('../../../notale-editor-frontend/src/film/motale-bridge.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {MotaleBridgeSession}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function fake(){
  let committed=null,preview=null,revision=0,mode='viewer',disposed=false,sets=0;
  const listeners=new Map(),events=[];
  const emit=(type,data)=>{events.push([type,data]);for(const fn of listeners.get(type)??[])fn(data);};
  const apply=(doc,isPreview)=>{revision++;if(isPreview)preview=structuredClone(doc);else{committed=structuredClone(doc);preview=null;sets++;}emit('author',{revision,preview:isPreview});return{revision,warnings:[]};};
  const act=(id,start,end)=>({id,start,end,title:id,state:'ok',revision:'r-'+id,engine:'manim',threeD:false,objects:true,author:true,windows:true,renderAct:true});
  const hello={protocol:'motale-bridge/0',film:'f1',crossOrigin:false,transport:['direct'],stage:{width:1280,height:720,units:'px'},time:'seconds',acts:[act('a',0,4),act('b',4,8)],props:{},authorSchema:'motale-author/0',events:[]};
  const bridge={protocol:'motale-bridge/0',hello:()=>hello,objects:()=>[],windows:()=>[],regions:()=>[],objectAt:()=>null,
    author:{get:()=>structuredClone(committed),set:doc=>apply(doc,false),preview:doc=>apply(doc,true),
      check:()=>[],cancelPreview:()=>{if(preview){preview=null;revision++;emit('author',{revision,preview:false});}return{revision};},reset:()=>apply(null,false)},
    mode:value=>{if(value)mode=value;return mode;},
    state:()=>({time:0,playing:false,activeBranch:'viewer-branch',mode,authorRevision:revision,previewing:preview!==null}),
    on:(type,fn)=>{const set=listeners.get(type)??new Set();listeners.set(type,set);set.add(fn);return()=>set.delete(fn);},
    renderAct:async(actId,t)=>({canvas:{},actId,t,width:1280,height:720,caption:null,authorRevision:revision}),
    dispose:()=>{disposed=true;listeners.clear();},
  };
  return{bridge,emit,events,get sets(){return sets;},get preview(){return preview;},get disposed(){return disposed;},get subscribers(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};
}
const author={schema:'motale-author/0',film:'f1',acts:{a:{revision:'r-a',objects:{title:{x:12}}}}};
test('committed sync preserves drafts, guards synchronous echo and isolates clip instances; stale identities never apply',()=>{
  const a=fake(),b=fake(),notifications=[],issues=[];
  let current=true;
  const first=new MotaleBridgeSession(a.bridge,()=>current,(type,data)=>notifications.push([type,data]),message=>issues.push(message));
  const second=new MotaleBridgeSession(b.bridge,()=>true,()=>{},()=>{});
  first.prepare(1,author);second.prepare(1);
  const writes=a.sets,revision=a.bridge.state().authorRevision;
  assert.equal(first.context().time,1);assert.equal(first.context().instance,a.bridge);
  first.context();first.context();assert.equal(a.bridge.state().authorRevision,revision,'context reads never write');
  first.setAuthorMode(true);
  const draft=structuredClone(author);draft.acts.a.objects.title.x=70;
  first.bridge.author.preview(draft);
  first.prepare(1,structuredClone(author));
  assert.equal(a.preview.acts.a.objects.title.x,70,'render tick does not erase a draft');
  assert.equal(a.sets,writes,'equal document data is not set again');
  assert.equal(b.bridge.author.get(),null,'other clip has its own author state');
  assert.ok(notifications.filter(([type])=>type==='motale-author').every(([,data])=>data.own),'synchronous echo is marked before call returns');
  a.emit('select',{act:'a',t:0,point:{x:0,y:0},hit:{id:'old'},shift:false});
  assert.equal(notifications.filter(([type])=>type==='motale-select').length,0,'old frame event ignored');
  a.emit('select',{act:'a',t:1,point:{x:0,y:0},hit:{id:'title'},shift:true});
  assert.equal(notifications.at(-1)[1].shift,true);
  first.setAuthorMode(false);assert.equal(a.preview,null,'leaving author mode cancels transient data');
  first.prepare(4,author);assert.equal(first.context().act.id,'b');assert.equal(first.context().time,0);
  const stale=structuredClone(author);stale.acts.a.revision='old';
  first.prepare(4,stale);assert.match(first.context().error,/重新生成/);assert.equal(a.bridge.author.get(),null);
  first.setAuthorMode(true);assert.equal(a.bridge.mode(),'viewer');assert.equal(issues.length,1);
  first.prepare(4,author);assert.equal(first.context().error,undefined);
  current=false;assert.equal(first.context(),undefined);assert.throws(()=>first.bridge.author.preview(author),{code:'E_DISPOSED'});
  first.dispose();assert.equal(a.subscribers,0);assert.equal(a.disposed,true);
  assert.equal(b.disposed,false);second.dispose();
});
test('host deadline settles an unresponsive render; seek, author changes and dispose cancel old work',async()=>{
  const a=fake(),signals=[];
  a.bridge.renderAct=(_act,_time,options)=>{signals.push(options.signal);return new Promise(()=>{});};
  const session=new MotaleBridgeSession(a.bridge,()=>true,()=>{},()=>{},15);
  session.prepare(1,author);
  await assert.rejects(session.bridge.renderAct('a',1),{code:'E_ABORTED'});assert.equal(signals[0].aborted,true);
  const pending=session.bridge.renderAct('a',1);session.prepare(2,author);await assert.rejects(pending,{code:'E_ABORTED'});
  const authored=session.bridge.renderAct('a',2);session.bridge.author.preview(author);await assert.rejects(authored,{code:'E_ABORTED'});
  const disposed=session.bridge.renderAct('a',2);session.dispose();await assert.rejects(disposed,{code:'E_ABORTED'});
  assert.ok(signals.every(signal=>signal.aborted));
});
test('external author writes quarantine the instance without creating an echo loop or overwriting its data',()=>{
  const a=fake(),notifications=[],issues=[];
  const session=new MotaleBridgeSession(a.bridge,()=>true,(type,data)=>notifications.push([type,data]),message=>issues.push(message));
  session.prepare(1,author);session.setAuthorMode(true);
  const external=structuredClone(author);external.acts.a.objects.title.x=99;
  a.bridge.author.set(external);
  assert.match(session.context().error,/外部更改/);assert.equal(a.bridge.mode(),'viewer');
  session.prepare(1,author);assert.equal(a.bridge.author.get().acts.a.objects.title.x,99,'host does not silently overwrite external data');
  assert.throws(()=>session.bridge.author.preview(author),{code:'E_STALE'});
  assert.equal(issues.length,1);assert.equal(notifications.filter(([,data])=>data.own===false).length,1);
  a.bridge.author.preview(external);
  assert.equal(a.preview,null,'external transient preview is cancelled');
  assert.equal(issues.length,2);assert.equal(notifications.filter(([,data])=>data.own===false).length,2,'cancelPreview echo never recurses');
  session.dispose();
});
test('v1 normalizes capabilities and parts while preserving matrices, schema and object IDs',()=>{
  const a=fake(),hello=a.bridge.hello();a.bridge.protocol=hello.protocol='motale-bridge/1';hello.authorSchema='motale-author/1';delete hello.props;for(const act of hello.acts){delete act.author;act.engine='motion';}
  const matrix=[0,1.5,-1.5,0,600,30],pivot=[40,70],props={x:{type:'number',keyable:true,base:0,value:12},text:{type:'string',keyable:false,base:'original',value:'edited',maxLength:2000}};let options;
  a.bridge.objects=(_id,_t,value)=>{options=value;return[{id:'2:title#1',name:'Title',kind:'Text',parent:null,order:1,bounds:[0,0,100,40],visible:true,matrix,pivot,props}];};
  a.bridge.captionTrack=()=>[{act:'a',t0:0,t1:1,text:'caption'}];
  const errors=[],session=new MotaleBridgeSession(a.bridge,()=>true,()=>{},message=>errors.push(message));
  session.prepare(1,author);assert.match(session.context().error,/版本.*不兼容/);assert.equal(a.bridge.author.get(),null,'v0 author must not reach v1');assert.equal(author.schema,'motale-author/0');
  const current={schema:'motale-author/1',film:'f1',acts:{a:{revision:'r-a',objects:{'2:title#1':{text:'edited',x:12}}}}};session.prepare(1,current);assert.equal(session.context().error,undefined);assert.equal(session.context().act.author,true);
  const [object]=session.bridge.objects('a',1,{all:true,parameters:'film'});assert.equal(options.parts,true);assert.equal(options.all,undefined);assert.deepEqual(object.matrix,matrix);assert.deepEqual(object.pivot,pivot);assert.deepEqual(object.props,props);assert.equal(object.text,'edited');assert.equal(object.editable,true);
  assert.deepEqual(session.bridge.author.get(),current);assert.equal(session.bridge.captionTrack()[0].text,'caption');assert.equal(errors.length,1);
  assert.throws(()=>session.bridge.author.preview(author),{code:'E_BAD_AUTHOR'});session.dispose();
});
test('v0 normalized props sample the active preview during synchronous author echoes without migrating saved data',()=>{
  const a=fake();a.bridge.hello().props={x:{type:'number',unit:'px',default:0},color:{type:'color',default:null}};
  a.bridge.objects=()=>[{id:'Text#1',name:'Text',kind:'Text',parent:null,order:0,bounds:[0,0,20,10],visible:true,text:'base',drawn:'vector',editable:true}];
  let session,echo;
  session=new MotaleBridgeSession(a.bridge,()=>true,(type)=>{if(type==='motale-author')echo=session.bridge.objects('a',1)[0].props.x.value;},()=>{});
  const current={schema:'motale-author/0',film:'f1',acts:{a:{revision:'r-a',objects:{'Text#1':{x:{keys:[[0,0],[2,40]]}}}}}};
  session.prepare(1,current);assert.equal(echo,20);assert.equal(session.bridge.objects('a',1)[0].matrix,undefined);
  const draft=structuredClone(current);draft.acts.a.objects['Text#1'].x=70;session.bridge.author.preview(draft);assert.equal(echo,70);
  session.bridge.author.cancelPreview();assert.equal(echo,20);assert.deepEqual(session.bridge.author.get(),current);
  assert.equal(session.bridge.objects('a',1,{author:false})[0].props.x.value,0);session.dispose();
});

test('v2 retains v1 documents and exposes pure structure candidates without revision or render side effects',async()=>{
 const a=fake(),hello=a.bridge.hello();a.bridge.protocol=hello.protocol='motale-bridge/2';hello.authorSchema='motale-author/2';hello.acts[0].structure=true;
 let received;const clipboard={schema:'motale-clip/1',film:'f1',act:'a',revision:'r-a',engine:'manim',roots:[]};
 const candidate={schema:'motale-author/2',film:'f1',acts:{a:{revision:'r-a',structure:{copies:[{prefix:'p',source:'title'}]}}}};
 a.bridge.structure={copy:(_act,_ids,options)=>{received=options.author;return clipboard;},paste:()=>({author:candidate,roots:['p:title'],idMap:{title:'p:title'}}),remove:()=>({author:candidate})};
 a.bridge.objects=()=>[{id:'p:title',source:'title',can:{duplicate:true,remove:true},matrix:[1,0,0,1,0,0],props:{x:{type:'number',base:0,value:0}},bounds:[0,0,10,10]}];
 const session=new MotaleBridgeSession(a.bridge,()=>true,()=>{},()=>{}),legacy={...author,schema:'motale-author/1'};session.prepare(1,legacy);
 assert.deepEqual(session.bridge.author.get(),legacy);assert.equal(session.context().error,undefined);const revision=a.bridge.state().authorRevision,sets=a.sets;
 const pending=session.bridge.renderAct('a',1);assert.deepEqual(session.bridge.structure.copy('a',['title'],{author:null}),clipboard);assert.equal(received,null,'null starts empty even when there is a committed author');
 assert.deepEqual(session.bridge.structure.paste('a',clipboard,{author:legacy,prefix:'p'}).author,candidate);session.bridge.structure.remove('a',['title'],{author:legacy});
 await pending;assert.equal(a.bridge.state().authorRevision,revision);assert.equal(a.sets,sets);assert.equal(session.bridge.objects('a',1)[0].source,'title');
 session.prepare(1,candidate);assert.deepEqual(session.bridge.author.get(),candidate);
 assert.throws(()=>session.bridge.structure.copy('a',['title'],{author:{...legacy,film:'other'}}),{code:'E_STALE'});
 session.dispose();assert.throws(()=>session.bridge.structure.remove('a',['title']),{code:'E_DISPOSED'});
 const old=fake(),oldHello=old.bridge.hello();old.bridge.protocol=oldHello.protocol='motale-bridge/1';oldHello.authorSchema='motale-author/1';const v1=new MotaleBridgeSession(old.bridge,()=>true,()=>{},()=>{});assert.throws(()=>v1.bridge.author.set(candidate),{code:'E_BAD_AUTHOR'});v1.dispose();
});
