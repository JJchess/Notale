import type {DeckDocument,Slide} from './model.js';
const scripts=(html:string)=>html.match(/<script\b[\s\S]*?<\/script\s*>/gi)??[];
/** Execution identity deliberately excludes save versions, tokens and editable appearance. */
export function runtimeIdentity(doc:DeckDocument,slide:Slide):string {
 const paths=new Set<string>(),entries:string[]=[];
 for(const match of slide.html.matchAll(/<(?:script|iframe)\b[^>]*?\b(?:src|data-src)\s*=\s*["']([^"']+)["']/gi)){
  entries.push(match[1]);
  try {const url=new URL(match[1],new URL(slide.sourcePath,'https://notale.invalid/'));if(url.origin==='https://notale.invalid')paths.add(decodeURIComponent(url.pathname.slice(1)));}catch{}
 }
 const selected=Object.entries(doc.assets).filter(([path])=>paths.has(path)||[...paths].some(entry=>(entry.endsWith('.html')||/\.[cm]?js$/.test(entry))&&(path.startsWith(entry.slice(0,entry.lastIndexOf('/')+1))||/(?:^|\/)code-runtime(?:-observer-v1)?\//.test(path))));
 const layout=doc.layouts.find(item=>item.id===slide.layoutId);
 return JSON.stringify([entries,scripts(slide.html),layout?.html,layout?.css,selected.map(([path,asset])=>[path,asset.hash])]);
}
export function authorIdentity(doc:DeckDocument,slide:Slide):string {
 return JSON.stringify([slide,doc.width,doc.height,doc.theme,doc.layouts.find(item=>item.id===slide.layoutId)]);
}
