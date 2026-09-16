import {createHash} from 'node:crypto';
import {lstat,readFile,mkdir,mkdtemp,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';

const frontend=process.cwd(),root=resolve(frontend,'..');
const pkg=JSON.parse(await readFile(resolve(frontend,'package.json'),'utf8'));
if(pkg.name!=='@notale/editor-frontend')throw Error('Run from the editor frontend directory');
const inventory=JSON.parse(await readFile(resolve(frontend,'.local/release-inventory.json'),'utf8')) as {
 files:{path:string;bytes:number;sha256:string}[];findings:unknown[];
};
const stage=await mkdtemp(resolve(tmpdir(),'notale-source-review-'));
const paths=new Set<string>();
for(const file of inventory.files){
 const parts=file.path.split('/');
 if(!['notale-format','notale-editor','notale-editor-frontend'].includes(parts[0])||parts.some(part=>!part||part==='.'||part==='..'||part.includes('\\'))||paths.has(file.path))throw Error('Invalid or duplicate inventory path');
 paths.add(file.path);
 // Refuse symlinks anywhere in the source chain, not only at the leaf.
 let source=root;
 for(const part of parts){source=resolve(source,part);if((await lstat(source)).isSymbolicLink())throw Error('Source path became a symlink: '+file.path);}
 const stat=await lstat(source);
 if(!stat.isFile())throw Error('Source is not a regular file: '+file.path);
 const data=await readFile(source),hash=createHash('sha256').update(data).digest('hex');
 if(hash!==file.sha256||data.length!==file.bytes)throw Error('Source changed; regenerate inventory: '+file.path);
 const destination=resolve(stage,file.path);
 await mkdir(dirname(destination),{recursive:true});
 await writeFile(destination,data,{flag:'wx'});
 await chmod(destination,stat.mode&0o111?0o755:0o644);
 const copied=await readFile(destination);
 if(createHash('sha256').update(copied).digest('hex')!==file.sha256)throw Error('Copy verification failed: '+file.path);
}
const rootFiles=[];
for(const [from,to] of [['notale-editor-frontend/docs/release/ROOT-README.md','README.md'],['notale-editor-frontend/LICENSE','LICENSE'],['notale-editor-frontend/docs/release/EDITOR-WORKFLOW.yml','.github/workflows/editor-release.yml']]){
 if(!paths.has(from))throw Error('Missing verified root document source: '+from);
 const data=await readFile(resolve(stage,from));
 await mkdir(dirname(resolve(stage,to)),{recursive:true});
 await writeFile(resolve(stage,to),data,{flag:'wx'});
 const sha256=createHash('sha256').update(data).digest('hex');
 if(createHash('sha256').update(await readFile(resolve(stage,to))).digest('hex')!==sha256)throw Error('Root document copy mismatch');
 rootFiles.push({path:to,source:from,bytes:data.length,sha256});
}
const report={status:'private-review-only',stage,files:paths.size,rootFiles,unresolvedFindings:inventory.findings.length,inventory};
await writeFile(resolve(frontend,'.local/source-release-stage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({stage,files:paths.size,verified:true,unresolvedFindings:inventory.findings.length,published:false},null,2));
