export const PCM_RATE=48000,PCM_SECONDS=8;
export interface AudioWindow {start:number;end:number;buffer:AudioBuffer}
const cache=new Map<string,Promise<AudioWindow>>();
/** Four source-time windows, each at most eight seconds of stereo float PCM. */
export function reverseAudioWindow(uri:string,index:number,context:BaseAudioContext):Promise<AudioWindow>{
 index=Math.max(0,index);const start=index*PCM_SECONDS,key=uri+'\0'+index;const existing=cache.get(key);if(existing){cache.delete(key);cache.set(key,existing);return existing;}
 const pending=(async()=>{const response=await fetch(`/film-media/pcm?uri=${encodeURIComponent(uri)}&startSample=${start*PCM_RATE}&sampleCount=${PCM_SECONDS*PCM_RATE}`);if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error??'声音窗口读取失败');}const bytes=await response.arrayBuffer();if(bytes.byteLength>PCM_SECONDS*PCM_RATE*8+16384||bytes.byteLength%8)throw Error('声音窗口格式无效');const data=new Float32Array(bytes),length=data.length/2,buffer=context.createBuffer(2,Math.max(1,length),PCM_RATE);for(let channel=0;channel<2;channel++){const out=buffer.getChannelData(channel);for(let i=0;i<length;i++)out[i]=data[(length-i-1)*2+channel];}return {start,end:start+length/PCM_RATE,buffer};})();cache.set(key,pending);while(cache.size>4)cache.delete(cache.keys().next().value!);pending.catch(()=>cache.delete(key));return pending;
}
export const reverseWindowIndex=(time:number)=>Math.max(0,Math.ceil(Math.max(0,time)/PCM_SECONDS)-1);
