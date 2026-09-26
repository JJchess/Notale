import type {DefaultTreeAdapterMap} from 'parse5';
export {parse} from 'parse5';
type Element=DefaultTreeAdapterMap['element'];
type Node=DefaultTreeAdapterMap['node'];
export const NODE_ID='data-notale-id';
export const attr=(el:Element,name:string)=>el.attrs.find(a=>a.name===name)?.value;
export function elements(node:Node):Element[]{
 const out:Element[]=[];
 function walk(n:Node){if('tagName' in n)out.push(n);if('childNodes' in n)for(const child of n.childNodes)walk(child);}
 walk(node);return out;
}
