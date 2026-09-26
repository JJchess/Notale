import type {Command} from '@notale/editor/browser';
import type {LocalizedMessage} from '@notale/editor/i18n';
export type AiIntent='edit-deck'|'edit-selection';
export interface AiStep extends Partial<LocalizedMessage> {
 chipMessage?:LocalizedMessage;
 detailMessages?:(LocalizedMessage|null)[];
 label:string;
 status:'active'|'done';
 chip?:string;            // the node's argument: the model name, a command count
 detail?:string[];        // what it did; on a retry the first line is why the last attempt failed
}
/** Scratch pages of interaction-insert transactions: created and deleted in the same batch. A page
 * the batch creates and keeps is a real new page. */
export function scratchPages(commands:readonly Command[]){
 const deleted=new Set(commands.flatMap(command=>command.type==='slide.delete'?[(command as {slideId:string}).slideId]:[]));
 return new Set(commands.flatMap(command=>command.type==='slide.insert'&&deleted.has((command as {slide:{id:string}}).slide.id)?[(command as {slide:{id:string}}).slide.id]:[]));
}
/** The real pages a batch touches: the scratch page of an insert transaction is not one of them. */
export function slidesOf(commands:readonly Command[]):string[]{
 const scratch=scratchPages(commands);
 const ids:string[]=[];
 for(const command of commands){
  const slideId=(command as {slideId?:unknown}).slideId;
  if(typeof slideId==='string'&&!scratch.has(slideId)&&!ids.includes(slideId))ids.push(slideId);
 }
 return ids;
}
/** Just enough of an object to say what a command will change it from. */
export interface AiObject {id:string;tag:string;text:string;style:Record<string,string>;attributes:Record<string,string>;}
/** One line of "what this candidate will change". */
export interface DiffRow {target:string;label:string;what:string;from?:string;to?:string;slideId?:string;page?:string;turn?:string;
 /** The label is one of our own words (an unnamed object's kind), not authored text: translate it. */
 generic?:boolean;}
/** Labels the list makes up for things without a name. An object authored with exactly one of these
 * names is translated too; an authored name is never passed to the translator otherwise. */
export const GENERIC_LABELS=new Set(['页面样式','样式链接','页面元信息','脚本','新内容','新页面','讲义主题','交互']);
/** A finished turn, for the transcript. UI only: the real transcript is the server session's. */
export interface AiTurn {id:string;instruction:string;targetLabel:string;intent:AiIntent;steps:AiStep[];
 status:'complete'|'incomplete'|'interrupted'|'failed';text?:string;detail?:string;version?:number;
 /** What the turn referred to, so "retry" can ask the same thing again. */
 targets?:string[];}
/** A model the server can reach, as `/api/ai/models` lists it. */
export interface AiModelRef {provider:string;id:string}
export interface AiModelInfo {id:string;name:string;vision:boolean;contextWindow:number}
export interface AiProvider {provider:string;name:string;available:boolean;reason?:string;models:AiModelInfo[]}
/** A picture the author attached for the model to look at. `url` is a local preview. */
export interface AiAttachment {id:string;name:string;mime:string;data:string;url:string}
/** One @ suggestion: what the menu shows, and the path text it inserts (pi's @file reference). */
export interface AiMention {kind:'page'|'object';label:string;detail:string;insert:string}
export const ATTACHMENT_LIMIT=4,ATTACHMENT_BYTES=5*1024*1024;
const IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
/** What is not reviewed yet: the document at the session's baseline against now. */
export interface AiReview {reviewBase:number;version:number;rows:DiffRow[];}
export interface AiModel {
 available:boolean;          // false until the host configures a model service
 reason:string;              // why it is unavailable, shown in place of the submit button
 status:'idle'|'running'|'error';
 instruction:string;
 /** What the turn in flight was sent with. The composer is cleared on send; this keeps the bubble. */
 sent:string;
 intent:AiIntent;
 targets:string[];
 targetLabel:string;
 steps:AiStep[];             // the real pipeline nodes of the turn in flight, in order
 turns:AiTurn[];             // finished turns, oldest first -- the visible transcript
 sessionId:string;           // the server-side conversation; empty until the first turn
 review?:AiReview;           // changes since the baseline, AI's and the author's alike
 error:string;
 /** The model's words for the call in flight, as they stream. */
 reply:string;
 providers:AiProvider[];     // what the picker lists; services without a key are listed, unavailable
 defaultModel?:AiModelRef;
 /** The author's pick; absent means the server's default. */
 choice?:AiModelRef;
 /** Whether the model that will answer can look at pictures. */
 vision:boolean;
 attachments:AiAttachment[];
 pickModel?:(ref:AiModelRef)=>void;
 attach?:(files:readonly File[])=>Promise<void>;
 detach?:(id:string)=>void;
 retry?:(turnId:string)=>Promise<void>;
 /** What @ can refer to: every page by its file, then the current page's objects. */
 mentions?:()=>AiMention[];
 change?:(patch:{instruction?:string})=>void;
 submit?:()=>Promise<void>;
 stop?:()=>void;
 accept?:()=>Promise<void>;
 discard?:()=>Promise<void>;
 /** Show a touched object on the canvas: switch to its page and select it. */
 locate?:(slideId:string,id:string)=>void;
 newConversation?:()=>void;
 clearSelection?:()=>void;
}
const initial:AiModel={available:false,reason:'',status:'idle',instruction:'',sent:'',intent:'edit-deck',targets:[],targetLabel:'',steps:[],turns:[],sessionId:'',error:'',reply:'',providers:[],vision:true,attachments:[]};
const MODEL_KEY='notale-ai-model';
/** The model a pick names, if the server still lists it as usable. */
export function findModel(providers:readonly AiProvider[],ref:AiModelRef|undefined){return ref?providers.find(p=>p.provider===ref.provider&&p.available)?.models.find(m=>m.id===ref.id):undefined;}
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
const publish=(next:AiModel)=>{model=next;for(const fn of listeners)fn();};
export const aiEditsState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
/** A step with the same label as the last one updates it in place (active→done); a new label
 * is a new row -- e.g. a retry's "请求模型（第 2 次尝试）" is genuinely a separate attempt. */
export function appendStep(steps:readonly AiStep[],step:AiStep):AiStep[]{
 if(steps.length&&steps[steps.length-1].label===step.label)return [...steps.slice(0,-1),step];
 return [...steps,step];
}
/** The wire format is newline-delimited JSON so progress can be read as it arrives without
 * SSE/WebSocket machinery. Pure and transport-independent: a chunk boundary can land mid-line,
 * so an incomplete trailing line is held back (`rest`) until the next chunk completes it. */
export function splitNdjson(buffer:string,chunk:string):{lines:unknown[];rest:string}{
 const parts=(buffer+chunk).split('\n'),rest=parts.pop()??'';
 return {lines:parts.filter(line=>line.trim()).map(line=>JSON.parse(line)),rest};
}
/** What the candidate will touch, in the author's words rather than command types. */
export function summarize(commands:readonly Command[]):string[]{
 const labels:Record<string,string>={'element.insert':'新增内容','element.patch':'修改对象','element.content':'替换内部结构','element.delete':'删除对象','component.set':'定义交互','component.remove':'移除交互','elements.transfer':'新增内容',
  'slide.duplicate':'复制页面','slide.move':'调整页序','slide.update':'修改页面属性','slide.replace':'修改页面','deck.update':'修改讲义主题'};
 const counts=new Map<string,number>();
 const add=(label:string)=>counts.set(label,(counts.get(label)??0)+1);
 const scratch=scratchPages(commands);
 for(const command of commands){
  if(command.type==='slide.insert'&&!scratch.has((command as {slide:{id:string}}).slide.id)){add('新增页面');continue;}
  if(command.type==='slide.delete'){if(!scratch.has((command as {slideId:string}).slideId))add('删除页面');continue;}
  // The scratch page of an insert transaction is plumbing; what it carries is the interaction.
  if(command.type==='slide.insert'){
   const slide=(command as {slide?:{components?:unknown[]}}).slide;
   if(slide?.components?.length)add('定义交互');
   continue;
  }
  const label=labels[command.type];
  if(label)add(label);
 }
 return [...counts].map(([label,count])=>count>1?`${label} ×${count}`:label);
}
/** CSS property names an author would recognise. Anything not listed shows its own name --
 * a wrong guess at a translation is worse than the property itself. */
const PROPERTY_NAMES:Record<string,string>={color:'颜色','background-color':'背景色',background:'背景','font-size':'字号','font-family':'字体','font-weight':'字重','line-height':'行高','text-align':'对齐',opacity:'不透明度',left:'左边距',top:'上边距',width:'宽度',height:'高度',padding:'内边距',margin:'外边距','border-radius':'圆角',border:'描边',display:'显示'};
export const DIFF_PREVIEW=6;
/** The canvas reports colours as rgb(); models write hex. Showing both formats side by side in
 * one row makes the reader do the conversion, so normalise to hex for display. */
export function displayValue(value:string|undefined){
 if(value===undefined)return undefined;
 const rgb=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value.trim());
 if(!rgb||(rgb[4]!==undefined&&Number(rgb[4])<1))return value.trim();
 return '#'+[rgb[1],rgb[2],rgb[3]].map(part=>Number(part).toString(16).padStart(2,'0')).join('');
}
/** The author-facing name of an object: what they'd call it, not its id. */
const NON_VISUAL:Record<string,string>={style:'页面样式',link:'样式链接',meta:'页面元信息',script:'脚本'};
const clip=(text:string)=>text.length>14?text.slice(0,14)+'…':text;
export function objectLabel(object:AiObject|undefined,id:string){
 if(!object)return id;
 const named=object.attributes['data-notale-name']?.trim();
 if(named)return named;
 // A <style>'s text is CSS, not a name anyone would call it by.
 if(NON_VISUAL[object.tag])return NON_VISUAL[object.tag];
 const text=object.text.trim();
 if(!text||/^@|[{}]/.test(text))return object.tag;
 return clip(text);
}
/** What to call a fragment that does not exist yet: its first words, else its first tag. */
export function insertLabel(html:string){
 const text=html.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 if(text)return clip(text);
 return /^\s*<\s*([a-z][\w-]*)/i.exec(html)?.[1]?.toLowerCase()??'新内容';
}
/** Row per property the candidate touches, with the value it replaces. The canvas preview shows
 * the result; this says what was actually asked for, which a picture cannot. */
/** What to call the current selection in the composer's reference chip. */
export function selectionName(objects:readonly AiObject[],targets:readonly string[]){
 if(!targets.length)return '';
 const name=objectLabel(objects.find(object=>object.id===targets[0]),targets[0]);
 return targets.length>1?`${name} 等 ${targets.length} 个对象`:name;
}
/** One chip per object a candidate touches, with how many of its properties change. The table
  * is for deciding; these are for recalling a turn that is already over. */
export type ChangeKind='patch'|'insert'|'delete'|'content'|'component';
/** One touched object: what the review list shows a line for. */
export interface DiffChip {target:string;label:string;count:number;rows:DiffRow[];kind:ChangeKind;slideId?:string;page?:string;turn?:string;generic?:boolean;}
const kindOf=(what:string):ChangeKind=>what==='新增'||what==='新增页面'||what==='复制页面'?'insert':what==='删除'||what==='删除页面'?'delete':what==='定义交互'?'component':what==='内部结构'?'content':'patch';
export function diffChips(rows:readonly DiffRow[]):DiffChip[]{
 const chips=new Map<string,DiffChip>();
 for(const row of rows){
  // The same object touched in two turns is two lines: each turn is its own decision.
  const key=JSON.stringify([row.turn??'',row.target||row.label]);
  const chip=chips.get(key)??{target:row.target,label:row.label,count:0,rows:[],kind:kindOf(row.what),
   ...(row.slideId?{slideId:row.slideId}:{}),...(row.page?{page:row.page}:{}),...(row.turn?{turn:row.turn}:{}),...(row.generic?{generic:true}:{})};
  chip.count++;chip.rows.push(row);chips.set(key,chip);
 }
 return [...chips.values()];
}
/** `objects` is the current page's list, or a lookup by page for a candidate that spans several. */
/** `after` answers "the page as this candidate leaves it": a whole-page replacement is read by
 * comparing the objects before and after, one row per object that appeared, went, or changed. */
export function diffRows(commands:readonly Command[],objects:readonly AiObject[]|((slideId:string)=>readonly AiObject[]|undefined),after?:(slideId:string)=>readonly AiObject[]|undefined):DiffRow[]{
 const lookup=typeof objects==='function'?objects:()=>objects;
 const rows:DiffRow[]=[];
 // Scratch pages of insert transactions: the component row already stands for what they carry.
 const scratch=scratchPages(commands);
 // A page is named by its title; a page this batch creates has no row of its own to look up.
 const pageName=(id:string)=>(commands.find(command=>command.type==='slide.insert'&&(command as {slide:{id:string}}).slide.id===id) as {slide?:{name?:string}}|undefined)?.slide?.name||id;
 commands.forEach((command,index)=>{
  const slideId=typeof (command as {slideId?:unknown}).slideId==='string'?(command as {slideId:string}).slideId:'';
  const byId=new Map((lookup(slideId)??[]).map(object=>[object.id,object]));
  if(command.type==='slide.insert'&&!scratch.has((command as {slide:{id:string}}).slide.id)){
   const slide=(command as {slide:{id:string;name?:string}}).slide;
   rows.push({target:'page:'+slide.id,label:slide.name||'新页面',what:'新增页面',slideId:slide.id});
   return;
  }
  if(command.type==='slide.delete'&&!scratch.has(slideId)){rows.push({target:'page:'+slideId,label:pageName(slideId),what:'删除页面',slideId});return;}
  if(command.type==='slide.duplicate'){rows.push({target:'page:'+(command as {newId:string}).newId,label:pageName(slideId),what:'复制页面',slideId:(command as {newId:string}).newId});return;}
  if(command.type==='slide.move'){rows.push({target:'page:'+slideId,label:pageName(slideId),what:'页序',to:`第 ${(command as {index:number}).index+1} 页`,slideId});return;}
  if(command.type==='slide.update'){
   for(const [field,value] of Object.entries(command as Record<string,unknown>))if(!['type','slideId'].includes(field))
    rows.push({target:'page:'+slideId,label:pageName(slideId),what:({name:'页面名称',notes:'备注',hidden:'隐藏',section:'分节',transition:'切换效果',theme:'页面主题'} as Record<string,string>)[field]??field,to:typeof value==='string'?value:JSON.stringify(value),slideId});
   return;
  }
  if(command.type==='slide.replace'){
   const before=new Map((lookup(slideId)??[]).map(object=>[object.id,object]));
   const now=new Map((after?.(slideId)??[]).map(object=>[object.id,object]));
   for(const [id,object] of now){
    const was=before.get(id),label=objectLabel(object,id);
    if(!was){rows.push({target:id,label,what:'新增',slideId});continue;}
    if(was.text.trim()!==object.text.trim())rows.push({target:id,label,what:'文字',from:was.text.trim()||undefined,to:object.text.trim(),slideId});
    for(const property of new Set([...Object.keys(was.style),...Object.keys(object.style)]))
     if(was.style[property]!==object.style[property])rows.push({target:id,label,what:PROPERTY_NAMES[property]??property,from:displayValue(was.style[property]),to:displayValue(object.style[property])??'（移除）',slideId});
    for(const name of new Set([...Object.keys(was.attributes),...Object.keys(object.attributes)]))
     if(name!=='style'&&was.attributes[name]!==object.attributes[name])rows.push({target:id,label,what:name,from:displayValue(was.attributes[name]),to:displayValue(object.attributes[name])??'（移除）',slideId});
   }
   for(const [id,object] of before)if(!now.has(id))rows.push({target:id,label:objectLabel(object,id),what:'删除',slideId});
   return;
  }
  if(command.type==='deck.update'){
   for(const [name,value] of Object.entries((command as {theme?:Record<string,string>}).theme??{}))rows.push({target:'deck',label:'讲义主题',what:name,to:displayValue(value)});
   return;
  }
  if(command.type==='slide.insert'){
   const slide=(command as {slide?:{id:string;components?:{id?:string;name?:string}[]}}).slide;
   for(const component of slide?.components??[])
    rows.push({target:'insert:'+(component.id??slide!.id),label:component.name??'交互',what:'定义交互',to:component.name??'交互'});
   return;
  }
  if(command.type==='slide.delete')return;
  if(command.type==='elements.transfer'&&scratch.has((command as {sourceSlideId:string}).sourceSlideId)){
   // The move out of the scratch page lands on the real page: tag the component's row with it.
   for(const row of rows)if(row.target.startsWith('insert:')&&!row.slideId)row.slideId=slideId;
   return;
  }
  const start=rows.length;
  const target='target' in command&&typeof command.target==='string'?command.target:'';
  const object=byId.get(target);
  const label=objectLabel(object,target);
  if(command.type==='element.patch'){
   const patch=(command as {patch:{text?:string;style?:Record<string,string>;attributes?:Record<string,string|null>}}).patch;
   if(patch.text!==undefined)rows.push({target,label,what:'文字',from:object?.text.trim()||undefined,to:patch.text});
   for(const [property,value] of Object.entries(patch.style??{}))
    rows.push({target,label,what:PROPERTY_NAMES[property]??property,from:displayValue(object?.style[property]),to:displayValue(value)});
   for(const [name,value] of Object.entries(patch.attributes??{}))
    rows.push({target,label,what:name,from:displayValue(object?.attributes[name]),to:value===null?'（移除）':displayValue(value)});
  }
  else if(command.type==='element.content')rows.push({target,label,what:'内部结构',to:'整体替换'});
  else if(command.type==='element.delete')rows.push({target,label,what:'删除'});
  else if(command.type==='element.insert')rows.push({target:'insert:'+index,label:insertLabel((command as {html:string}).html),what:'新增'});
  else if(command.type==='elements.transfer')rows.push({target:'insert:'+index,label:'新内容',what:'新增'});
  if(slideId)for(const row of rows.slice(start))row.slideId=slideId;
 });
 for(const row of rows)if(GENERIC_LABELS.has(row.label))row.generic=true;
 return rows;
}
const storageKey=(documentId:string)=>'notale-ai-session-'+documentId;
const STORAGE_LIMIT=200_000;
/** Per deck: which server session the conversation is, and the turns to show. */
export function loadConversation(documentId:string):{sessionId:string;turns:AiTurn[]}{
 try{
  const raw=localStorage.getItem(storageKey(documentId));
  if(!raw)return {sessionId:'',turns:[]};
  const parsed=JSON.parse(raw) as {sessionId?:string;turns?:AiTurn[]};
  return {sessionId:typeof parsed.sessionId==='string'?parsed.sessionId:'',turns:Array.isArray(parsed.turns)?parsed.turns:[]};
 }catch{return {sessionId:'',turns:[]};}
}
export function saveConversation(documentId:string,state:{sessionId:string;turns:AiTurn[]}){
 try{
  let turns=state.turns,payload=JSON.stringify({sessionId:state.sessionId,turns});
  while(payload.length>STORAGE_LIMIT&&turns.length){turns=turns.slice(1);payload=JSON.stringify({sessionId:state.sessionId,turns});}
  localStorage.setItem(storageKey(documentId),payload);
 }catch{/* private browsing, quota, or no DOM at all */}
}
/** The stream's last line: what the turn committed and said. */
export interface AiTurnResult {sessionId:string;reviewBase:number;version?:number;status:'complete'|'incomplete'|'interrupted';text:string;note?:string;}
export interface AiReviewReply {reviewBase:number;version:number;commands:Command[];before:Record<string,AiObject[]>;after:Record<string,AiObject[]>;}
export interface AiContext {
 documentId:()=>string;
 slideId:()=>string;
 selection:()=>string[];
 selectionLabel:()=>string;
 /** The page's objects, for naming the current selection. */
 objects:()=>readonly AiObject[];
 /** Runs a turn; `onSession` fires as soon as the server says which session it is. */
 request:(path:string,body:unknown,signal:AbortSignal,onStep:(step:AiStep)=>void,onSession:(id:string)=>void,onText:(delta:string|null)=>void)=>Promise<AiTurnResult>;
 /** The services and the models each key can use. */
 models:()=>Promise<{default:AiModelRef;providers:AiProvider[]}>;
 /** The deck's pages as files, for @ references. */
 pages:()=>readonly {id:string;path:string;name:string}[];
 review:(sessionId:string)=>Promise<AiReviewReply>;
 accept:(sessionId:string,version:number)=>Promise<unknown>;
 discard:(sessionId:string)=>Promise<unknown>;
 /** Stops the running turn; its stream still ends with the result line. */
 interrupt:(sessionId:string)=>Promise<unknown>;
 closeSession:(sessionId:string)=>void;
 /** Bring the author's copy up to what the server has (the AI commits like a collaborator). */
 pull:()=>Promise<void>;
 status:()=>Promise<{available:boolean;reason:string}>;
 clearSelection:()=>void;
 pageLabel?:(slideId:string)=>string;
 /** The confirmed document version: when it moves, the review is stale. */
 version:()=>number;
 locate?:(slideId:string,id:string)=>void;
}
export function bindAiEdits(context:AiContext){
 const token=Symbol();owner=token;
 const active=()=>owner===token;
 let controller:AbortController|undefined,stopped=false;
 let loaded='',reviewed=-1,reviewing:Promise<void>|undefined;
 const render=(patch:Partial<AiModel>)=>{if(active())publish({...model,...patch});};
 const persist=(patch:{sessionId?:string;turns?:AiTurn[]})=>{saveConversation(context.documentId(),{sessionId:patch.sessionId??model.sessionId,turns:patch.turns??model.turns});render(patch);};
 /** The review is the document at the baseline against the author's copy now. */
 async function reloadReview(){
  const sessionId=model.sessionId;
  if(!sessionId){render({review:undefined});return;}
  const version=context.version();
  reviewed=version;
  try{
   const reply=await context.review(sessionId);
   if(!active()||sessionId!==model.sessionId)return;
   const rows=diffRows(reply.commands,slideId=>reply.before[slideId],slideId=>reply.after[slideId]);
   const pages=new Set(rows.flatMap(row=>row.slideId?[row.slideId]:[]));
   if(pages.size>1)for(const row of rows)if(row.slideId)row.page=context.pageLabel?.(row.slideId)??row.slideId;
   render({review:rows.length?{reviewBase:reply.reviewBase,version:reply.version,rows}:undefined});
  }catch{/* the next version change asks again */}
 }
 const queueReview=()=>{if(!reviewing)reviewing=reloadReview().finally(()=>{reviewing=undefined;if(active()&&model.sessionId&&reviewed!==context.version())queueReview();});};
 function refresh(){
  if(!active())return;
  if(loaded!==context.documentId()){
   loaded=context.documentId();
   const stored=loadConversation(loaded);
   reviewed=-1;
   render({sessionId:stored.sessionId,turns:stored.turns,review:undefined});
  }
  const targets=context.selection();
  const intent:AiIntent=targets.length?'edit-selection':'edit-deck';
  // Any commit -- the AI's or the author's -- changes what is unreviewed.
  if(model.sessionId&&reviewed!==context.version())queueReview();
  if(model.status==='running')return;
  render({intent,targets,targetLabel:selectionName(context.objects(),targets)||context.selectionLabel()});
 }
/** One turn: what to ask, about which objects. The composer's words, pictures and pick go with it. */
 async function send(instruction:string,targets:string[],targetLabel:string){
  const intent:AiIntent=targets.length?'edit-selection':'edit-deck';
  const startedIn=context.documentId(),images=model.attachments;
  controller=new AbortController();stopped=false;
  render({status:'running',error:'',steps:[],reply:'',intent,targets,instruction:'',sent:instruction,attachments:[]});
  const seal=(turn:Omit<AiTurn,'id'|'instruction'|'targetLabel'|'intent'|'steps'>)=>persist({turns:[...model.turns,{id:crypto.randomUUID(),instruction,targetLabel,intent,steps:model.steps,targets,...turn}]});
  try{
   const result=await context.request('/api/documents/'+startedIn+'/ai-edits',
    {...(model.sessionId?{sessionId:model.sessionId}:{}),slideId:context.slideId(),instruction,targets,
     ...(findModel(model.providers,model.choice)?{model:model.choice}:{}),
     ...(images.length?{images:images.map(({mime,data})=>({mime,data}))}:{})},
    controller.signal,
    step=>{if(active())render({steps:appendStep(model.steps,step)});},
    id=>{if(active()&&context.documentId()===startedIn&&id!==model.sessionId)persist({sessionId:id});},
    // A new model call starts over: words before a tool call were a preamble, not the reply.
    delta=>{if(active())render({reply:delta===null?'':model.reply+delta});});
   for(const image of images)URL.revokeObjectURL(image.url);
   if(!active()||context.documentId()!==startedIn){render({status:'idle',sent:'',reply:''});return;}
   seal({status:result.status,text:result.text,...(result.note?{detail:result.note}:{}),...(result.version!==undefined?{version:result.version}:{})});
   // A turn the author stopped hands the words back, to edit and send again.
   render({status:'idle',sent:'',steps:[],reply:'',...(stopped?{instruction}:{})});
   if(result.version!==undefined)await context.pull();
   queueReview();
  }catch(cause){
   if(!active())return;
   const aborted=controller?.signal.aborted;
   const message=cause instanceof Error?cause.message:String(cause);
   // Hung up without a result (no session yet, or the interrupt request failed): nothing committed to show.
   if(aborted){seal({status:'interrupted'});render({status:'idle',instruction:model.sent,sent:'',steps:[],reply:''});}
   else{seal({status:'failed',detail:message});render({status:'error',error:message,sent:'',steps:[],reply:''});}
  }finally{controller=undefined;}
 }
 // The picker's list; a remembered pick survives only while the server still lists it as usable.
 void context.models().then(({default:fallback,providers})=>{
  let saved:AiModelRef|undefined;
  try{saved=JSON.parse(localStorage.getItem(MODEL_KEY)??'null')??undefined;}catch{saved=undefined;}
  const choice=findModel(providers,saved)?saved:undefined;
  render({providers,defaultModel:fallback,...(choice?{choice}:{}),vision:findModel(providers,choice??fallback)?.vision??true});
 }).catch(()=>{/* the picker stays empty; turns use the server's default */});
 void context.status().then(status=>render({available:status.available,reason:status.reason})).catch(()=>render({available:false,reason:'无法确认模型服务状态'}));
 publish({...initial,
  change:patch=>{if(active()&&model.status!=='running')render({...patch,error:''});},
  // Stop is a request of its own (pi's RPC abort, Codex's turn/interrupt); the turn's stream then
  // ends with its result like any other turn. Before the session is known, hanging up is the stop.
  stop:()=>{
   if(!active()||model.status!=='running')return;
   stopped=true;
   if(model.sessionId)void context.interrupt(model.sessionId).catch(()=>controller?.abort());else controller?.abort();
  },
  locate:(slideId,id)=>{if(active())context.locate?.(slideId,id);},
  clearSelection:()=>{if(active())context.clearSelection();},
  newConversation:()=>{
   if(!active()||model.status==='running')return;
   if(model.sessionId)context.closeSession(model.sessionId);
   persist({sessionId:'',turns:[]});render({review:undefined,steps:[],error:'',instruction:'',sent:''});
  },
  submit:async()=>{
   if(!active()||model.status==='running'||!model.instruction.trim())return;
   const targets=context.selection();
   await send(model.instruction.trim(),targets,model.targetLabel);
  },
  // Retry asks the same thing again, about the same objects, as a new turn.
  retry:async turnId=>{
   const turn=model.turns.find(entry=>entry.id===turnId);
   if(!active()||!turn||model.status==='running')return;
   await send(turn.instruction,turn.targets??[],turn.targetLabel);
  },
  mentions:()=>{
   const pages=context.pages(),current=pages.find(page=>page.id===context.slideId());
   return [
    ...pages.map((page,index):AiMention=>({kind:'page',label:page.name||page.path,detail:String(index+1),insert:'@'+page.path})),
    ...(current?context.objects().map((object):AiMention=>({kind:'object',label:objectLabel(object,object.id),detail:object.id,insert:`@${current.path}#${object.id}`})):[]),
   ];
  },
  pickModel:ref=>{
   if(!active()||!findModel(model.providers,ref))return;
   try{localStorage.setItem(MODEL_KEY,JSON.stringify(ref));}catch{/* a per-viewer convenience */}
   render({choice:ref,vision:findModel(model.providers,ref)!.vision});
  },
  attach:async files=>{
   if(!active())return;
   const room=ATTACHMENT_LIMIT-model.attachments.length;
   const accepted=files.filter(file=>IMAGE_TYPES.includes(file.type));
   const tooBig=accepted.filter(file=>file.size>ATTACHMENT_BYTES);
   const taken=accepted.filter(file=>file.size<=ATTACHMENT_BYTES).slice(0,Math.max(0,room));
   const added=await Promise.all(taken.map(async file=>{
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
    for(let at=0;at<bytes.length;at+=0x8000)binary+=String.fromCharCode(...bytes.subarray(at,at+0x8000));
    return {id:crypto.randomUUID(),name:file.name,mime:file.type,data:btoa(binary),url:URL.createObjectURL(file)};
   }));
   if(!active())return;
   const error=tooBig.length?'图片不能超过 5 MB':accepted.length>taken.length||files.length>accepted.length?'最多附 4 张 PNG、JPEG 或 WebP 图片':'';
   render({attachments:[...model.attachments,...added],error});
  },
  detach:id=>{
   const gone=model.attachments.find(entry=>entry.id===id);
   if(!active()||!gone)return;
   URL.revokeObjectURL(gone.url);
   render({attachments:model.attachments.filter(entry=>entry!==gone)});
  },
  accept:async()=>{
   if(!active()||!model.sessionId||!model.review)return;
   try{await context.accept(model.sessionId,model.review.version);render({review:undefined});reviewed=-1;queueReview();}
   catch(cause){render({error:cause instanceof Error?cause.message:String(cause)});}
  },
  discard:async()=>{
   if(!active()||!model.sessionId||!model.review)return;
   try{await context.discard(model.sessionId);await context.pull();reviewed=-1;queueReview();}
   catch(cause){render({error:cause instanceof Error?cause.message:String(cause)});}
  },
 });
 return {render:refresh,dispose(){if(owner===token){owner=undefined;controller?.abort();publish(initial);}}};
}
