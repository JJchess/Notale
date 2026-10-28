import type {FilmMotaleAuthor} from '@notale/editor/film';
import type {MotaleContext,MotaleBridgeObject,MotalePropState} from './motale-bridge';
import {sampleMotaleValue,validateMotaleValue,writeMotaleValue,motalePropertyLabels,type MotaleValue} from './motale-keyframes';
import {translateUi as t} from '../i18n/store';

export const contentProperties=['text','tex','value','values'] as const;
export type ContentProperty=typeof contentProperties[number];
export const contentProperty=(object:Pick<MotaleBridgeObject,'props'>)=>contentProperties.find(key=>object.props[key]);
export function parseContent(raw:string,property:ContentProperty,spec:MotalePropState):MotaleValue {
 let value:MotaleValue=raw;
 if(property==='value'){if(!raw.trim())throw Error('请输入数值');value=Number(raw);}
 if(property==='values'){
  const text=raw.trim();try{value=text.startsWith('[')?JSON.parse(text):text?text.split(/[,，\s]+/).map(Number):[];}catch{throw Error('请输入有效的数字数组');}
 }
 validateMotaleValue(property,value,spec);return value;
}
export const contentText=(value:MotaleValue|undefined)=>value===undefined?'':Array.isArray(value)?value.join(', '):String(value);
export type ContentContext={clipId:string;scope:string;context:MotaleContext;ids:string[];author?:FilmMotaleAuthor;locked:boolean};
type View={key:string;node:HTMLLabelElement;input:HTMLInputElement|HTMLTextAreaElement;error:HTMLElement;inline:boolean};
type Edit={origin:ContentContext;key:string;ids:string[];property:ContentProperty;spec:MotalePropState;raw:string;saved:string;expected:string;composing:boolean;error:string;redo?:string};
const authorKey=(author?:FilmMotaleAuthor)=>JSON.stringify(author??null);
const captureContext=(now:ContentContext):ContentContext=>({...now,ids:[...now.ids],context:{...now.context,act:{...now.context.act},hello:{...now.context.hello}}});
const selectionKey=(ids:readonly string[],property:ContentProperty)=>JSON.stringify([[...ids].sort(),property]);
/** One content session is shared by the inspector and the canvas. Only completed
 * input groups enter the existing film command queue; bridge previews stay local. */
export class MotaleContentEditor {
 private edit?:Edit;private views=new Set<View>();private inline?:HTMLElement;
 private idle?:ReturnType<typeof setTimeout>;private maximum?:ReturnType<typeof setTimeout>;
 private events=new AbortController();private disposed=false;private historyBusy=false;
 applying=false;
 constructor(private root:HTMLElement,private options:{read:()=>ContentContext|undefined;commit:(clipId:string,author:FilmMotaleAuthor)=>boolean;history:(action:'undo'|'redo')=>Promise<void>;save?:()=>Promise<void>;bounds:(id:string)=>{x:number;y:number;width:number;height:number}|undefined;focus:()=>void;report:(message:string)=>void}){
  window.addEventListener('pointerdown',e=>{
   if(!this.edit||e.button!==0)return;const target=e.target as Element;
   if([...this.views].some(view=>view.key===this.edit!.key&&view.node.contains(target)))return;
   if(target.closest('#undo,#redo,[data-action=undo],[data-action=redo]'))return;
   if(!this.finish()){e.preventDefault();e.stopImmediatePropagation();this.focus();}
  },{capture:true,signal:this.events.signal});
  // A cancelled pointerdown can still produce a click; block that activation too.
  window.addEventListener('click',e=>{const target=e.target as Element;if(!this.edit||!this.edit.error&&!this.edit.composing||target.closest('#undo,#redo,[data-action=undo],[data-action=redo]')||[...this.views].some(v=>v.node.contains(target)))return;e.preventDefault();e.stopImmediatePropagation();this.focus();},{capture:true,signal:this.events.signal});
  window.addEventListener('contextmenu',e=>{if(!this.edit||[...this.views].some(v=>v.node.contains(e.target as Node)))return;if(!this.finish()){e.preventDefault();e.stopImmediatePropagation();this.focus();}},{capture:true,signal:this.events.signal});
 }
 get editing(){return !!this.edit;}
 get pending(){return !!this.edit&&(this.edit.composing||this.edit.raw!==this.edit.saved);}
 private timers(){clearTimeout(this.idle);clearTimeout(this.maximum);this.idle=this.maximum=undefined;}
 private context(edit:Edit){
  const now=this.options.read(),old=edit.origin;
  if(!now||now.locked||now.context.error||now.context.bridge.mode()!=='author'||now.scope!==old.scope||now.clipId!==old.clipId||now.context.instance!==old.context.instance||now.context.hello.film!==old.context.hello.film||now.context.act.id!==old.context.act.id||now.context.act.revision!==old.context.act.revision||Math.abs(now.context.time-old.context.time)>1e-7||selectionKey(now.ids,edit.property)!==edit.key||authorKey(now.author)!==edit.expected)throw Error('场景或编辑位置已变化，未写入旧草稿');
  return now;
 }
 private begin(ids:string[],property:ContentProperty,spec:MotalePropState,raw:string){
  const key=selectionKey(ids,property);if(this.edit?.key===key)return this.edit;
  if(!this.finish())return;
  const origin=this.options.read();if(!origin||origin.locked||!ids.length)return;
  this.edit={origin:captureContext(origin),key,ids:[...ids],property,spec,raw,saved:raw,expected:authorKey(origin.author),composing:false,error:''};
  try{this.context(this.edit);}catch(error){this.close();this.options.report(String(error));return;}
  return this.edit;
 }
 private author(edit:Edit){
  const now=this.context(edit),value=parseContent(edit.raw,edit.property,edit.spec),author=structuredClone(now.author??{schema:now.context.hello.authorSchema,acts:{}});
  author.film??=now.context.hello.film;const act=author.acts[now.context.act.id]??={};if(now.context.act.revision)act.revision??=now.context.act.revision;act.objects??={};
  const objects=now.context.bridge.objects(now.context.act.id,now.context.time,{parameters:'film'});
  for(const id of edit.ids){const spec=objects.find(object=>object.id===id)?.props[edit.property];if(!spec)throw Error('对象不再支持此内容');writeMotaleValue(act.objects[id]??={},edit.property,value,now.context.time,spec);}
  const problems=now.context.bridge.author.check(author);if(problems.length)throw Error(problems.map(p=>[p.path,p.message].filter(Boolean).join(': ')).join('; '));return author;
 }
 private issue(error:unknown){if(this.edit){this.edit.error=error instanceof Error?error.message:String(error);this.sync();}}
 private preview(){const edit=this.edit;if(!edit||edit.composing)return;try{const author=this.author(edit);edit.origin.context.bridge.author.preview(author);edit.error='';}catch(error){try{edit.origin.context.bridge.author.cancelPreview();}catch{}this.issue(error);}this.sync();}
 private changed(view:View){
  const edit=this.edit;if(!edit)return;edit.raw=view.input.value;edit.redo=undefined;clearTimeout(this.idle);
  if(edit.composing){clearTimeout(this.maximum);this.maximum=undefined;this.sync();return;}
  this.preview();this.idle=setTimeout(()=>this.flush(),500);this.maximum??=setTimeout(()=>this.flush(),2000);
 }
 flush(){
  const edit=this.edit;if(!edit||this.applying)return true;if(edit.composing||this.historyBusy)return false;this.timers();
  try{
   this.context(edit);if(edit.raw===edit.saved){edit.error='';edit.origin.context.bridge.author.cancelPreview();this.sync();return true;}
   const author=this.author(edit);edit.origin.context.bridge.author.cancelPreview();this.applying=true;
   if(!this.options.commit(edit.origin.clipId,author))throw Error('场景修改未保存');
   edit.expected=authorKey(this.options.read()?.author);edit.saved=edit.raw;edit.error='';this.sync();return true;
  }catch(error){this.issue(error);return false;}finally{this.applying=false;}
 }
 finish(){if(!this.flush())return false;this.close();return true;}
 private close(){this.timers();this.edit=undefined;this.inline?.remove();this.inline=undefined;for(const view of this.views)if(view.inline){this.views.delete(view);} }
 private focus(){const views=[...this.views].filter(view=>view.key===this.edit?.key&&view.input.isConnected);(views.find(view=>view.inline)??views[0])?.input.focus({preventScroll:true});}
 async history(action:'undo'|'redo'){
  const edit=this.edit;if(edit?.composing||this.historyBusy)return;
  if(edit&&(action==='undo'&&(edit.raw!==edit.saved||edit.error)||action==='redo'&&edit.redo!==undefined)){
   this.timers();if(action==='undo'){edit.redo=edit.raw;edit.raw=edit.saved;edit.error='';try{edit.origin.context.bridge.author.cancelPreview();}catch{}}
   else{edit.raw=edit.redo!;edit.redo=undefined;this.preview();this.idle=setTimeout(()=>this.flush(),500);}
   this.sync();return;
  }
  this.historyBusy=true;this.timers();try{
   await this.options.history(action);
   if(edit&&this.edit===edit){const now=this.options.read();if(!now){this.close();return;}edit.origin=captureContext(now);edit.expected=authorKey(now.author);const values=this.values(now,edit.ids,edit.property);edit.raw=edit.saved=contentText(values.every(v=>JSON.stringify(v)===JSON.stringify(values[0]))?values[0]:undefined);edit.error='';this.sync();}
  }catch(error){this.options.report(String(error));}finally{this.historyBusy=false;}
 }
 private values(now:ContentContext,ids:string[],property:ContentProperty){const objects=now.context.bridge.objects(now.context.act.id,now.context.time,{parameters:'film'});return ids.map(id=>sampleMotaleValue(now.author?.acts[now.context.act.id]?.objects?.[id]?.[property],objects.find(obj=>obj.id===id)?.props[property]?.base as MotaleValue,now.context.time));}
 field(ids:string[],property:ContentProperty,spec:MotalePropState,value:MotaleValue|undefined,inline=false){
  const node=document.createElement('label');node.className='film-content-field';const title=document.createElement('span');title.textContent=t(motalePropertyLabels[property]);
  const input=property==='value'?document.createElement('input'):document.createElement('textarea');input.setAttribute('aria-label',t(motalePropertyLabels[property]));input.dataset.contentProperty=property;
  if(input instanceof HTMLInputElement){input.type='text';input.inputMode='decimal';}else{input.rows=2;input.spellcheck=property==='text';if(spec.maxLength!==undefined)input.maxLength=spec.maxLength;}
  input.value=contentText(value);input.placeholder=value===undefined?'—':'';
  const error=document.createElement('span');error.className='film-content-error';error.setAttribute('role','status');error.id='film-content-error-'+crypto.randomUUID();input.setAttribute('aria-describedby',error.id);node.append(title,input,error);
  const view:View={key:selectionKey(ids,property),node,input,error,inline};this.views.add(view);
  const begin=()=>this.begin(ids,property,spec,input.value);
  input.onfocus=()=>{if(!begin())input.blur();};input.oninput=()=>{if(begin())this.changed(view);};
  input.addEventListener('compositionstart',()=>{const edit=begin();if(edit){edit.composing=true;this.timers();}});
  input.addEventListener('compositionend',()=>{if(this.edit){this.edit.composing=false;this.changed(view);}});
  input.onblur=()=>{queueMicrotask(()=>{if(this.disposed||!this.edit||this.edit.composing||!input.isConnected)return;if(![...this.views].some(v=>v.key===this.edit!.key&&v.node.contains(document.activeElement)))if(!this.finish())this.focus();});};
  input.onkeydown=e=>{
   e.stopPropagation();if(e.isComposing||this.edit?.composing||e.keyCode===229)return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(this.flush())void this.options.save?.().catch(error=>this.options.report(String(error)));return;}
   if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();void this.history(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return;}
   if(e.key==='Escape'||e.key==='Enter'&&property==='value'){e.preventDefault();if(this.finish())this.options.focus();else this.focus();}
  };
  this.sync();return {node,dispose:()=>{this.views.delete(view);}};
 }
 open(id:string){
  if(!this.finish())return false;const now=this.options.read();if(!now||now.locked)return false;
  const object=now.context.bridge.objects(now.context.act.id,now.context.time,{parameters:'film'}).find(obj=>obj.id===id&&obj.visible&&obj.editable),property=object&&contentProperty(object);
  if(!object||!property||!object.bounds)return false;
  const value=this.values(now,[id],property)[0];if(!this.begin([id],property,object.props[property],contentText(value)))return false;
  const view=this.field([id],property,object.props[property],value,true);
  this.inline=document.createElement('div');this.inline.className='film-content-inline film-ui';this.inline.dataset.contentObject=id;this.inline.append(view.node);this.root.append(this.inline);
  this.position();const input=view.node.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!;input.focus({preventScroll:true});input.select();return true;
 }
 private sync(){const edit=this.edit;if(!edit)return;for(const view of this.views){if(view.key!==edit.key)continue;if(view.input.value!==edit.raw&&!edit.composing)view.input.value=edit.raw;view.error.textContent=t(edit.error);view.input.setAttribute('aria-invalid',String(!!edit.error));}}
 private position(){if(!this.inline||!this.edit)return;const box=this.options.bounds(this.edit.ids[0]);if(!box)return;const root=this.root.getBoundingClientRect(),width=Math.min(360,Math.max(220,root.width-16)),height=this.inline.offsetHeight;
  this.inline.style.width=width+'px';this.inline.style.left=Math.max(8,Math.min(root.width-width-8,box.x-root.x))+'px';this.inline.style.top=Math.max(8,Math.min(root.height-height-8,box.y+box.height-root.y+8))+'px';}
 refresh(){if(this.disposed||this.applying||this.historyBusy||!this.edit)return;try{this.context(this.edit);}catch(error){try{this.edit.origin.context.bridge.author.cancelPreview();}catch{}this.options.report(String(error));this.close();return;}this.position();}
 dispose(){this.disposed=true;this.events.abort();this.timers();try{this.edit?.origin.context.bridge.author.cancelPreview();}catch{}this.close();this.views.clear();}
}
