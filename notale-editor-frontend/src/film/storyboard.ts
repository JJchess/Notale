import {FilmPreview} from './preview';
import {frameSeconds,type FilmDocument,type FilmClip} from '@notale/editor/film';
type Tile={host:HTMLElement;picture:HTMLDivElement;clip:FilmClip;preview?:FilmPreview;visible:boolean;pending:boolean;attempts:number;signature:string};
/** Thumbnail renderer only: the shared PageList owns navigation, focus and cards. */
export class FilmStoryboard {
 private tiles=new Map<string,Tile>();private document?:FilmDocument;private clips:FilmClip[]=[];private raf=0;
 private observer=new IntersectionObserver(entries=>{for(const entry of entries){const tile=[...this.tiles.values()].find(t=>t.host===entry.target);if(tile){tile.visible=entry.isIntersecting;if(tile.visible&&tile.pending)this.schedule();}}},{rootMargin:'80px'});
 readonly mount=(id:string,host:HTMLElement)=>{
  const clip=this.clips.find(c=>c.id===id);if(!clip)return;
  const old=this.tiles.get(id);if(old){this.observer.unobserve(old.host);old.preview?.dispose();old.picture.remove();}
  const picture=document.createElement('div');picture.className='film-scene-thumbnail';host.append(picture);
  const tile:Tile={host,picture,clip,visible:false,pending:true,attempts:0,signature:''};this.tiles.set(id,tile);this.observer.observe(host);this.refresh(tile);this.schedule();
  return ()=>{if(this.tiles.get(id)!==tile)return;this.observer.unobserve(host);tile.preview?.dispose();picture.remove();this.tiles.delete(id);};
 };
 update(doc:FilmDocument,clips:FilmClip[]){this.document=doc;this.clips=clips;for(const tile of this.tiles.values()){const clip=clips.find(c=>c.id===tile.clip.id);if(clip){tile.clip=clip;this.refresh(tile);}}this.schedule();}
 private refresh(tile:Tile){const doc=this.document;if(!doc)return;const signature=JSON.stringify([tile.clip,doc.sources.find(s=>s.id===tile.clip.sourceId),doc.width,doc.height,doc.background,doc.frameRate]);if(signature!==tile.signature){tile.signature=signature;tile.pending=true;tile.attempts=0;tile.picture.style.aspectRatio=doc.width+'/'+doc.height;}}
 private schedule(){if(!this.raf&&[...this.tiles.values()].some(t=>t.visible&&t.pending))this.raf=requestAnimationFrame(()=>this.paint());}
 private paint(){this.raf=0;if(!this.document)return;let count=0;for(const tile of this.tiles.values()){if(!tile.visible||!tile.pending)continue;if(count++>=2)continue;
  tile.preview??=new FilmPreview(tile.picture,()=>{tile.host.dataset.failed='true';tile.pending=false;},()=>{});
  const doc=this.document,clip=tile.clip,source=doc.sources.find(s=>s.id===clip.sourceId);if(!source){tile.pending=false;continue;}
  const thumbnail:FilmDocument={...doc,sources:[source],tracks:[{id:'thumbnail',kind:'media',title:'',hidden:false,muted:true,locked:true,clips:[clip]}],markers:[]};
  const ready=tile.preview.frame(thumbnail,frameSeconds(clip.at+Math.min(clip.duration-1,Math.round(doc.frameRate.numerator/doc.frameRate.denominator)),doc.frameRate),tile.attempts===0,[],false);
  tile.attempts++;if(ready||tile.attempts>=600)tile.pending=false;
 }this.schedule();}
 dispose(){cancelAnimationFrame(this.raf);this.observer.disconnect();for(const tile of this.tiles.values()){tile.preview?.dispose();tile.picture.remove();}this.tiles.clear();}
}
