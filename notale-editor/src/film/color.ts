import {filmAssert,validFilmColor,type FilmLut,type FilmCurvePoint,type FilmColor} from '@notale/format/film';
/** .cube uses red-fastest 3D samples, matching WebGL TEXTURE_3D x/y/z. */
export function parseCube(raw:string,title='LUT'):FilmLut {
 const lut:FilmLut={title,size:0,values:[]};
 for(const original of raw.split(/\r?\n/)){const line=original.replace(/#.*$/,'').trim();if(!line)continue;const tokens=line.split(/\s+/),name=tokens[0];
  if(name==='TITLE'){lut.title=line.slice(5).trim().replace(/^"|"$/g,'');continue;}
  if(name==='LUT_3D_SIZE'){filmAssert(tokens.length===2&&lut.size===0,'Duplicate or invalid LUT size');lut.size=Number(tokens[1]);continue;}
  if(name==='DOMAIN_MIN'||name==='DOMAIN_MAX'){filmAssert(tokens.length===4,'Invalid LUT domain');lut[name==='DOMAIN_MIN'?'domainMin':'domainMax']=tokens.slice(1).map(Number) as [number,number,number];continue;}
  filmAssert(tokens.length===3&&tokens.every(t=>Number.isFinite(Number(t))),'Only 3D .cube LUT files are supported');lut.values.push(...tokens.map(Number));
 }
 filmAssert(validFilmColor({lut}),'Invalid or incomplete 3D LUT');return lut;
}
export function curveValue(points:FilmCurvePoint[]|undefined,value:number){if(!points)return value;let right=points.findIndex(p=>p[0]>=value);if(right<0)return points.at(-1)![1];if(right===0)return points[0][1];const a=points[right-1],b=points[right];return a[1]+(b[1]-a[1])*(value-a[0])/(b[0]-a[0]);}
export function colorCurveTexture(color:FilmColor){const data=new Uint8Array(256*4);for(let i=0;i<256;i++){for(const [c,key] of ['r','g','b'].entries())data[i*4+c]=Math.round(255*curveValue(color.curves?.[key as 'r'|'g'|'b'],curveValue(color.curves?.rgb,i/255)));data[i*4+3]=255;}return data;}
