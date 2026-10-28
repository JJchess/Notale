import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const runtime='nodejs';
export async function GET(_request:Request,context:{params:Promise<{asset:string}>}) {
 const {asset}=await context.params;
 if(!['bridge.js','text-editor.js'].includes(asset))return new Response('Not found',{status:404});
 const root=join(process.cwd(),'node_modules/@notale/editor/dist');
 return new Response(await readFile(join(root,asset),'utf8'),{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=0, must-revalidate'}});
}
