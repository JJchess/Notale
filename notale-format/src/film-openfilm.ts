/** OpenFilm 0.1 author metadata. Source HTML stays separate from executable pages. */
export interface FilmSelectorOverride {at:string;n?:number;t?:[number,number];s?:number|[number,number];r?:number;style?:Record<string,string|number>;lock?:true;text?:string}
export interface FilmHtmlClip {
 src:string;id:string;at?:number;time?:number[];box?:{x:number;y:number;w?:number;h?:number;r?:number};size?:{w:number;h:number};sound?:true;speed?:number;volume?:number;
 class?:string;style?:string;attrs?:Record<string,string>;overrides?:(FilmSelectorOverride|{fade:[number,number]})[];
}
export interface FilmInterchangeClip {original:FilmHtmlClip;baseline:{at:number;duration:number;in:number;x:number;y:number;width:number;height:number;rotation:number;gain:number;speed:number};resolvedStyle?:Record<string,string>}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const pair=(v:unknown,positive=false)=>Array.isArray(v)&&v.length===2&&v.every(n=>finite(n)&&(!positive||n>0));
const metadata=(v:unknown,track=false)=>object(v)&&Object.entries(v).every(([k,x])=>new RegExp(track?'^(id|class|title|lang|dir|data-[a-z0-9-]+|aria-[a-z]+)$':'^(class|alt|title|lang|dir|data-[a-z0-9-]+|aria-[a-z]+)$').test(k)&&typeof x==='string');
export function validFilmOverrides(value:unknown):boolean{return Array.isArray(value)&&value.length<=1000&&value.every(o=>{
 if(!object(o))return false;if(o.at===undefined)return Object.keys(o).every(k=>k==='fade')&&pair(o.fade)&&o.fade.every((v:number)=>v>=0);
 return typeof o.at==='string'&&o.at.length>0&&o.at.length<=512&&Object.keys(o).every(k=>['at','n','t','s','r','style','lock','text'].includes(k))&&(o.n===undefined||Number.isSafeInteger(o.n)&&o.n>=1)&&(o.t===undefined||pair(o.t))&&(o.s===undefined||finite(o.s)&&o.s>0||pair(o.s,true))&&(o.r===undefined||finite(o.r))&&(o.lock===undefined||o.lock===true)&&(o.text===undefined||typeof o.text==='string'&&o.text.length<=2000)&&(o.style===undefined||object(o.style)&&Object.entries(o.style).length<=24&&Object.entries(o.style).every(([k,v])=>/^(?:[a-zA-Z]{1,40}|--[A-Za-z0-9_-]{1,60})$/.test(k)&&(finite(v)||typeof v==='string'&&v.length<=2000)));
});}
export function validFilmInterchange(value:unknown):value is FilmInterchangeClip {
 if(!object(value)||!object(value.original)||!object(value.baseline))return false;const c=value.original,b=value.baseline;
 return typeof c.src==='string'&&typeof c.id==='string'&&(c.overrides===undefined||validFilmOverrides(c.overrides))&&(c.attrs===undefined||metadata(c.attrs))&&['class','style'].every(k=>c[k]===undefined||typeof c[k]==='string')&&['at','duration','in','x','y','width','height','rotation','gain','speed'].every(k=>finite(b[k]))&&(value.resolvedStyle===undefined||object(value.resolvedStyle)&&Object.entries(value.resolvedStyle).every(([k,v])=>/^--[\w-]+$|^[a-z][a-z-]*$/.test(k)&&typeof v==='string'&&v.length<=10000));
}
export const validFilmTrackAttrs=(v:unknown)=>metadata(v,true);
