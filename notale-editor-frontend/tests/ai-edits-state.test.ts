import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindAiEdits,aiEditsState,summarize,splitNdjson,appendStep,type AiContext,type AiStep,type AiCandidate,type AiRequestResult} from '../src/state/ai-edits';
type Command=Parameters<typeof summarize>[0][number];
const patch=(target:string)=>({type:'element.patch',slideId:'page',target,patch:{text:'x'}}) as unknown as Command;
function harness(overrides:Partial<AiContext>={}){
 let selection:string[]=[];
 const calls:{path:string;body:unknown}[]=[];
 const applied:Command[][]=[];
 const previewed:AiCandidate[]=[];
 let clears=0;
 let reply:AiRequestResult={mutationId:'m1',baseVersion:3,commands:[patch('title')],model:'test',preview:{protocol:2,documentId:'doc',fromVersion:3,toVersion:4,changes:[]}};
 let steps:AiStep[]=[];
 let failure:Error|undefined;
 let hold:((value:typeof reply)=>void)|undefined;
 const context:AiContext={
  documentId:()=>'doc',
  slideId:()=>'page',
  selection:()=>selection,
  selectionLabel:()=>'标题',
  async request(path,body,signal,onStep){
   calls.push({path,body});
   for(const step of steps)onStep(step);
   if(failure)throw failure;
   if(hold===undefined&&(body as {instruction:string}).instruction==='慢')
    return new Promise<typeof reply>((resolve,reject)=>{hold=resolve;signal.addEventListener('abort',()=>reject(new Error('aborted')));});
   return reply;
  },
  async apply(commands){applied.push(commands);return undefined;},
  async status(){return {available:true,reason:''};},
  preview(candidate){previewed.push(candidate);},
  clearPreview(){clears++;},
  ...overrides,
 };
 const binding=bindAiEdits(context);
 return {binding,calls,applied,previewed,
  get clears(){return clears;},
  select(ids:string[]){selection=ids;binding.render();},
  set reply(value:typeof reply){reply=value;},
  set steps(value:AiStep[]){steps=value;},
  set failure(value:Error|undefined){failure=value;},
  release(){hold?.(reply);},
  get model(){return aiEditsState.getSnapshot();}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('the intent follows the selection: nothing selected means insert, a selection means edit',()=>{
 const h=harness();
 h.select([]);
 assert.equal(h.model.intent,'insert-interactive');
 h.select(['title']);
 assert.equal(h.model.intent,'edit-selection');
 assert.equal(h.model.targetLabel,'标题');
 h.binding.dispose();
});
test('a candidate is held for review and applies as a single batch',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改成三栏'});
 await h.model.submit?.();
 assert.equal(h.model.status,'candidate');
 assert.deepEqual(h.model.candidate?.summary,['修改对象']);
 assert.equal(h.applied.length,0,'nothing is written before the author applies');
 await h.model.apply?.();
 assert.equal(h.applied.length,1,'one call to the kernel is one undo step');
 assert.equal(h.applied[0].length,1);
 assert.equal(h.model.status,'idle');
 h.binding.dispose();
});
test('discarding a candidate leaves the document untouched',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 h.model.discard?.();
 assert.equal(h.model.status,'idle');
 assert.equal(h.model.candidate,undefined);
 assert.equal(h.applied.length,0);
 h.binding.dispose();
});
test('a candidate raised against a different selection refuses to apply',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 h.select(['other']);
 assert.equal(h.model.status,'idle','a stale candidate is dropped when the selection moves');
 assert.equal(h.applied.length,0);
 h.binding.dispose();
});
test('an unconfigured model service is reported instead of a submit button',async()=>{
 const h=harness({async status(){return {available:false,reason:'未配置模型服务：设置环境变量 GEMINI_API_KEY 后可用'};}});
 await settle();
 assert.equal(h.model.available,false);
 assert.match(h.model.reason,/GEMINI_API_KEY/);
 h.binding.dispose();
});
test('a failure surfaces as an error and writes nothing',async()=>{
 const h=harness();
 h.failure=new Error('模型没能给出可用的修改');
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 assert.equal(h.model.status,'error');
 assert.match(h.model.error,/没能给出/);
 assert.equal(h.applied.length,0);
 h.binding.dispose();
});
test('stopping a running task returns to idle without an error banner',async()=>{
 const h=harness();
 h.select([]);
 h.model.change?.({instruction:'慢'});
 const running=h.model.submit?.();
 await settle();
 assert.equal(h.model.status,'running');
 h.model.stop?.();
 await running;
 assert.equal(h.model.status,'idle');
 assert.equal(h.model.error,'');
 h.binding.dispose();
});
test('the summary names what changes, not the command types',()=>{
 assert.deepEqual(
  summarize([patch('a'),patch('b'),{type:'component.set'} as unknown as Command,{type:'slide.delete'} as unknown as Command]),
  ['修改对象 ×2','定义交互'],
 );
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

test('real steps accumulate in order as the request reports them',async()=>{
 const h=harness();
 h.steps=[
  {label:'读取页面对象',status:'active'},{label:'读取页面对象',status:'done'},
  {label:'请求模型',status:'active'},{label:'请求模型',status:'done'},
  {label:'解析与校验',status:'active'},{label:'解析与校验',status:'done'},
  {label:'服务端试跑',status:'active'},{label:'服务端试跑',status:'done'},
 ];
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 assert.deepEqual(h.model.steps,[
  {label:'读取页面对象',status:'done'},
  {label:'请求模型',status:'done'},
  {label:'解析与校验',status:'done'},
  {label:'服务端试跑',status:'done'},
 ],'each label collapses to its latest status, not one row per event');
});
test('a new submit clears the previous run\'s steps',async()=>{
 const h=harness();
 h.steps=[{label:'读取页面对象',status:'active'},{label:'读取页面对象',status:'done'}];
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 assert.equal(h.model.steps.length,1);
 h.steps=[{label:'请求模型',status:'active'}];
 h.model.change?.({instruction:'再改'});
 await h.model.submit?.();
 assert.deepEqual(h.model.steps,[{label:'请求模型',status:'active'}]);
});
test('appendStep merges same-label updates and starts a new row for a distinct label',()=>{
 let steps=appendStep([],{label:'请求模型',status:'active'});
 steps=appendStep(steps,{label:'请求模型',status:'done'});
 assert.deepEqual(steps,[{label:'请求模型',status:'done'}]);
 steps=appendStep(steps,{label:'请求模型（第 2 次尝试）',status:'active'});
 assert.deepEqual(steps,[{label:'请求模型',status:'done'},{label:'请求模型（第 2 次尝试）',status:'active'}]);
});

test('a candidate is projected onto the canvas the moment it arrives, and cleared on discard',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 assert.equal(h.previewed.length,1);
 assert.equal(h.previewed[0].commands.length,1);
 assert.equal(h.clears,1,'starting the request itself clears any leftover preview first');
 h.model.discard?.();
 assert.equal(h.clears,2);
});
test('apply clears the preview before writing, and reinstates it if the write fails',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 const clearsBeforeApply=h.clears;
 await h.model.apply?.();
 assert.ok(h.clears>clearsBeforeApply,'apply clears the ghost before the real write lands');
 assert.equal(h.previewed.length,1,'a successful apply does not re-show the preview');
});
test('a failed apply keeps the candidate under review, preview included',async()=>{
 const h=harness({async apply(){throw new Error('网络错误');}});
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 await h.model.apply?.();
 assert.equal(h.model.status,'candidate');
 assert.equal(h.previewed.length,2,'the preview is re-shown once the failed write leaves the candidate on screen');
});
test('moving the selection while a candidate is shown clears its preview too',async()=>{
 const h=harness();
 h.select(['title']);
 h.model.change?.({instruction:'改'});
 await h.model.submit?.();
 const clearsAtCandidate=h.clears;
 h.select(['other']);
 assert.ok(h.clears>clearsAtCandidate);
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
