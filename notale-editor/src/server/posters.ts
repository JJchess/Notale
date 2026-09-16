import {setPriority} from 'node:os';
import {fork,type ChildProcess} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,readdir,stat,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
interface Job {key:string;url:string;width:number;height:number;step:number;}
/** One isolated browser process; API requests only enqueue work or read completed images. */
export class PosterService {
 private completed=0;private preparing=new Set<string>();private completing=false;private jobs=new Map<string,Job>();private failed=new Map<string,number>();private running?:Job;private process?:ChildProcess;private timer?:ReturnType<typeof setTimeout>;private closed=false;
 constructor(private directory=resolve('.local/posters')){}
 async request(key:string,create:()=>Promise<Job>):Promise<Buffer|undefined>{
  try{return await readFile(resolve(this.directory,key+'.webp'));}catch{}
  if(!this.closed&&!this.preparing.has(key)&&!this.jobs.has(key)&&this.running?.key!==key&&(this.failed.get(key)??0)<Date.now()){
   if(this.jobs.size>=256)this.jobs.delete(this.jobs.keys().next().value!);
   this.preparing.add(key);try{const job=await create();if(!this.closed)this.jobs.set(key,job);}finally{this.preparing.delete(key);}void this.pump();
  }
  return undefined;
 }
 private async pump(){
  if(this.closed||this.completing||this.running||!this.jobs.size)return;
  const job=this.jobs.values().next().value!;this.jobs.delete(job.key);this.running=job;
  if(!this.process){
   const child=this.process=fork(new URL('./poster-worker.js',import.meta.url),[],{execArgv:[],stdio:['ignore','ignore','inherit','ipc']});
   try{if(child.pid)setPriority(child.pid,10);}catch{}
   child.on('message',(message:{key?:string;data?:string;error?:string})=>{if(this.process===child&&message.key===this.running?.key)void this.complete(message);});
   child.on('exit',()=>{if(this.process===child){this.process=undefined;void this.complete({error:'Renderer stopped'});}});
   child.on('error',()=>{if(this.process===child){this.process=undefined;void this.complete({error:'Renderer failed'});}});
  }
  this.timer=setTimeout(()=>{const child=this.process;this.process=undefined;child?.kill();void this.complete({error:'Renderer timeout'});},25000);
  this.process.send(job);
 }
 private async complete(message:{data?:string;error?:string}){
  const job=this.running;if(!job)return;this.running=undefined;this.completing=true;clearTimeout(this.timer);
  if(message.data)try{
   await mkdir(this.directory,{recursive:true});const path=resolve(this.directory,job.key+'.webp'),temporary=path+'.'+process.pid+'.tmp';await writeFile(temporary,Buffer.from(message.data,'base64'));await rename(temporary,path);
  }catch{this.failed.set(job.key,Date.now()+30000);}
  else this.failed.set(job.key,Date.now()+30000);
  if(++this.completed%20===0)void this.prune().catch(()=>{});
  if(this.failed.size>256)this.failed.delete(this.failed.keys().next().value!);
  this.completing=false;void this.pump();
 }
 private async prune(){const files=(await readdir(this.directory)).filter(name=>name.endsWith('.webp'));if(files.length<=512)return;const dated=await Promise.all(files.map(async name=>({name,time:(await stat(resolve(this.directory,name))).mtimeMs})));dated.sort((a,b)=>b.time-a.time);await Promise.all(dated.slice(512).map(file=>unlink(resolve(this.directory,file.name)).catch(()=>{})));}
 close(){this.closed=true;clearTimeout(this.timer);this.jobs.clear();this.process?.kill();this.process=undefined;}
}
