import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, readdir, stat, rm} from 'node:fs/promises';

const terminal = state => ['complete','failed','cancelled'].includes(state);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const record = job => ({version:2,actor:job.actor,scope:job.scope,id:job.id,requestId:job.requestId,requestHash:job.requestHash,retryOf:job.retryOf,created:job.created,updated:Date.now(),state:job.state,phase:job.phase,progress:job.progress,doc:job.doc,options:job.options,plan:job.plan,start:job.start,end:job.end,width:job.width,height:job.height,total:job.total,file:job.file,error:job.error,errorCode:job.errorCode,result:job.result,validation:job.validation,preview:job.preview,resources:job.resources});
export class ExportJobs {
  jobs = new Map(); requests = new Map(); tail = Promise.resolve();
  constructor(root,owner={}) {this.owner=owner;this.root=root;this.ready=this.restore();}
  async restore() {
    await mkdir(this.root,{recursive:true});
    for (const item of await readdir(this.root,{withFileTypes:true})) {
      if (!item.isDirectory() || !/^[a-f0-9-]{36}$/.test(item.name)) continue;
      try {
        const value=JSON.parse(await readFile(path.join(this.root,item.name,'job.json'),'utf8'));
        if (value.version!==2 || value.actor!==this.owner.actor || value.scope!==this.owner.scope || value.id!==item.name || !value.doc || !value.options) continue;
        const job=this.attach(value);this.jobs.set(job.id,job);
        if(job.requestId)this.requests.set(this.owner.actor+':'+job.doc.id+':'+job.requestId,job);
        if(!terminal(job.state)){job.state='failed';job.phase='interrupted';job.errorCode='interrupted';job.error='导出服务中断；可以从原快照重试';await this.save(job);await this.cleanTemporary(job);}
        else if(job.state==='complete'&&job.file) {try{await stat(path.join(job.dir,job.file));}catch{job.state='failed';job.errorCode='artifact-missing';job.error='导出文件已丢失；可以重试';delete job.file;await this.save(job);}}
      } catch { /* Pre-persistence exports and incomplete temporary records are not jobs. */ }
    }
  }
  attach(value){return {...value,actor:this.owner.actor,scope:this.owner.scope,runtime:this.owner.runtime,dir:path.join(this.root,value.id),children:new Set(),pcm:new Map(),cancelled:false,done:0,controller:new AbortController(),writeChain:Promise.resolve()};}
  async save(job){const value=record(job);job.writeChain=job.writeChain.catch(()=>{}).then(async()=>{await mkdir(job.dir,{recursive:true});const tmp=path.join(job.dir,'job.json.tmp');await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,path.join(job.dir,'job.json'));});await job.writeChain;}
  async create(input, prepare, work) {
    await this.ready;
    const requestHash=digest({doc:input.doc,options:input.options}),key=input.requestId&&this.owner.actor+':'+input.doc.id+':'+input.requestId;
    if(key&&this.requests.has(key)){const old=this.requests.get(key);if(old.requestHash!==requestHash)throw Object.assign(Error('同一次请求的导出内容发生变化'),{status:409});return old;}
    if(this.closing)throw Error('影片服务正在关闭');
    const job=this.attach({...input,id:randomUUID(),requestHash,created:Date.now(),state:'queued',phase:'preparing',progress:0});
    this.jobs.set(job.id,job);if(key)this.requests.set(key,job);
    try{await this.save(job);await prepare(job);await this.save(job);}catch(error){job.state=job.cancelled?'cancelled':'failed';job.error=job.cancelled?undefined:error.message;job.errorCode=job.cancelled?undefined:'prepare-failed';await this.save(job);await this.cleanTemporary(job);return job;}
    const execute=async()=>{
      if(job.cancelled)return;
      job.state='running';await this.save(job);
      try{await work(job);if(job.cancelled)throw Error('已取消');job.state='complete';job.phase='complete';job.progress=1;}
      catch(error){job.state=job.cancelled?'cancelled':'failed';job.error=job.cancelled?undefined:error.message;job.errorCode=job.cancelled?undefined:'export-failed';delete job.file;delete job.preview;}
      finally{await job.browser?.close().catch(()=>{});job.browser=undefined;job.videoFrames=undefined;job.pcm.clear();await this.cleanTemporary(job);await this.save(job);}
    };
    this.tail=this.tail.then(()=>this.owner.runtime?.schedule?this.owner.runtime.schedule(execute):execute()).catch(async error=>{job.state='failed';job.error=String(error);await this.save(job).catch(()=>{});});
    return job;
  }
  async close() {this.closing=true;await this.ready;await Promise.all([...this.jobs.values()].filter(job=>!terminal(job.state)).map(job=>this.cancel(job)));await this.tail;}
  async cancel(job) {
    if(terminal(job.state))return job;
    job.cancelled=true;job.controller.abort();job.state=job.state==='queued'?'cancelled':'cancelling';job.phase=job.state;
    for(const child of job.children){child.kill('SIGTERM');const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1500);timer.unref();child.once('close',()=>clearTimeout(timer));}
    void job.browser?.close().catch(()=>{});
    await this.save(job);if(job.state==='cancelled')await this.cleanTemporary(job);return job;
  }
  async cleanTemporary(job){
    // Keep the immutable input snapshot for explicit retries, never publish partial outputs.
    for(const item of await readdir(job.dir,{withFileTypes:true}).catch(()=>[]))if(item.name!=='input'&&!['job.json','snapshot.film.json'].includes(item.name)&&!(job.state==='complete'&&(item.name===job.file||item.name==='html'))){await rm(path.join(job.dir,item.name),{recursive:true,force:true}).catch(()=>{});}
  }
}
