import {filmAssert,frameSeconds,type FilmDocument,type FilmClip} from '@notale/format/film';
/** Only OpenFilm pages have selector-editable author DOM. Motale stays opaque. */
export function ensurePageMetadata(doc:FilmDocument,clip:FilmClip){
 const source=doc.sources.find(s=>s.id===clip.sourceId);filmAssert(source?.kind==='openfilm','Selector edits require an OpenFilm page');if(clip.openfilm)return;
 const a=clip.appearance?.values??{},number=(key:keyof typeof a,fallback:number)=>typeof a[key]==='number'?a[key] as number:fallback;
 const width=number('width',source.width??doc.width)*number('scaleX',1),height=number('height',source.height??doc.height)*number('scaleY',1),x=number('x',doc.width/2),y=number('y',doc.height/2),rotation=number('rotation',0);
 clip.openfilm={original:{id:clip.id,src:source.uri,at:frameSeconds(clip.at,doc.frameRate),time:[clip.in,clip.in+frameSeconds(clip.duration,doc.frameRate)],box:{x:x-width/2,y:y-height/2,w:width,h:height,r:rotation},size:{w:source.width??doc.width,h:source.height??doc.height}},baseline:{at:clip.at,duration:clip.duration,in:clip.in,x,y,width,height,rotation,gain:1,speed:1}};
}
