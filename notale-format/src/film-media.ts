/** Project-owned font bytes and source-time sidecar captions. Derivative media are caches, never authored data. */
export interface FilmFont {
  id:string; family:string; displayName:string; uri:string; hash:string;
  format:'woff2'|'woff'|'truetype'|'opentype'; weight?:string; style?:'normal'|'italic'|'oblique'; postscriptName?:string;
}
export interface FilmSourceCaption {
  id:string; title:string; language:string;
  cues:{start:number;end:number;text:string;settings?:string;vttId?:string}[];
  vttHeader?:string;vttBlocks?:string[];
}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const name=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=256&&!/[\u0000-\u001f]/.test(x);
const payload=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&!/\r|\n\s*\n|-->/.test(x);
export function validFilmFonts(value:unknown){
 if(!Array.isArray(value)||value.length>512)return false;const ids=new Set(),families=new Set();
 return value.every(f=>{if(!object(f)||!name(f.id)||ids.has(f.id)||!name(f.family)||families.has(f.family)||!name(f.displayName)||typeof f.uri!=='string'||!f.uri.trim()||/^(javascript|data|vbscript):/i.test(f.uri.trim())||typeof f.hash!=='string'||!/^[a-f0-9]{64}$/.test(f.hash)||!['woff2','woff','truetype','opentype'].includes(String(f.format))||f.weight!==undefined&&!/^(?:[1-9]\d{0,2}|1000)(?: (?:[1-9]\d{0,2}|1000))?$/.test(String(f.weight))||f.style!==undefined&&!['normal','italic','oblique'].includes(String(f.style))||f.postscriptName!==undefined&&!name(f.postscriptName))return false;ids.add(f.id);families.add(f.family);return true;});
}
export function validFilmCaptions(value:unknown){
 if(!Array.isArray(value)||value.length>64)return false;const ids=new Set();
 return value.every(c=>{if(!object(c)||!name(c.id)||ids.has(c.id)||!name(c.title)||typeof c.language!=='string'||!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(c.language)||!Array.isArray(c.cues)||c.cues.length>100000)return false;ids.add(c.id);return c.cues.every(q=>object(q)&&typeof q.start==='number'&&Number.isFinite(q.start)&&q.start>=0&&typeof q.end==='number'&&Number.isFinite(q.end)&&q.end>q.start&&payload(q.text)&&(q.settings===undefined||typeof q.settings==='string'&&!/[\r\n]|-->/.test(q.settings))&&(q.vttId===undefined||name(q.vttId)&&!q.vttId.includes('-->')))&&(c.vttHeader===undefined||typeof c.vttHeader==='string'&&!/[\r\n]|-->/.test(c.vttHeader))&&(c.vttBlocks===undefined||Array.isArray(c.vttBlocks)&&c.vttBlocks.every(b=>typeof b==='string'&&/^(NOTE(?:[ \t\n]|$)|STYLE\n|REGION\n)/.test(b)&&! /\n\s*\n/.test(b)));});
}
