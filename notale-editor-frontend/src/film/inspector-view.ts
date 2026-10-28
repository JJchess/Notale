/** Restore view state only. Never restore an input's stale draft into a new target. */
export function inspectorView(host:HTMLElement){
 const expanded=new Map<string,boolean>();let previous='';
 return {
  capture(target:string,kind:string){
   const same=target===previous,scroll=host.scrollTop,active=document.activeElement as HTMLInputElement|null;
   const label=active&&host.contains(active)?active.getAttribute('aria-label'):null;
   const start=active?.selectionStart,end=active?.selectionEnd;
   for(const node of host.querySelectorAll<HTMLDetailsElement>('details[data-section]'))expanded.set(node.dataset.preference??node.dataset.section!,node.open);
   previous=target;
   return ()=>{
    for(const node of host.querySelectorAll<HTMLDetailsElement>('details[data-section]')){
     const key=kind+':'+node.dataset.section;node.dataset.preference=key;
     if(expanded.has(key))node.open=expanded.get(key)!;
    }
    host.scrollTop=same?scroll:0;
    if(same&&label&&active&&!active.isConnected){
     const next=host.querySelector<HTMLInputElement>(`[aria-label="${CSS.escape(label)}"]:not(:disabled)`);
     if(next){next.focus({preventScroll:true});if(start!==null&&start!==undefined)try{next.setSelectionRange(start,end??start);}catch{}}
    }
   };
  },
 };
}
export function inspectorSection(title:string,key:string,open=false){
 const section=document.createElement('details');section.className='film-property-section';section.dataset.section=key;section.open=open;
 const summary=document.createElement('summary');summary.textContent=title;section.append(summary);return section;
}
