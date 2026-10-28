import path from 'node:path';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {mkdir,stat,lstat,readFile,writeFile,readdir,copyFile,realpath} from 'node:fs/promises';

const packageLimits=JSON.parse(await readFile(new URL('./package-limits.json',import.meta.url),'utf8'));
const localHosts=new Set(['film.local','film-render.invalid','localhost','127.0.0.1','film-build.localhost']);
const textExtension=/\.(?:html?|css|m?js|json|svg)$/i;
const rootReference=/(?:https?:\/\/(?:localhost|127\.0\.0\.1|film-build\.localhost)(?::\d+)?)?\/(?:assets|fixtures\/motale|film-media\/font-files)\/[^\s"'<>\\)]+/g;
const fontResource=/^film-media\/font-files\/[a-f0-9]{64}\.(?:ttf|otf|woff2?)$/;
function sourceLocation(root,name){if(fontResource.test(name))return {filename:path.join(root,'fonts',path.basename(name)),folder:path.join(root,'fonts')};const assets=name.startsWith('assets/');return {filename:path.join(assets?root:root,name),folder:path.join(root,assets?'assets':'fixtures/motale')};}
export async function fileHash(filename){const hash=createHash('sha256');for await(const bytes of createReadStream(filename))hash.update(bytes);return hash.digest('hex');}
export function resourceName(uri){const u=new URL(uri,'http://film.local');if(!['http:','https:'].includes(u.protocol)||!localHosts.has(u.hostname)||!/^\/(?:assets\/|fixtures\/motale\/(?:motion|manim|whiteboard)\/|film-media\/font-files\/[a-f0-9]{64}\.(?:ttf|otf|woff2?)$)/.test(u.pathname))throw Error(`素材尚未导入本地：${uri}`);return decodeURIComponent(u.pathname).slice(1);}
function references(text,uri){
 const refs=[],result=new Set();
 if(/\.m?js$/i.test(new URL(uri,'http://film.local').pathname)){
  const file=ts.createSourceFile(uri,text,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
  function visit(node){
   if(ts.isStringLiteralLike(node))for(const match of node.text.match(rootReference)??[])result.add(match);
   let argument,module=false;
   if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){argument=node.moduleSpecifier;module=true;}
   else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='fetch')){argument=node.arguments[0];module=node.expression.kind===ts.SyntaxKind.ImportKeyword;}
   else if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL')argument=node.arguments?.[0];
   if(argument&&ts.isStringLiteralLike(argument))refs.push({ref:argument.text,module});
   ts.forEachChild(node,visit);
  }visit(file);
 }else{
  for(const match of text.match(rootReference)??[])result.add(match);
  for(const match of text.matchAll(/(?:\b(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s"')]+)|(?:\bimport\s*(?:[^'";]*?from\s*)?|\bfetch\s*\(|\bnew\s+URL\s*\()\s*["']([^"']+)["'])/g))refs.push({ref:match[1]??match[2]??match[3],module:false});
 }
 for(const {ref,module} of refs){
  if(!ref||/^(?:data:|blob:|#|mailto:)/i.test(ref))continue;
  // Bare package specifiers are resolved by the source runtime/import map. They
  // are not relative files; the capture network whitelist checks actual loads.
  if(module&&!/^(?:\.{1,2}\/|\/|https?:)/.test(ref))continue;
  const url=new URL(ref,new URL(uri,'http://film.local'));
  if(localHosts.has(url.hostname))result.add(url.href);
  else if(!/^https?:/.test(url.protocol))throw Error('工程包含不支持的资源协议：'+ref+' in '+uri);
  else throw Error(`便携工程仍依赖远程资源，请先导入：${url.href}`);
 }return [...result];
}
function documentUris(document){const out=new Set();const visit=doc=>{for(const font of doc.fonts??[])out.add(font.uri);for(const source of doc.sources){if(source.kind==='sequence')visit(source.sequence);else if(source.kind!=='overlay')out.add(source.uri);else for(const uri of source.html?.match(rootReference)??[])out.add(uri);}for(const uri of JSON.stringify(doc).match(rootReference)??[])out.add(uri);};visit(document);return [...out];}

/** Resolve a bounded, read-only resource closure, shared by snapshots and scopes. */
export async function collectResources(document,{root,check=()=>{},limits={}}){
  const selected=new Map(),visited=new Set(),scanned=new Set(),bundles=new Set();let bytes=0;
  function declared(doc){for(const source of doc.sources){if(source.kind==='sequence')declared(source.sequence);else if(source.kind==='motale'){
    const name=resourceName(source.uri),folder=path.posix.dirname(name);
    if(name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('无效工程资源路径：'+name);
    // Motale imports acts by id at runtime. Its explicitly selected directory is
    // the bundle, never the shared assets/imports/fixtures root.
    if(!/^(?:assets\/(?!imports$)[^/]+(?:\/[^/]+)*|fixtures\/motale\/(?:motion|manim|whiteboard)(?:\/[^/]+)*)$/.test(folder))throw Error('Motale 影片必须放在独立素材目录内');
    bundles.add(folder);
  }}}declared(document);
  function boundedSize(info){bytes+=info.size;if(selected.size+1>(limits.maxFiles??packageLimits.entities)||info.size>(limits.maxFileBytes??Infinity)||bytes>(limits.maxBytes??packageLimits.expandedBytes))throw Error('画面依赖的资源数量或大小超过限制');}

  async function add(name,scan=true){
    check();if(!name||name.split('/').some(p=>!p||p==='..'||p==='.')||name.includes('\\'))throw Error('无效工程资源路径：'+name);
    let entry=selected.get(name);
    if(!entry){const {filename,folder}=sourceLocation(root,name),info=await lstat(filename);if(info.isSymbolicLink())throw Error('导出素材不能包含符号链接');if(!info.isFile())throw Error('工程资源不是文件');const actual=await realpath(filename),allowed=await realpath(folder);if(!actual.startsWith(allowed+path.sep))throw Error('工程资源超出来源目录');boundedSize(info);entry={filename,info};selected.set(name,entry);}
    if(scan&&!scanned.has(name)&&textExtension.test(name)&&entry.info.size<8*1024*1024){scanned.add(name);for(const uri of references(await readFile(entry.filename,'utf8'),'/'+name))await visit(uri);}
  }
  // Copy complete explicit bundles, but follow dependency syntax only from the
  // actual entry graph: bundled documentation/examples are not live resources.
  async function tree(name,depth=0){check();if(depth>32)throw Error('资源目录嵌套过深');const base=name.startsWith('assets/')?root:root;for(const item of await readdir(path.join(base,name),{withFileTypes:true})){if(item.isSymbolicLink())throw Error('导出素材不能包含符号链接');if(item.isDirectory())await tree(name+'/'+item.name,depth+1);else if(item.isFile())await add(name+'/'+item.name,false);}}
  async function visit(uri){check();const name=resourceName(uri);if(visited.has(name))return;visited.add(name);const bundle=[...bundles].find(folder=>name.startsWith(folder+'/'))??name.match(/^(assets\/imports\/[^/]+|fixtures\/motale\/(?:motion|manim|whiteboard))\//)?.[1];if(bundle&&!visited.has(bundle)){visited.add(bundle);await tree(bundle);}if(!bundle||!name.endsWith('/'))await add(name);}
  for(const uri of documentUris(document))await visit(uri);
  return selected;
}

/** Copy only selected files / explicit import bundles. Never the shared assets root. */
export async function snapshotResources(document,{root,dir,check=()=>{}}){
  const selected=await collectResources(document,{root,check});
  const files=[];
  for(const [name,{filename,info}]of selected){check();const before=await stat(filename);if(before.size!==info.size||before.mtimeMs!==info.mtimeMs)throw Error('导出准备期间素材发生变化，请重试');const target=path.join(dir,name);await mkdir(path.dirname(target),{recursive:true});await copyFile(filename,target,constants.COPYFILE_FICLONE);const after=await stat(filename);if(after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('导出准备期间素材发生变化，请重试');files.push({path:name,bytes:info.size,sha256:await fileHash(target)});}
  return {version:1,files};
}

/** Rewrite resource URLs in document JSON / HTML without changing authored metadata. */
export function mapDocumentResources(document,base){const visit=value=>typeof value==='string'?value.replace(rootReference,uri=>{const u=new URL(uri,'http://film.local');return base+u.pathname.slice(1)+u.search+u.hash;}):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v)])):value;return visit(document);}

export async function copySnapshot(resources,from,to,check=()=>{}){for(const file of resources.files){check();const source=path.join(from,file.path);if(await fileHash(source)!==file.sha256)throw Error('固定的导出素材已损坏，无法重试');const target=path.join(to,file.path);await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target,constants.COPYFILE_FICLONE);}}

export async function portableResources(resources,from,to,check=()=>{}){
  await copySnapshot(resources,from,to,check);
  for(const file of resources.files){check();if(!textExtension.test(file.path))continue;const name=path.join(to,file.path),original=await readFile(name,'utf8');if(Buffer.byteLength(original)>8*1024*1024)continue;const updated=original.replace(rootReference,uri=>{const u=new URL(uri,'http://film.local'),target=decodeURIComponent(u.pathname).slice(1);return path.posix.relative(path.posix.dirname(file.path),target)+u.search+u.hash;});if(updated!==original)await writeFile(name,updated);}
}

export async function packageManifest(dir,documentId,extra={}){
  const files=[];let entities=1,bytes=0;
  async function visit(relative=''){for(const item of await readdir(path.join(dir,relative),{withFileTypes:true})){const name=relative?relative+'/'+item.name:item.name;if(name==='manifest.json')continue;if(++entities>packageLimits.entities)throw Error('工程包超过 8192 个文件及目录');if(item.isDirectory())await visit(name);else if(item.isFile()){const filename=path.join(dir,name),size=(await stat(filename)).size;bytes+=size;if(bytes>packageLimits.expandedBytes)throw Error('工程包超过 512 MiB');files.push({path:name,bytes:size,sha256:await fileHash(filename)});}}}
  await visit();const manifest={kind:'notale-film-package',version:1,document:'film.json',documentId,files:files.sort((a,b)=>a.path.localeCompare(b.path)),...extra};if(bytes+Buffer.byteLength(JSON.stringify(manifest))>packageLimits.expandedBytes)throw Error('工程包超过 512 MiB');return manifest;
}
