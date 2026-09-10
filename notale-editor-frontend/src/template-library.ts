import type {Snapshot, Slide} from '@notale/editor/browser';

type Entry={id:string;name:string;category:string;width:number;height:number;diagram:boolean;thumbnail:string};
type TemplateAsset={path:string;mime:string;hash:string};
type Payload={id:string;name:string;width:number;height:number;html:string;fontCss:string;assets:TemplateAsset[];diagram?:{html:string;width:number;height:number}};
type Context={ready:()=>Promise<unknown>;snapshot:()=>Snapshot;slide:()=>Slide;commands:(commands:unknown[],remember?:boolean,focusSlide?:string)=>Promise<unknown>;upload:(bytes:Uint8Array,mime:string)=>Promise<unknown>;selectInstance:(instance:string)=>void;error:(cause:unknown)=>void};
const base='/templates/refined/';
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const payloads=new Map<string,Promise<Payload>>();
async function json<T>(url:string):Promise<T>{const response=await fetch(url);if(!response.ok)throw new Error('模板暂时无法加载，请重试');return response.json();}
function load(id:string,kind:'page'|'diagram'){const key=id+(kind==='diagram'?'-diagram':'');let task=payloads.get(key);if(!task){task=json<Payload>(base+key+'.json');payloads.set(key,task);task.catch(()=>payloads.delete(key));}return task;}

// The same immutable payload produces thumbnails and editable authoring content.
export function createTemplateLibrary(ctx:Context){
  const host=document.getElementById('template-drawer')!;
  host.innerHTML='<input class="template-search" type="search" placeholder="搜索模板" aria-label="搜索模板"><div class="template-cards"></div><p class="template-status" role="status"></p>';
  const cards=host.querySelector<HTMLElement>('.template-cards')!,search=host.querySelector<HTMLInputElement>('input')!,status=host.querySelector<HTMLElement>('.template-status')!;
  const dialog=document.createElement('dialog');dialog.className='template-dialog';
  dialog.innerHTML='<div class="template-dialog-heading"><strong id="template-preview-title"></strong><button type="button" class="template-close" aria-label="关闭模板预览" title="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="template-preview"><img alt=""></div><div class="template-dialog-actions"><span role="status"></span><button type="button" data-template-use="diagram">插入当前页</button><button type="button" data-template-use="page" class="primary">添加为新页面</button></div>';
  dialog.setAttribute('aria-labelledby','template-preview-title');document.body.append(dialog);
  let entries:Entry[]|undefined,entry:Entry|undefined,busy=false,loading:Promise<void>|undefined;
  const insertSection=document.querySelector<HTMLDetailsElement>('[data-insert-category="diagrams"]')!;
  const insertGrid=insertSection.querySelector<HTMLElement>('.diagram-grid')!;
  const insertStatus=document.createElement('p');insertStatus.className='hint';insertStatus.setAttribute('role','status');insertStatus.hidden=true;insertGrid.after(insertStatus);
  function renderInsertDiagrams(){
    insertGrid.querySelectorAll('[data-diagram-template]').forEach(n=>n.remove());
    const buttons=(entries??[]).filter(e=>e.diagram).map(e=>{
      const button=document.createElement('button');button.type='button';button.dataset.diagramTemplate=e.id;
      button.setAttribute('aria-label','预览并插入 '+e.name);button.title=e.name;
      button.innerHTML=`<img class="diagram-preview" loading="lazy" src="${base+e.id}-diagram.png" alt="" style="object-fit:contain"><span class="insert-item-label">${escape(e.name)}</span>`;
      button.onclick=()=>openPreview(e.id,'diagram');return button;
    });
    insertGrid.prepend(...buttons);insertStatus.hidden=true;
  }
  insertSection.addEventListener('toggle',()=>{if(insertSection.open)void ensure();});
  if(insertSection.open)void ensure();

  function render(){
    const q=search.value.trim().toLowerCase(),list=(entries??[]).filter(e=>!q||(e.name+e.id).toLowerCase().includes(q));
    cards.innerHTML=list.map(e=>`<button type="button" class="template-card" data-template-id="${e.id}" aria-label="预览 ${escape(e.name)}"><img loading="lazy" src="${base+e.id}.png" alt=""><span>${escape(e.name)}</span></button>`).join('');
    status.textContent=entries&&!list.length?'没有匹配的模板':'';
  }
  async function ensure(){if(entries)return;if(loading)return loading;
    status.textContent='正在加载模板…';insertStatus.hidden=false;insertStatus.textContent='正在加载图示…';loading=json<{templates:Entry[]}>(base+'manifest.json').then(data=>{entries=data.templates;render();renderInsertDiagrams();}).catch(cause=>{status.textContent='模板加载失败，再次点击模板入口重试';insertStatus.textContent='图示加载失败，重新展开此分类可重试';ctx.error(cause);}).finally(()=>{loading=undefined;});return loading;
  }
  document.querySelector('[data-tool="templates"]')!.addEventListener('click',()=>void ensure());
  search.oninput=render;
  function openPreview(id:string,variant:'page'|'diagram'){
    if(busy)return;
    entry=entries?.find(e=>e.id===id);if(!entry)return;
    dialog.querySelector('strong')!.textContent=entry.name;
    const img=dialog.querySelector('img')!;img.src=base+entry.id+(variant==='diagram'?'-diagram':'')+'.png';img.alt=entry.name;
    const diagramButton=dialog.querySelector<HTMLElement>('[data-template-use="diagram"]')!;
    const pageButton=dialog.querySelector<HTMLElement>('[data-template-use="page"]')!;
    diagramButton.hidden=variant!=='diagram'||!entry.diagram;diagramButton.classList.toggle('primary',variant==='diagram');
    pageButton.hidden=variant!=='page';pageButton.classList.toggle('primary',variant==='page');
    dialog.querySelector('[role="status"]')!.textContent='';dialog.showModal();
    void load(id,variant).catch(()=>{});
  }
  cards.onclick=event=>{
    const id=(event.target as Element).closest<HTMLElement>('[data-template-id]')?.dataset.templateId;
    if(id)openPreview(id,'page');
  };
  dialog.querySelector<HTMLButtonElement>('.template-close')!.onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{event.stopPropagation();if(busy)event.preventDefault();});
  // Capture Escape here because editor keyboard shortcuts also listen on window.
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopImmediatePropagation();event.preventDefault();if(!busy)dialog.close();}},true);
  async function insert(id:string,kind:'page'|'diagram'){
    await ctx.ready();const original=ctx.snapshot(),target=ctx.slide();
    const data=await load(id,kind),variant=data;
    if(!variant)throw new Error('这个模板没有独立图示');
    const commands:unknown[]=[],paths=new Map<string,string>();
    const note=dialog.querySelector('[role="status"]')!;note.textContent='正在准备资源…';
    // Fonts and images are content-addressed and shared by templates in this lecture.
    await Promise.all(data.assets.map(async asset=>{
      const name=asset.path.split('/').pop()!,path=`assets/templates/${asset.hash.slice(0,16)}-${name}`;paths.set(asset.path,path);
      if(original.document.assets[path]?.hash===asset.hash)return;
      const response=await fetch(base+asset.path);if(!response.ok)throw new Error('模板资源加载失败，请重试');
      const stored=await ctx.upload(new Uint8Array(await response.arrayBuffer()),asset.mime);
      commands.push({type:'asset.put',path,asset:stored});
    }));
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
    note.textContent='正在插入…';await ctx.commands(commands,true,kind==='page'?pageId:undefined);
    if(kind==='diagram')ctx.selectInstance(instance);
  }
  for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-template-use]'))button.onclick=async()=>{
    if(!entry||busy)return;busy=true;dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
    try{await insert(entry.id,button.dataset.templateUse as 'page'|'diagram');dialog.close();}
    catch(cause){dialog.querySelector('[role="status"]')!.textContent=cause instanceof Error?cause.message:'插入失败，请重试';ctx.error(cause);}
    finally{busy=false;dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);}
  };
}
