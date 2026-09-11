/** Transient presentation data. Never sent to the author/save command pipeline. */
export type PresentationRole='controller'|'audience'|'preview'|'following';
export type PresentationRuntimeState={
 controls:Record<string,{value:string;checked?:boolean}>;
 components:Record<string,string>;
 charts:Record<string,unknown>;
 scenes:Record<string,unknown>;
 media:Record<string,{time:number;paused:boolean;rate:number;volume:number;muted:boolean;at:number}>;
 dom:Record<string,{text?:string;attributes:Record<string,string|null>}>;
 capabilities:string[];
};
export type PresentationRuntimePatch=Partial<PresentationRuntimeState>;
export type PresentationViewport={scale:number;x:number;y:number};
export type PresentationSessionState={
 protocol:2;documentId:string;version:number;session:string;term:number;sequence:number;
 slideId:string;step:number;max:number;ended:boolean;blank:boolean;
 timer:{elapsed:number;runningSince:number|null};autoPaused:boolean;
 viewport:PresentationViewport;annotations:Record<string,string>;
 runtime:Record<string,PresentationRuntimeState>;
};
export function mergePresentationRuntime(base:PresentationRuntimeState|undefined,patch:PresentationRuntimePatch):PresentationRuntimeState{
 const empty:PresentationRuntimeState={controls:{},components:{},charts:{},scenes:{},media:{},dom:{},capabilities:[]};
 const next={...(base??empty)};
 for(const key of ['controls','components','charts','scenes','media','dom'] as const)next[key]={...next[key],...patch[key]} as never;
 if(patch.capabilities)next.capabilities=patch.capabilities;
 return next;
}
export function presentationOrder(current:Pick<PresentationSessionState,'term'|'sequence'>,incoming:Pick<PresentationSessionState,'term'|'sequence'>){
 if(!Number.isSafeInteger(incoming.term)||!Number.isSafeInteger(incoming.sequence)||incoming.term<0||incoming.sequence<0)return 'stale';
 if(incoming.term<current.term||incoming.term===current.term&&incoming.sequence<=current.sequence)return 'stale';
 return incoming.term===current.term&&incoming.sequence>current.sequence+1?'gap':'next';
}
export function validPresentationState(value:unknown,id:string,version:number,session:string):value is PresentationSessionState{
 const s=value as PresentationSessionState;
 return !!s&&s.protocol===2&&s.documentId===id&&s.version===version&&s.session===session&&typeof s.slideId==='string'&&Number.isInteger(s.step)&&s.step>=0&&s.step<=500&&Number.isInteger(s.max)&&s.max>=s.step&&s.max<=500&&Number.isSafeInteger(s.term)&&Number.isSafeInteger(s.sequence)&&typeof s.blank==='boolean'&&typeof s.ended==='boolean'&&!!s.timer&&Number.isFinite(s.timer.elapsed)&&s.timer.elapsed>=0&&(s.timer.runningSince===null||Number.isFinite(s.timer.runningSince))&&!!s.viewport&&Number.isFinite(s.viewport.scale)&&s.viewport.scale>=1&&s.viewport.scale<=4&&Number.isFinite(s.viewport.x)&&Number.isFinite(s.viewport.y)&&!!s.annotations&&typeof s.annotations==='object'&&!!s.runtime&&typeof s.runtime==='object';
}
