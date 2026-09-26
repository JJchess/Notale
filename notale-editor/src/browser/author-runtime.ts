import { rewriteSrcset } from '../domain/srcset.js';
import { reconcileAuthorDom } from './author-dom.js';
import type { Slide, Command } from '../domain/model.js';
export interface RuntimeAdapter<T> { update(value: T): void | Promise<void> }
type Context = {
  config: {width:number;height:number;slide:Slide;scenes?:any[];chartComponents?:any};
  charts: RuntimeAdapter<Slide['nativeCharts']>;
  components: RuntimeAdapter<NonNullable<Slide['components']>>;
  connectors: RuntimeAdapter<NonNullable<Slide['connectors']>>;
  media: {update:()=>void};canvas:{start:()=>void};
  protect:(el:Element)=>boolean;refresh:()=>void;metadata:()=>void;
  ack?:(requestId:string)=>void;reload:(reason:string)=>void;error:(e:unknown)=>void;
};
/** Applies author changes without taking ownership of interactive runtime state. */
export function createAuthorRuntime(context: Context) {
  const {config}=context,slide=config.slide;
  let assetBase=new URL('../'.repeat(slide.sourcePath.split('/').length-1)||'./',location.href).href;
  let compiled=document.documentElement.outerHTML,theme:Record<string,string>={},runtimeVersion=0,loading=Promise.resolve(),engine:Promise<void>|undefined;
  let latestAuthor:{after:string;transforms:Slide['transforms']}|undefined,latestState:any;
  const get=(id:string)=>document.querySelector<HTMLElement>('[data-notale-id="'+CSS.escape(id)+'"]');
  const changed=(a:unknown,b:unknown)=>JSON.stringify(a)!==JSON.stringify(b);
  function url(value:string){if(!value||/^(#|[a-z][\w+.-]*:|\/)/i.test(value))return value;return new URL(value,new URL(slide.sourcePath,assetBase)).href;}
  function resolve(value:string,attribute:string){
    if(['src','href','poster','xlink:href'].includes(attribute))return url(value);
    if(attribute==='srcset')return rewriteSrcset(value,url);
    if(attribute==='style')return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,quote,path)=>'url("'+url(path)+'")');
    return value;
  }
  function resources(data:any){
    if(!data.assetBase)return;assetBase=data.assetBase;
    const paths=new Set<string>(data.changedPaths??[]);
    if(!paths.size)return;
    for(const node of document.querySelectorAll<HTMLElement>('[src],[srcset],[poster],link[href],[style]')){
      for(const name of ['src','poster','href']){const raw=node.getAttribute(name);if(!raw||node.tagName==='SCRIPT')continue;
        try{const u=new URL(raw,location.href),path=decodeURIComponent(u.pathname.split('/').slice(5).join('/'));if(u.origin===location.origin&&paths.has(path))node.setAttribute(name,new URL(path,assetBase).href);}catch{}
      }
      const srcset=node.getAttribute('srcset');
      if(srcset){const next=rewriteSrcset(srcset,raw=>{try{const u=new URL(raw,location.href),path=decodeURIComponent(u.pathname.split('/').slice(5).join('/'));return u.origin===location.origin&&paths.has(path)?new URL(path,assetBase).href:raw;}catch{return raw;}});if(next!==srcset)node.setAttribute('srcset',next);}
      if(node.style)for(const key of node.style){const raw=node.style.getPropertyValue(key);if(!raw.includes('url('))continue;
        const next=raw.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(whole,quote,path)=>{try{const u=new URL(path,location.href),key=decodeURIComponent(u.pathname.split('/').slice(5).join('/'));return u.origin===location.origin&&paths.has(key)?'url("'+new URL(key,assetBase).href+'")':whole;}catch{return whole;}});
        if(next!==raw)node.style.setProperty(key,next,node.style.getPropertyPriority(key));
      }
    }
  }
  function applyTheme(next:Record<string,string>){
    const root=document.documentElement;
    for(const key of new Set([...Object.keys(theme),...Object.keys(next)]))if(theme[key]!==next[key]){if(next[key])root.style.setProperty(key,resolve(next[key],'style'));else root.style.removeProperty(key);}
    theme={...next};
  }
  async function charts(next:Slide['nativeCharts']){
    if(Object.values(next).some(chart=>!!chart.authoring)&&!window.__NOTALE_CHART_ENGINE__&&!window.echarts){
      engine??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.dataset.notaleRuntime='';script.src=new URL('__notale_runtime__/chart-engine.js',assetBase).href;script.onload=()=>resolve();script.onerror=()=>{engine=undefined;reject(Error('图表引擎暂未加载'));};document.head.append(script);});
      await engine;
    }
    await context.charts.update(next);
  }
  async function state(data:any){
    if(data.slide?.id!==slide.id)return;
    const next=data.slide as Slide,previous={...slide};
    // Adapter comparisons happen before assigning the shared runtime metadata.
    if(changed(previous.nativeCharts,next.nativeCharts))await charts(next.nativeCharts);
    if(changed(previous.components,next.components))await context.components.update(next.components??[]);
    if(changed(previous.connectors,next.connectors))await context.connectors.update(next.connectors??[]);
    Object.assign(slide,next);
    if(data.theme)applyTheme(data.theme);
    if(data.width!==undefined&&data.height!==undefined&&(config.width!==data.width||config.height!==data.height)){
      config.width=data.width;config.height=data.height;const stage=document.getElementById('stage');
      if(stage){stage.style.width=data.width+'px';stage.style.height=data.height+'px';}
      window.dispatchEvent(new Event('resize'));
    }
    context.media.update();context.canvas.start();
    for(const binding of next.bindings)if(changed(binding,previous.bindings.find(b=>b.id===binding.id))){const node=get(binding.target) as HTMLInputElement|null;if(node){if(node.type==='checkbox')node.checked=!!binding.value;else node.value=String(binding.value);node.dispatchEvent(new Event(binding.event,{bubbles:true}));}}
    for(const settings of next.scenes??[])if(changed(settings,previous.scenes?.find(s=>s.id===settings.id))){
      const scene=config.scenes?.find(s=>s.id===settings.id);
      for(const parameter of scene?.parameters??[]){if(!parameter.control||!Object.hasOwn(settings.values,parameter.key))continue;const node=get(parameter.control.target) as HTMLInputElement|null;if(node){if(node.type==='checkbox')node.checked=!!settings.values[parameter.key];else node.value=String(settings.values[parameter.key]);node.dispatchEvent(new Event(parameter.control.event,{bubbles:true}));}}
      if(settings.checkpoint)window.__NOTALE_CHECKPOINTS__?.[settings.id]?.restore(settings.checkpoint);
    }
    context.metadata();context.refresh();
  }
  function preview(commands:Command[]){
    let measure=false;
    for(const command of commands){
      if('slideId' in command&&command.slideId!==slide.id)continue;
      if(command.type==='element.patch'&&command.patch.style){const node=get(command.target);if(!node)continue;
        for(const [key,value] of Object.entries(command.patch.style)){
          if(value)node.style.setProperty(key,resolve(value.replace(/\s*!important\s*$/i,''),'style'),/!important\s*$/i.test(value)?'important':'');else node.style.removeProperty(key);
          if(!/^(color|background.*|fill|stroke(?:-width)?|opacity|box-shadow|filter|border.*color|--.*)$/.test(key))measure=true;
        }
      }else if(command.type==='slide.update'&&command.patch.theme)applyTheme({...theme,...command.patch.theme});
      else if(command.type==='deck.update'&&command.theme)applyTheme({...theme,...command.theme});
    }
    if(measure)context.refresh();
  }
  async function runtime(data:any){
    if(data.version<=runtimeVersion)return;
    const response=await fetch(data.url);if(!response.ok)throw Error('互动资源更新失败');
    const html=await response.text();if(data.version<=runtimeVersion)return;
    const doc=new DOMParser().parseFromString(html,'text/html'),raw=doc.getElementById('notale-author-config')?.textContent;
    if(!raw){context.reload('runtime-recovery');return;}
    const next=JSON.parse(raw);if(next.slide.id!==slide.id)return;
    const result=reconcileAuthorDom(document,compiled,html,{protect:context.protect,resolve});
    if(result.reload){context.reload(result.reload);return;}
    for(const source of doc.querySelectorAll('script[data-notale-factories]')){const script=document.createElement('script');script.dataset.notaleRuntime='';script.textContent=source.textContent;document.head.append(script);script.remove();}
    config.scenes=next.scenes;config.chartComponents=next.chartComponents;
    await state({slide:next.slide,width:next.width,height:next.height});
    if(latestAuthor)reconcileAuthorDom(document,next.slide.html,latestAuthor.after,{protect:context.protect,resolve,force:true});
    if(latestState)await state(latestState);
    compiled=html;runtimeVersion=data.version;
  }
  return {
    receive(type:string,data:any){
      if(type==='author-flush'){loading=loading.then(()=>context.ack?.(data.requestId)).catch(context.error);return true;}
      if(type==='author-preview'){preview(data.commands??[]);return true;}
      if(type==='author-resources'){resources(data);return true;}
      if(type==='author-state'){latestState=data;loading=loading.then(()=>state(data)).catch(context.error);return true;}
      if(type==='runtime-refresh'){loading=loading.then(()=>runtime(data)).catch(context.error);return true;}
      if(type==='author-update'){
        latestAuthor=data;
        const result=reconcileAuthorDom(document,data.before,data.after,{protect:context.protect,resolve});
        if(result.reload)context.reload(result.reload);
        else{Object.assign(slide.transforms,data.transforms);if(result.changed.length||result.structure){context.media.update();context.refresh();}}
        return true;
      }
      return false;
    },
  };
}
