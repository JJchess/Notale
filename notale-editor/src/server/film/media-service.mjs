import {resourceName} from './export-resources.mjs';
/** Worktree-only imports. Each upload creates a fresh copy; fixture files are never writable. */
import {createReadStream} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';import {mkdir,open,rename,rm,realpath,stat,readFile,readdir} from 'node:fs/promises';
import {createMediaDerivatives} from './media-derivatives.mjs';
const packageLimits=JSON.parse(await readFile(new URL('./package-limits.json',import.meta.url),'utf8'));
export function createMediaService({root,spawn,actor}) {
const assets=path.join(root,'assets'),imports=path.join(assets,'imports'),opened=new Set(),thumbs=new Map();
let activeThumbs=0;const thumbQueue=[];function scheduleThumb(work){if(thumbQueue.length>=200)throw Error('缩略图任务较多，请稍后重试');return new Promise((resolve,reject)=>{thumbQueue.push({work,resolve,reject});pumpThumbs();});}function pumpThumbs(){while(activeThumbs<2&&thumbQueue.length){const task=thumbQueue.shift();activeThumbs++;Promise.resolve().then(task.work).then(task.resolve,task.reject).finally(()=>{activeThumbs--;pumpThumbs();});}}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
const metadataCache=new Map();
async function hashFile(filename){const hash=createHash('sha256');for await(const bytes of createReadStream(filename))hash.update(bytes);return hash.digest('hex');}
async function fingerprint(uri,kind='file'){const {filename,info}=await resourcePath(uri);if(kind!=='bundle')return {sha256:await hashFile(filename),bytes:info.size,kind:'file'};const folder=path.dirname(filename);if(folder===assets||folder===imports)throw Error('请选择独立素材目录中的入口文件');const entries=[];let bytes=0,entities=0;async function walk(dir,relative=''){for(const entry of await readdir(dir,{withFileTypes:true})){if(++entities>packageLimits.entities)throw Error('素材目录项目过多');const name=relative+entry.name,file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('素材目录不能包含符号链接');if(entry.isDirectory())await walk(file,name+'/');else if(entry.isFile()){const before=await stat(file);bytes+=before.size;if(bytes>packageLimits.expandedBytes)throw Error('素材目录超过 512 MiB');const sha256=await hashFile(file),after=await stat(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('校验期间素材发生变化，请重试');entries.push([name,before.size,sha256]);}}}await walk(folder);entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);return {sha256:createHash('sha256').update(JSON.stringify(entries)).digest('hex'),bytes,kind:'bundle'};}

async function resourcePath(uri){
 const pathname='/'+resourceName(uri),fixture=pathname.startsWith('/fixtures/motale/'),folder=pathname.startsWith('/assets/')?assets:fixture?path.join(root,'fixtures/motale'):undefined;
 if(!folder)throw Error('素材不在可读取目录');
 const filename=await realpath(path.join(folder,pathname.slice(fixture?'/fixtures/motale/'.length:'/assets/'.length))),base=await realpath(folder);
 if(!filename.startsWith(base+path.sep))throw Error('Invalid media path');const info=await stat(filename);if(!info.isFile())throw Error('素材不是文件');return {filename,info};
}
async function metadata(uri){
 const {filename,info}=await resourcePath(uri),key=filename+':'+info.mtimeMs+':'+info.size;
 if(metadataCache.has(key))return metadataCache.get(key);
 const value={name:path.basename(filename),bytes:info.size,modified:new Date(info.mtimeMs).toISOString(),streams:[],fingerprint:{sha256:await hashFile(filename),bytes:info.size,kind:'file'}};
 if(/\.(mp4|webm|mov|mkv|m4v|mp3|wav|ogg|m4a|aac|flac|png|jpe?g|webp|avif|gif)$/i.test(filename)){
  const probe=await scheduleThumb(()=>new Promise((resolve,reject)=>{
   const child=spawn('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,mp3,wav,ogg,flac,png_pipe,jpeg_pipe,webp_pipe,gif,aac','-show_entries','format=format_name,duration,start_time,bit_rate:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,start_time,sample_rate,channels,channel_layout:stream_side_data=rotation','-of','json',filename],{stdio:['ignore','pipe','pipe']});let text='',oversize=false;const timeout=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',data=>{text+=data;if(text.length>1024*1024){oversize=true;child.kill('SIGTERM');}});child.stderr.resume();child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);try{if(code!==0||oversize)throw Error('无法读取媒体编码信息');resolve(JSON.parse(text));}catch(error){reject(error);}});
  }));
  Object.assign(value,{format:probe.format?.format_name,duration:Number(probe.format?.duration)||undefined,bitRate:Number(probe.format?.bit_rate)||undefined,streams:probe.streams??[]});
 }
 if(metadataCache.size>=32)metadataCache.delete(metadataCache.keys().next().value);metadataCache.set(key,value);return value;
}
async function thumb(uri,time=0){if(!Number.isFinite(time)||time<0||time>86400)throw Error('Invalid thumbnail time');time=Math.floor(time*4)/4;const url={pathname:'/'+resourceName(uri)};if(!url.pathname.startsWith('/assets/'))throw Error('Only imported media can be thumbnailed');const filename=await realpath(path.join(assets,decodeURIComponent(url.pathname.slice(8)))),base=await realpath(assets);if(!filename.startsWith(base+path.sep))throw Error('Invalid media path');const info=await stat(filename),key=filename+':'+info.mtimeMs+':'+time;if(!thumbs.has(key)){if(thumbs.size>=100)thumbs.delete(thumbs.keys().next().value);const promise=scheduleThumb(()=>new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-v','error','-threads','1','-ss',String(time),'-i',filename,'-frames:v','1','-vf','scale=240:135:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','mjpeg','-threads','1','pipe:1'],{stdio:['ignore','pipe','pipe']});const buffers=[];let size=0;child.stdout.on('data',data=>{size+=data.length;if(size>4*1024*1024)child.kill('SIGTERM');else buffers.push(data);});child.stderr.resume();const timeout=setTimeout(()=>child.kill('SIGTERM'),15000);child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);if(code===0&&size)resolve(Buffer.concat(buffers));else reject(Error('无法生成媒体缩略图'));});}));thumbs.set(key,promise);promise.catch(()=>thumbs.delete(key));}return thumbs.get(key);}
const derivatives=createMediaDerivatives({root,resourcePath,metadata,spawn});
async function mediaRequest(req,res){const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/film-media/'))return false;try{
 if(await derivatives(req,res,url))return true;
 if(url.pathname==='/film-media/fingerprint'&&req.method==='GET'){json(res,200,await fingerprint(url.searchParams.get('uri')??'',url.searchParams.get('kind')??'file'));return true;}
 if(url.pathname==='/film-media/status'&&req.method==='GET'){const {info}=await resourcePath(url.searchParams.get('uri')??'');json(res,200,{available:true,bytes:info.size});return true;}
 if(url.pathname==='/film-media/metadata'&&req.method==='GET'){json(res,200,await metadata(url.searchParams.get('uri')??''));return true;}
 if(url.pathname==='/film-media/download'&&req.method==='GET'){
  const {filename,info}=await resourcePath(url.searchParams.get('uri')??'');res.writeHead(200,{'content-type':'application/octet-stream','content-length':String(info.size),'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(path.basename(filename)).replace(/'/g,'%27'),'x-content-type-options':'nosniff','cache-control':'no-store'});const stream=createReadStream(filename);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return true;
 }
 if(url.pathname==='/film-media/thumbnail'&&req.method==='GET'){const bytes=await thumb(url.searchParams.get('uri')??'',Number(url.searchParams.get('time')??0));res.writeHead(200,{'content-type':'image/jpeg','cache-control':'private,max-age=3600'});res.end(bytes);return true;}
 if(url.pathname==='/film-media/imports'&&req.method==='POST'){await mkdir(imports,{recursive:true});const id=randomUUID();await mkdir(path.join(imports,id));opened.add(id);json(res,201,{id});return true;}
 const complete=/^\/film-media\/imports\/([a-f0-9-]{36})\/complete$/.exec(url.pathname);if(complete&&req.method==='POST'){if(!opened.has(complete[1]))throw Error('Import session expired');opened.delete(complete[1]);json(res,200,{complete:true});return true;}
 const cleanup=/^\/film-media\/imports\/([a-f0-9-]{36})$/.exec(url.pathname);if(cleanup&&req.method==='DELETE'){if(!opened.has(cleanup[1]))throw Error('Import session expired');opened.delete(cleanup[1]);await rm(path.join(imports,cleanup[1]),{recursive:true,force:true});json(res,200,{removed:true});return true;}
 const match=/^\/film-media\/imports\/([a-f0-9-]{36})$/.exec(url.pathname);if(match&&req.method==='PUT'){
  const id=match[1],relative=url.searchParams.get('path')??'';if(!opened.has(id))throw Error('Import session expired');if(!relative||relative.length>1000||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||/[\u0000-\u001f]/.test(relative))throw Error('Invalid import path');
  const destination=path.join(imports,id,relative);await mkdir(path.dirname(destination),{recursive:true});const temp=destination+'.upload-'+randomUUID(),file=await open(temp,'wx',0o600);let size=0;const hash=createHash('sha256');
  try{for await(const bytes of req){size+=bytes.length;hash.update(bytes);if(size>2*1024**3)throw Error('单个素材不能超过 2 GiB');await file.writeFile(bytes);}await file.close();await open(destination,'wx',0o600).then(f=>f.close());await rename(temp,destination);}catch(error){await file.close().catch(()=>{});await rm(temp,{force:true});throw error;}
  json(res,201,{uri:'/assets/imports/'+id+'/'+relative.split('/').map(encodeURIComponent).join('/'),size,fingerprint:{sha256:hash.digest('hex'),bytes:size,relativePath:relative,kind:'file'}});return true;
 }
 json(res,404,{error:'Media endpoint not found'});
 }catch(error){const code=['ENOENT','ENOTDIR'].includes(error.code)?'RESOURCE_MISSING':['EACCES','EPERM'].includes(error.code)?'RESOURCE_DENIED':'RESOURCE_INVALID';const status=code==='RESOURCE_MISSING'?404:code==='RESOURCE_DENIED'?403:400;if(!res.headersSent)json(res,status,{error:code==='RESOURCE_MISSING'?'素材文件不存在':code==='RESOURCE_DENIED'?'没有读取素材的权限':error.message,code});else res.destroy();}return true;}

return {handle:mediaRequest};
}
