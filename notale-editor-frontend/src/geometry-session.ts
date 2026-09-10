import { commitSchema } from '@notale/editor/browser';
import type { Pending } from './pending-journal.js';
import { SyncJournal, type SavedOperation } from './sync-journal.js';
export type GeometryState={chart?:import('@notale/editor/browser').Slide['nativeCharts'][string];id:string;style:string|null;patch?:Record<string,string|null>;vector?:unknown[]};
export type GeometryEdit={id:string;slideId:string;runtimeId:string;sequence:number;sourceVersion?:number;commands:unknown[];before:GeometryState[];after:GeometryState[];task?:Pending;vector?:boolean;chart?:boolean};
/** Shared durable document queue. Geometry is one producer, never a second writer. */
export class GeometrySession {
  ownerId=sessionStorage.getItem('notale-sync-client')??crypto.randomUUID();
  private documentId='';private entries:SavedOperation[]=[];private undone:SavedOperation[]=[];
  private running:Promise<void>|undefined;private failure:unknown;private activeId='';private lastTime=0;private volatile:SavedOperation[]=[];private retainedCount=0;private timer:ReturnType<typeof setTimeout>|undefined;private backoff=1000;
  private journal=new SyncJournal();private initialized=this.initialize();
  private channel=new BroadcastChannel('notale-document-sync-v1');
  constructor(private context:{task:(edit:GeometryEdit)=>Pending;submit:(task:Pending)=>Promise<number>;paint:(states:GeometryState[])=>void;changed:()=>void;error:(error:unknown)=>void;remote:()=>Promise<void>;confirm:(task:Pending,version:number)=>void;recovered:(task:Pending)=>void;snapshot:()=>unknown}) {
    this.channel.onmessage=e=>{if(e.data?.documentId===this.documentId){if(e.data.task?.owner===this.ownerId)this.context.confirm(e.data.task,e.data.version);if(!this.running)void this.reloadAndDrain();}};
    window.addEventListener('online',()=>{void this.retry().catch(this.context.error);});
    window.addEventListener('focus',()=>{if(this.documentId)void this.context.remote().catch(()=>{});});
    setInterval(()=>{if(this.documentId&&!document.hidden&&!this.running)void this.context.remote().catch(()=>{});},3000);
  }
  private async initialize(){
    await this.journal.ready();
    while(true){const claimed=await new Promise<boolean>((resolve,reject)=>{void navigator.locks.request('notale-tab:'+this.journal.namespace+':'+this.ownerId,{ifAvailable:true},async lock=>{resolve(!!lock);if(lock)await new Promise<void>(()=>{});}).catch(reject);});if(claimed)break;this.ownerId=crypto.randomUUID();}
    sessionStorage.setItem('notale-sync-client',this.ownerId);await this.journal.migrate();
  }
  async ownsHistory(task:Pending){if(!task.owner||task.owner===this.ownerId)return true;const locks=await navigator.locks.query();return !locks.held?.some(l=>l.name==='notale-tab:'+this.journal.namespace+':'+task.owner);}
  private async reloadAndDrain(){try{await this.refresh();await this.context.remote();await this.drain();}catch(e){this.context.error(e);}}
  private async refresh(){const all=await this.journal.list(this.documentId);this.retainedCount=all.filter(e=>e.state==='recovery').length;this.entries=all.filter(e=>e.state==='pending');this.context.changed();}
  async load(documentId:string){await this.initialized;await this.journal.migrate();this.documentId=documentId;this.failure=undefined;this.undone=[];for(const entry of await this.journal.list(documentId)){if(entry.staged&&entry.draftTask&&await this.ownsHistory(entry.draftTask))await this.journal.finalize(entry.id);}await this.refresh();}
  private record(edit?:GeometryEdit,task?:Pending):SavedOperation{return {id:edit?.id??task!.request.mutationId,documentId:this.documentId,edit,task:task?{...task,owner:task.owner??this.ownerId}:undefined,createdAt:this.lastTime=Math.max(Date.now(),this.lastTime+1),state:'pending'};}
  async enqueue(edit:GeometryEdit){
    if(!commitSchema.shape.commands.safeParse(edit.commands).success)throw Error('手势命令无效');
    const entry=this.record({...edit,sourceVersion:this.context.task(edit).request.baseVersion,owner:this.ownerId} as GeometryEdit,edit.task);await this.add(entry);void this.drain().catch(this.context.error);
  }
  async stageText(task:Pending){await this.initialized;const entry:SavedOperation={id:task.request.mutationId,documentId:task.documentId,draftTask:{...task,owner:this.ownerId},staged:true,createdAt:Date.now(),state:'pending'};try{if(!await this.journal.stage(entry))throw Error('文字批次已提交');this.volatile=this.volatile.filter(e=>e.id!==entry.id);this.entries=this.entries.filter(e=>e.id!==entry.id);this.entries.push(entry);this.context.changed();}catch(e){this.volatile=this.volatile.filter(v=>v.id!==entry.id);this.volatile.push(entry);this.failure=e;this.context.changed();throw e;}}
  async finalizeText(id:string){await this.journal.finalize(id);await this.refresh();void this.drain().catch(this.context.error);}
  async cancelText(id:string){const result=await this.journal.cancel(id);if(result)await this.refresh();return result;}
  async submit(task:Pending){const entry=this.record(undefined,task);await this.add(entry);await this.drain();if(await this.journal.get(entry.id))throw this.failure??Error('修改尚未同步，已保存在本机');}
  private async add(entry:SavedOperation){await this.initialized;this.entries.push(entry);this.undone=[];this.context.changed();try{await this.journal.put(entry);}catch(e){this.volatile.push(entry);this.failure=Error('无法写入本机草稿，请保留当前窗口并导出修改');this.context.error(this.failure);this.context.changed();throw e;}this.context.changed();}
  has(id:string){return this.entries.some(e=>e.id===id&&!!e.edit);}
  get onlyChartEdits(){return this.entries.every(e=>e.edit?.chart);}
  get count(){return this.entries.length;}
  get canUndo(){const e=this.entries.at(-1);return !!e?.edit&&e.id!==this.activeId&&!e.task;}
  get canRedo(){return this.undone.length>0;}
  get blocked(){return !!this.failure;}
  get status(){if(this.volatile.length)return '本机保存失败 · 请导出草稿';if(!this.failure)return this.count?(this.entries.every(e=>e.staged)?'编辑中 · 草稿已存本机':'正在保存…'):this.retainedCount?'已同步 · 有待恢复草稿':'';const code=(this.failure as any)?.code;return !code||/^HTTP_5|^HTTP_429|^INTERNAL/.test(code)?'已保存到本机 · 等待联网同步':'同步已暂停 · 草稿保留在本机';}
  private patches(edit:GeometryEdit,reverse=false):GeometryState[]{return (reverse?edit.before:edit.after).map((state:GeometryState)=>{if(state.vector||state.chart)return state;const old=(reverse?edit.after:edit.before).find((s:GeometryState)=>s.id===state.id);const a=document.createElement('div'),b=document.createElement('div');a.setAttribute('style',old?.style??'');b.setAttribute('style',state.style??'');const patch:Record<string,string|null>={};for(const key of new Set([...a.style,...b.style]))if(a.style.getPropertyValue(key)!==b.style.getPropertyValue(key))patch[key]=b.style.getPropertyValue(key)||null;return {...state,patch};});}
  states(slideId:string){return this.entries.filter(e=>e.edit?.slideId===slideId).flatMap(e=>this.patches(e.edit!));}
  get firstSlide(){return this.entries[0]?.edit?.slideId??this.entries[0]?.task?.slideId;}
  async undo(){if(!this.canUndo)return false;const edit=this.entries.at(-1)!;if(!await this.journal.cancel(edit.id))return false;this.entries=this.entries.filter(e=>e.id!==edit.id);this.undone.push(edit);this.context.paint(this.patches(edit.edit,true));this.context.changed();return true;}
  async redo(){const entry=this.undone.pop();if(!entry)return false;const rest=[...this.undone];await this.enqueue({...entry.edit,id:crypto.randomUUID(),task:undefined});this.undone=rest;this.context.paint(this.patches(entry.edit));return true;}
  async drain():Promise<void>{
    await this.initialized;if(this.running){await this.running;return this.drain();}if(this.failure)throw this.failure;if(!this.documentId)return;
    this.running=(async()=>{await navigator.locks.request('notale-sync:'+this.journal.namespace+':'+this.documentId,async()=>{
      while(true){const pending=(await this.journal.list(this.documentId)).filter(e=>e.state==='pending');if(!pending.length){this.entries=[];break;}
        const entry=pending[0];this.entries=pending;if(entry.staged)break;this.activeId=entry.id;
        if(!entry.task){entry.task={...this.context.task(entry.edit),owner:entry.edit.owner??this.ownerId,geometry:!entry.edit.vector&&!entry.edit.chart,vector:!!entry.edit.vector,chart:!!entry.edit.chart};if(!await this.journal.claim(entry.id,entry.task))continue;}
        try{const version=await this.context.submit(entry.task);await this.journal.acknowledge(entry.id,this.documentId,version,this.context.snapshot());this.backoff=1000;this.entries=this.entries.filter(e=>e.id!==entry.id);this.activeId='';this.context.changed();this.channel.postMessage({documentId:this.documentId,version,task:entry.task});}
        catch(error){const code=(error as any)?.code;if(code==='SYNC_RECOVERY_REQUIRED'||code==='OBJECT_NOT_FOUND'||code==='SLIDE_NOT_FOUND') {entry.state='recovery';entry.error=String(error);await this.journal.put(entry);this.retainedCount++;this.context.recovered(entry.task);this.entries=this.entries.filter(e=>e.id!==entry.id);this.context.error(Error('部分修改无法应用，完整操作已保留为恢复草稿'));continue;}throw error;}
      }
    });})();
    try{await this.running;void this.context.remote().catch(this.context.error);}catch(error){this.failure=error;const code=(error as any)?.code;if(!code||/^HTTP_5|^HTTP_429|^NETWORK|^TIMEOUT|^INTERNAL/.test(code)){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.retry().catch(()=>{});},this.backoff);this.backoff=Math.min(30000,this.backoff*2);}throw error;}finally{this.running=undefined;this.activeId='';this.context.changed();}
  }
  async retry(){for(const entry of this.volatile){await this.journal.put(entry);if(entry.staged)await this.journal.finalize(entry.id);}this.volatile=[];this.failure=undefined;clearTimeout(this.timer);await this.drain();}
  async barrier(){if(this.entries.length)await this.drain();}
  async abandon(){if(this.running)throw Error('请等待当前保存结束');for(const e of this.entries){e.state='recovery';e.error='用户保留草稿后重新载入';await this.journal.put(e);}this.entries=[];this.undone=[];this.failure=undefined;this.context.changed();}
  async checkpoint(snapshot:unknown){await this.journal.checkpoint(this.documentId,snapshot);}
  async pull(){await this.context.remote();}
  async importDraft(raw:string){await this.initialized;await this.journal.importFile(raw);this.context.changed();}
  async retained(){await this.initialized;return this.journal.list();}
  async recoveries(){await this.initialized;return (await this.journal.list()).filter(e=>e.state==='recovery');}
  async exportDraft(){return JSON.stringify({schema:'notale-sync-v1',documentId:this.documentId,checkpoint:await this.journal.checkpoint(this.documentId),operations:[...await this.journal.list(this.documentId),...this.volatile].map(e=>({...e,task:e.task??e.draftTask,staged:false,draftTask:undefined}))},null,2);}
}
