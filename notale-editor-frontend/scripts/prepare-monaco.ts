import {readFile,cp,mkdir,writeFile} from 'node:fs/promises';
const version=JSON.parse(await readFile('node_modules/monaco-editor/package.json','utf8')).version;
let installed='';try{installed=await readFile('public/monaco/version','utf8');}catch{}
if(installed!==version){await mkdir('public/monaco',{recursive:true});await cp('node_modules/monaco-editor/min/vs','public/monaco/vs',{recursive:true});for(const file of ['LICENSE','ThirdPartyNotices.txt'])await cp('node_modules/monaco-editor/'+file,'public/monaco/'+file);await writeFile('public/monaco/version',version);}
