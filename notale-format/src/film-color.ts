export type FilmCurvePoint=[number,number];
export type FilmCurveChannel='rgb'|'r'|'g'|'b';
export interface FilmLut {title:string;size:number;values:number[];domainMin?:[number,number,number];domainMax?:[number,number,number]}
export interface FilmColor {enabled?:boolean;curves?:Partial<Record<FilmCurveChannel,FilmCurvePoint[]>>;lut?:FilmLut;intensity?:number}
export function validFilmColor(input:unknown):input is FilmColor {
 if(!input||typeof input!=='object'||Array.isArray(input))return false;const color=input as FilmColor;
 if(color.enabled!==undefined&&typeof color.enabled!=='boolean'||color.intensity!==undefined&&(!Number.isFinite(color.intensity)||color.intensity<0||color.intensity>1))return false;
 if(color.curves!==undefined){if(!color.curves||typeof color.curves!=='object'||Array.isArray(color.curves))return false;for(const [channel,points] of Object.entries(color.curves)){if(!['rgb','r','g','b'].includes(channel)||!Array.isArray(points)||points.length<2||points.length>128)return false;let previous=-1;for(const p of points){if(!Array.isArray(p)||p.length!==2||!p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||p[0]<=previous)return false;previous=p[0];}if(points[0][0]!==0||points.at(-1)![0]!==1)return false;}}
 const lut=color.lut;if(lut!==undefined){if(!lut||typeof lut!=='object'||typeof lut.title!=='string'||!Number.isInteger(lut.size)||lut.size<2||lut.size>65||!Array.isArray(lut.values)||lut.values.length!==lut.size**3*3||!lut.values.every(x=>Number.isFinite(x)))return false;for(const domain of [lut.domainMin,lut.domainMax])if(domain!==undefined&&(!Array.isArray(domain)||domain.length!==3||!domain.every(x=>Number.isFinite(x))))return false;for(let i=0;i<3;i++)if((lut.domainMin?.[i]??0)>=(lut.domainMax?.[i]??1))return false;}
 return true;
}
