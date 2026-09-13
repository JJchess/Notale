import {isKeyboardRecovery,type KeyboardRecovery} from './state/keyboard-queue';
import { commitSchema, identifier } from '@notale/editor/browser';
import { isPending, type Pending } from './pending-journal.js';
export type SavedOperation={id:string;documentId:string;task?:Pending;draftTask?:Pending;staged?:boolean;edit?:any;createdAt:number;state:'pending'|'recovery';error?:string;sent?:boolean};
const request=<T>(req:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
/** One durable record per intent; a closed or duplicated tab cannot orphan a queue. */
export class SyncJournal {
  private db:Promise<IDBDatabase>;
  namespace='';
  constructor(){this.db=(async()=>{const response=await fetch('/api/sync-context');if(!response.ok)throw Error('无法确认草稿所属身份');const {scope,actor}=await response.json();this.namespace=JSON.stringify([scope,actor]);return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('notale-sync-v2:'+this.namespace,1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('operations',{keyPath:'id'}).createIndex('document','documentId');db.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});})();}

  async retainKeyboard(records:KeyboardRecovery[]){const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta');for(const record of records){const check=store.get('keyboard-dismissed:'+record.id);check.onsuccess=()=>{if(!check.result)store.put(structuredClone(record),'keyboard:'+record.id);};}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('快捷键恢复记录写入中断'));});}
  async keyboardRecoveries(documentId?:string){const db=await this.db;const rows=await request(db.transaction('meta').objectStore('meta').getAll(IDBKeyRange.bound('keyboard:','keyboard:\uffff'))) as KeyboardRecovery[];return rows.filter(row=>!documentId||row.intent.documentId===documentId).sort((a,b)=>a.createdAt-b.createdAt);}
  async dismissKeyboard(id:string){const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('keyboard:'+id);tx.objectStore('meta').put(true,'keyboard-dismissed:'+id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async stage(entry:SavedOperation){const db=await this.db;return new Promise<boolean>((resolve,reject)=>{let saved=false;const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),r=store.get(entry.id);r.onsuccess=()=>{if(!r.result?.task){store.put({...entry,createdAt:r.result?.createdAt??entry.createdAt});saved=true;}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async finalize(id:string){const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),r=store.get(id);r.onsuccess=()=>{const entry=r.result;if(entry?.staged&&entry.draftTask){entry.task=entry.draftTask;delete entry.draftTask;entry.staged=false;store.put(entry);}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async checkpoint(documentId:string,snapshot?:unknown){const db=await this.db;if(snapshot===undefined)return request(db.transaction('meta').objectStore('meta').get('checkpoint:'+documentId));await new Promise<void>((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(structuredClone(snapshot),'checkpoint:'+documentId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async importFile(raw:string){const data=JSON.parse(raw);if(data.schema!=='notale-sync-v1'||!Array.isArray(data.operations))throw Error('恢复文件格式不正确');
    for(const entry of data.operations){if(!commitSchema.shape.mutationId.safeParse(entry.id).success||!identifier.safeParse(entry.documentId).success||!Number.isFinite(entry.createdAt)||(!entry.edit&&!entry.task)||entry.task&&!isPending(entry.task)||entry.task&&entry.task.request.mutationId!==entry.id||entry.edit&&!commitSchema.shape.commands.safeParse(entry.edit.commands).success)throw Error('恢复操作无效，未导入');}
    const keyboard=data.keyboard??[];if(!Array.isArray(keyboard)||!keyboard.every(row=>isKeyboardRecovery(row)&&commitSchema.shape.mutationId.safeParse(row.id).success&&identifier.safeParse(row.intent.documentId).success&&identifier.safeParse(row.intent.slideId).success))throw Error('快捷键恢复记录无效，未导入');
    const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['operations','meta'],'readwrite'),store=tx.objectStore('operations');for(const row of keyboard){const meta=tx.objectStore('meta'),r=meta.get('keyboard:'+row.id);r.onsuccess=()=>{if(!r.result)meta.put(row,'keyboard:'+row.id);else if(JSON.stringify(r.result)!==JSON.stringify(row))tx.abort();};}for(const entry of data.operations){const r=store.get(entry.id);r.onsuccess=()=>{if(!r.result)store.add({...entry,state:'recovery',error:'从恢复文件导入'});else if(JSON.stringify(r.result.task)!==JSON.stringify(entry.task)||JSON.stringify(r.result.edit)!==JSON.stringify(entry.edit))tx.abort();};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error('同名恢复事务内容不同，未覆盖原记录'));tx.onerror=()=>reject(tx.error);});
  }
  async ready(){await this.db;}
  async list(documentId?:string){const db=await this.db,tx=db.transaction('operations','readonly'),store=tx.objectStore('operations');return (await request(documentId?store.index('document').getAll(documentId):store.getAll()) as SavedOperation[]).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));}
  async get(id:string){const db=await this.db;return request(db.transaction('operations').objectStore('operations').get(id)) as Promise<SavedOperation|undefined>;}
  async put(operation:SavedOperation){const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').put(structuredClone(operation));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('本机草稿写入中断'));});}
  async claim(id:string,task:Pending){const db=await this.db;return new Promise<boolean>((resolve,reject)=>{let claimed=false;const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),r=store.get(id);r.onsuccess=()=>{const entry=r.result;if(entry?.state==='pending'){entry.task??=structuredClone(task);store.put(entry);claimed=true;}};tx.oncomplete=()=>resolve(claimed);tx.onerror=()=>reject(tx.error);});}
  async cancel(id:string){const db=await this.db;return new Promise<boolean>((resolve,reject)=>{let cancelled=false;const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),r=store.get(id);r.onsuccess=()=>{if(r.result&&!r.result.sent&&(!r.result.task||r.result.task.kernel?.protocol===2)){store.delete(id);cancelled=true;}};tx.oncomplete=()=>resolve(cancelled);tx.onerror=()=>reject(tx.error);});}
  async markSending(id:string){const db=await this.db;return new Promise<boolean>((resolve,reject)=>{let found=false;const tx=db.transaction('operations','readwrite'),store=tx.objectStore('operations'),r=store.get(id);r.onsuccess=()=>{const entry=r.result;if(entry?.state==='pending'&&!entry.staged){entry.sent=true;store.put(entry);found=true;}};tx.oncomplete=()=>resolve(found);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async acknowledge(id:string,documentId:string,version:number,snapshot?:unknown){const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['operations','meta'],'readwrite');tx.objectStore('operations').delete(id);tx.objectStore('meta').put(version,'version:'+documentId);if(snapshot)tx.objectStore('meta').put(structuredClone(snapshot),'checkpoint:'+documentId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async migrate(){
    // Import v1 without deleting its records or changing an already-sent request.
    const oldName='notale-sync-v1:'+this.namespace;
    if((await indexedDB.databases()).some(db=>db.name===oldName)){
      const old=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(oldName);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{
        const entries=await request(old.transaction('operations').objectStore('operations').getAll()) as SavedOperation[];
        const db=await this.db;
        for(const entry of entries){
          const marker='imported-v1:'+entry.id;
          if(await request(db.transaction('meta').objectStore('meta').get(marker)))continue;
          await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['operations','meta'],'readwrite'),ops=tx.objectStore('operations'),r=ops.get(entry.id);r.onsuccess=()=>{if(!r.result)ops.put(entry);tx.objectStore('meta').put(true,marker);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
        }
      }finally{old.close();}
    }
    // Read all legacy owners, including closed windows. Never remove source data here.
    const legacy:any[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(!key.startsWith('notale-geometry-v1:')&&!key.startsWith('notale-editor-pending-v2:'))continue;try{const raw=JSON.parse(localStorage.getItem(key)!);if(key.startsWith('notale-geometry'))for(const edit of raw.edits??[])legacy.push({id:edit.id,documentId:raw.documentId,edit,task:edit.task,createdAt:Date.now()+legacy.length,state:'pending'});else if(raw.task)legacy.push({id:raw.task.request.mutationId,documentId:raw.task.documentId,task:raw.task,createdAt:raw.createdAt,state:'pending'});}catch{/* Legacy recovery UI retains corrupt originals. */}}
    if(!legacy.length)return;
    const db=await this.db,existing=new Set((await this.list()).map(e=>e.id)),candidates:SavedOperation[]=[];
    for(const entry of legacy){if(existing.has(entry.id))continue;const migrated=await request(db.transaction('meta').objectStore('meta').get('migrated:'+entry.id));if(!migrated)candidates.push(entry);}
    if(!candidates.length)return;
    const response=await fetch('/api/documents');if(!response.ok)throw Error('无法读取待恢复讲义');const allowed=new Set((await response.json()).map((d:any)=>d.id));
    for(const entry of candidates){if(!allowed.has(entry.documentId)||existing.has(entry.id))continue;
      await new Promise<void>((resolve,reject)=>{const t=db.transaction(['operations','meta'],'readwrite');t.objectStore('operations').put(entry);t.objectStore('meta').put(true,'migrated:'+entry.id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});existing.add(entry.id);
    }
  }
}
