import type {EditAction} from '../shortcuts';
export interface KeyboardIntent {action:EditAction;documentId:string;slideId:string;ids:string[];focusCanvas:boolean;}
export interface KeyboardRecovery {id:string;createdAt:number;intent:KeyboardIntent;phase:'queued'|'executing';error?:string;}
const actions=new Set(['nudge','group','ungroup','front','back','forward','backward','copy','cut','paste','duplicate','delete','undo','redo','clear','select-all','save']);
export function isKeyboardRecovery(value:unknown):value is KeyboardRecovery {
 if(!value||typeof value!=='object')return false;
 const row=value as KeyboardRecovery,intent=row.intent,action=intent?.action;
 return typeof row.id==='string'&&!!row.id&&Number.isFinite(row.createdAt)&&['queued','executing'].includes(row.phase)
  &&!!intent&&typeof intent.documentId==='string'&&typeof intent.slideId==='string'&&Array.isArray(intent.ids)&&intent.ids.every(id=>typeof id==='string')&&typeof intent.focusCanvas==='boolean'
  &&!!action&&actions.has(action.type)&&(action.type!=='nudge'||Number.isFinite(action.dx)&&Number.isFinite(action.dy))&&(row.error===undefined||typeof row.error==='string');
}
const sameScope=(a:KeyboardIntent,b:KeyboardIntent)=>a.documentId===b.documentId&&a.slideId===b.slideId&&JSON.stringify(a.ids)===JSON.stringify(b.ids);
/** Session-owned keyboard admission and scheduling, independent of UI nodes and rendering. */
export class KeyboardQueue {
 private queue:KeyboardRecovery[]=[];
 private failed:KeyboardRecovery[]=[];
 private active?:KeyboardRecovery;
 private timer?:ReturnType<typeof setTimeout>;
 private running?:Promise<void>;
 private closed=false;
 private durable=new Set<string>();
 private waiters=new Set<()=>void>();
 constructor(private context:{prepare:()=>Promise<void>;execute:(item:KeyboardIntent,effectsComplete:(selection?:readonly string[])=>void)=>Promise<readonly string[]|undefined>;error:(cause:unknown)=>void;retain?:(records:KeyboardRecovery[])=>Promise<void>},signal:AbortSignal){
  if(signal.aborted)this.closed=true;else signal.addEventListener('abort',()=>this.close(),{once:true});
 }
 enqueue(source:KeyboardIntent){
  if(this.closed||!actions.has(source.action.type))return;
  const action=source.action;
  if(action.type==='nudge'&&(!Number.isFinite(action.dx)||!Number.isFinite(action.dy)||Math.abs(action.dx)>10||Math.abs(action.dy)>10))return;
  const item=structuredClone(source),last=this.queue.at(-1)?.intent;
  if(last?.action.type==='nudge'&&item.action.type==='nudge'&&sameScope(last,item)){
   last.action.dx+=item.action.dx;last.action.dy+=item.action.dy;last.focusCanvas||=item.focusCanvas;
  }else this.queue.push({id:crypto.randomUUID(),createdAt:Date.now(),intent:item,phase:'queued'});
  clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.drain();},action.type==='nudge'?100:0);
 }
 get pending(){return !!this.running||this.queue.length>0||this.failed.some(row=>!this.durable.has(row.id));}
 whenIdle(){return this.running||(!this.closed&&this.queue.length)?new Promise<void>(resolve=>this.waiters.add(resolve)):Promise.resolve();}
 /** Original intents remain available until a durable recovery adapter consumes them. */
 retained(){return structuredClone([...this.failed,...(this.active?[this.active]:[]),...this.queue]);}
 private finish(){for(const done of this.waiters)done();this.waiters.clear();}
 private drain(){
  if(this.running||this.closed)return;
  this.running=(async()=>{
   try{
    while(this.queue.length&&!this.closed){
     await this.context.prepare();if(this.closed)return;
     const record=this.queue.shift()!;record.phase='executing';this.active=record;
     const complete=(selection?:readonly string[])=>{
      if(this.active!==record)return;
      this.active=undefined;
      if(selection)for(const queued of this.queue)if(sameScope(queued.intent,record.intent))queued.intent.ids=[...selection];
     };
     const selection=await this.context.execute(structuredClone(record.intent),complete);complete(selection);
    }
   }catch(cause){
    if(this.active)this.active.error=cause instanceof Error?cause.message:String(cause);
    this.failed.push(...(this.active?[this.active]:[]),...this.queue);this.active=undefined;this.queue=[];
    try{await this.persistRetained();}catch(storageError){if(!this.closed)this.context.error(storageError);}
    if(!this.closed)this.context.error(cause);
   }finally{this.running=undefined;this.finish();}
  })();
 }
 private async persistRetained(){const records=this.retained();if(this.context.retain){await this.context.retain(records);for(const record of records)this.durable.add(record.id);}}
 async seal(){this.close();await this.running;await this.persistRetained();}
 close(){this.closed=true;clearTimeout(this.timer);this.timer=undefined;if(!this.running)this.finish();}
}
