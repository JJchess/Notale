import type {ReactNode} from 'react';
/** Fixed vector geometry avoids platform-dependent Unicode/emoji glyphs. */
export function AnimationEffectIcon({effect}:{effect:string}) {
 const outward=effect.endsWith('-out');
 let shape:ReactNode;
 if(effect==='draw-stroke')shape=<><path d="M4 19c3-11 8 1 12-10" strokeDasharray="2 3"/><path d="m14 5 3-3 5 5-3 3Z"/><path d="m14 5-2 7 7-2"/></>;
 else if(effect==='appear'||effect==='disappear')shape=<><rect x="6" y="6" width="12" height="12" rx="2" opacity={effect==='appear'?1:.45}/><path d="M12 2v1M12 21v1M2 12h1M21 12h1M4 4l1 1M19 19l1 1M4 20l1-1M19 5l1-1"/></>;
 else if(effect.startsWith('fade'))shape=<><rect x="3" y="5" width="5" height="14" rx="1" opacity={outward?1:.2}/><rect x="10" y="5" width="4" height="14" rx="1" opacity=".5"/><rect x="16" y="5" width="5" height="14" rx="1" opacity={outward?.2:1}/></>;
 else if(effect.startsWith('fly'))shape=<><rect x="13" y="7" width="8" height="10" rx="2" opacity=".4"/><path d={outward?'M17 12H3m4-4-4 4 4 4':'M3 12h14m-4-4 4 4-4 4'}/></>;
 else if(effect.startsWith('zoom'))shape=<><rect x="8" y="8" width="8" height="8" rx="1" opacity=".5"/><path d={outward?'M2 2l5 5M7 3v4H3M22 22l-5-5m0 4v-4h4':'m7 7-5-5m0 4V2h4m11 15 5 5m0-4v4h-4'}/></>;
 else if(effect==='float-in')shape=<><rect x="8" y="4" width="12" height="8" rx="2"/><path d="M4 21V9m-3 3 3-3 3 3M11 17h9M14 21h6" opacity=".65"/></>;
 else if(effect==='bounce-in')shape=<><path d="M3 20c2-17 7-17 9 0 2-9 6-9 8 0M2 22h20"/><circle cx="12" cy="6" r="2"/></>;
 else if(effect.startsWith('wipe'))shape=<><rect x="4" y="5" width="16" height="14" rx="2" opacity=".4"/><path d="M12 3v18"/><path d={outward?'m10 9-3 3 3 3':'m14 9 3 3-3 3'}/></>;
 else if(effect.startsWith('split'))shape=<><path d="M9 4H4v16h5M15 4h5v16h-5" opacity=".5"/><path d={outward?'M2 12h7m-3-3 3 3-3 3m16-3h-7m3-3-3 3 3 3':'M9 12H2m3-3-3 3 3 3m10-3h7m-3-3 3 3-3 3'}/></>;
 else if(effect==='pulse')shape=<><path d="M2 12h5l3-8 4 16 3-8h5"/></>;
 else if(effect==='spin')shape=<><path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/><rect x="9" y="9" width="6" height="6" rx="1"/></>;
 else shape=<><circle cx="4" cy="18" r="2"/><path d="M6 18c12 0-3-13 13-13" strokeDasharray="2 3"/><path d="m16 2 4 3-4 3"/></>;
 return <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shape}</svg>;
}
