import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
type RecordEntry={project:string;path:string;version:string;license:string;optional:boolean};
const inventory=JSON.parse(await readFile('docs/release/dependency-licenses.json','utf8')).packages as RecordEntry[];
const upstream=JSON.parse(await readFile('docs/release/upstream-licenses/manifest.json','utf8')) as {name:string;version:string;file:string;source:string;sha256:string;supplemental?:boolean;declaredTerms?:boolean}[];
const missing:{project:string;path:string;reason:string;optional:boolean}[]=[];
const collected=new Map<string,{name:string;version:string;license:string;completeTextFound:boolean;declaredTermsIncluded:boolean;projects:Set<string>;texts:{file:string;text:string;sha256:string}[]}>();
async function licenseFiles(directory:string,depth=0):Promise<string[]>{
 const entries=await readdir(directory,{withFileTypes:true});const result:string[]=[];
 for(const entry of entries){
  if(entry.isFile()&&/^(licen[sc]e|copying|notice|copyright|authors)([._-]|$)/i.test(entry.name))result.push(resolve(directory,entry.name));
  if(entry.isDirectory()&&depth<2&&/^(licenses?|licences?|legal)$/i.test(entry.name))result.push(...await licenseFiles(resolve(directory,entry.name),depth+1));
 }
 return result.sort();
}
for(const record of inventory){
 const directory=resolve(record.project==='frontend'?'.':'../notale-editor',record.path);
 let metadata:{name:string;version:string};
 try{metadata=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;missing.push({...record,reason:'not installed on this platform'});continue;}
 if(metadata.version!==record.version)throw Error(`Installed version differs from lock: ${record.project}/${record.path}`);
 if(metadata.name==='@notale/editor')continue;
 const key=metadata.name+'@'+metadata.version;
 const previous=collected.get(key);if(previous){previous.projects.add(record.project);continue;}
 const files=await licenseFiles(directory);
 const texts=[];
 if(!files.length){
  for(const entry of await readdir(directory)){
   if(!/^readme(?:\.md|\.txt)?$/i.test(entry))continue;
   const readme=await readFile(resolve(directory,entry),'utf8');
   const match=readme.match(/^#{1,3}\s+licen[sc](?:e|ing)\s*\r?\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im);
   if(match&&/Permission is hereby granted|Redistribution and use in source and binary forms/i.test(match[1]))texts.push({file:entry+'#license',text:match[0],sha256:createHash('sha256').update(match[0]).digest('hex')});
  }
 }
 const hasLocalText=files.length>0||texts.length>0;
 let hasCompleteSupplement=false;
 let declaredTermsIncluded=false;
 {
  for(const supplement of upstream.filter(entry=>entry.name===metadata.name&&entry.version===metadata.version&&(entry.supplemental||!hasLocalText))){
   if(!/^[\w.-]+$/.test(supplement.file))throw Error('Invalid upstream license filename');
   const bytes=await readFile(resolve('docs/release/upstream-licenses',supplement.file));
   const sha256=createHash('sha256').update(bytes).digest('hex');
   if(sha256!==supplement.sha256)throw Error('Upstream license hash mismatch: '+key);
   if(!supplement.supplemental)hasCompleteSupplement=true;
   if(supplement.declaredTerms)declaredTermsIncluded=true;
   texts.push({file:'upstream: '+supplement.source,text:bytes.toString('utf8'),sha256});
  }
 }
 if(!hasLocalText&&!hasCompleteSupplement)missing.push({...record,reason:'no full license text in inspected package locations (README metadata alone is insufficient)'});
 for(const file of files){const bytes=await readFile(file);texts.push({file:relative(directory,file),text:bytes.toString('utf8'),sha256:createHash('sha256').update(bytes).digest('hex')});}
 collected.set(key,{...metadata,license:record.license,completeTextFound:hasLocalText||hasCompleteSupplement,declaredTermsIncluded,projects:new Set([record.project]),texts});
}
await mkdir('docs/release',{recursive:true});
const packages=[...collected.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
await writeFile('docs/release/THIRD-PARTY-NOTICES.txt','Notale editor — collected third-party license texts\nGenerated from installed packages matching the lock inventory and version-pinned upstream supplements.\nThis file is not complete clearance; see notice-review.json for gaps.\n\n'+packages.map(p=>`============================================================\n${p.name}@${p.version}\nDeclared: ${p.license}\nProjects: ${[...p.projects].join(', ')}\n\n${p.texts.map(t=>`--- ${t.file} (SHA256 ${t.sha256}) ---\n${t.text}\n`).join('\n')}`).join('\n'));
await writeFile('../notale-editor/docs/THIRD-PARTY-NOTICES.txt',await readFile('docs/release/THIRD-PARTY-NOTICES.txt'));
await writeFile('docs/release/notice-review.json',JSON.stringify({packages:packages.map(p=>({name:p.name,version:p.version,completeTextFound:p.completeTextFound,declaredTermsIncluded:p.declaredTermsIncluded,projects:[...p.projects],files:p.texts.map(({file,sha256})=>({file,sha256}))})),missing},null,2)+'\n');
console.log(`Collected ${packages.reduce((n,p)=>n+p.texts.length,0)} license/notice texts from ${packages.length} installed package versions; ${missing.length} records need review (including optional platforms).`);
