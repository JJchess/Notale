/** Native previews are virtualized: hidden pages do not keep their scripts alive. */
export function createPageThumbnails() {
  let width=1600, height=900;
  const visible=new Set<HTMLElement>();
  const mounted=new Map<HTMLElement,HTMLIFrameElement>();
  const urls=new Map<string,string>();
  let queued=false;
  function fit(host:HTMLElement, frame:HTMLIFrameElement) {
    frame.style.width=width+'px'; frame.style.height=height+'px';
    frame.style.transform=`scale(${host.clientWidth/width})`;
  }
  function refresh() {
    queued=false;
    const overview=document.body.classList.contains('overview-mode');
    const candidates=[...visible].filter(host=>host.isConnected&&host.getClientRects().length&&host.closest<HTMLElement>('.slide-card')?.hidden===false);
    candidates.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
    const wanted=new Set(candidates.slice(0,overview?8:6));
    for(const [host,frame] of mounted) if(!wanted.has(host)) { frame.remove();mounted.delete(host);host.classList.remove('thumbnail-ready'); }
    for(const host of wanted) {
      let frame=mounted.get(host);
      if(!frame) {
        const url=urls.get(host.dataset.thumbnail!);if(!url)continue;
        frame=document.createElement('iframe');frame.title='页面缩略图';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.inert=true;
        frame.setAttribute('sandbox','allow-scripts allow-same-origin');
        frame.setAttribute('allow',"autoplay 'none'; fullscreen 'none'");
        frame.addEventListener('load',()=>{if(mounted.get(host)===frame)host.classList.add('thumbnail-ready');});
        frame.src=url; mounted.set(host,frame);host.append(frame);
      }
      fit(host,frame);
    }
  }
  function schedule() { if(!queued) {queued=true;requestAnimationFrame(refresh);} }
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) { if(entry.isIntersecting)visible.add(entry.target as HTMLElement);else visible.delete(entry.target as HTMLElement); }
    schedule();
  });
  const resize=new ResizeObserver(schedule);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>{for(const frame of mounted.values())frame.remove();mounted.clear();});
  return {
    update(slides:{id:string;url:string}[], dimensions:{width:number;height:number}) {
      observer.disconnect();resize.disconnect();visible.clear();
      for(const frame of mounted.values())frame.remove();mounted.clear();urls.clear();
      width=dimensions.width;height=dimensions.height;
      for(const slide of slides)urls.set(slide.id,slide.url);
      for(const host of document.querySelectorAll<HTMLElement>('[data-thumbnail]')) {
        host.style.aspectRatio=`${width} / ${height}`;
        observer.observe(host);resize.observe(host);
      }
      schedule();
    },
  };
}
