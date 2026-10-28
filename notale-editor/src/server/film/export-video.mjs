import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readdir,rename,rm} from 'node:fs/promises';
import {resourceName} from './export-resources.mjs';

export function frameIndexAt(frames,time){
  if(!Number.isFinite(time)||time<0||!frames.length)throw Error('无效视频源时间');
  let low=0,high=frames.length;
  while(low<high){const middle=(low+high)>>>1;if(frames[middle].time<=time+1e-9)low=middle+1;else high=middle;}
  return Math.max(0,low-1);
}


/** Shared actual-PTS index for file exports and bounded in-memory monitor capture. */
export async function readVideoIndex(task,file,run,{timeoutMs=120000,maxOutput=64*1024*1024,maxFrames=500000}={}){
 const probe=JSON.parse((await run(task,'ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time:stream=duration,start_time,width,height,sample_aspect_ratio','-of','json',file],{timeoutMs,maxOutput})).toString());
    const rows=probe.frames??[];
    if(!rows.length||rows.length>maxFrames)throw Error(`视频帧索引为空或超过 ${maxFrames} 帧`);
    const origin=Number(rows[0].best_effort_timestamp_time);
    if(!Number.isFinite(origin))throw Error('视频没有可验证的展示时间戳');
    const frames=rows.map((row,index)=>({index,time:Number(row.best_effort_timestamp_time)-origin,duration:Number(row.pkt_duration_time)||0}));
    if(frames.some((frame,index)=>!Number.isFinite(frame.time)||index>0&&frame.time<frames[index-1].time))throw Error('视频展示时间戳不单调');
    const last=frames.at(-1),duration=Math.max(Number(probe.streams?.[0]?.duration)||0,last.time+(last.duration||frames.at(-2)&&last.time-frames.at(-2).time||1/30));
 return {frames,duration};
}
/** Export-only PTS selection. Browser seeking is deliberately not used for video capture. */
export class ExportVideoFrames {
  sources=new Map();
  constructor(job,{run,check}){this.job=job;this.run=run;this.check=check;}
  async source(uri){
    if(this.sources.has(uri))return this.sources.get(uri);
    const file=path.join(this.job.dir,'input',resourceName(uri));
    const {frames,duration}=await readVideoIndex(this.job,file,this.run);
    const key=createHash('sha256').update(resourceName(uri)).digest('hex').slice(0,20),dir=path.join(this.job.dir,'video-frames',key);
    const value={uri,file,key,dir,frames,duration,decoded:new Set()};this.sources.set(uri,value);return value;
  }
  async prepare(requests){
    const needed=new Map();
    for(const {uri,time}of requests){this.check(this.job);const source=await this.source(uri);if(time>=source.duration+1e-7)throw Error('导出片段超出视频实际时长');const index=frameIndexAt(source.frames,time);if(!source.decoded.has(index)){const set=needed.get(source)??new Set();set.add(index);needed.set(source,set);}}
    for(const [source,set]of needed){
      this.check(this.job);const indices=[...set].sort((a,b)=>a-b),batch=path.join(source.dir,'pending');await mkdir(batch,{recursive:true});
      // One sequential decode for all missing indices, including B-frame reordering and VFR PTS.
      const filter=path.join(batch,'select.txt');await writeFile(filter,`select='${indices.map(index=>`eq(n,${index})`).join('+')}',scale=trunc(iw*sar+0.5):ih,setsar=1`);
      await this.run(this.job,'ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','2','-i',source.file,'-map','0:v:0','-an','-filter_script:v',filter,'-vsync','0','-threads','2',path.join(batch,'%08d.png')],{timeoutMs:300000,maxOutput:1024*1024});
      const files=(await readdir(batch)).filter(name=>name.endsWith('.png')).sort();if(files.length!==indices.length)throw Error('视频确定性解码帧数不符');
      for(let i=0;i<indices.length;i++){this.check(this.job);await rename(path.join(batch,files[i]),path.join(source.dir,indices[i]+'.png'));source.decoded.add(indices[i]);}
      await rm(batch,{recursive:true});
    }
    return Object.fromEntries([...this.sources].map(([uri,source])=>[uri,{duration:source.duration,frames:[...source.decoded].sort((a,b)=>a-b).map(index=>({time:source.frames[index].time,uri:`/film-export/jobs/${this.job.id}/files/video-frames/${source.key}/${index}.png`}))}]));
  }
}
