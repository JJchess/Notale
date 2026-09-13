import { TEMPLATE_CATALOG_BASE } from './template-catalog';
import {bindTemplateLibrary} from './state/template-library';
import type {Snapshot, Slide} from '@notale/editor/browser';

export type Entry={id:string;name:string;category:string;width:number;height:number;diagram:boolean;thumbnail:string};
type TemplateAsset={path:string;mime:string;hash:string};
type Payload={id:string;name:string;width:number;height:number;html:string;fontCss:string;assets:TemplateAsset[];diagram?:{html:string;width:number;height:number}};
type Context={ready:()=>Promise<unknown>;snapshot:()=>Snapshot;slide:()=>Slide;commands:(commands:unknown[],remember?:boolean,focusSlide?:string)=>Promise<unknown>;upload:(bytes:Uint8Array,mime:string)=>Promise<unknown>;selectInstance:(instance:string)=>void;error:(cause:unknown)=>void};
const base=TEMPLATE_CATALOG_BASE;
const payloads=new Map<string,Promise<Payload>>();
async function json<T>(url:string):Promise<T>{const response=await fetch(url);if(!response.ok)throw new Error('模板暂时无法加载，请重试');return response.json();}
function load(id:string,kind:'page'|'diagram'){const key=id+(kind==='diagram'?'-diagram':'');let task=payloads.get(key);if(!task){task=json<Payload>(base+key+'.json');payloads.set(key,task);task.catch(()=>payloads.delete(key));}return task;}

// Template HTML is document content; editor controls are owned by React.
export function createTemplateLibrary(ctx:Context){
  let active=true;
  function assertActive(){if(!active)throw new Error('编辑会话已关闭');}
  const binding=bindTemplateLibrary({
    catalog:()=>json<{templates:Entry[]}>(base+'manifest.json').then(data=>data.templates),
    preload:load,
    insert:(id,kind,progress)=>{report=progress;return insert(id,kind);},
    error:ctx.error,
  });
  let report:(message:string)=>void=()=>{};
  async function insert(id:string,kind:'page'|'diagram'){
    assertActive();await ctx.ready();assertActive();const original=ctx.snapshot(),target=ctx.slide();
    const data=await load(id,kind),variant=data;
    if(!variant)throw new Error('这个模板没有独立图示');
    const commands:unknown[]=[],paths=new Map<string,string>();
    report('正在准备资源…');
    // Fonts and images are content-addressed and shared by templates in this lecture.
    await Promise.all(data.assets.map(async asset=>{
      const name=asset.path.split('/').pop()!,path=`assets/templates/${asset.hash.slice(0,16)}-${name}`;paths.set(asset.path,path);
      if(original.document.assets[path]?.hash===asset.hash)return;
      const response=await fetch(base+asset.path);if(!response.ok)throw new Error('模板资源加载失败，请重试');
      const stored=await ctx.upload(new Uint8Array(await response.arrayBuffer()),asset.mime);
      commands.push({type:'asset.put',path,asset:stored});
    }));
    assertActive();
    if(ctx.snapshot().document.id!==original.document.id||ctx.slide().id!==target.id)throw new Error('已切换页面，请在当前页面重新插入模板');
    const pageId=crypto.randomUUID(),instance=crypto.randomUUID(),prefix='t'+instance.replaceAll('-','');
    const sourcePath=kind==='page'?pageId+'.html':target.sourcePath;
    const relative='../'.repeat(sourcePath.split('/').length-1);
    const rebase=(html:string)=>{for(const [from,to]of paths)html=html.split(from).join(relative+to);return html;};
    const doc=new DOMParser().parseFromString(rebase(variant.html),'text/html'),root=doc.body.firstElementChild as HTMLElement;
    const ids=new Map<string,string>();let i=0;
    for(const node of [root,...root.querySelectorAll('*')]){
      node.setAttribute('data-notale-id',`${prefix}-${++i}`);
      if(node.id){ids.set(node.id,`${prefix}-${node.id}`);node.id=ids.get(node.id)!;}
    }
    for(const node of [root,...root.querySelectorAll('*')])for(const attr of [...node.attributes]){
      if(attr.name==='id')continue;
      let value=attr.value;for(const [old,next]of ids){value=value.replaceAll(`url(#${old})`,`url(#${next})`).replaceAll(`url("#${old}")`,`url("#${next}")`).replaceAll(`url('#${old}')`,`url('#${next}')`);if(value===`#${old}`)value=`#${next}`;}
      if(value!==attr.value)node.setAttribute(attr.name,value);
    }
    root.dataset.templateInstance=instance;
    const {width,height}=original.document;
    const scale=kind==='diagram'?Math.min(width*.45/variant.width,height*.5/variant.height):Math.min(width/variant.width,height/variant.height);
    Object.assign(root.style,{position:'absolute',left:((width-variant.width*scale)/2)+'px',top:((height-variant.height*scale)/2)+'px',transform:`scale(${scale})`,transformOrigin:'0 0',margin:'0'});
    const fontCss=rebase(data.fontCss);
    const members=[...root.children].filter(n=>n instanceof HTMLElement||n.localName==='svg').map(n=>n.getAttribute('data-notale-id')!).filter(Boolean);
    const groups=kind==='diagram'&&members.length>1?[{id:crypto.randomUUID(),name:data.name,members}]:[];
    if(kind==='page'){
      commands.push({type:'slide.insert',after:target.id,slide:{id:pageId,name:data.name,sourcePath,html:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{margin:0;background:white}*{box-sizing:border-box}${fontCss}</style></head><body><main id="stage" style="position:absolute;width:${width}px;height:${height}px">${root.outerHTML}</main></body></html>`}});
    }else{
      const style=doc.createElement('style');style.textContent=fontCss;root.prepend(style);
      // Use the existing clipboard transaction to remap IDs, SVG references and group membership atomically.
      const source:Slide={...structuredClone(target),html:`<!doctype html><html><body>${root.outerHTML}</body></html>`,layoutId:null,layoutSourceId:undefined,layoutValues:undefined,layoutImages:undefined,theme:{},guides:[],stepMap:[],steps:undefined,nativeStepCount:0,groups,transforms:{},locked:[],animations:[],bindings:[],connectors:[],nativeCharts:{},components:[],canvasInstances:undefined,scenes:undefined,constraints:undefined};
      commands.push({type:'elements.transfer',slideId:target.id,sourceSlideId:target.id,sourceSnapshot:source,targets:[root.dataset.notaleId],mode:'copy',offset:{x:0,y:0}});
    }
    report('正在插入…');await ctx.commands(commands,true,kind==='page'?pageId:undefined);
    if(active&&kind==='diagram'&&ctx.snapshot().document.id===original.document.id&&ctx.slide().id===target.id)ctx.selectInstance(instance);
  }
  return {dispose(){active=false;binding.dispose();}};
}
