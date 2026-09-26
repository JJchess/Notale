import type {Snapshot} from '@notale/editor/browser';
export interface PreviewSource {snapshot:Snapshot;slideId:string;}
export interface PreviewState {
 open:boolean;opening:boolean;source?:PreviewSource;
 index:number;count:number;step:number;max:number;
 status:'idle'|'loading'|'ready'|'failed';error:string;
}
const initial:PreviewState={open:false,opening:false,index:0,count:0,step:0,max:0,status:'idle',error:''};
export class PreviewSession {
 private state=initial;
 private listeners=new Set<()=>void>();
 getSnapshot=()=>this.state;
 getServerSnapshot=()=>initial;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 update(patch:Partial<PreviewState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
 reset(){this.state=initial;for(const listener of this.listeners)listener();}
}
export const previewSession=new PreviewSession();
export const previewActions:{prepare:()=>Promise<PreviewSource>;open:(step?:number)=>Promise<void>;close:()=>void;navigate:(direction:number)=>void;retry:()=>Promise<void>;present:()=>void;error:(error:unknown)=>void}={
 prepare:async()=>{throw Error('编辑器仍在加载');},open:async()=>{},close:()=>{},navigate:()=>{},retry:async()=>{},present:()=>{},error:()=>{},
};
