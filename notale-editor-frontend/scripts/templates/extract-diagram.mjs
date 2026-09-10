// Extract a reusable figure, not a presentation page with its heading removed.
// Runs in Chromium against the prepared editable page.
export function extractDiagram({code,theme}) {
  const source=document.querySelector('[data-template]'),component=source.cloneNode(true);
  const keep={P004:'.p004-tier',P007:'.golden-circle',P002:'.p002-five-w,.p002-one-h,.p002-en,.p002-arrow,.p002-zh,.p002-goal',P016:'.abc-shape,.abc-module'};
  if(code==='P015') {
    component.replaceChildren();
    const colors=theme.bands;
    const labels=[['观点','Point','P'],['理由','Reason','R'],['证据','Evidence','E'],['重申观点','Point','P']];
    const widths=[203,254,255,254];let x=0;
    labels.forEach(([zh,en,initial],i)=>{
      const body=widths[i],w=body+40,gradient=`prep-step-${i}`;
      const node=document.createElement('div');node.dataset.elementId=`p015-step-${i}`;
      Object.assign(node.style,{position:'absolute',left:x+'px',top:'0px',width:w+'px',height:'86px',color:'white',fontFamily:'"Notale CJK",sans-serif'});
      const points=i?`0,0 ${body},0 ${w},43 ${body},86 0,86 40,43`:`0,0 ${body},0 ${w},43 ${body},86 0,86`;
      node.innerHTML=`<svg viewBox="0 0 ${w} 86" width="${w}" height="86" style="position:absolute;inset:0;width:100%;height:100%"><defs><linearGradient id="${gradient}"><stop offset="0" stop-color="${colors[i]}"/><stop offset="1" stop-color="${colors[i]}"/></linearGradient></defs><polygon points="${points}" fill="url(#${gradient})" stroke="${theme.border}" stroke-width="2"/></svg><div data-element-id="p015-flow-label-${i}" style="position:absolute;left:${i?49:18}px;top:16px;width:126px;text-align:center;font-size:22px;font-weight:700;line-height:1.3">${zh}<span style="display:block;font-family:Arial,sans-serif;font-size:18px;font-weight:400">${en}</span></div><div data-element-id="p015-flow-initial-${i}" style="position:absolute;left:${body-48}px;top:16px;width:45px;text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:44px;line-height:1.2">${initial}</div>`;
      component.append(node);x+=body;
    });
  }else {
    for(const n of [...component.children])if(!n.matches(keep[code]))n.remove();
    if(code==='P002')for(const n of component.querySelectorAll('.p002-goal'))n.style.left='407px';
    if(code==='P007'){
      // Expose the three editable labels and circle geometry as a real group.
      const circle=component.firstElementChild;
      for(const n of [...circle.children])component.append(n);
      circle.remove();
    }
  }
  // Component styling is deliberately separate from the full-page reference.
  // Inline styles remain editable after insertion; no gallery-only colour filter.
  for(const n of [component,...component.querySelectorAll('*')]) {
    n.style.fontFamily=theme.font;
    n.style.color=theme.ink;
    n.style.textShadow='none';
    n.style.boxShadow='none';
    if(n.style.borderStyle && n.style.borderStyle!=='none')n.style.borderColor=theme.border;
  }
  const set=(selector,styles)=>component.querySelectorAll(selector).forEach(n=>Object.assign(n.style,styles));
  if(code==='P004')component.querySelectorAll('polygon').forEach((n,i)=>{
    n.setAttribute('fill',theme.bands[i]);n.setAttribute('stroke',theme.border);n.setAttribute('stroke-width','.5');
  });
  if(code==='P007')component.querySelectorAll('circle').forEach((n,i)=>{
    n.setAttribute('fill',[theme.soft,theme.bands[2],theme.paper][i]);
    n.setAttribute('stroke',theme.border);n.setAttribute('stroke-width','1.5');
  });
  if(code==='P002'){
    set('.p002-en,.p002-goal',{background:theme.soft,borderRadius:'6px'});
    set('.p002-five-w,.p002-one-h',{background:theme.accent,borderRadius:'6px'});
    set('.p002-five-w,.p002-one-h,.p002-five-w *,.p002-one-h *',{color:theme.paper});
    set('.p002-zh',{background:theme.paper,borderColor:theme.border});
    component.querySelectorAll('.p002-arrow polygon').forEach(n=>n.setAttribute('fill',theme.border));
  }
  if(code==='P015'){
    set('[data-element-id*="flow-initial"]',{color:theme.accent,fontWeight:'600'});
    set('[data-element-id*="flow-label"] span',{color:theme.muted});
  }
  if(code==='P016'){
    set('.abc-shape',{background:theme.soft,border:'1.5px solid '+theme.border});
    set('.big',{background:'none',color:theme.accent,opacity:'.12',fontWeight:'600',transform:'none'});
    set('.abc-copy h3,.abc-copy .en',{transform:'none'});
    set('.abc-copy .en',{color:theme.muted});
    set('[data-template-decoration]',{borderColor:theme.border});
  }
  document.body.append(component);
  const parts=[...component.children].filter(n=>getComputedStyle(n).display!=='none');
  // A standalone SVG inherits 100% from the former circle container; retain its viewBox dimensions.
  if(code==='P007'){
    const svg=component.querySelector('svg');svg.style.width='419px';svg.style.height='419px';
  }
  const box=component.getBoundingClientRect(),rects=parts.map(n=>n.getBoundingClientRect());
  const x=Math.min(...rects.map(r=>r.left-box.left)),y=Math.min(...rects.map(r=>r.top-box.top));
  const width=Math.max(...rects.map(r=>r.right-box.left))-x,height=Math.max(...rects.map(r=>r.bottom-box.top))-y;
  for(const n of parts){n.style.left=(parseFloat(n.style.left||'0')-x)+'px';n.style.top=(parseFloat(n.style.top||'0')-y)+'px';}
  Object.assign(component.style,{width:width+'px',height:height+'px',background:'transparent',overflow:'visible'});
  let seq=0;for(const n of [component,...component.querySelectorAll('*')])n.setAttribute('data-notale-id',`${code.toLowerCase()}-diagram-${++seq}`);
  const result={html:component.outerHTML,width,height};component.remove();return result;
}
