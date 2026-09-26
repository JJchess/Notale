import {invariant} from './model.js';
import {elements,parse} from './html-tree.js';
/** Browser-safe validation shared by layouts and interaction insertion. */
export function assertStatic(html:string){
 invariant(!elements(parse(html)).some(e=>['script','base','iframe','canvas'].includes(e.tagName)||e.attrs.some(a=>/^on/i.test(a.name)||/^\s*javascript:/i.test(a.value))),
 'SCRIPTED_LAYOUT','Shared layout objects must be static HTML/SVG/media; page scripts remain on their original page');
}
