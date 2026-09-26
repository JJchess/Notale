import type { CanvasPreview } from './resources';
import { observeThumbnailHosts, type ThumbnailHost } from './thumbnail-hosts';
import type { DeckDocument } from '@notale/editor/browser';

/** Thumbnail hosts contain images only; author runtimes never run in the sidebar. */
export function createPageThumbnails() {
  let refreshTimer:ReturnType<typeof setTimeout>;
  let started=false;
  let disposed=false, latest:DeckDocument|undefined, version:number|undefined;
  const hosts=new Map<HTMLElement,ThumbnailHost>();
  const visible=new Set<HTMLElement>();
  const tasks=new Map<HTMLElement,{key:string;abort:AbortController;url?:string;image:HTMLImageElement}>();
  function remove(host:HTMLElement){const task=tasks.get(host);if(!task)return;task.abort.abort();if(task.url)URL.revokeObjectURL(task.url);task.image.remove();tasks.delete(host);host.classList.remove('thumbnail-ready');}
  async function paint(host:HTMLElement){
    const registration=hosts.get(host),doc=latest;
    if(disposed||!started||!visible.has(host)||!doc||!version||registration?.documentId!==doc.id)return;
    const slide=doc.slides.find(s=>s.id===registration.pageId);if(!slide)return;
    const key=JSON.stringify([slide,doc.width,doc.height,doc.theme,doc.layouts,doc.assets]);
    const before=tasks.get(host);if(before?.key===key)return;
    before?.abort.abort();
    const image=before?.image??document.createElement('img');
    image.alt='';image.draggable=false;image.style.cssText='display:block;width:100%;height:100%;object-fit:contain;pointer-events:none';
    if(!before)host.append(image);
    const task={key,abort:new AbortController(),url:before?.url,image};tasks.set(host,task);
    const url=`/api/documents/${encodeURIComponent(doc.id)}/slides/${encodeURIComponent(slide.id)}/poster?version=${version}`;
    try{
      for(let attempt=0;attempt<30;attempt++){
        const response=await fetch(url,{signal:task.abort.signal});
        if(response.status===202){await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{task.abort.signal.removeEventListener('abort',abort);resolve();},Math.min(1000+attempt*250,3000));task.abort.signal.addEventListener('abort',abort,{once:true});});continue;}
        if(!response.ok)return;
        const blob=await response.blob();if(tasks.get(host)!==task||task.abort.signal.aborted)return;
        const next=URL.createObjectURL(blob);image.src=next;if(task.url)URL.revokeObjectURL(task.url);task.url=next;host.classList.add('thumbnail-ready');return;
      }
    }catch(error){if(!task.abort.signal.aborted)console.debug('Thumbnail unavailable',error);}
  }
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const host=entry.target as HTMLElement;if(entry.isIntersecting){visible.add(host);void paint(host);}else{visible.delete(host);remove(host);}}},{rootMargin:'200px'});
  const stop=observeThumbnailHosts((registration,attached)=>{const host=registration.element;if(attached){hosts.set(host,registration);observer.observe(host);}else if(hosts.get(host)===registration){observer.unobserve(host);visible.delete(host);remove(host);hosts.delete(host);}});
  return {
    start(){if(disposed)return;started=true;for(const host of visible)void paint(host);},
    update(_slides:{id:string;url:string}[],doc:DeckDocument,preview?:CanvasPreview){if(disposed)return;if(latest?.id!==doc.id){for(const host of tasks.keys())remove(host);version=undefined;}latest=doc;if(preview)version=preview.version;for(const host of hosts.keys())host.style.aspectRatio=`${doc.width}/${doc.height}`;for(const host of visible)void paint(host);},
    // Request a persisted poster only after update receives the corresponding save version.
    patch(doc:DeckDocument,_base='',_paths:string[]=[],savedVersion?:number){if(disposed||savedVersion===undefined)return;latest=doc;version=savedVersion;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const host of visible)void paint(host);},300);},
    dispose(){if(disposed)return;disposed=true;clearTimeout(refreshTimer);stop();observer.disconnect();for(const host of tasks.keys())remove(host);hosts.clear();visible.clear();},
  };
}
