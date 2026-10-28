/** Injected into the opaque overlay frame. Sampled styles remain visible during
 * editing, but are suspended for the synchronous author DOM reconciliation. */
export function overlayAnimationRuntime(channel:string) {
 let previous=new Map<HTMLElement,Record<string,{value:string;priority:string}>>(),last:Record<string,Record<string,string>>={};
 let bases=new WeakMap<HTMLElement,CSSStyleDeclaration>();
 const rememberBase=(node:HTMLElement)=>{let base=bases.get(node);if(!base){base=document.createElement('div').style;base.cssText=node.getAttribute('style')??'';bases.set(node,base);}return base;};
 const rememberBases=()=>{for(const node of document.querySelectorAll<HTMLElement>('#stage [data-notale-id]'))rememberBase(node);};
 // Native gestures mutate inline styles before the host accepts their values.
 // Sampled properties must always restore the authored base, never that draft.
 rememberBases();
 const restore=()=>{for(const [node,properties] of previous)for(const [property,before]of Object.entries(properties)){if(before.value)node.style.setProperty(property,before.value,before.priority);else node.style.removeProperty(property);}previous.clear();};
 const paint=(styles:Record<string,Record<string,string>>)=>{
  restore();last=styles;
  for(const [id,properties] of Object.entries(styles)){
   const node=document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`);if(!node)continue;
   const base=rememberBase(node);
   previous.set(node,Object.fromEntries(Object.keys(properties).map(property=>[property,{value:base.getPropertyValue(property),priority:base.getPropertyPriority(property)}])));
   for(const [property,value] of Object.entries(properties))node.style.setProperty(property,value,'important');
  }
 };
 let regionFrame=0;
 const post=(type:string,data:Record<string,unknown>)=>parent.postMessage({source:'notale-film-animation',channel,type,...data},'*');
 let paintSequence=0,fontSequence=0,fontsReadySequence=0,paintRevision=0,collection=0,paintStylesSignature:string|undefined;
 let paintInspection=false,paintPlaying=false,paintFrame=0,paintTimer:ReturnType<typeof setTimeout>|undefined,paintDirty=false,lastInspection=-Infinity,pendingStamp='';
 // Visual bounds are separate from editor hit targets: pointer-events:none
 // content still paints, while transparent layout boxes and handles do not.
 const collectPaintRegions=(stage:HTMLElement)=>{
  const list:{id:string;x:number;y:number;width:number;height:number;opacity:number;uncertain:boolean}[]=[];
  let uncertain=false,visited=0;
  const transparent=(color:string)=>color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color)||/\/\s*0(?:\.0+)?\s*\)$/.test(color);
  const cache=new Map<Element,{opacity:number;uncertain:boolean;hidden:boolean}>();
  const visibility=(node:Element):{opacity:number;uncertain:boolean;hidden:boolean}=>{
   const known=cache.get(node);if(known)return known;
   const css=getComputedStyle(node),parent=node.parentElement?visibility(node.parentElement):{opacity:1,uncertain:false,hidden:false};
   const viewport=node===document.documentElement||node===document.body||node===stage;
   const value={opacity:parent.opacity*(Number(css.opacity)||0),hidden:parent.hidden||css.display==='none'||css.contentVisibility==='hidden',uncertain:parent.uncertain||css.clipPath!=='none'||css.maskImage!=='none'||css.filter!=='none'||css.mixBlendMode!=='normal'||css.borderRadius!=='0px'||(!viewport&&['hidden','clip','scroll','auto'].some(value=>css.overflowX===value||css.overflowY===value))};
   cache.set(node,value);return value;
  };
  const add=(node:Element,rect:{x:number;y:number;width:number;height:number},state:{opacity:number;uncertain:boolean},pad=0)=>{
   if(list.length>=2048){uncertain=true;return;}
   const x=Math.max(0,rect.x-pad),y=Math.max(0,rect.y-pad),right=Math.min(innerWidth,rect.x+rect.width+pad),bottom=Math.min(innerHeight,rect.y+rect.height+pad);
   if(right>x&&bottom>y){list.push({id:node.getAttribute('data-notale-id')??'',x,y,width:right-x,height:bottom-y,opacity:state.opacity,uncertain:state.uncertain});uncertain ||=state.uncertain;}
  };
  for(const node of stage.querySelectorAll<HTMLElement>('[data-notale-id]')){
   if(++visited>4096){uncertain=true;break;}
   if(node.closest('[data-notale-handles],.moveable-control,.moveable-line,.moveable-area'))continue;
   const css=getComputedStyle(node),state=visibility(node);
   if(state.hidden||state.opacity<=0||css.visibility!=='visible'||css.contentVisibility==='hidden')continue;
   const svg=node.namespaceURI==='http://www.w3.org/2000/svg';
   if(svg){
    if(!/^(path|rect|circle|ellipse|line|polyline|polygon|text|tspan)$/.test(node.localName))continue;
    const fill=node.localName!=='line'&&css.fill!=='none'&&!transparent(css.fill)&&Number(css.fillOpacity)>0;
    const stroke=css.stroke!=='none'&&!transparent(css.stroke)&&Number(css.strokeOpacity)>0?parseFloat(css.strokeWidth)||0:0;
    if(fill||stroke)add(node,node.getBoundingClientRect(),state,stroke/2);
    continue;
   }
   const background=css.backgroundImage!=='none',border=['top','right','bottom','left'].some(side=>parseFloat(css.getPropertyValue(`border-${side}-width`))>0&&!transparent(css.getPropertyValue(`border-${side}-color`))&&css.getPropertyValue(`border-${side}-style`)!=='none');
   if(background||!transparent(css.backgroundColor)||border||css.boxShadow!=='none')add(node,node.getBoundingClientRect(),{...state,uncertain:state.uncertain||background||css.boxShadow!=='none'});
   // Block widths include whitespace; use each actual text run instead.
   const textColor=css.getPropertyValue('-webkit-text-fill-color')||css.color;
   if(!transparent(textColor)||css.textShadow!=='none')for(const child of node.childNodes)if(child.nodeType===Node.TEXT_NODE&&child.textContent?.trim()){
    const range=document.createRange();range.selectNodeContents(child);
    for(const rect of range.getClientRects())add(node,rect,{...state,uncertain:state.uncertain||css.textShadow!=='none'});
   }
  }
  post('paint-regions',{sequence:paintSequence,fontSequence,revision:paintRevision,collection:++collection,ready:paintSequence>0&&fontsReadySequence===fontSequence&&document.fonts.status==='loaded',regions:list,uncertain});
 };
 const cancelPaintInspection=()=>{if(paintFrame)cancelAnimationFrame(paintFrame);if(paintTimer!==undefined)clearTimeout(paintTimer);paintFrame=0;paintTimer=undefined;paintDirty=false;};
 const schedulePaintRegions=()=>{
  if(!paintInspection)return;
  const stamp=`${paintSequence}:${fontSequence}:${paintRevision}`;
  if(!paintDirty||stamp!==pendingStamp){pendingStamp=stamp;post('paint-regions',{sequence:paintSequence,fontSequence,revision:paintRevision,collection:++collection,ready:false,regions:[],uncertain:true});}
  paintDirty=true;if(paintFrame||paintTimer!==undefined)return;
  const run=()=>{paintFrame=0;if(!paintInspection)return;paintDirty=false;lastInspection=performance.now();const stage=document.getElementById('stage');if(stage)collectPaintRegions(stage);};
  const delay=paintPlaying?Math.max(0,100-(performance.now()-lastInspection)):0;
  if(delay>0)paintTimer=setTimeout(()=>{paintTimer=undefined;if(paintInspection)paintFrame=requestAnimationFrame(run);},delay);
  else paintFrame=requestAnimationFrame(run);
 };
 let authorOrigin:{frame:number;[key:string]:unknown}={frame:0};
 const inputOrigin=(kind:string,origin=authorOrigin)=>post('input-origin',{kind,origin});
 // Installed before the native bridge, so these messages precede its geometry
 // commits and text sessions even if the host has already queued another frame.
 window.addEventListener('pointerdown',()=>inputOrigin('gesture'),{capture:true,passive:true});
 window.addEventListener('keydown',()=>inputOrigin('keyboard'),{capture:true,passive:true});
 window.addEventListener('dblclick',()=>inputOrigin('text'),{capture:true,passive:true});
 const regions=()=>{
  regionFrame=0;const stage=document.getElementById('stage');if(!stage)return;
  const list:{id:string;x:number;y:number;width:number;height:number}[]=[];
  const add=(node:Element,id:string)=>{const rect=node.getBoundingClientRect();if(rect.width>0&&rect.height>0)list.push({id,x:rect.x,y:rect.y,width:rect.width,height:rect.height});};
  for(const node of stage.querySelectorAll<HTMLElement>('[data-notale-id]')){
   const css=getComputedStyle(node);if(css.display==='none'||css.visibility==='hidden'||css.pointerEvents==='none')continue;
   // SVG children and transparent layout wrappers are hit through their native
   // selectable owner; a full-stage wrapper must not swallow another source.
   if(node.closest('svg')&&node.localName!=='svg')continue;
   const text=[...node.childNodes].some(child=>child.nodeType===Node.TEXT_NODE&&!!child.textContent?.trim());
   const drawn=node.localName==='svg'||text||/^(p|pre|code|h[1-6])$/.test(node.localName)||css.backgroundImage!=='none'||!['transparent','rgba(0, 0, 0, 0)'].includes(css.backgroundColor)||['Top','Right','Bottom','Left'].some(side=>parseFloat(css.getPropertyValue(`border-${side.toLowerCase()}-width`))>0);
   if(drawn)add(node,node.dataset.notaleId!);
  }
  for(const node of document.querySelectorAll('[data-notale-handles] .moveable-control,[data-notale-handles] .moveable-line,[data-notale-handles] .moveable-area'))if(getComputedStyle(node).display!=='none')add(node,'');
  post('hit-regions',{regions:list});
 };
 const scheduleRegions=()=>{if(!regionFrame)regionFrame=requestAnimationFrame(regions);schedulePaintRegions();};
 new MutationObserver(records=>{if(records.some(record=>record.type==='childList'))rememberBases();scheduleRegions();}).observe(document.documentElement,{subtree:true,attributes:true,childList:true,characterData:true,attributeFilter:['style','class','hidden']});
 window.addEventListener('resize',scheduleRegions);
 document.fonts.addEventListener('loading',scheduleRegions);
 document.fonts.addEventListener('loadingdone',scheduleRegions);
 document.fonts.addEventListener('loadingerror',scheduleRegions);
 let pointerFrame=0,pointer:{x:number;y:number}|undefined;
 window.addEventListener('pointermove',event=>{pointer={x:event.clientX,y:event.clientY};if(!pointerFrame)pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;if(pointer)post('pointer',pointer);});},{passive:true,capture:true});
 scheduleRegions();
 let observer:MutationObserver|undefined;
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.source!=='notale-host'||event.data.channel!==channel)return;
  const {type,data}=event.data;
  if(Number.isSafeInteger(data?.paintRevision))paintRevision=data.paintRevision;
  if(type==='film-paint-inspection'){
   cancelPaintInspection();paintInspection=data.enabled===true;paintPlaying=data.playing===true;
   if(paintInspection)schedulePaintRegions();
  }
  if(type==='film-fonts'){
   fontSequence=data.sequence;fontsReadySequence=-1;
   let sheet=document.getElementById('film-project-fonts');if(!sheet){sheet=document.createElement('style');sheet.id='film-project-fonts';document.head.append(sheet);}sheet.textContent=data.css;
   document.body.getBoundingClientRect();
   void Promise.all([...document.fonts].map(font=>font.load())).then(()=>document.fonts.ready).then(()=>{if(data.sequence===fontSequence)fontsReadySequence=data.sequence;post('fonts-ready',{sequence:data.sequence});scheduleRegions();},error=>post('fonts-ready',{sequence:data.sequence,error:'工程字体载入失败：'+String(error)}));
  }
  if(type==='text-start'||type==='text-object-format')inputOrigin('text',data.authorOrigin??authorOrigin);
  if(type==='object-box-size')inputOrigin('gesture');
  if(type==='author-update'){
   // This listener is installed before Notale's bridge. Remove presentation-only
   // values before its author reconciliation, then repaint in the same event
   // turn, before the browser can display an intermediate base frame.
   restore();queueMicrotask(()=>{bases=new WeakMap();rememberBases();paint(last);scheduleRegions();});
  }
  if(['select','mode','camera','text-end','geometry-draft'].includes(type))scheduleRegions();
  if(type==='film-geometry-watch'){
   observer?.disconnect();const target=document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(data.target)}"]`);
   if(target){const selector=`[data-notale-id="${CSS.escape(data.target)}"]`;observer=new MutationObserver(()=>{const current=document.querySelector(selector);if(current)parent.postMessage({source:'notale-film-animation',channel,type:'geometry-preview',html:current.outerHTML},'*');});observer.observe(document.getElementById('stage')!,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});}
  }
  if(type==='film-object-frame'){
   if(Number.isSafeInteger(data.origin?.frame))authorOrigin={...data.origin};
   paintSequence=data.sequence;
   const signature=JSON.stringify(data.styles),changed=data.forcePaint===true||signature!==paintStylesSignature;
   if(changed){paintStylesSignature=signature;paint(data.styles);}
   post('painted',{sequence:data.sequence});if(changed)scheduleRegions();
  }
  if(type==='film-object-read'){
   const styles=last;restore();const node=document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(data.target)}"]`);
   const value=node?getComputedStyle(node).getPropertyValue(data.property):'';paint(styles);
   parent.postMessage({source:'notale-film-animation',channel,type:'style',key:data.key,value,...(!node?{error:'对象已不存在'}:{})},'*');
  }
 });
}
