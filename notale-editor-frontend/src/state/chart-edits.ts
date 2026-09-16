import type {ChartAuthoring} from '@notale/editor/browser';
export interface ChartEdit {id:string;documentId:string;slideId:string;target:string;before:ChartAuthoring;after:ChartAuthoring;}
/** Captured edit identities survive selection changes and failed writes. */
export class ChartEdits {
 private tail:Promise<void>=Promise.resolve();
 private retained=new Map<string,ChartEdit>();
 private sealed=false;
 private sealing?:Promise<void>;
 constructor(private commit:(edit:ChartEdit)=>Promise<void>){}
 enqueue(source:Omit<ChartEdit,'id'>){
  if(this.sealed)return Promise.reject(Error('图表编辑已关闭'));
  const edit=structuredClone({...source,id:crypto.randomUUID()});this.retained.set(edit.id,edit);
  const task=this.tail.catch(()=>{}).then(()=>this.commit(edit)).then(()=>{this.retained.delete(edit.id);});
  this.tail=task;return task;
 }
 async flush(){await this.tail;if(this.retained.size)throw Error('仍有图表修改未写入本机');}
 seal():Promise<void>{
  this.sealed=true;
  if(this.sealing)return this.sealing;
  this.sealing=(async()=>{
   await this.tail.catch(()=>{});
   for(const edit of [...this.retained.values()]){
    await this.commit(structuredClone(edit));
    this.retained.delete(edit.id);
   }
  })().finally(()=>{this.sealing=undefined;});
  return this.sealing;
 }
 hasPending(documentId:string,slideId:string,target:string){for(const edit of this.retained.values())if(edit.documentId===documentId&&edit.slideId===slideId&&edit.target===target)return true;return false;}
 pending(){return [...this.retained.values()].map(edit=>structuredClone(edit));}
}
