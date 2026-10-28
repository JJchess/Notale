import type {FilmAudioEffects} from '@notale/editor/film';
/** One graph builder for live WebAudio and deterministic OfflineAudioContext. */
export function audioEffectGraph(context:BaseAudioContext,effects:FilmAudioEffects={}){
 const input=context.createGain(),output=context.createGain(),nodes:AudioNode[]=[input,output];let tail:AudioNode=input,compressor:DynamicsCompressorNode|undefined;
 if(effects.enabled!==false){for(const band of effects.eq??[]){const filter=context.createBiquadFilter();filter.type=band.type;filter.frequency.value=Math.min(band.frequency,context.sampleRate/2);filter.gain.value=band.gain;filter.Q.value=band.q;tail.connect(filter);tail=filter;nodes.push(filter);}
  if(effects.compressor){compressor=context.createDynamicsCompressor();for(const key of ['threshold','knee','ratio','attack','release'] as const)compressor[key].value=effects.compressor[key];tail.connect(compressor);tail=compressor;nodes.push(compressor);}
 }tail.connect(output);return {input,output,compressor,dispose(){nodes.forEach(n=>n.disconnect());}};
}
export interface OfflineFilmStem {uri:string;start?:number;effects?:FilmAudioEffects;gain:{time:number;value:number}[]}
export async function renderFilmAudio(stems:OfflineFilmStem[],sampleCount:number){
 const context=new OfflineAudioContext(2,sampleCount,48000);
 await Promise.all(stems.map(async stem=>{const response=await fetch(stem.uri);if(!response.ok)throw Error('Offline audio source unavailable');const buffer=await context.decodeAudioData(await response.arrayBuffer()),source=context.createBufferSource(),graph=audioEffectGraph(context,stem.effects),gain=context.createGain();source.buffer=buffer;source.connect(graph.input);graph.output.connect(gain).connect(context.destination);gain.gain.value=stem.gain[0]?.value??1;for(const [i,key] of stem.gain.entries()){if(i===0)gain.gain.setValueAtTime(key.value,key.time);else gain.gain.linearRampToValueAtTime(key.value,key.time);}source.start(stem.start??0);}));
 const rendered=await context.startRendering(),bytes=new Uint8Array(sampleCount*8),view=new DataView(bytes.buffer),left=rendered.getChannelData(0),right=rendered.getChannelData(1);for(let i=0;i<sampleCount;i++){view.setFloat32(i*8,left[i],true);view.setFloat32(i*8+4,right[i],true);}let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
}
