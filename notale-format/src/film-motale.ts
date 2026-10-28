/** Versioned Motale author data. Times are source-act seconds, never timeline frames.
 * Each clip owns its copy; viewer branches and transient previews are not persisted. */
export type FilmMotaleEasing='linear'|'smooth'|'step';
export interface FilmMotaleKeys<T> {keys:[time:number,value:T,easing?:FilmMotaleEasing][]}
export interface FilmMotaleObject {
 x?:number|FilmMotaleKeys<number>;y?:number|FilmMotaleKeys<number>;
 scale?:number|FilmMotaleKeys<number>;rotate?:number|FilmMotaleKeys<number>;
 opacity?:number|FilmMotaleKeys<number>;
 color?:string|null|FilmMotaleKeys<string>;visible?:boolean|FilmMotaleKeys<boolean>;
 /** Static content is valid in motale-author/1 and /2; the bridge checks object support. */
 text?:string;tex?:string;value?:number;values?:number[];
}
export interface FilmMotaleWindow {from?:number;until?:number;handback?:number;range?:[number,number];step?:number}
export interface FilmMotaleAuthor {
 schema:'motale-author/0'|'motale-author/1'|'motale-author/2';film?:string;
 acts:Record<string,{revision?:string;objects?:Record<string,FilmMotaleObject>;windows?:Record<string,FilmMotaleWindow>;structure?:{copies?:{prefix:string;source:string}[];removed?:string[]}}>;
}
const forbidden=new Set(['__proto__','constructor','prototype']);
const identifier=(v:unknown,max=256):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)&&!forbidden.has(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const time=(v:unknown):v is number=>finite(v)&&v>=0;
const color=(v:unknown):v is string=>typeof v==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(v);
/** Accept plain records from the iframe's realm, but never accessors or inherited payloads. */
function record(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==null&&(Object.getPrototypeOf(prototype)!==null||Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name!=='Object'))return false;
 return Reflect.ownKeys(value).every(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return typeof key==='string'&&!forbidden.has(key)&&d.enumerable&&'value' in d;});
}
function fields(value:unknown,names:readonly string[]):value is Record<string,unknown>{return record(value)&&Object.keys(value).every(key=>names.includes(key));}
function array(value:unknown,max:number):value is unknown[]{
 if(!Array.isArray(value)||value.length>max)return false;
 const keys=Reflect.ownKeys(value);
 return keys.length===value.length+1&&keys.every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)&&Number(key)<value.length&&'value' in Object.getOwnPropertyDescriptor(value,key)!);
}
/** Bounded JSON validation; live object/window existence, act duration, content construction
 * and the source object's exact values length are bridge checks. No version/ID migration.
 * Limits: 2M serialized characters, 256 acts, 10k objects, 4096 windows,
 * 100k keyframes total and 10k keys per property; v1 text/tex use at most 2000
 * UTF-16 code units each, values use 10k numbers per property and 100k total.
 * v2 permits at most 64 copies and 256 removed roots per act; IDs are derived, not mapped.
 * Unknown fields and keyed content are rejected. */
export function validFilmMotaleAuthor(value:unknown):value is FilmMotaleAuthor {
 try{
  if(!fields(value,['schema','film','acts'])||value.schema!=='motale-author/0'&&value.schema!=='motale-author/1'&&value.schema!=='motale-author/2'||value.film!==undefined&&!identifier(value.film)||!record(value.acts)||Object.keys(value.acts).length>256)return false;
  const names=['x','y','scale','rotate','opacity','color','visible'];
  if(value.schema!=='motale-author/0')names.push('text','tex','value','values');
  let objects=0,windows=0,keyframes=0,numbers=0;
  const property=(name:string,data:unknown)=>{
   if(name==='text'||name==='tex')return typeof data==='string'&&data.length<=2000;
   if(name==='value')return finite(data);
   if(name==='values')return array(data,10000)&&(numbers+=data.length)<=100000&&data.every(finite);
   const valid=(v:unknown)=>name==='visible'?typeof v==='boolean':name==='color'?color(v):finite(v)&&(name!=='scale'||v>=.01)&&(name!=='opacity'||v>=0&&v<=1);
   if(name==='color'&&data===null||valid(data))return true;
   if(!fields(data,['keys'])||!array(data.keys,10000)||!data.keys.length||(keyframes+=data.keys.length)>100000)return false;
   let previous=-1;
   return data.keys.every(key=>{
    if(!array(key,3)||key.length<2||!time(key[0])||key[0]<=previous||!valid(key[1]))return false;
    const ease=key[2];if(key.length===3&&(typeof ease!=='string'||!['linear','smooth','step'].includes(ease)||name==='color'&&ease!=='step'||name==='visible'&&ease!=='step'))return false;
    previous=key[0];return true;
   });
  };
  for(const [id,act] of Object.entries(value.acts)){
   if(!identifier(id)||!fields(act,value.schema==='motale-author/2'?['revision','objects','windows','structure']:['revision','objects','windows'])||act.revision!==undefined&&!identifier(act.revision))return false;
   if(act.objects!==undefined){
    if(!record(act.objects)||(objects+=Object.keys(act.objects).length)>10000)return false;
    for(const [target,object] of Object.entries(act.objects))if(!identifier(target,value.schema==='motale-author/2'?289:256)||!fields(object,names)||!Object.entries(object).every(([name,data])=>property(name,data)))return false;
   }
   if(act.structure!==undefined){
    const structure=act.structure;
    if(!fields(structure,['copies','removed']))return false;
    if(structure.copies!==undefined){
     if(!array(structure.copies,64))return false;
     const pairs=new Set<string>();
     for(const copy of structure.copies){
      if(!fields(copy,['prefix','source'])||typeof copy.prefix!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(copy.prefix)||!identifier(copy.source))return false;
      const pair=JSON.stringify([copy.prefix,copy.source]);if(pairs.has(pair))return false;pairs.add(pair);
     }
    }
    if(structure.removed!==undefined&&(!array(structure.removed,256)||!structure.removed.every(id=>identifier(id,289))||new Set(structure.removed).size!==structure.removed.length))return false;
   }
   if(act.windows!==undefined){
    if(!record(act.windows)||(windows+=Object.keys(act.windows).length)>4096)return false;
    for(const [target,window] of Object.entries(act.windows)){
     if(!identifier(target)||!fields(window,['from','until','handback','range','step']))return false;
     for(const [name,data] of Object.entries(window)){
      if(name==='range'){if(!array(data,2)||data.length!==2||!finite(data[0])||!finite(data[1])||data[0]>=data[1])return false;}
      else if(!time(data)||name==='step'&&data<=0)return false;
     }
     if(window.from!==undefined&&window.until!==undefined&&(window.from as number)>=(window.until as number))return false;
    }
   }
  }
  return JSON.stringify(value).length<=2_000_000;
 }catch{return false;}
}
