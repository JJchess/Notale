// Runs in Chromium while preparing authored templates; no runtime/editor scripts are exported.
export async function refineDOM({code, width, height}:{code:string;width:number;height:number}) {
  const section = document.querySelector<HTMLElement>('.slide')!;
  document.querySelectorAll('script,.fidelity-vector-layer,.fidelity-photo-layer,#native-toolbar,#native-image-input,#native-toast').forEach(n=>n.remove());
  const css=[];
  for(const sheet of document.styleSheets) for(const rule of [...sheet.cssRules]) {
    if(rule.type===CSSRule.FONT_FACE_RULE){css.push(rule.cssText);continue;}
    if(rule.type!==CSSRule.STYLE_RULE) continue;
    const selector=(rule as CSSStyleRule).selectorText;
    if(/native-|fidelity|data-edit-mode|contenteditable|#viewport|#slide-shell|^html|^body|:root|\.slide::?(before|after)/.test(selector)) continue;
    if(rule.cssText.length>1800) continue; // Remove pixel-by-pixel screenshot compensation, not authored geometry.
    if(code==='E1-02' && /\[data-element-id="e102-(photo|fold|peel)"\]/.test(selector)) continue;
    css.push(rule.cssText);
  }
  document.querySelectorAll('style,link').forEach(n=>n.remove());
  const style=document.createElement('style');
  style.textContent=`*{box-sizing:border-box}html,body{margin:0;background:white}.slide{font-family:"Notale CJK",sans-serif;color:#1d2521} ${css.join('\n')}`;
  document.head.append(style);
  document.body.replaceChildren(section);
  await document.fonts.ready;
  section.className='slide';section.removeAttribute('style');
  Object.assign(section.style,{position:'relative',width:width+'px',height:height+'px',overflow:'hidden',isolation:'isolate'});
  section.querySelectorAll('[data-element-id$="-meta"],[data-element-id$="-credit"]').forEach(n=>n.remove());
  const byId=(id:string)=>section.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
  const svgNS='http://www.w3.org/2000/svg';
  const svg=(w:number,h:number,content:string)=>{const n=document.createElementNS(svgNS,'svg');n.setAttribute('viewBox',`0 0 ${w} ${h}`);n.setAttribute('width',String(w));n.setAttribute('height',String(h));n.innerHTML=content;Object.assign(n.style,{position:'absolute',inset:'0',width:'100%',height:'100%',overflow:'visible'});return n;};
  if(code==='P004') {
    // All tiers use the same apex and side slope. Gaps don't accumulate rounding errors.
    const center=139,apex=68,slope=87/138;
    const levels=[[68,109],[115,140],[147,172],[179,206]];
    const fills=['#6bdea7','#26aa6b','#1d7f50','#135535'];
    levels.forEach(([top,bottom],i)=>{
      const n=byId(`p004-tier-${i+1}`),half=(bottom-apex)*slope,topHalf=(top-apex)*slope,w=2*half,h=bottom-top;
      Object.assign(n.style,{left:(center-half)+'px',top:top+'px',width:w+'px',height:h+'px',clipPath:'none',background:'transparent',padding:'0'});
      const geometry=svg(w,h,`<polygon points="${half-topHalf},0 ${half+topHalf},0 ${w},${h} 0,${h}" fill="${fills[i]}"/>`);
      n.prepend(geometry);geometry.setAttribute('aria-label',i?'梯形':'三角形');
      const label=n.querySelector('span')!;
      // Use the narrowest horizontal intersection across the text line, not the outer box.
      const textTop=i?7:25,lineHeight=10,safeHalf=(top+textTop-apex)*slope-2;
      Object.assign(label.style,{position:'absolute',left:(half-safeHalf)+'px',top:textTop+'px',width:(2*safeHalf)+'px',height:lineHeight+'px',lineHeight:lineHeight+'px',fontFamily:'"Notale CJK",sans-serif',fontSize:'7.5px',transform:'none',textAlign:'center'});
      byId(`p004-shadow-${i+1}`)?.remove();
    });
  }
  if(code==='P015') {
    const title=byId('header-title');title.style.setProperty('font-family','"Notale Droid",sans-serif','important');title.style.setProperty('font-weight','700','important');
  }
  if(code==='P007') {
    const n=byId('p007-circle'); n.replaceChildren();
    Object.assign(n.style,{background:'transparent',borderRadius:'0'});
    n.append(svg(419,419,'<circle cx="209.5" cy="209.5" r="209.5" fill="#1d7f50"/><circle cx="209.5" cy="209.5" r="141" fill="#26aa6b"/><circle cx="209.5" cy="209.5" r="74" fill="#f2f2f2"/>'));
    for(const [en,zh,y,color] of [['What','做什么',2,'white'],['How','怎么做',72,'white'],['Why','为什么',171,'#111']] as const){
      const text=document.createElement('div');text.dataset.elementId='p007-'+en.toLowerCase();text.dataset.text='true';text.innerHTML=`<strong>${en}</strong><br><span>${zh}</span>`;
      Object.assign(text.style,{position:'absolute',left:'140px',top:y+'px',width:'139px',height:'63px',color,fontFamily:'"Notale Zen Hei",sans-serif',textAlign:'center',lineHeight:'1.35'});n.append(text);
    }
  }
  // Turn polygon/path clipping into scalable geometry. Text remains an independent editable layer.
  for(const n of [...section.querySelectorAll('div')]) {
    const s=getComputedStyle(n),clip=s.clipPath;
    if(!/^(polygon|path)\(/.test(clip))continue;
    const w=n.offsetWidth,h=n.offsetHeight;if(!w||!h)continue;
    const id='clip-'+code.toLowerCase()+'-'+(n.dataset.elementId??Math.random().toString(36).slice(2));
    let shape;
    if(clip.startsWith('polygon(')) {
      const points=clip.slice(8,-1).split(',').map(p=>p.trim().split(/\s+/).map((v,i)=>v.endsWith('%')?parseFloat(v)/100*(i?h:w):parseFloat(v)).join(','));
      shape=`<polygon points="${points.join(' ')}"/>`;
    } else shape=`<path d="${clip.slice(5,-1).replace(/^['"]|['"]$/g,'')}"/>`;
    if(n.querySelector('img')||s.backgroundImage!=='none') {
      const defs=svg(w,h,`<defs><clipPath id="${id}" clipPathUnits="objectBoundingBox">${shape.replace('/>',` transform="scale(${1/w} ${1/h})"/>`)}</clipPath></defs>`);
      defs.style.pointerEvents='none';n.append(defs);n.style.clipPath=`url(#${id})`;
    } else {
      const geometry=svg(w,h,shape.replace('/>',` fill="${s.backgroundColor}"/>`));n.style.clipPath='none';n.style.background='transparent';n.prepend(geometry);
      for(const child of n.children)if(child!==geometry){if(getComputedStyle(child).position==='static')(child as HTMLElement|SVGElement).style.position='relative';}
    }
  }
  // Preserve useful header and arrow pseudo-elements, but materialize them for the editor.
  for(const n of [...section.querySelectorAll<HTMLElement|SVGElement>('*')].filter(n=>n instanceof HTMLElement)) {
    for(const pseudo of ['::before','::after']) {
      const s=getComputedStyle(n,pseudo);if(['none','normal',''].includes(s.content)||s.display==='none')continue;
      const child=document.createElement('div');child.dataset.templateDecoration='';
      for(const prop of [...s])child.style.setProperty(prop,s.getPropertyValue(prop));
      child.style.removeProperty('content');child.textContent=s.content.replace(/^"|"$/g,'');
      if(pseudo==='::before')n.prepend(child);else n.append(child);
    }
  }
  const pseudoOff=document.createElement('style');pseudoOff.textContent='.slide *::before,.slide *::after{content:none!important}';document.head.append(pseudoOff);
  // Freeze native element styles, keeping the DOM text, images and SVG paths editable.
  // No global selectors or template-specific CSS can leak into an existing lecture.
  const properties=('display position left top right bottom width height min-width min-height max-width max-height box-sizing margin padding border border-radius background color opacity overflow overflow-x overflow-y isolation z-index font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-transform text-shadow white-space word-break overflow-wrap vertical-align flex flex-direction flex-wrap align-items align-self align-content justify-content justify-items justify-self gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row transform transform-origin translate rotate scale clip-path filter box-shadow object-fit object-position mask-image mask-size mask-position mask-repeat').split(' ');
  const nodes=[section,...section.querySelectorAll<HTMLElement|SVGElement>('*')];
  const computed=nodes.map(n=>{
    if(n.namespaceURI===svgNS&&n.localName!=='svg')return null;
    const s=getComputedStyle(n);return properties.map(p=>[p,(['width','height'].includes(p)&&n.style.getPropertyValue(p).endsWith('%'))?n.style.getPropertyValue(p):s.getPropertyValue(p)]);
  });
  nodes.forEach((n,i)=>{
    if(computed[i]){n.removeAttribute('style');for(const [p,v] of computed[i]!)if(v&&v!=='none'&&v!=='normal'&&!(v==='auto'&&/^(width|height|left|right|top|bottom)$/.test(p)))n.style.setProperty(p,v);}
    n.removeAttribute('contenteditable');n.removeAttribute('data-editable');n.removeAttribute('data-rotate');n.removeAttribute('data-asset');
    n.removeAttribute('draggable');n.removeAttribute('aria-hidden');
    if(n.tagName==='IMG') {n.style.pointerEvents='auto';n.setAttribute('alt','模板图片');}
  });
  // A source HTML sometimes inherits pre-line on a flex wrapper; actual text keeps its original line breaks.
  section.dataset.template=code;
  section.removeAttribute('id');
  return section.outerHTML;
}
