import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindAiEdits,aiEditsState,summarize,type AiContext} from '../src/state/ai-edits';
type Command=Parameters<typeof summarize>[0][number];
const patch=(target:string)=>({type:'element.patch',slideId:'page',target,patch:{text:'x'}}) as unknown as Command;
function harness(overrides:Partial<AiContext>={}){
 let selection:string[]=[];
 const calls:{path:string;body:unknown}[]=[];
 const applied:Command[][]=[];
 let reply:unknown={mutationId:'m1',baseVersion:3,commands:[patch('title')],model:'test'};
 let failure:Error|undefined;
 let hold:((value:unknown)=>void)|undefined;
 const context:AiContext={
  documentId:()=>'doc',
  slideId:()=>'page',
  selection:()=>selection,
  selectionLabel:()=>'标题',
  async request(path,body,signal){
   calls.push({path,body});
   if(failure)throw failure;
   if(hold===undefined&&(body as {instruction:string}).instruction==='慢')
    return new Promise((resolve,reject)=>{hold=resolve;signal.addEventListener('abort',()=>reject(new Error('aborted')));});
   return reply;
  },
  async apply(commands){applied.push(commands);return undefined;},
  async status(){return {available:true,reason:''};},
  ...overrides,
 };
 const binding=bindAiEdits(context);
 return {binding,calls,applied,
  select(ids:string[]){selection=ids;binding.render();},
  set reply(value:unknown){reply=value;},
  set failure(value:Error|undefined){failure=value;},
  release(){hold?.({mutationId:'m1',baseVersion:3,commands:[patch('title')],model:'test'});},
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
