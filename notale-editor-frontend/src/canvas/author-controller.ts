import type {Command,Snapshot,Slide} from '@notale/editor/browser';
import {projectCommands} from '../author-projection';
import {trackPreviewLease} from './resource-lease';
import type {CanvasController} from './controller';
import type {CanvasPreview} from './resources';
type Context={
 snapshot:()=>Snapshot;confirmed:()=>Snapshot;pageId:()=>string;
 preview:(documentId:string,version:number)=>Promise<CanvasPreview>;
 painted:(document:Snapshot['document'],base:string,paths:string[],animationsChanged:boolean)=>void;
 refreshed:(preview:CanvasPreview,snapshot:Snapshot)=>void;
 pageRemoved:()=>Promise<void>;
};
/** Coordinates author projections and resource versions for the active canvas. UI observes completed paints. */
export class AuthorCanvasController {
 private rendered?:Slide;
 private externalPreview?:Slide;
 private previews:Command[]=[];
 private leases=new Map<string,ReturnType<typeof trackPreviewLease>>();
 private signature='';
 private base='';
 private paintedAssets:Snapshot['document']['assets']={};
 private sequence=0;
 private epoch=0;
 private disposed=false;
 private refreshSequence=0;
 private detach:()=>void;
 constructor(private canvas:Pick<CanvasController,'send'|'onDispose'>,private context:Context){this.detach=canvas.onDispose(()=>this.dispose());}
 get assetBase(){return this.base;}
 beginPage(){if(this.disposed)return;++this.refreshSequence;++this.epoch;++this.sequence;this.previews=[];this.rendered=undefined;this.externalPreview=undefined;}
 resetDocument(){this.beginPage();this.signature='';this.base='';this.paintedAssets={};for(const lease of this.leases.values())lease.stop();this.leases.clear();}
 seed(confirmed:Snapshot,slide:Slide,url:string){if(this.disposed)return;this.rendered=structuredClone(slide);this.base=new URL('../'.repeat(slide.sourcePath.split('/').length-1)||'./',url).href;this.signature=JSON.stringify(confirmed.document.assets);this.paintedAssets=confirmed.document.assets;}
 preview(commands:Command[]){if(this.disposed)return;this.previews.push(...commands);this.canvas.send('author-preview',{commands});}
 /** Paints a candidate the author has not applied yet -- e.g. an AI edit under review. The
  * committed state (`rendered`) is untouched, so this is always cheaply reversible; it only
  * makes sense while nothing else is editing, and the caller must clear it before any real
  * edit reaches this controller. */
 previewExternal(slide:Slide){
  if(this.disposed||!this.rendered||slide.id!==this.rendered.id)return;
  const before=(this.externalPreview??this.rendered).html;
  this.externalPreview=slide;
  this.canvas.send('author-update',{before,after:slide.html,transforms:slide.transforms});
 }
 clearExternalPreview(){
  if(this.disposed||!this.externalPreview||!this.rendered)return;
  const before=this.externalPreview.html;
  this.externalPreview=undefined;
  this.canvas.send('author-update',{before,after:this.rendered.html,transforms:this.rendered.transforms});
 }
 private retain(documentId:string,preview:CanvasPreview){const key=JSON.stringify([documentId,preview.version,preview.channel]);if(!this.leases.has(key))this.leases.set(key,trackPreviewLease(documentId,preview));}
 private async resources(current:()=>boolean){
  const confirmed=this.context.confirmed(),signature=JSON.stringify(confirmed.document.assets);
  if(signature===this.signature&&this.base)return this.base;
  if(!Object.keys(confirmed.document.assets).length){this.signature=signature;return '';}
  const preview=await this.context.preview(confirmed.document.id,confirmed.version);
  if(!current())return undefined;
  const first=confirmed.document.slides[0],url=preview.slides.find(s=>s.id===first.id)?.url;if(!url)throw Error('页面资源地址不可用');
  this.retain(confirmed.document.id,preview);
  this.base=new URL('../'.repeat(first.sourcePath.split('/').length-1)||'./',url).href;this.signature=signature;return this.base;
 }
 async update(previous=this.rendered){
  if(this.disposed||!previous)return;
  const pageId=this.context.pageId(),documentId=this.context.snapshot().document.id,sequence=++this.sequence,epoch=this.epoch;
  const current=()=>!this.disposed&&epoch===this.epoch&&sequence===this.sequence&&pageId===this.context.pageId()&&documentId===this.context.snapshot().document.id;
  const base=await this.resources(current);if(!current()||base===undefined)return;
  const snapshot=this.context.snapshot(),next=snapshot.document.slides.find(s=>s.id===pageId);
  if(!next){await this.context.pageRemoved();return;}
  previous=this.rendered?.id===next.id?this.rendered:previous;if(previous.id!==next.id)return;
  if(this.previews.length){previous=projectCommands({...snapshot,document:{...snapshot.document,slides:[previous]}},this.previews).document.slides[0];this.previews=[];}
  const assets=this.context.confirmed().document.assets;
  const changedPaths=Object.keys(assets).filter(path=>JSON.stringify(assets[path])!==JSON.stringify(this.paintedAssets[path]));this.paintedAssets=assets;
  this.canvas.send('author-resources',{assetBase:base,changedPaths});
  this.canvas.send('author-update',{before:previous.html,after:next.html,transforms:next.transforms});
  this.canvas.send('author-state',{slide:{...next,html:''},theme:{...snapshot.document.theme,...snapshot.document.layouts.find(l=>l.id===next.layoutId)?.theme,...next.theme},width:snapshot.document.width,height:snapshot.document.height,assetBase:base,assetPaths:Object.keys(assets)});
  this.rendered=structuredClone(next);
  this.context.painted(snapshot.document,base,changedPaths,JSON.stringify(previous.animations)!==JSON.stringify(next.animations));
 }
 async refreshRuntime(snapshot:Snapshot,pageId:string){
  if(this.disposed)return;
  const epoch=this.epoch,sequence=++this.refreshSequence,documentId=snapshot.document.id;
  const preview=await this.context.preview(documentId,snapshot.version);
  if(this.disposed||sequence!==this.refreshSequence||epoch!==this.epoch||documentId!==this.context.snapshot().document.id||pageId!==this.context.pageId())return;
  this.retain(documentId,preview);this.context.refreshed(preview,snapshot);
  const source=preview.slides.find(s=>s.id===pageId);if(source)this.canvas.send('runtime-refresh',{url:source.url,version:snapshot.version});
 }
 dispose(){if(this.disposed)return;this.resetDocument();this.disposed=true;this.detach();}
}
