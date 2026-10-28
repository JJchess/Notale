import {reverseAudioWindow,reverseWindowIndex,type AudioWindow} from './audio-windows';
import {audioEffectGraph} from './audio-effects.js';
import type {FilmAudioEffects} from '@notale/editor/film';
/** Native decoding feeds one WebAudio graph; media elements are never played twice. */
export class FilmAudioMixer {
 constructor(private failed:(message:string)=>void=()=>{},private parent?:FilmAudioMixer){}
 private context?:AudioContext;private bus?:GainNode;private splitter?:ChannelSplitterNode;private analysers:AnalyserNode[]=[];private buffers:Float32Array<ArrayBuffer>[]=[];private held=[0,0];private holdAfter=0;
 private connectBus(){if(this.bus||!this.context)return;this.bus=this.context.createGain();this.bus.channelCount=2;this.bus.channelCountMode='explicit';this.bus.connect(this.parent?.bus??this.context.destination);if(!this.parent){this.splitter=this.context.createChannelSplitter(2);this.bus.connect(this.splitter);for(let channel=0;channel<2;channel++){const analyser=this.context.createAnalyser();analyser.fftSize=2048;this.splitter.connect(analyser,channel);this.analysers.push(analyser);this.buffers.push(new Float32Array(analyser.fftSize));}}}
 resetPeaks(){this.held=[0,0];this.holdAfter=(this.context?.currentTime??0)+2048/(this.context?.sampleRate??48000);}
 levels(){return [0,1].map(channel=>{const analyser=this.analysers[channel],data=this.buffers[channel];let peak=0,power=0;if(analyser&&data){analyser.getFloatTimeDomainData(data);for(const value of data){peak=Math.max(peak,Math.abs(value));power+=value*value;}}if((this.context?.currentTime??0)>=this.holdAfter)this.held[channel]=Math.max(this.held[channel],peak);return {peak,rms:Math.sqrt(power/(data?.length??1)),hold:this.held[channel],clipped:this.held[channel]>=1};});}
 private reverse=new Map<HTMLMediaElement,{window?:AudioWindow;next?:AudioWindow;loading?:Promise<void>;index?:number;nextIndex?:number;error?:string;node?:AudioBufferSourceNode;scheduled?:AudioBufferSourceNode;target:number;rate:number;time:number;clock:number;startedRate:number;uri:string}>();private channels=new Map<HTMLMediaElement,{source:MediaElementAudioSourceNode;gain:GainNode;graph:ReturnType<typeof audioEffectGraph>;signature:string}>();
 async resume(){if(this.parent){await this.parent.resume();this.context=this.parent.context;}else this.context??=new AudioContext();this.connectBus();if(this.context?.state==='suspended')await this.context.resume();}
 set(media:HTMLMediaElement,value:number,effects?:FilmAudioEffects){
  if(!this.context){media.volume=Math.min(1,value);return;}
  const signature=JSON.stringify(effects??{});
  let channel=this.channels.get(media);if(!channel){const source=this.context.createMediaElementSource(media),gain=this.context.createGain(),graph=audioEffectGraph(this.context,effects);source.connect(graph.input);graph.output.connect(gain).connect(this.bus!);channel={source,gain,graph,signature};this.channels.set(media,channel);}
  else if(channel.signature!==signature){this.pause(media);channel.source.disconnect();channel.graph.dispose();channel.graph=audioEffectGraph(this.context,effects);channel.source.connect(channel.graph.input);channel.graph.output.connect(channel.gain);channel.signature=signature;}
  media.volume=1;channel.gain.gain.setValueAtTime(value,this.context.currentTime);
 }
 prepare(media:HTMLMediaElement,time:number,rate:number,playing:boolean){
  if(rate>=0){this.pause(media);return true;}if(!playing||!this.context)return true;
  const uri=media.dataset.filmSourceUri||media.currentSrc||media.src;
  let voice=this.reverse.get(media);if(!voice||voice.uri!==uri){this.pause(media);voice={target:time,rate,time,clock:0,startedRate:rate,uri};this.reverse.set(media,voice);}
  voice.target=time;voice.rate=rate;const index=reverseWindowIndex(time);
  if(voice.next&&index===voice.nextIndex){voice.window=voice.next;voice.index=index;voice.next=undefined;voice.nextIndex=undefined;}
  if(voice.index!==index&&!voice.loading){const current=voice;current.loading=reverseAudioWindow(uri,index,this.context).then(window=>{if(this.reverse.get(media)!==current)return;current.window=window;current.index=index;current.error=undefined;}).catch(error=>{current.error=String(error);this.failed(current.error);}).finally(()=>{current.loading=undefined;});}
  if(voice.index===index&&index>0&&voice.nextIndex!==index-1){const current=voice;current.nextIndex=index-1;void reverseAudioWindow(uri,index-1,this.context).then(window=>{if(this.reverse.get(media)===current&&current.nextIndex===index-1)current.next=window;}).catch(error=>{current.nextIndex=undefined;this.failed(String(error));});}
  return voice.index===index&&!!voice.window;
 }
 playReverse(media:HTMLMediaElement){
  const v=this.reverse.get(media),channel=this.channels.get(media),context=this.context;if(!v?.window||!context||!channel)return;
  const expected=v.time+(context.currentTime-v.clock)*v.startedRate;
  if(v.node&&Math.abs(expected-v.target)>.12)this.pause(media);else if(v.node&&v.startedRate!==v.rate){v.node.playbackRate.setValueAtTime(Math.abs(v.rate),context.currentTime);v.time=expected;v.clock=context.currentTime;v.startedRate=v.rate;if(v.scheduled){v.scheduled.onended=null;try{v.scheduled.stop();}catch{}v.scheduled.disconnect();v.scheduled=undefined;}}
  const start=(window:AudioWindow,time:number,when=0)=>{const node=context.createBufferSource();node.buffer=window.buffer;node.connect(channel.graph.input);node.playbackRate.value=Math.abs(v.rate);node.start(when,Math.min(window.buffer.duration-1/window.buffer.sampleRate,Math.max(0,window.end-time)));return node;};
  if(!v.node){v.node=start(v.window,v.target);v.time=v.target;v.clock=context.currentTime;v.startedRate=v.rate;const own=v.node;own.onended=()=>{own.disconnect();if(v.node===own){v.node=v.scheduled;v.scheduled=undefined;}};}
  if(!v.scheduled&&v.next&&v.window.start>0){const remaining=(v.target-v.window.start)/Math.abs(v.rate);if(remaining>0&&remaining<1){const next=v.next,node=start(next,next.end,context.currentTime+remaining);v.scheduled=node;node.onended=()=>{node.disconnect();if(v.node===node){v.node=v.scheduled;v.scheduled=undefined;}};}}
 }
 pause(media:HTMLMediaElement){const v=this.reverse.get(media);if(v){for(const node of [v.node,v.scheduled])if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();}v.node=v.scheduled=undefined;}}
 remove(media:HTMLMediaElement){this.pause(media);this.reverse.delete(media);const channel=this.channels.get(media);channel?.source.disconnect();channel?.graph.dispose();channel?.gain.disconnect();this.channels.delete(media);}
 dispose(){for(const media of this.channels.keys())this.remove(media);this.bus?.disconnect();this.splitter?.disconnect();this.analysers.forEach(a=>a.disconnect());if(!this.parent)void this.context?.close();this.context=undefined;this.bus=undefined;}
}
const waveforms=new Map<string,Promise<{duration:number;peaks:Float32Array}>>();
export function audioWaveform(uri:string){
 let work=waveforms.get(uri);if(work)return work;
 work=(async()=>{const response=await fetch('/film-media/waveform?uri='+encodeURIComponent(uri)),value=await response.json();if(!response.ok)throw Error(value.error??'声音波形读取失败');if(!Array.isArray(value.peaks)||value.peaks.length>8192)throw Error('声音波形格式无效');return {duration:Number(value.duration),peaks:Float32Array.from(value.peaks)};})();waveforms.set(uri,work);if(waveforms.size>32)waveforms.delete(waveforms.keys().next().value!);work.catch(()=>waveforms.delete(uri));return work;
}
export function waveformCanvas(uri:string,start:number,duration:number,width:number,map?:(fraction:number)=>number){
 const canvas=document.createElement('canvas');canvas.className='film-waveform';canvas.width=Math.max(1,Math.min(1600,Math.ceil(width)));canvas.height=34;canvas.setAttribute('aria-label','声音波形');
 void audioWaveform(uri).then(w=>{const ctx=canvas.getContext('2d')!;ctx.fillStyle='#8fd1c4';for(let x=0;x<canvas.width;x++){const first=map?map(x/canvas.width):start+x/canvas.width*duration,last=map?map((x+1)/canvas.width):start+(x+1)/canvas.width*duration,a=Math.max(0,Math.floor(Math.min(first,last)/w.duration*w.peaks.length)),b=Math.min(w.peaks.length,Math.ceil(Math.max(first,last)/w.duration*w.peaks.length));let peak=0;for(let k=a;k<b;k++)peak=Math.max(peak,w.peaks[k]);const h=Math.max(1,peak*32);ctx.fillRect(x,(34-h)/2,1,h);}canvas.dataset.waveformReady='true';}).catch(error=>{canvas.title=String(error);canvas.dataset.waveformReady='error';});return canvas;
}
