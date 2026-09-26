import {setPriority} from 'node:os';
import {fork,type ChildProcess} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,readdir,stat,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
export interface Job {key:string;url:string;width:number;height:number;step:number;outWidth?:number;probe?:boolean;}
/** One isolated browser process; API requests only enqueue work or read completed images. */
export class PosterService {
 private completed=0;private preparing=new Set<string>();private completing=false;private jobs=new Map<string,Job>();private failed=new Map<string,number>();private running?:Job;private process?:ChildProcess;private timer?:ReturnType<typeof setTimeout>;private closed=false;
 constructor(private directory=resolve('.local/posters')){}
 /** `urgent` jumps the queue: an AI run is waiting on it, the sidebar thumbnails are not. */
 async request(key:string,create:()=>Promise<Job>,urgent=false):Promise<Buffer|undefined>{
  try{return await readFile(resolve(this.directory,key+'.webp'));}catch{}
  if(!this.closed&&!this.preparing.has(key)&&!this.jobs.has(key)&&this.running?.key!==key&&(this.failed.get(key)??0)<Date.now()){
   if(this.jobs.size>=256)this.jobs.delete(this.jobs.keys().next().value!);
   this.preparing.add(key);try{const job=await create();if(!this.closed){if(urgent)this.jobs=new Map([[key,job],...this.jobs]);else this.jobs.set(key,job);}}finally{this.preparing.delete(key);}void this.pump();
  }
  return undefined;
 }
 /** Layout warnings of a probed render, once its image exists. */
 async warnings(key:string):Promise<string[]>{try{return JSON.parse(await readFile(resolve(this.directory,key+'.json'),'utf8')) as string[];}catch{return [];}}
 private async pump(){
  if(this.closed||this.completing||this.running||!this.jobs.size)return;
  const job=this.jobs.values().next().value!;this.jobs.delete(job.key);this.running=job;
  if(!this.process){
   // Under tsx (tests, `npm run dev`) there is no .js beside this file: use the built worker. tsx's
   // transpiled worker would not do, its injected __name helper breaks the in-page layout probe.
   const worker=new URL(import.meta.url.endsWith('.ts')?'../../dist/server/poster-worker.js':'./poster-worker.js',import.meta.url);
   const child=this.process=fork(worker,[],{execArgv:[],stdio:['ignore','ignore','inherit','ipc']});
   try{if(child.pid)setPriority(child.pid,10);}catch{}
   child.on('message',(message:{key?:string;data?:string;error?:string;warnings?:string[]})=>{if(this.process===child&&message.key===this.running?.key)void this.complete(message);});
   child.on('exit',()=>{if(this.process===child){this.process=undefined;void this.complete({error:'Renderer stopped'});}});
   child.on('error',()=>{if(this.process===child){this.process=undefined;void this.complete({error:'Renderer failed'});}});
  }
  this.timer=setTimeout(()=>{const child=this.process;this.process=undefined;child?.kill();void this.complete({error:'Renderer timeout'});},25000);
  this.process.send(job);
 }
 private async complete(message:{data?:string;error?:string;warnings?:string[]}){
  const job=this.running;if(!job)return;this.running=undefined;this.completing=true;clearTimeout(this.timer);
  if(message.data)try{
   await mkdir(this.directory,{recursive:true});const path=resolve(this.directory,job.key+'.webp'),temporary=path+'.'+process.pid+'.tmp';
   // Warnings land before the image: whoever sees the image may read them at once.
   if(message.warnings)await writeFile(resolve(this.directory,job.key+'.json'),JSON.stringify(message.warnings));
   await writeFile(temporary,Buffer.from(message.data,'base64'));await rename(temporary,path);
  }catch{this.failed.set(job.key,Date.now()+30000);}
  else this.failed.set(job.key,Date.now()+30000);
  if(++this.completed%20===0)void this.prune().catch(()=>{});
  if(this.failed.size>256)this.failed.delete(this.failed.keys().next().value!);
  this.completing=false;void this.pump();
 }
 private async prune(){const files=(await readdir(this.directory)).filter(name=>name.endsWith('.webp'));if(files.length<=512)return;const dated=await Promise.all(files.map(async name=>({name,time:(await stat(resolve(this.directory,name))).mtimeMs})));dated.sort((a,b)=>b.time-a.time);await Promise.all(dated.slice(512).flatMap(file=>[unlink(resolve(this.directory,file.name)).catch(()=>{}),unlink(resolve(this.directory,file.name.replace(/\.webp$/,'.json'))).catch(()=>{})]));}
 // Disconnecting too: playwright traps SIGTERM in the worker, and a live IPC channel keeps this process alive.
 close(){this.closed=true;clearTimeout(this.timer);this.jobs.clear();if(this.process?.connected)this.process.disconnect();this.process?.kill();this.process=undefined;}
}
