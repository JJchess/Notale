import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const backend=resolve('../notale-editor');
const require=createRequire(resolve(backend,'package.json'));
const {build}=require('esbuild') as {build:(options:Record<string,unknown>)=>Promise<{metafile:{inputs:Record<string,unknown>}}>};
const entries=['vector-editor','vector-worker','text-editor','bridge','workbench','show'];
const results=await Promise.all(entries.map(async name=>{
 const result=await build({absWorkingDir:backend,entryPoints:[`src/browser/${name}.ts`],outfile:`audit/${name}.js`,bundle:true,write:false,metafile:true,format:['workbench','show'].includes(name)?'esm':'iife',target:'es2022',external:name.startsWith('vector-')?['fs','path']:[],logLevel:'silent'});
 const paths=new Set<string>();
 for(const input of Object.keys(result.metafile.inputs)){
  const parts=input.split('/'),index=parts.lastIndexOf('node_modules');
  if(index<0)continue;
  paths.add(parts.slice(0,index+(parts[index+1].startsWith('@')?3:2)).join('/'));
 }
 const packages=await Promise.all([...paths].sort().map(async path=>{
  const p=JSON.parse(await readFile(resolve(backend,path,'package.json'),'utf8'));
  return {name:p.name,version:p.version,path};
 }));
 return {entry:`src/browser/${name}.ts`,packages};
}));
const copiedAssets=await Promise.all(['echarts','reveal.js','pathkit-wasm'].map(async name=>{const p=JSON.parse(await readFile(resolve(backend,'node_modules',name,'package.json'),'utf8'));return {name:p.name,version:p.version};}));
const review=JSON.parse(await readFile('docs/release/notice-review.json','utf8'));
const bundledNames=new Set([...results.flatMap(r=>r.packages.map(p=>p.name)),...copiedAssets.map(p=>p.name)]);
const bundledMissing=review.packages.filter((p:{name:string;completeTextFound:boolean})=>bundledNames.has(p.name)&&!p.completeTextFound).map((p:{name:string;version:string})=>({name:p.name,version:p.version}));
await writeFile('docs/release/runtime-dependencies.json',JSON.stringify({scope:'Current backend browser entry graphs and explicitly copied third-party runtime assets; no emitted runtime files modified',entries:results,copiedAssets,bundledMissing},null,2)+'\n');
console.log(JSON.stringify({bundledPackages:bundledNames.size,bundledMissing},null,2));
