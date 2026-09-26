import type { MediaSettings } from '../domain/media.js';
/** Keyed native media lifecycles: paint edits retain both nodes and playback. */
export function mediaController(report: (type: string, data: unknown) => void) {
  type Entry = {el:HTMLMediaElement;settings:MediaSettings;raw:string;frame:number;events:AbortController};
  const entries=new Map<HTMLMediaElement,Entry>();
  const start=(e:Entry)=>Math.min(e.settings.startAt,Number.isFinite(e.el.duration)?Math.max(0,e.el.duration-.01):e.settings.startAt);
  const end=(e:Entry)=>Math.min(e.settings.endAt??Infinity,e.el.duration||Infinity);
  const play=(e:Entry)=>{const raw=e.raw;void e.el.play().catch(error=>{if(entries.get(e.el)!==e||e.events.signal.aborted||e.raw!==raw)return;e.el.controls=true;report('media-blocked',{target:e.el.dataset.notaleId,message:String(error)});});};
  function update(){
    for(const [el,e] of entries)if(!el.isConnected||!el.hasAttribute('data-notale-media')){e.el.pause();e.events.abort();cancelAnimationFrame(e.frame);entries.delete(el);}
    for(const el of document.querySelectorAll<HTMLMediaElement>('video[data-notale-media],audio[data-notale-media]')){
      const raw=el.dataset.notaleMedia!;let e=entries.get(el);if(e?.raw===raw)continue;
      let settings:MediaSettings;try{settings=JSON.parse(raw);}catch{continue;}
      const fresh=!e;
      if(!e){e={el,settings,raw,frame:0,events:new AbortController()};entries.set(el,e);}else{e.settings=settings;e.raw=raw;}
      el.autoplay=false;el.loop=false;el.controls=settings.controls;el.muted=settings.muted;el.volume=settings.volume;el.playbackRate=settings.rate;
      const entry=e;
      const reset=()=>{if(el.readyState>=1&&(fresh||el.currentTime<start(entry)||el.currentTime>end(entry)))el.currentTime=start(entry);};
      if(el.readyState>=1)reset();else el.addEventListener('loadedmetadata',reset,{once:true,signal:entry.events.signal});
      if(!fresh)continue;
      const enforce=()=>{if(el.currentTime>=end(entry)-.01){if(entry.settings.loop&&!el.paused){el.currentTime=start(entry);if(el.ended)play(entry);}else{el.pause();if(Number.isFinite(end(entry))&&Math.abs(el.currentTime-end(entry))>.005)el.currentTime=end(entry);}}};
      const tick=()=>{if(el.paused)return;enforce();entry.frame=requestAnimationFrame(tick);};
      const listen=(type:string,fn:()=>void)=>el.addEventListener(type,fn,{signal:entry.events.signal});
      listen('play',()=>{if(el.currentTime<start(entry)||el.currentTime>=end(entry)-.02)el.currentTime=start(entry);cancelAnimationFrame(entry.frame);entry.frame=requestAnimationFrame(tick);});
      listen('pause',()=>cancelAnimationFrame(entry.frame));listen('timeupdate',enforce);
      listen('seeking',()=>{if(el.currentTime<start(entry))el.currentTime=start(entry);else if(el.currentTime>end(entry))el.currentTime=end(entry);});
      listen('ended',()=>{if(entry.settings.loop){el.currentTime=start(entry);play(entry);}});
    }
  }
  update();let previous=-1;
  return {update,get maxStep(){return Math.max(0,...[...entries.values()].flatMap(e=>[e.settings.startStep??0,...(e.settings.startSteps??[])]));},
    seek(step:number,animate:boolean,enabled:boolean){
      for(const e of entries.values()){
        const triggers=[e.settings.startStep,...(e.settings.startSteps??[])].filter((s):s is number=>s!==null),trigger=triggers.length?Math.min(...triggers):null;
        if(!enabled||!animate||step<previous||(trigger!==null&&step<trigger)){e.el.pause();if(e.el.readyState>=1)e.el.currentTime=start(e);}
        if(enabled&&animate&&triggers.includes(step)&&step!==previous){if(e.el.readyState>=1)e.el.currentTime=start(e);play(e);}
      }previous=step;
    },stop(){for(const e of entries.values()){e.el.pause();cancelAnimationFrame(e.frame);e.events.abort();}entries.clear();},
  };
}
