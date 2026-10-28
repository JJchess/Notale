import {parseFilmDocument,type FilmDocument,type FilmRate,type FilmSource} from '@notale/editor/film';

function rational(value:string|undefined):FilmRate|undefined {
 const match=/^(\d+)\/(\d+)$/.exec(value??'');if(!match)return;
 let numerator=Number(match[1]),denominator=Number(match[2]);
 if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<1||numerator/denominator<1||numerator/denominator>240)return;
 let a=numerator,b=denominator;while(b){const remainder=a%b;a=b;b=remainder;}numerator/=a;denominator/=a;return {numerator,denominator};
}
/** Agreeing nominal/average rates give a conservative CFR hint. VFR and invalid
 * probes stay unset rather than silently selecting a rounded project grid. */
export function videoFrameRate(stream:{avg_frame_rate?:string;r_frame_rate?:string}|undefined):FilmRate|undefined {
 const average=rational(stream?.avg_frame_rate),nominal=rational(stream?.r_frame_rate);
 if(!average||!nominal)return;
 return Math.abs(average.numerator/average.denominator-nominal.numerator/nominal.denominator)<1e-5?average:undefined;
}
/** Call BEFORE adding sources or constructing clips so all import entry points
 * quantize against the same grid. Only new, still-empty auto projects qualify. */
export function prepareFirstVideoRate(document:FilmDocument,sources:readonly FilmSource[]):FilmDocument {
 const next=parseFilmDocument(document);
 if(next.frameRateMode!=='auto')return next;
 if(next.markers.length||next.tracks.some(t=>(t.kind==='media'?t.clips:t.cues).length)){next.frameRateMode='manual';return next;}
 const source=sources.find(s=>s.kind==='video'&&s.frameRate);
 if(source){next.frameRate={...source.frameRate!};next.frameRateMode='manual';}
 return next;
}
