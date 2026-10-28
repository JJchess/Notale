/** Streaming spectral-flux detector. The decoder feeds mono 8 kHz float PCM.
 * Only novelty values are retained; audio length does not allocate a PCM buffer. */
export const RHYTHM_VERSION='spectral-flux-2';
const RATE=8000,N=512,HOP=128;
function spectrum(samples,window){
 const re=new Float64Array(N),im=new Float64Array(N);
 for(let i=0,j=0;i<N;i++){re[j]=samples[i]*window[i];let bit=N>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;}
 for(let size=2;size<=N;size*=2){const a=-2*Math.PI/size;for(let start=0;start<N;start+=size)for(let j=0;j<size/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=start+j,l=k+size/2,x=re[l]*c-im[l]*s,y=re[l]*s+im[l]*c;re[l]=re[k]-x;im[l]=im[k]-y;re[k]+=x;im[k]+=y;}}
 return Array.from({length:N/2},(_,i)=>Math.log1p(Math.hypot(re[i],im[i])*10));
}
export function createRhythmAnalyzer(){
 const window=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1))),samples=new Float32Array(N),novelty=[];
 let length=0,count=0,previous=Array(N/2).fill(0),remainder=Buffer.alloc(0);
 return {write(chunk){const data=remainder.length?Buffer.concat([remainder,chunk]):chunk,bytes=data.length-data.length%4;
   for(let offset=0;offset<bytes;offset+=4){const value=data.readFloatLE(offset);samples[length++]=Number.isFinite(value)?value:0;count++;if(length===N){const current=spectrum(samples,window);let flux=0;for(let i=2;i<current.length;i++)flux+=Math.max(0,current[i]-previous[i]);novelty.push(flux);previous=current;samples.copyWithin(0,HOP);length-=HOP;}}
   remainder=data.subarray(bytes);
 },finish(fingerprint){return inferRhythm(novelty,count/RATE,fingerprint);},get duration(){return count/RATE;}};
}
export function inferRhythm(novelty,duration,fingerprint){
 const events=[],strength=[],step=HOP/RATE,max=novelty.reduce((a,b)=>Math.max(a,b),0);
 // A local adaptive threshold handles quiet passages without turning stationary
 // speech/noise into evenly spaced beats. Refractory period is 80 ms.
 let last=-Infinity;
 for(let i=1;i<novelty.length-1;i++){
  const from=Math.max(0,i-16),to=Math.min(novelty.length,i+17);let sum=0;for(let j=from;j<to;j++)sum+=novelty[j];const threshold=sum/(to-from)*1.45;
  const time=Math.max(0,(i*HOP+N/2)/RATE);
  if(novelty[i]>threshold&&novelty[i]>max*.025&&novelty[i]>=novelty[i-1]&&novelty[i]>novelty[i+1]&&time-last>=.08&&time<duration){events.push(time);strength.push(novelty[i]-threshold);last=time;if(events.length>=100000)break;}
 }
 const result={version:1,fingerprint,duration,onsets:events,beats:[],confidence:0};
 if(events.length<8||duration<4)return result;
 // Correlation votes come from real onset pairs (at most 4 s apart). Normalize
 // against how many pulses should exist, penalizing arbitrary sparse coincidences.
 const bins=new Float64Array(151);for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length&&events[j]-events[i]<2;j++){const d=events[j]-events[i];for(let multiple=1;multiple<=4;multiple++){const bpm=60*multiple/d;if(bpm>=50&&bpm<=200)bins[Math.round(bpm)-50]+=1/multiple;}}
 let best=0;for(let i=1;i<bins.length;i++)if(bins[i]>bins[best])best=i;let bpm=best+50,period=60/bpm;
 // Refine to measured neighboring pulse distances, avoiding integer-BPM drift.
 const periods=[];for(let i=1;i<events.length;i++){const d=events[i]-events[i-1],multiple=Math.round(d/period);if(multiple>=1&&multiple<=4&&Math.abs(d-multiple*period)<period*.12)periods.push(d/multiple);}
 if(periods.length){period=periods.reduce((sum,value)=>sum+value,0)/periods.length;bpm=60/period;}
 let sx=0,sy=0;for(const t of events){sx+=Math.cos(t/period*2*Math.PI);sy+=Math.sin(t/period*2*Math.PI);}const coherence=Math.hypot(sx,sy)/events.length,phase=((Math.atan2(sy,sx)/(2*Math.PI)*period)%period+period)%period;
 const first=events[0],end=events.at(-1),expected=Math.max(1,(end-first)/period),aligned=events.filter(t=>Math.abs((t-phase)/period-Math.round((t-phase)/period))<.12).length;
 const confidence=Math.min(1,coherence*Math.min(1,aligned/expected));result.confidence=Number(confidence.toFixed(4));
 if(confidence<.58||bpm<30||bpm>300)return result;
 result.bpm=Number(bpm.toFixed(3));
 let near=0;
 for(let t=phase+Math.ceil((first-phase-.06)/period)*period;t<=end+.06&&t<duration&&result.beats.length<100000;t+=period){if(t<0)continue;while(near<events.length&&events[near]<t-period*.15)near++;if(near<events.length&&Math.abs(events[near]-t)<period*.15)result.beats.push(events[near]);}
 return result;
}
