import {unzipSync} from 'fflate';
import packageLimits from './package-limits.json';
import {parseFilmDocument,type FilmDocument} from '@notale/editor/film';

type PackageManifest={kind:'notale-film-package';version:1;document:string;portable:true;resources:string[];files:{path:string;bytes:number;sha256:string}[]};
const safePath=(value:string)=>typeof value==='string'&&!!value&&value.length<=1000&&!/[\\\0-\x1f]/.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>!!part&&part!=='.'&&part!=='..'&&!part.startsWith('.'));
async function hash(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}

/** Validate the whole package before uploading anything or changing the open document. */
export async function readFilmPackage(bytes:Uint8Array){
  let size=0,count=0;
  const files=unzipSync(bytes,{filter:entry=>{if(++count>packageLimits.entities||(size+=entry.originalSize)>packageLimits.expandedBytes)throw Error('工程包超过 512 MiB 或 8192 个文件及目录');if(entry.name.endsWith('/'))return false;if(!safePath(entry.name))throw Error('工程包包含无效路径');return true;}});
  const text=(name:string)=>{const value=files[name];if(!value)throw Error(`工程包缺少 ${name}`);return new TextDecoder().decode(value);};
  const manifest=JSON.parse(text('manifest.json')) as PackageManifest;
  if(manifest.kind!=='notale-film-package'||manifest.version!==1||manifest.portable!==true||manifest.document!=='film.json'||!Array.isArray(manifest.files)||!Array.isArray(manifest.resources))throw Error('请选择可编辑的 Notale 便携工程包');
  const entries=new Map<string,PackageManifest['files'][number]>();
  for(const item of manifest.files){if(!safePath(item.path)||entries.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('工程包清单无效');entries.set(item.path,item);const value=files[item.path];if(!value||value.byteLength!==item.bytes||await hash(value)!==item.sha256)throw Error(`工程文件校验失败：${item.path}`);}
  if(!entries.has('film.json')||new Set(manifest.resources).size!==manifest.resources.length||manifest.resources.some(name=>!entries.has(name)||!safePath(name)))throw Error('工程素材清单不完整');
  const doc=parseFilmDocument(JSON.parse(text('film.json')));
  const resources=new Set(manifest.resources);
  const check=(document:FilmDocument)=>{for(const font of document.fonts??[])checkUri(font.uri);for(const source of document.sources){if(source.kind==='sequence')check(source.sequence!);else if(source.kind!=='overlay')checkUri(source.uri);}};
  const checkUri=(uri:string)=>{const url=new URL(uri,'https://film-package.invalid/');if(url.origin!=='https://film-package.invalid'||!resources.has(decodeURIComponent(url.pathname).slice(1)))throw Error('工程引用了包外素材：'+uri);};check(doc);
  return {doc,manifest,files};
}

export async function importFilmPackage(file:File,options:{signal?:AbortSignal;progress?:(done:number,total:number)=>void}={}):Promise<FilmDocument>{
  if(file.size>packageLimits.expandedBytes)throw Error('工程包超过 512 MiB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==0x50||bytes[1]!==0x4b)return parseFilmDocument(JSON.parse(new TextDecoder().decode(bytes)));
  const {doc,manifest,files}=await readFilmPackage(bytes);
  const request=async(url:string,init:RequestInit)=>{const response=await fetch(url,{...init,signal:options.signal}),result=await response.json();if(!response.ok)throw Error(result.error??'工程素材导入失败');return result;};
  const batch=await request('/film-media/imports',{method:'POST'}),mapped=new Map<string,string>(),fingerprints=new Map<string,NonNullable<FilmDocument['sources'][number]['fingerprint']>>();
  try{
    let done=0;for(const name of manifest.resources){const result=await request(`/film-media/imports/${batch.id}?path=${encodeURIComponent(name)}`,{method:'PUT',body:new Blob([new Uint8Array(files[name])])});mapped.set(name,result.uri);fingerprints.set(result.uri,result.fingerprint);options.progress?.(++done,manifest.resources.length);}
    const replace=(uri:string)=>{try{const url=new URL(uri,'https://film-package.invalid/');if(url.origin!=='https://film-package.invalid')return uri;const destination=mapped.get(decodeURIComponent(url.pathname).slice(1));return destination?destination+url.search+url.hash:uri;}catch{return uri;}};
    const visit=(value:unknown):unknown=>typeof value==='string'?replace(value).replace(/(?:assets\/|fixtures\/motale\/|film-media\/font-files\/)[^\s"'<>\\)]+/g,uri=>replace(uri)):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)])):value;
    const imported=parseFilmDocument(visit(doc));imported.id=crypto.randomUUID();
    const bundlePrints=new Map<string,NonNullable<FilmDocument['sources'][number]['fingerprint']>>();const refresh=async(document:FilmDocument)=>{for(const source of document.sources){if(source.sequence){await refresh(source.sequence);continue;}if(['overlay','lecture'].includes(source.kind))continue;const uri=new URL(source.uri,location.href).pathname;if(source.kind==='motale'||source.kind==='openfilm'){if(!bundlePrints.has(uri))bundlePrints.set(uri,await request('/film-media/fingerprint?kind=bundle&uri='+encodeURIComponent(uri),{method:'GET'}));source.fingerprint=bundlePrints.get(uri);}else source.fingerprint=fingerprints.get(uri);}};await refresh(imported);
    await request(`/film-media/imports/${batch.id}/complete`,{method:'POST'});
    return imported;
  }catch(error){await fetch(`/film-media/imports/${batch.id}`,{method:'DELETE'}).catch(()=>{});throw error;}
}
