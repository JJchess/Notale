<sample id="neuron-to-formula" category="general" variant="mini">
  <file path="samples/general/neuron-to-formula/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>一颗神经元，可以写成一行计算</title>
  <link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="styles.css">
</head>
<body>
<main id="stage">
  <header><h1>一颗神经元，可以写成一行计算</h1>
    <p id="formula">a=σ(Σxᵢwᵢ+b)</p>
  </header>
  <figure>
    <canvas id="visual"></canvas>
    <section id="fallback" hidden><h2>画布不可用</h2><p>a = σ(Σ xᵢwᵢ + b)</p><p>树突 → x₁…x₅　突触 → w₁…w₅　胞体 → Σ+b　小丘 → σ　轴突 → a</p></section>
  </figure>
  <section class="controller">
    <div><h2 id="stateName">生物结构</h2><p id="stateCopy">树突接收信号，胞体整合，轴突送出脉冲。</p></div>
    <div class="controls"><button id="previous">上一步</button><output id="progress">1 / 4</output><button id="next">下一步</button><button id="reset">复位</button></div>
  </section>
</main>
<script src="assets/base.js"></script><script src="visual.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/neuron-to-formula/mini/pages/styles.css">
```css
:root{
--bg:#dbe2dd;--text:#15231f;--muted:#60716b;--signal:#d84836;--parameter:#99631a;
--paper:#e7ece8;--font-sans:"PingFang SC","Microsoft YaHei",system-ui,sans-serif
}
header{position:absolute;inset:44px 70px auto;display:grid;grid-template-columns:780px 1fr;align-items:end;gap:60px}
h1{font-size:52px;line-height:1.08;letter-spacing:-.045em}
#formula{justify-self:end;font:48px/1 "Times New Roman",serif;white-space:nowrap}
figure{position:absolute;inset:154px 68px auto;height:552px;margin:0}#visual{width:100%;height:100%}
#fallback{height:100%;padding:105px 70px;border-block:1px solid #9eada7;background:#e7ece8c7}
.controller{position:absolute;inset:720px 68px auto;height:142px;border-top:1px solid #15231f3d;display:grid;grid-template-columns:620px 1fr;gap:50px;padding-top:22px}
#stateName{color:var(--signal);font-size:28px;line-height:1.1}#stateCopy{margin-top:8px;font-size:17px;line-height:1.5}
.controls{display:flex;justify-content:flex-end;gap:24px;padding-top:7px}button{min-width:82px;padding:8px 0;border:0;border-bottom:1px solid;background:none;cursor:pointer;font-size:14px}
button:disabled{opacity:.35}output{padding-top:9px;color:var(--muted);font-variant-numeric:tabular-nums}
```
  </file>
  <file path="samples/general/neuron-to-formula/mini/pages/visual.js">
```javascript
(function () {
"use strict";
const get=document.getElementById.bind(document);
const canvas=get("visual"),name=get("stateName"),copy=get("stateCopy"),progress=get("progress");
const previous=get("previous"),next=get("next"),resetButton=get("reset");
const reduced=matchMedia("(prefers-reduced-motion: reduce)"),context=canvas.getContext&&canvas.getContext("2d");
const SEED=20250815,CENTER=[586,274],INPUT_Y=[116,195,274,353,432],POSITIONS=[0,.38,.75,1];
const TITLES=["生物结构","加权输入","求和、偏置与激活","输出"];
const NOTES=["树突接收信号，胞体整合，轴突送出脉冲。","五条树突成为 x₁…x₅；五处突触成为 w₁…w₅。",
  "胞体计算 Σxᵢwᵢ + b，轴突小丘执行 σ。","同一条路径写成 a = σ(Σxᵢwᵢ + b)。"];
const scene={trunks:[],branches:[],terminals:[]},state={value:0,index:0,frame:0,disposed:false};
const events=new AbortController();
let autofit,colors;
if(!window.Deck||!context){
  canvas.hidden=true;get("fallback").hidden=false;
  [previous,next,resetButton].forEach(button=>button.disabled=true);window.__NOTALE_READY__=true;return;
}
const clamp=value=>Deck.clamp(value,0,1),lerp=Deck.lerp;
const ease=value=>{value=clamp(value);return value*value*(3-2*value)};
const mix=(start,end,amount)=>[lerp(start[0],end[0],amount),lerp(start[1],end[1],amount)];
function seededRandom(seed){return function(){
  let value=seed+=0x6D2B79F5;value=Math.imul(value^value>>>15,value|1);
  value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296;
}}
const random=seededRandom(SEED),range=(min,max)=>lerp(min,max,random());
function curve(start,end,bend){
  const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy)||1;
  return[start,[(start[0]+end[0])/2-dy/length*bend,(start[1]+end[1])/2+dx/length*bend],end];
}
function pointOn(path,amount){
  const back=1-amount;
  return[back*back*path[0][0]+2*back*amount*path[1][0]+amount*amount*path[2][0],
    back*back*path[0][1]+2*back*amount*path[1][1]+amount*amount*path[2][1]];
}
function blendPath(first,second,amount){return first.map((point,index)=>mix(point,second[index],amount))}
function buildGeometry(){
  const specs=[[4,204,83,-54,6],[3.46,124,170,-20,7],[3.14,90,266,28,6],
    [2.8,140,382,18,7],[2.3,214,464,48,6]];
  specs.forEach((spec,index)=>{
    const root=[CENTER[0]+Math.cos(spec[0])*59,CENTER[1]+Math.sin(spec[0])*59];
    const biology=curve(root,[spec[1],spec[2]],spec[3]);
    const delta=[132-CENTER[0],INPUT_Y[index]-CENTER[1]],length=Math.hypot(...delta);
    const mathStart=[CENTER[0]+delta[0]/length*44,CENTER[1]+delta[1]/length*44];
    const math=curve(mathStart,[132,INPUT_Y[index]],0);
    scene.trunks.push({id:"x"+(index+1),biology,math});
    for(let branch=0;branch<spec[4];branch++){
      const origin=pointOn(biology,.15+branch*.12),side=(branch+index)%2?1:-1;
      const end=[Math.max(28,origin[0]-range(42,112)),
        Math.max(22,Math.min(528,origin[1]+side*range(34,92)))];
      scene.branches.push(curve(origin,end,side*range(5,18)));
    }
  });
  scene.axonBiology=curve([649,270],[1186,232],32);scene.axonMath=curve([630,274],[1280,274],0);
  for(let index=0;index<5;index++){
    const angle=-.72+index*.36+range(-.08,.08),root=scene.axonBiology[2];
    const end=[root[0]+Math.cos(angle)*range(58,108),root[1]+Math.sin(angle)*range(58,108)];
    scene.terminals.push(curve(root,end,range(-14,14)));
  }
}
const rgba=(color,alpha)=>"rgba("+color.join(",")+","+alpha+")";
function drawPath(path,width,color,alpha){
  if(alpha<=0)return;context.beginPath();context.moveTo(...path[0]);
  context.quadraticCurveTo(...path[1],...path[2]);context.strokeStyle=rgba(color,alpha);
  context.lineWidth=width;context.lineCap="round";context.stroke();
}
function label(text,x,y,size,color,alpha){
  context.fillStyle=rgba(color,alpha);context.font=size+"px Times New Roman";context.textAlign="center";
  context.textBaseline="middle";context.fillText(text,x,y);
}
function diamond(point,alpha){
  context.save();context.translate(...point);context.rotate(Math.PI/4);
  context.fillStyle=rgba(colors.parameter,alpha);context.fillRect(-6,-6,12,12);context.restore();
}
function drawSoma(amount){
  context.beginPath();
  for(let index=0;index<26;index++){
    const angle=index/26*Math.PI*2;
    const biology=64*(1+.1*Math.sin(angle*3+.7)+.07*Math.sin(angle*5+2));
    const radius=lerp(biology,44,amount),point=[586+Math.cos(angle)*radius,274+Math.sin(angle)*radius];
    index?context.lineTo(...point):context.moveTo(...point);
  }
  context.closePath();context.fillStyle=rgba(colors.paper,.8);context.fill();
  context.strokeStyle=rgba(amount>.5?colors.signal:colors.bio,1);context.lineWidth=2.5;context.stroke();
}
function draw(){
  const input=ease(state.value/.38),math=ease((state.value-.34)/.41),output=ease((state.value-.72)/.28);
  context.clearRect(0,0,1464,552);
  scene.branches.forEach(branch=>drawPath(branch,1.5,colors.bio,.58*(1-input)));
  scene.trunks.forEach((trunk,index)=>{
    drawPath(blendPath(trunk.biology,trunk.math,input),lerp(5.4,2.4,input),
      input>.5?colors.signal:colors.bio,1);
    label("x"+"₁₂₃₄₅"[index],132,INPUT_Y[index],18,colors.signal,input);
    const weight=mix(pointOn(trunk.biology,9/13),pointOn(trunk.math,9/13),input);
    diamond(weight,.35+.65*input);
    label("w"+"₁₂₃₄₅"[index],weight[0],weight[1]-17,14,colors.parameter,input);
  });
  drawSoma(math);label("Σ",586,274,38,colors.ink,math);
  context.beginPath();context.moveTo(586,318);context.lineTo(586,345);
  context.strokeStyle=rgba(colors.parameter,math);context.lineWidth=1.5;context.stroke();
  diamond([586,345],math);label("b",603,345,18,colors.parameter,math);
  drawPath(blendPath(scene.axonBiology,scene.axonMath,lerp(math,output,.55)),
    lerp(5,2.5,output),output>.45?colors.signal:colors.bio,1);
  scene.terminals.forEach(terminal=>drawPath(terminal,1.4,colors.bio,.58*(1-output)));
  context.beginPath();context.arc(981,274,36,0,Math.PI*2);context.strokeStyle=rgba(colors.signal,math);
  context.lineWidth=2.4;context.stroke();label("σ",981,274,36,colors.ink,math);
  label("a",1314,274,20,colors.signal,output);
}
function updateInterface(){
  state.index=state.value<.19?0:state.value<.565?1:state.value<.875?2:3;
  name.textContent=TITLES[state.index];copy.textContent=NOTES[state.index];
  progress.textContent=(state.index+1)+" / 4";previous.disabled=state.index===0;next.disabled=state.index===3;
}
function render(value){state.value=clamp(value);draw();updateInterface()}
function stopAnimation(){cancelAnimationFrame(state.frame);state.frame=0}
function goTo(index,immediate){
  if(state.disposed)return;index=Math.max(0,Math.min(3,index));stopAnimation();
  const start=state.value,target=POSITIONS[index];
  if(immediate||reduced.matches)return render(target);
  const started=performance.now();
  function tick(now){
    const amount=clamp((now-started)/900);render(lerp(start,target,ease(amount)));
    if(amount<1)state.frame=requestAnimationFrame(tick);
  }
  state.frame=requestAnimationFrame(tick);
}
const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:events.signal});
function dispose(){
  if(state.disposed)return;state.disposed=true;stopAnimation();events.abort();
  if(autofit)autofit.stop();window.__NOTALE_READY__=false;
}
buildGeometry();
colors={ink:Deck.rgb("text"),bio:Deck.rgb("muted"),signal:Deck.rgb("signal"),
  parameter:Deck.rgb("parameter"),paper:Deck.rgb("paper")};
autofit=Deck.autofit(canvas,draw);listen(previous,"click",()=>goTo(state.index-1));
listen(next,"click",()=>goTo(state.index+1));listen(resetButton,"click",()=>goTo(0));
listen(window,"pagehide",dispose);
render(reduced.matches?1:0);
window.MiniNeuron={goTo,reset:()=>goTo(0),dispose,inspect:()=>({
  seed:SEED,value:state.value,index:state.index,animating:Boolean(state.frame),
  ids:scene.trunks.map((trunk,index)=>trunk.id+":w"+(index+1)),
  ends:scene.trunks.map(trunk=>trunk.biology[2])
})};
window.__NOTALE_READY__=true;
}());
```
  </file>
</sample>
