import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Read-only preparation: reports never contain matched secret values or source snippets.
const frontend=process.cwd();
const pkg=JSON.parse(await readFile(resolve(frontend,'package.json'),'utf8'));
if(pkg.name!=='@notale/editor-frontend')throw Error('Run from the editor frontend directory');
const contract=String(pkg.dependencies['@notale/editor']);
if(!/^file:vendor\/notale-editor-[\w.-]+\.tgz$/.test(contract))throw Error('Unexpected editor contract archive');
const selectedArchive=contract.slice(5);
const files:{path:string;bytes:number;sha256:string}[]=[];
const excluded:{path:string;reason:string}[]=[];
const findings:{path:string;line?:number;kind:string}[]=[];
const roots=['src','app','scripts','tests','docs'];
const legacyTemplateTools=new Set(['prepare.ts','prepare-diagrams.ts','prepare-fonts.py','extract-diagram.ts','refine-dom.ts','diagram-payload.ts'].map(name=>'scripts/templates/'+name));
const rootFiles=new Set(['README.md','LICENSE','package.json','package-lock.json','compose.yaml','next.config.ts','playwright.config.ts','tsconfig.json','tsconfig.build.json','tsconfig.scripts.json','.gitignore','.npmignore']);
const checks:[string,RegExp][]=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['cloud-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['embedded-credential-url',/https?:\/\/[^\s/:@]+:[^\s/@]+@/],
 ['workspace-path',/\/(?:data1\/home|home|Users)\/[\w.-]+\//],
 ['reference-directory',/(?:\.\.\/)+refs\//],
];
for(const project of ['notale-editor','notale-editor-frontend']){
 const root=resolve(frontend,'..',project);
 async function walk(relative:string){
  for(const entry of (await readdir(resolve(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const local=relative?`${relative}/${entry.name}`:entry.name,path=`${project}/${local}`;
   let reason='';
   if(entry.isSymbolicLink()){findings.push({path,kind:'symbolic-link'});continue;}
   if(['node_modules','.local','.git','dist','test-results','playwright-report'].includes(entry.name)||entry.name.startsWith('.next'))reason='generated or local state';
   else if(/^\.env(?:\.|$)/.test(entry.name)||/\.(?:pem|key|p12|pfx|sqlite|db|tsbuildinfo)$/.test(entry.name))reason='environment, credential or local database';
   else if(local==='templates/refined'||local==='templates/README.md'||legacyTemplateTools.has(local))reason='legacy reference catalog or reconstruction tooling; original catalog replaces it';
   else if(local.startsWith('vendor/')&&local.endsWith('.tgz')&&local!==selectedArchive)reason='unselected contract archive';
   else if(!relative&&!roots.includes(local)&&!rootFiles.has(local)&&!['templates','vendor'].includes(local))reason='outside proposed editor source scope';
   if(reason){excluded.push({path,reason});continue;}
   if(entry.isDirectory()){await walk(local);continue;}
   if(!entry.isFile()){findings.push({path,kind:'non-regular-file'});continue;}
   const data=await readFile(resolve(root,local));
   files.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
   if(data.includes(0)||/\.(?:png|jpg|webp|woff2?|tgz|wasm)$/.test(local))continue;
   const lines=data.toString('utf8').split('\n');
   lines.forEach((line,index)=>{for(const [kind,pattern] of checks)if(pattern.test(line))findings.push({path,line:index+1,kind});});
  }
 }
 await walk('');
}
const result={status:'review-required',scope:'proposed editor-only source; not Git history or dependency clearance',selectedArchive,files,excluded,findings};
await mkdir(resolve(frontend,'.local'),{recursive:true});
await writeFile(resolve(frontend,'.local/release-inventory.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),excluded:excluded.length,findings:findings.length,byKind:Object.fromEntries([...new Set(findings.map(f=>f.kind))].map(kind=>[kind,findings.filter(f=>f.kind===kind).length])),report:'.local/release-inventory.json'},null,2));
