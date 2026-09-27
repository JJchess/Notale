import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindAiEdits,aiEditsState,type AiProvider,summarize,splitNdjson,appendStep,loadConversation,saveConversation,diffRows,diffChips,displayValue,objectLabel,insertLabel,DIFF_PREVIEW,type AiContext,type AiStep,type AiTurnResult,type AiReviewReply,type AiObject} from '../src/state/ai-edits';
type Command=Parameters<typeof summarize>[0][number];
const patch=(target:string)=>({type:'element.patch',slideId:'page',target,patch:{text:'x'}}) as unknown as Command;
const title:AiObject={id:'title',tag:'h1',text:'标题文字',style:{color:'#111111'},attributes:{}};
/** A fake server: turns commit by bumping the version, the review diffs whatever `changes` holds. */
function harness(overrides:Partial<AiContext>={}){
 const store=new Map<string,string>();
 (globalThis as any).localStorage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);},removeItem:(key:string)=>{store.delete(key);}};
 let selection:string[]=[],version=3,documentId='doc';
 const calls:{path:string;body:any}[]=[],accepted:number[]=[],closed:string[]=[],uploads:string[]=[];
 let discarded=0,pulls=0,changes:Command[]=[];
 let reply:AiTurnResult={sessionId:'s1',reviewBase:3,version:4,status:'complete',text:'改好了。'};
 let steps:AiStep[]=[];
 let text:(string|null)[]=[];
 let failure:Error|undefined;
 let finish:((value:AiTurnResult)=>void)|undefined;const interrupted:string[]=[];
 const context:AiContext={
  documentId:()=>documentId,
  slideId:()=>'page',
  version:()=>version,
  pageLabel:id=>id,
  selection:()=>selection,
  selectionLabel:()=>'标题',
  objects:()=>[title],
  async request(path,body,signal,onStep,onSession,onText){
   calls.push({path,body});
   onSession(reply.sessionId);
   for(const piece of text)onText(piece);
   for(const step of steps)onStep(step);
   if(failure)throw failure;
   if((body as {instruction:string}).instruction==='慢')
    return new Promise<AiTurnResult>((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(new Error('aborted')));});
   if(reply.version!==undefined){version=reply.version;changes=[patch('title')];}
   return reply;
  },
  async review():Promise<AiReviewReply>{return {reviewBase:3,version,commands:changes,before:{page:[title]},after:{page:[title]}};},
  async accept(_sessionId,at){accepted.push(at);changes=[];},
  async discard(){discarded++;changes=[];version++;},
  closeSession(id){closed.push(id);},
  // Like the server: the stopped turn commits what it wrote and its stream ends with the result.
  async interrupt(id){interrupted.push(id);version++;changes=[patch('title')];finish?.({sessionId:'s1',reviewBase:3,version,status:'interrupted',text:''});return {};},
  async pull(){pulls++;},
  async uploadFile(file){if(file.name.startsWith('bad'))throw new Error('只能附 PDF、DOCX、PPTX 或视频（MP4、MOV、WebM）');uploads.push(file.name);return {id:`u-${uploads.length}`};},
  async status(){return {available:true,reason:''};},
  async models(){return {default:{provider:'google',id:'gemini-3.8-flash'},providers};},
  pages:()=>[{id:'page',path:'pages/01.html',name:'封面'},{id:'second',path:'pages/02.html',name:'目录'}],
  clearSelection(){selection=[];binding.render();},
  ...overrides,
 };
 const binding=bindAiEdits(context);
 binding.render();
 return {binding,calls,accepted,closed,interrupted,uploads,
  get discarded(){return discarded;},get pulls(){return pulls;},
  select(ids:string[]){selection=ids;binding.render();},
  /** Someone -- the author, a collaborator -- commits a change of their own. */
  edit(commands:Command[]){changes=[...changes,...commands];version++;binding.render();},
  set documentId(value:string){documentId=value;binding.render();},
  set reply(value:AiTurnResult){reply=value;},
  set steps(value:AiStep[]){steps=value;},
  set text(value:(string|null)[]){text=value;},
  set failure(value:Error|undefined){failure=value;},
  get model(){return aiEditsState.getSnapshot();},
  done(){binding.dispose();delete (globalThis as any).localStorage;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const providers:AiProvider[]=[
 {provider:'google',name:'Google',available:true,models:[{id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',vision:true,contextWindow:1_048_576}]},
 {provider:'siliconflow',name:'SiliconFlow',available:true,models:[{id:'deepseek-v3',name:'DeepSeek V3',vision:false,contextWindow:128_000}]},
 {provider:'openai',name:'OpenAI',available:false,reason:'未配置密钥',models:[]},
];

test('the intent follows the selection: nothing selected means the whole page, a selection means that selection',()=>{
 const h=harness();
 assert.equal(h.model.intent,'edit-deck');
 h.select(['title']);
 assert.equal(h.model.intent,'edit-selection');
 assert.equal(h.model.targetLabel,'标题文字','the reference names the object, not the inspector panel');
 h.done();
});
test('an unconfigured model service is reported instead of a submit button',async()=>{
 const h=harness({async status(){return {available:false,reason:'未配置模型服务：设置环境变量 GEMINI_API_KEY 后可用'};}});
 await settle();
 assert.equal(h.model.available,false);
 assert.match(h.model.reason,/GEMINI_API_KEY/);
 h.done();
});
test('a turn is written into the deck: the canvas pulls it, and the review lists it',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();await settle();
 assert.deepEqual(h.calls[0]?.body,{slideId:'page',instruction:'改',targets:['title']},'the first turn opens a session; the selection is context');
 assert.equal(h.model.sessionId,'s1');
 assert.equal(h.pulls,1);
 assert.deepEqual(h.model.turns.map(turn=>[turn.instruction,turn.status,turn.version,turn.text]),[['改','complete',4,'改好了。']]);
 assert.equal(h.model.review?.rows.length,1);
 h.model.change?.({instruction:'再改'});
 await h.model.submit?.();
 assert.equal(h.calls[1]?.body.sessionId,'s1','the next instruction continues the same session, with no history in the body');
 assert.equal('history' in h.calls[1]!.body||'pending' in h.calls[1]!.body,false);
 h.done();
});
test('an edit the author makes during review is part of the review too',async()=>{
 const h=harness();
 h.model.change?.({instruction:'改'});await h.model.submit?.();await settle();
 h.edit([{type:'element.patch',slideId:'page',target:'title',patch:{style:{color:'#c0392b'}}} as unknown as Command]);await settle();await settle();
 assert.deepEqual(h.model.review?.rows.map(row=>row.what),['文字','颜色']);
 h.done();
});
test('accept moves the baseline to the version reviewed; discard goes back to it and pulls',async()=>{
 const h=harness();
 h.model.change?.({instruction:'改'});await h.model.submit?.();await settle();
 await h.model.accept?.();await settle();
 assert.deepEqual(h.accepted,[4]);
 assert.equal(h.model.review,undefined);
 h.model.change?.({instruction:'再改'});h.reply={sessionId:'s1',reviewBase:4,version:5,status:'complete',text:''};
 await h.model.submit?.();await settle();
 const pulls=h.pulls;
 await h.model.discard?.();await settle();
 assert.equal(h.discarded,1);
 assert.equal(h.pulls,pulls+1);
 assert.equal(h.model.review,undefined);
 h.done();
});
test('words and no change: a reply turn, nothing to pull or review',async()=>{
 const h=harness();
 h.reply={sessionId:'s1',reviewBase:3,status:'complete',text:'你想改哪部分？'};
 h.model.change?.({instruction:'改一下'});await h.model.submit?.();await settle();
 assert.equal(h.model.turns[0]?.text,'你想改哪部分？');
 assert.equal(h.model.turns[0]?.version,undefined);
 assert.equal(h.pulls,0);
 assert.equal(h.model.review,undefined);
 h.done();
});
test('a failure surfaces as an error and a failed turn; the words stay in the bubble',async()=>{
 const h=harness();
 h.failure=new Error('模型服务不可用');
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 assert.equal(h.model.status,'error');
 assert.match(h.model.error,/不可用/);
 assert.equal(h.model.turns[0]?.status,'failed');
 assert.equal(h.model.instruction,'');
 h.done();
});
test('stop is a request of its own: the stream still ends with the result, whose edits are pulled and reviewed',async()=>{
 const h=harness();
 h.model.change?.({instruction:'慢'});
 const running=h.model.submit?.();
 await settle();
 assert.equal(h.model.status,'running');
 assert.equal(h.model.instruction,'','the composer empties on send');
 assert.equal(h.model.sent,'慢');
 h.model.stop?.();
 await running;await settle();
 assert.deepEqual(h.interrupted,['s1']);
 assert.equal(h.model.status,'idle');
 assert.equal(h.model.error,'');
 assert.deepEqual([h.model.turns[0]?.status,h.model.turns[0]?.version],['interrupted',4]);
 assert.equal(h.pulls,1,'what landed before the stop is pulled at once, no timer');
 assert.equal(h.model.review?.rows.length,1);
 assert.equal(h.model.instruction,'慢','the words come back to edit and resend');
 h.done();
});
test('before the session is known, stopping hangs up',async()=>{
 const h=harness({async request(_path,_body,signal){return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')));});}});
 h.model.change?.({instruction:'慢'});
 const running=h.model.submit?.();await settle();
 h.model.stop?.();await running;
 assert.deepEqual(h.interrupted,[]);
 assert.equal(h.model.turns[0]?.status,'interrupted');
 h.done();
});
test('steps collapse per label, and a new submit starts from none',async()=>{
 const h=harness();
 h.steps=[{label:'读取',status:'active'},{label:'读取',status:'done'},{label:'修改',status:'active'}];
 h.model.change?.({instruction:'慢'});
 const running=h.model.submit?.();await settle();
 assert.deepEqual(h.model.steps,[{label:'读取',status:'done'},{label:'修改',status:'active'}]);
 h.model.stop?.();await running;
 assert.deepEqual(h.model.turns[0]?.steps.map(step=>step.label),['读取','修改'],'the turn keeps the steps it took');
 assert.deepEqual(h.model.steps,[]);
 h.done();
});
test('the session and turns survive a reload; a new conversation closes the session',async()=>{
 const h=harness();
 h.model.change?.({instruction:'改'});await h.model.submit?.();await settle();
 assert.deepEqual(loadConversation('doc').sessionId,'s1');
 assert.equal(loadConversation('doc').turns.length,1);
 saveConversation('broken',{sessionId:'x',turns:[]});
 assert.deepEqual(loadConversation('missing'),{sessionId:'',turns:[]});
 h.model.newConversation?.();
 assert.deepEqual(h.closed,['s1']);
 assert.equal(h.model.sessionId,'');
 assert.deepEqual(h.model.turns,[]);
 h.done();
});
test('switching decks loads that deck\'s own conversation',async()=>{
 const h=harness();
 h.model.change?.({instruction:'改'});await h.model.submit?.();await settle();
 h.documentId='other';
 assert.equal(h.model.sessionId,'');
 assert.deepEqual(h.model.turns,[]);
 assert.equal(h.model.review,undefined);
 h.documentId='doc';
 assert.equal(h.model.sessionId,'s1');
 h.done();
});

test('the summary names what changes, not the command types',()=>{
 assert.deepEqual(
  summarize([patch('a'),patch('b'),{type:'component.set'} as unknown as Command]),
  ['修改对象 ×2','定义交互'],
 );
 // A page the batch creates and keeps is a real change; one it creates and deletes is plumbing.
 assert.deepEqual(summarize([{type:'slide.insert',slide:{id:'n',name:'补充'}} as unknown as Command,{type:'slide.delete',slideId:'old'} as unknown as Command]),['新增页面','删除页面']);
 assert.deepEqual(
  summarize([
   {type:'slide.insert',slide:{id:'t',components:[{id:'c'}]}} as unknown as Command,
   {type:'elements.transfer',slideId:'p',sourceSlideId:'t',targets:['r']} as unknown as Command,
   {type:'slide.delete',slideId:'t'} as unknown as Command,
  ]),
  ['定义交互','新增内容'],
  'the scratch page of an insert transaction is not shown as a change',
 );
});

test('appendStep merges same-label updates and starts a new row for a distinct label',()=>{
 let steps=appendStep([],{label:'请求模型',status:'active'});
 steps=appendStep(steps,{label:'请求模型',status:'done'});
 assert.deepEqual(steps,[{label:'请求模型',status:'done'}]);
 steps=appendStep(steps,{label:'请求模型（第 2 次尝试）',status:'active'});
 assert.deepEqual(steps,[{label:'请求模型',status:'done'},{label:'请求模型（第 2 次尝试）',status:'active'}]);
});

test('ndjson lines are read as they complete, and a split line waits for the rest',()=>{
 const first=splitNdjson('','{"type":"step","label":"a"}\n{"type":"step","lab');
 assert.deepEqual(first.lines,[{type:'step',label:'a'}]);
 assert.equal(first.rest,'{"type":"step","lab');
 const second=splitNdjson(first.rest,'el":"b"}\n');
 assert.deepEqual(second.lines,[{type:'step',label:'b'}]);
 assert.equal(second.rest,'');
});
test('ndjson with no trailing newline holds the whole thing back',()=>{
 const result=splitNdjson('','{"type":"result"');
 assert.deepEqual(result.lines,[]);
 assert.equal(result.rest,'{"type":"result"');
});

const page:AiObject[]=[
 {id:'title',tag:'h1',text:'标题文字',style:{color:'rgb(17, 17, 17)','font-size':'44px'},attributes:{'data-notale-name':'大标题'}},
 {id:'body',tag:'p',text:'这是一段很长很长的正文，长到需要被截断显示',style:{},attributes:{}},
];
const cmd=(value:unknown)=>value as Parameters<typeof diffRows>[0][number];
test('a diff row names the object, the property and the value it replaces',()=>{
 const rows=diffRows([cmd({type:'element.patch',slideId:'p',target:'title',patch:{style:{color:'#c0392b'},text:'新标题'}})],page);
 assert.deepEqual(rows.map(row=>[row.label,row.what,row.from,row.to]),[
  ['大标题','文字','标题文字','新标题'],
  ['大标题','颜色','#111111','#c0392b'],
 ]);
 // rgb() from the canvas and hex from the model are the same colour; show one format.
 assert.equal(displayValue('rgb(17, 17, 17)'),'#111111');
 assert.equal(displayValue('rgba(17, 17, 17, 0.5)'),'rgba(17, 17, 17, 0.5)','a transparent colour is not a hex');
 assert.equal(displayValue('44px'),'44px');
 assert.equal(displayValue(undefined),undefined);
});
test('every command type the AI can emit produces a readable row',()=>{
 const rows=diffRows([
  cmd({type:'element.content',slideId:'p',target:'body',html:'<p>x</p>'}),
  cmd({type:'element.delete',slideId:'p',target:'title'}),
  cmd({type:'element.insert',slideId:'p',html:'<p>x</p>'}),
  cmd({type:'slide.insert',after:'p',slide:{id:'t',components:[{name:'点击展开'}]}}),
  cmd({type:'slide.delete',slideId:'t'}),
  cmd({type:'element.patch',slideId:'p',target:'title',patch:{attributes:{href:null}}}),
 ],page);
 assert.deepEqual(rows.map(row=>row.what),['内部结构','删除','新增','定义交互','href']);
 const pages=diffRows([
  cmd({type:'slide.insert',after:'p',slide:{id:'n',name:'补充'}}),
  cmd({type:'slide.move',slideId:'p',index:2}),
  cmd({type:'deck.update',theme:{'--accent':'rgb(255, 0, 0)'}}),
 ],page);
 assert.deepEqual(pages.map(row=>[row.label,row.what,row.to]),[['补充','新增页面',undefined],['p','页序','第 3 页'],['讲义主题','--accent','#ff0000']]);
 assert.equal(rows[0].label,'这是一段很长很长的正文，长到…','a long text label is cut, not left to blow up the column');
 assert.equal(rows[2].label,'x','an insert is named by its words, not "new content"');
 assert.equal(rows[3].label,'点击展开','a component insert is named by the component');
 assert.equal(rows[3].to,'点击展开');
 assert.equal(rows[4].to,'（移除）');
});
test('an object the page no longer has falls back to its id instead of crashing',()=>{
 const rows=diffRows([cmd({type:'element.patch',slideId:'p',target:'ghost',patch:{text:'x'}})],page);
 assert.deepEqual([rows.length,rows[0].label,rows[0].from],[1,'ghost',undefined]);
});

test('the preview cap leaves the rest to a disclosure rather than truncating the list',()=>{
 const many=diffRows([cmd({type:'element.patch',slideId:'p',target:'title',patch:{style:Object.fromEntries(Array.from({length:DIFF_PREVIEW+3},(_,i)=>['--v'+i,String(i)]))}})],page);
 assert.equal(many.length,DIFF_PREVIEW+3,'diffRows returns everything; folding is the view\'s job');
});

test('change chips group a turn by object, and count the properties each one loses',()=>{
 const rows=diffRows([
  cmd({type:'element.patch',slideId:'p',target:'title',patch:{style:{color:'#c0392b','font-size':'50px'}}}),
  cmd({type:'element.patch',slideId:'p',target:'body',patch:{text:'新正文'}}),
  cmd({type:'element.insert',slideId:'p',html:'<p>x</p>'}),
  cmd({type:'elements.transfer',slideId:'p',sourceSlideId:'t',targets:['r']}),
 ],page);
 const chips=diffChips(rows);
 // Two inserts are two lines, each named by what it carries; a bare transfer has no words to give.
 assert.deepEqual(chips.map(chip=>[chip.label,chip.count,chip.kind]),[['大标题',2,'patch'],['这是一段很长很长的正文，长到…',1,'patch'],['x',1,'insert'],['新内容',1,'insert']]);
 assert.deepEqual(chips[0].rows.map(row=>row.what),['颜色','字号']);
 // Each insert gets a synthetic target of its own, so two inserts never merge into one chip.
 assert.equal(chips[2].target,'insert:2');
 assert.deepEqual(diffChips([]),[]);
});

test('objects without a visual name are called by what they are, never by their CSS',()=>{
 assert.equal(objectLabel({id:'s',tag:'style',text:'@keyframes float{from{top:0}}',style:{},attributes:{}},'s'),'页面样式');
 assert.equal(objectLabel({id:'d',tag:'div',text:'.x{color:red}',style:{},attributes:{}},'d'),'div','text that reads as CSS is not a name');
 assert.equal(objectLabel({id:'d',tag:'div',text:'',style:{},attributes:{'data-notale-name':'卡片'}},'d'),'卡片','an authored name still wins');
});
test('an inserted fragment is named by its first words, else its first tag',()=>{
 assert.equal(insertLabel('<section data-notale-id="a"><style>.a{}</style><button>看答案</button><p>答案在这里。</p></section>'),'看答案 答案在这里。');
 assert.equal(insertLabel('<img data-notale-id="i" src="x.png">'),'img');
 assert.equal(insertLabel('<div><p>这是一段很长很长很长的插入内容，超过十四个字</p></div>'),'这是一段很长很长很长的插入内…');
});
test('an insert transaction is one line for the component, tagged with the page it lands on',()=>{
 const rows=diffRows([
  cmd({type:'slide.insert',after:'p',slide:{id:'ai-m1',components:[{id:'tip',name:'点击展开'}]}}),
  cmd({type:'elements.transfer',slideId:'p',sourceSlideId:'ai-m1',targets:['tip-root']}),
  cmd({type:'slide.delete',slideId:'ai-m1'}),
 ],page);
 assert.deepEqual(rows.map(row=>[row.label,row.what,row.slideId,row.target]),[['点击展开','定义交互','p','insert:tip']]);
});
test('the same object touched in two turns is two lines, each with its own page and turn',()=>{
 const rows=[
  ...diffRows([cmd({type:'element.patch',slideId:'p',target:'title',patch:{style:{color:'#c0392b'}}})],page).map(row=>({...row,turn:'变红',page:'第 1 页'})),
  ...diffRows([cmd({type:'element.patch',slideId:'p',target:'title',patch:{style:{color:'#264685','font-size':'50px'}}})],page).map(row=>({...row,turn:'变蓝',page:'第 1 页'})),
 ];
 const chips=diffChips(rows);
 assert.deepEqual(chips.map(chip=>[chip.label,chip.count,chip.turn,chip.page,chip.slideId]),[['大标题',1,'变红','第 1 页','p'],['大标题',2,'变蓝','第 1 页','p']]);
});

test('a whole-page replacement reads as the objects it adds, removes and changes',()=>{
 const before:AiObject[]=[{id:'t',tag:'h1',text:'旧标题',style:{color:'#111111'},attributes:{}},{id:'gone',tag:'p',text:'删掉的段落',style:{},attributes:{}}];
 const after:AiObject[]=[{id:'t',tag:'h1',text:'新标题',style:{color:'rgb(255, 0, 0)'},attributes:{}},{id:'new',tag:'p',text:'新段落',style:{},attributes:{}}];
 const rows=diffRows([cmd({type:'slide.replace',slideId:'p',slide:{id:'p'}})],()=>before,()=>after);
 assert.deepEqual(rows.map(row=>[row.target,row.what,row.from,row.to]),[
  ['t','文字','旧标题','新标题'],['t','颜色','#111111','#ff0000'],['new','新增',undefined,undefined],['gone','删除',undefined,undefined]]);
 assert.deepEqual(summarize([cmd({type:'slide.replace',slideId:'p',slide:{id:'p'}})]),['修改页面']);
});

test('the picked model goes with each turn and is remembered; one the server no longer lists is dropped',async()=>{
 const h=harness();await settle();
 assert.equal(h.model.providers.length,3);
 h.model.pickModel?.({provider:'openai',id:'gpt'});
 assert.equal(h.model.choice,undefined,'a service without a key cannot be picked');
 h.model.pickModel?.({provider:'siliconflow',id:'deepseek-v3'});
 assert.equal(h.model.vision,false);
 h.model.change?.({instruction:'改'});await h.model.submit?.();
 assert.deepEqual(h.calls[0]?.body.model,{provider:'siliconflow',id:'deepseek-v3'});
 assert.equal(localStorage.getItem('notale-ai-model'),JSON.stringify({provider:'siliconflow',id:'deepseek-v3'}));
 h.done();
});
test('no pick means the server\'s default: the request carries no model',async()=>{
 const h=harness();await settle();
 h.model.change?.({instruction:'改'});await h.model.submit?.();
 assert.equal('model' in h.calls[0]!.body,false);
 assert.equal(h.model.vision,true,'the default can see');
 h.done();
});
test('attached pictures go with the next turn only; the wrong kind, too many or too big are refused',async()=>{
 const h=harness();await settle();
 const png=(name:string,size=8)=>new File([new Uint8Array(size)],name,{type:'image/png'});
 await h.model.attach?.([png('a.png'),new File(['x'],'a.txt',{type:'text/plain'})]);
 assert.deepEqual(h.model.attachments.map(item=>item.name),['a.png']);
 assert.match(h.model.error,/最多附 4 张/);
 await h.model.attach?.([png('big.png',5*1024*1024+1)]);
 assert.match(h.model.error,/5 MB/);
 await h.model.attach?.([png('b.png'),png('c.png'),png('d.png'),png('e.png')]);
 assert.equal(h.model.attachments.length,4);
 h.model.detach?.(h.model.attachments[3]!.id);
 h.model.change?.({instruction:'照这几张改'});await h.model.submit?.();
 const images=h.calls[0]!.body.images as {mime:string;data:string}[];
 assert.deepEqual(images.map(image=>[image.mime,image.data]),[['image/png','AAAAAAAAAAA='],['image/png','AAAAAAAAAAA='],['image/png','AAAAAAAAAAA=']]);
 assert.deepEqual(h.model.attachments,[],'sent pictures leave the composer');
 h.done();
});
test('the reply streams in, starting over with each model call, and is gone once the turn is sealed',async()=>{
 const seen:string[]=[];
 const h=harness();await settle();
 const off=aiEditsState.subscribe(()=>{const reply=aiEditsState.getSnapshot().reply;if(reply&&seen.at(-1)!==reply)seen.push(reply);});
 h.text=[null,'先看看',null,'标题','改好了。'];
 h.model.change?.({instruction:'改'});await h.model.submit?.();
 off();
 assert.deepEqual(seen,['先看看','标题','标题改好了。']);
 assert.equal(h.model.reply,'');
 h.done();
});
test('retry asks the same thing about the same objects, as a new turn',async()=>{
 const h=harness();await settle();
 h.select(['title']);h.model.change?.({instruction:'标题变红'});await h.model.submit?.();
 h.select([]);
 await h.model.retry?.(h.model.turns[0]!.id);
 assert.deepEqual([h.calls[1]?.body.instruction,h.calls[1]?.body.targets],['标题变红',['title']]);
 assert.equal(h.model.turns.length,2);
 h.done();
});
test('@ lists every page by its file, then this page\'s objects by their anchor',()=>{
 const h=harness();
 assert.deepEqual(h.model.mentions?.().map(item=>[item.kind,item.label,item.insert]),[
  ['page','封面','@pages/01.html'],['page','目录','@pages/02.html'],['object','标题文字','@pages/01.html#title']]);
 h.done();
});

test('documents and video upload on their own and go with the message by id; a failed one is shown and left out',async()=>{
 const h=harness();
 await h.model.attach?.([new File(['%PDF-1.4'],'paper.pdf'),new File(['x'],'demo.mp4'),new File(['x'],'bad.webm')]);
 await settle();
 assert.deepEqual(h.model.files.map(file=>[file.name,file.state]),[['paper.pdf','ready'],['demo.mp4','ready'],['bad.webm','failed']]);
 assert.deepEqual(h.uploads,['paper.pdf','demo.mp4']);
 h.model.change?.({instruction:'按论文改'});
 await h.model.submit?.();await settle();
 assert.deepEqual(h.calls[0]?.body.files,['u-1','u-2']);
 assert.deepEqual(h.model.files,[],'sent files leave the composer');
 h.done();
});
