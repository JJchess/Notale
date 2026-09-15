// Camera is a pure function of the recorded interval, so seeking needs no history.
const F=x=>x*x*x-x-2; // Static reference curve, never used to solve the root.
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
const fmt=x=>Number.isFinite(x)?(Math.abs(x)>0&&Math.abs(x)<1e-4?x.toExponential(2):x.toFixed(7)):'—';
const text=(x,y,value,anchor='start',color='var(--code-muted)')=>
 '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-family="inherit" font-size="13" style="fill:'+color+'">'+value+'</text>';
function camera(s){
 const width=s.b-s.a;
 const span=s.initial[1]-s.initial[0];
 const level=Math.max(0,Math.floor(Math.log(span/width)/Math.log(4)+1e-8));
 const cell=span*4**-level;
 const origin=s.initial[0]+Math.floor((s.a-s.initial[0])/cell+1e-8)*cell;
 const left=origin-cell*.1,right=origin+cell*1.1;
 const ymin=Math.min(F(left),F(right),0),ymax=Math.max(F(left),F(right),0);
 const padding=(ymax-ymin)*.12;
 return {left,right,low:ymin-padding,high:ymax+padding,zoom:4**level};
}
function interpolate(a,b,t){
 return Object.fromEntries(Object.keys(a).map(k=>[k,mix(a[k],b[k],t)]));
}
function diagram(s,c,range){
 const x=v=>72+(v-c.left)/(c.right-c.left)*588;
 const y=v=>280-(v-c.low)/(c.high-c.low)*230;
 const decimals=Math.max(2,Math.min(10,Math.ceil(-Math.log10(c.right-c.left))+2));
 let curve='';
 for(let i=0;i<=120;i++){
  const v=mix(c.left,c.right,i/120);
  curve+=(i?'L':'M')+x(v).toFixed(3)+' '+y(F(v)).toFixed(3);
 }
 let g='<defs><clipPath id="plot-clip"><rect x="72" y="50" width="588" height="230"/></clipPath></defs>';
 g+=text(72,22,'y = x³ − x − 2');
 g+=text(660,22,'局部放大 ×'+Math.round(1.2*(s.initial[1]-s.initial[0])/(c.right-c.left)).toLocaleString('en-US'),'end','var(--code-accent)');
 g+='<g clip-path="url(#plot-clip)">';
 g+='<rect x="'+x(range.a)+'" y="50" width="'+Math.max(0,x(range.b)-x(range.a))+'" height="230" fill="var(--code-secondary)" opacity=".10"/>';
 g+='<path d="M72 '+y(0)+' H660" stroke="var(--code-line)"/>';
 g+='<path d="'+curve+'" stroke="var(--code-muted)" stroke-width="2" fill="none"/>';
 for(const v of [range.a,range.b])g+='<path d="M'+x(v)+' 50 V280" stroke="var(--code-secondary)" stroke-width="2"/>';
 g+='<path d="M'+x(s.m)+' '+y(0)+' V'+y(s.fm)+'" stroke="var(--code-accent)" stroke-dasharray="3 4"/>';
 g+='<circle cx="'+x(s.m)+'" cy="'+y(s.fm)+'" r="5" fill="var(--code-accent)"/>';
 g+='</g>';
 g+=text(62,y(0)+4,'0','end');
 g+=text(62,58,c.high.toExponential(1),'end');
 g+=text(62,280,c.low.toExponential(1),'end');
 for(let i=0;i<3;i++){
  const v=mix(c.left,c.right,i/2);
  g+=text(72+294*i,305,v.toFixed(decimals),i===0?'start':i===2?'end':'middle');
 }
 g+=text(72,344,'全局定位');
 g+=text(660,344,'色带：保留区间 · 圆点：本次取样','end');
 g+='<path d="M72 365 H660" stroke="var(--code-line)" stroke-width="3"/>';
 const globalX=v=>72+(v-s.initial[0])/(s.initial[1]-s.initial[0])*588;
 const lo=Math.max(s.initial[0],c.left),hi=Math.min(s.initial[1],c.right);
 g+='<rect x="'+globalX(lo)+'" y="359" width="'+Math.max(0,(globalX(hi)-globalX(lo)))+'" height="12" fill="var(--code-accent)" opacity=".25"/>';
 g+='<path d="M'+globalX((s.a+s.b)/2)+' 356 V374" stroke="var(--code-accent)" stroke-width="2"/>';
 g+=text(72,389,fmt(s.initial[0]),'start')+text(660,389,fmt(s.initial[1]),'end');
 g+=text(72,425,'a  '+fmt(s.a),'start','var(--code-ink)')+text(660,425,'b  '+fmt(s.b),'end','var(--code-ink)');
 g+=text(72,451,'区间宽度  '+fmt(s.b-s.a))+text(660,451,'f(m)  '+fmt(s.fm),'end','var(--code-accent)');
 return '<svg viewBox="0 0 720 470" role="img" aria-label="随区间收缩放大的二分法曲线，下方保留全局定位">'+g+'</svg>';
}
function mount(markup){patchSvg(document.getElementById("code-plot"),markup)}
window.renderNotaleView=packet=>{
 const s=packet.state;
 document.getElementById("code-title").textContent="二分法 · 目标区间宽度 < "+Number(s.tol).toExponential(0);
 if(!s||!Number.isFinite(s.a)||!Number.isFinite(s.b)||s.b<=s.a)return;
 const target=camera(s),previous=packet.previousState;
 const step=Math.round(Math.log2((s.initial[1]-s.initial[0])/(s.b-s.a)));
 document.getElementById('code-status').textContent=s.stage==='done'
  ?'完成 · 根 ≈ '+fmt(s.m)
  :'第 '+step+' 次收缩 · 保留异号的这一半';
 document.getElementById('code-caption').textContent='坐标刻度随镜头更新；曲线局部趋近直线，区间仍在不断缩小。';
 const draw=(c,range)=>mount(diagram(s,c,range));
 const validPrevious=previous&&Number.isFinite(previous.a)&&previous.b>previous.a;
 if(!window.NotaleMotion?.duration||!validPrevious){draw(target,s);return}
 const from=camera(previous),zooming=from.zoom!==target.zoom;
 // Shrink under the old camera first; then reframe, within the shared playback interval.
 const duration=Math.min(650,1500/(packet.playback.speed||1)*.65);
 window.NotaleMotion.tween(duration,t=>{
  const shrink=ease(Math.min(1,t/(zooming?.35:1)));
  const travel=zooming?ease(Math.max(0,(t-.35)/.65)):1;
  draw(interpolate(from,target,travel),{a:mix(previous.a,s.a,shrink),b:mix(previous.b,s.b,shrink)});
 });
};
