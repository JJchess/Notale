import {localeStore,translateUi} from '../i18n/store';

/** Only call immediately after creating a product-owned static template.
 * Authored text and subsequently mounted content are deliberately not traversed. */
export function localizeStaticFilmUI(root:HTMLElement,signal?:AbortSignal){
 const text:{node:Text;source:string}[]=[],attrs:{node:Element;name:string;source:string}[]=[];
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode())if(node.textContent?.trim())text.push({node:node as Text,source:node.textContent});
 for(const node of [root,...root.querySelectorAll('*')])for(const name of ['title','aria-label','placeholder']){const source=node.getAttribute(name);if(source)attrs.push({node,name,source});}
 const render=()=>{for(const item of text)if(root.contains(item.node))item.node.data=translateUi(item.source);for(const item of attrs)if(root.contains(item.node)||item.node===root)item.node.setAttribute(item.name,translateUi(item.source));};
 render();const dispose=localeStore.subscribe(render);signal?.addEventListener('abort',dispose,{once:true});
 if(root instanceof HTMLDialogElement)root.addEventListener('close',dispose,{once:true});
 return dispose;
}
export const easingLabel=(value:string)=>translateUi(({linear:'线性',hold:'保持',ease:'平滑','ease-in':'缓入','ease-out':'缓出','ease-in-out':'缓入缓出',custom:'自定义贝塞尔'} as Record<string,string>)[value]??value);
