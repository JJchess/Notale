import type {DeckDocument,Slide} from '@notale/editor/browser';
/** Visible thumbnails share incremental author updates; unrelated frames stay mounted. */
export function createPageThumbnails(){
  let changedPaths:string[]=[];
  let width=1600,height=900,documentId='',assetBase='',queued=false,latest:DeckDocument|undefined;
  const visible=new Set<HTMLElement>(),mounted=new Map<HTMLElement,HTMLIFrameElement>(),urls=new Map<string,string>();
  const sources=new Map<string,Slide>(),painted=new WeakMap<HTMLIFrameElement,Slide>();
  const scripts=(s:Slide)=>JSON.stringify(s.html.match(/<script\b[\s\S]*?<\/script>/gi)??[]);
  function post(frame:HTMLIFrameElement,type:string,data:unknown){const channel=new URL(frame.src).pathname.split('/')[2];frame.contentWindow?.postMessage({source:'notale-host',channel,type,data},new URL(frame.src).origin);}
  function paint(host:HTMLElement,frame:HTMLIFrameElement){
    const id=host.dataset.thumbnail!,next=latest?.slides.find(s=>s.id===id),before=painted.get(frame)??sources.get(id);if(!before||!next||before===next)return;
    if(scripts(before)!==scripts(next))return;
    post(frame,'author-resources',{assetBase,changedPaths});
    post(frame,'author-update',{before:before.html,after:next.html,transforms:next.transforms});
    post(frame,'author-state',{slide:{...next,html:''},theme:{...latest!.theme,...latest!.layouts.find(l=>l.id===next.layoutId)?.theme,...next.theme},width,height});
    painted.set(frame,next);
  }
  function refresh(){
    queued=false;const overview=document.body.classList.contains('overview-mode');
    const candidates=[...visible].filter(h=>h.isConnected&&h.getClientRects().length&&h.closest<HTMLElement>('.slide-card')?.hidden===false).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
    const wanted=new Set(candidates.slice(0,overview?8:6));
    for(const [host,frame] of mounted)if(!wanted.has(host)){frame.remove();mounted.delete(host);host.classList.remove('thumbnail-ready');}
    for(const host of wanted){let frame=mounted.get(host);
      if(!frame){const url=urls.get(host.dataset.thumbnail!);if(!url)continue;
        frame=document.createElement('iframe');frame.title='页面缩略图';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.inert=true;
        frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.setAttribute('allow',"autoplay 'none'; fullscreen 'none'");
        const created=frame;frame.addEventListener('load',()=>{if(mounted.get(host)!==created)return;host.classList.add('thumbnail-ready');post(created,'mode',{mode:'edit'});paint(host,created);});
        frame.src=url;mounted.set(host,frame);host.append(frame);
      }
      frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform='scale('+host.clientWidth/width+')';
    }
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(refresh);}}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target as HTMLElement);else visible.delete(entry.target as HTMLElement);}schedule();});
  const resize=new ResizeObserver(schedule);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>{for(const frame of mounted.values())frame.remove();mounted.clear();});
  return {
    update(slides:{id:string;url:string}[],doc:DeckDocument){
      if(documentId!==doc.id){for(const frame of mounted.values())frame.remove();mounted.clear();urls.clear();sources.clear();documentId=doc.id;}
      latest=doc;width=doc.width;height=doc.height;
      for(const item of slides){const next=doc.slides.find(s=>s.id===item.id);if(!next)continue;
        const previous=sources.get(item.id);
        if(!previous||scripts(previous)!==scripts(next)){
          urls.set(item.id,item.url);sources.set(item.id,next);
          for(const [host,frame] of mounted)if(host.dataset.thumbnail===item.id){frame.remove();mounted.delete(host);}
        }
      }
      observer.disconnect();resize.disconnect();visible.clear();
      for(const host of document.querySelectorAll<HTMLElement>('[data-thumbnail]')){host.style.aspectRatio=width+'/'+height;observer.observe(host);resize.observe(host);}
      for(const [host,frame] of mounted)paint(host,frame);schedule();
    },
    patch(doc:DeckDocument,base='',paths:string[]=[]){changedPaths=paths;latest=doc;width=doc.width;height=doc.height;if(base)assetBase=base;for(const [host,frame] of mounted)paint(host,frame);},
  };
}
