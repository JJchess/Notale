<sample id="solar-storage" category="chart" variant="mini">
  <file path="samples/chart/solar-storage/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>太阳落山后，电从哪里来？</title>
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main id="stage" data-state="overview">
<header><h1>太阳落山后，电从哪里来？</h1></header>
<section class="layout">
  <figure>
    <div class="figure-head"><strong>两座峰为什么没有相遇？</strong><span><i class="solar"></i>光伏　<i class="demand"></i>需求</span></div>
    <div id="plot">
      <div id="chart" role="img" aria-label="十三个时点的光伏和需求，共用零到一百吉瓦纵轴"></div>
      <svg id="overlay" aria-hidden="true">
        <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L9 5 0 10z"></path></marker></defs>
        <polygon id="surplus"></polygon><polygon id="gap"></polygon>
        <path id="transferBase" marker-end="url(#arrow)"></path><path id="transferFlow"></path>
      </svg>
      <div id="tag14" class="tag"><b>+24 GW</b><span>14:00 富余</span></div>
      <div id="tag20" class="tag"><b>−53 GW</b><span>20:00 缺口</span></div>
      <div id="transferTag">先充电，6 小时后释放</div>
      <div id="fallback" hidden><b>14:00　88 − 64 = 24 GW 富余</b><span>向后移动 6 小时</span><b>20:00　78 − 25 = 53 GW 缺口</b><p>储能转移已存入的能量，不制造能量。</p></div>
    </div>
    <figcaption>共用 0–100 GW 纵轴。教学示意数据未包含容量、效率和其他电源。</figcaption>
  </figure>
  <aside>
    <h2>储能解决时间错位，<br>不凭空增加供给。</h2>
    <p class="shift">光伏峰值 14:00　→　需求峰值 20:00<br><b>错开 6 小时</b></p>
    <p class="limit">53 GW 缺口大于单点 24 GW 富余；储能能削减，但不能独自补齐。</p>
    <div class="controls"><button id="replay">重演转移</button><button id="reset">复位</button></div>
  </aside>
</section>
</main>
<script src="assets/lib/echarts.min.js"></script><script src="assets/base.js"></script><script src="solar-storage.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/solar-storage/mini/pages/styles.css">
```css
:root{
--bg:#11130f;--text:#f4f0e3;--font-sans:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;--focus:#ffdb69
}
body{background:#090a08}
#stage{background:linear-gradient(#171914,#11130f 68%,#0b0c0a)}
header{position:absolute;left:70px;top:52px}
h1{font-size:51px;line-height:1.05;letter-spacing:-.045em}
.layout{
position:absolute;left:70px;right:70px;top:166px;height:628px;
display:grid;grid-template-columns:1fr 320px;gap:30px
}
figure{display:grid;grid-template-rows:58px 1fr 34px;border-block:1px solid #41473d;min-width:0}
.figure-head{display:flex;align-items:center;justify-content:space-between;color:#d6e2dd;font-size:16px}
.figure-head i{display:inline-block;width:26px;height:3px;margin:0 7px 4px 0}
.solar{background:#ffd35c}.demand{background:#edf5ef}
#plot{
position:relative;overflow:hidden;
background:linear-gradient(90deg,#0b1d3275,#102b302e 25%,#cd942f13 55%,#4c29342b 80%,#0b1d326b)
}
#chart,#overlay{position:absolute;inset:0;width:100%;height:100%}
#chart{z-index:2}#overlay{z-index:3;pointer-events:none;overflow:visible}
#surplus{fill:#8fc49b2e;stroke:#62d8ad80}#gap{fill:#ff826f2b;stroke:#ff826f73}
#transferBase,#transferFlow{fill:none;stroke-linecap:round}
#transferBase{stroke:#ffd35cb3;stroke-width:2.5}
#transferFlow{stroke:#ffd35c;stroke-width:4;stroke-dasharray:2 16;opacity:0}
#arrow path{fill:#ffd35c}
.tag{position:absolute;z-index:4;padding:5px 0}.tag b{display:block;font-size:22px}
.tag span{color:#d2ded9;font-size:13px}#tag14{color:#8fc49b}#tag20{color:#ff826f}
#transferTag{
position:absolute;z-index:4;padding:8px 12px;border:1px solid #ffd35c73;
background:#11130feb;color:#ffd35c;font-size:14px;opacity:0;transition:.4s ease
}
figcaption{padding:10px 0 0 62px;color:#adb0a5;font-size:12px}
aside{display:flex;flex-direction:column;padding-left:22px;border-left:1px solid #41473d}
h2{font-size:29px;line-height:1.2;letter-spacing:-.025em}
.shift{margin-top:32px;padding-block:22px;border-block:1px solid #8fc49b5c;font-size:16px;line-height:1.8}
.shift b{color:#ffd35c}.limit{margin-top:17px;color:#d0dbd6;font-size:14px;line-height:1.55}
.controls{margin-top:auto;display:flex;gap:10px;padding-top:13px;border-top:1px solid #41473d}
button{min-height:42px;border:1px solid #41473d;background:none;padding:0 14px;cursor:pointer;font-weight:650}
#replay{flex:1;border-color:#ffd35c7a;color:#ffd35c}
#fallback{
position:absolute;inset:70px;display:grid;place-content:center;
gap:16px;padding:32px;background:#181b16
}
#fallback b{font-size:22px}#fallback span{color:#ffd35c}#fallback p{color:#c8d5d0;font-size:17px}
.failed>:not(#fallback){display:none}
[data-state="transfer"] :is(#surplus,#gap){opacity:.35}
[data-state="transfer"] #transferFlow{opacity:1;animation:flow .7s linear infinite}
[data-state="transfer"] #transferTag{opacity:1;transform:translateY(-3px)}
[data-state="settled"] #transferFlow{opacity:.5;stroke-dasharray:none}
[data-state="settled"] #transferTag{opacity:1}
@keyframes flow{to{stroke-dashoffset:-36}}
@media(prefers-reduced-motion:reduce){#transferFlow{animation:none!important;stroke-dasharray:none}}
```
  </file>
  <file path="samples/chart/solar-storage/mini/pages/solar-storage.js">
```javascript
(function(){
"use strict";
var HOUR=1,DEMAND=2,SOLAR=3;
var records=[["h00",0,36,0],["h02",2,33,0],["h04",4,31,0],["h06",6,34,2],
  ["h08",8,43,22],["h10",10,55,52],["h12",12,62,76],["h14",14,64,88],
  ["h16",16,60,81],["h18",18,63,57],["h20",20,78,25],["h22",22,66,2],["h24",24,44,0]];
var byId=document.getElementById.bind(document),stage=byId("stage"),plot=byId("plot"),host=byId("chart");
var replayButton=byId("replay"),resetButton=byId("reset");
var motion=matchMedia("(prefers-reduced-motion: reduce)"),removers=[],timers=[];
var chart,observer,resizeFrame=0,disposed=false;
function line(id,name,field,color){
  return{id:id,name:name,type:"line",smooth:.2,symbol:"circle",symbolSize:7,encode:{x:"hour",y:field},
    lineStyle:{color:color,width:4},itemStyle:{color:color}};
}
function chartOption(){
  var solar=line("solar","光伏供给","solar","#ffd35c");
  solar.areaStyle={color:"#ffd35c1f"};
  var demand=line("demand","用电需求","demand","#edf5ef");demand.symbol="emptyCircle";
  return{animation:!motion.matches,dataset:{dimensions:["id","hour","demand","solar"],source:records},
    grid:{left:62,right:38,top:52,bottom:48},
    xAxis:{type:"value",min:0,max:24,interval:2,axisLine:{lineStyle:{color:"#575c51"}},
      axisLabel:{color:"#adb0a5",formatter:function(value){return(value<10?"0":"")+value}},splitLine:{show:false}},
    yAxis:{type:"value",min:0,max:100,interval:20,name:"功率（GW）",axisLabel:{color:"#adb0a5"},
      splitLine:{lineStyle:{color:"#dcdccd24"}}},
    series:[solar,demand]};
}
function crossing(first,second){
  var firstGap=first[SOLAR]-first[DEMAND],secondGap=second[SOLAR]-second[DEMAND];
  var ratio=firstGap/(firstGap-secondGap);
  return[first[HOUR]+(second[HOUR]-first[HOUR])*ratio,first[DEMAND]+(second[DEMAND]-first[DEMAND])*ratio];
}
function drawOverlay(){
  if(disposed)return;
  var width=plot.clientWidth,height=plot.clientHeight,left=62,right=38,top=52,bottom=48;
  var x=function(value){return left+value/24*(width-left-right)};
  var y=function(value){return top+(100-value)/100*(height-top-bottom)};
  var point=function(pair){return x(pair[0]).toFixed(1)+","+y(pair[1]).toFixed(1)};
  var sunrise=crossing(records[5],records[6]),dusk=crossing(records[8],records[9]);
  var midday=records.slice(6,9),evening=records.slice(9);
  var values=function(list,field){return list.map(function(record){return[record[HOUR],record[field]]})};
  var surplus=[sunrise].concat(values(midday,SOLAR),[dusk],values(midday.slice().reverse(),DEMAND));
  var gap=[dusk].concat(values(evening,DEMAND),values(evening.slice().reverse(),SOLAR));
  byId("overlay").setAttribute("viewBox","0 0 "+width+" "+height);
  byId("surplus").setAttribute("points",surplus.map(point).join(" "));
  byId("gap").setAttribute("points",gap.map(point).join(" "));
  var start=[x(14)+7,y(88)-7],end=[x(20)-8,y(78)-7];
  var route="M"+start.join(" ")+" C"+(start[0]+70)+" 18 "+(end[0]-70)+" 18 "+end.join(" ");
  byId("transferBase").setAttribute("d",route);byId("transferFlow").setAttribute("d",route);
  place("tag14",x(14)+18,(y(88)+y(64))/2-28);
  place("tag20",Math.min(x(20)+18,width-150),(y(78)+y(25))/2-28);
  place("transferTag",(x(14)+x(20))/2-92,8);
}
function place(id,left,top){
  var node=byId(id);node.style.left=left+"px";node.style.top=top+"px";
}
function scheduleResize(){
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(function(){
    resizeFrame=0;if(chart)chart.resize();drawOverlay();
  });
}
function setState(name){
  stage.dataset.state=name;
}
function clearPlayback(){
  timers.forEach(clearTimeout);timers.length=0;
}
function replay(){
  clearPlayback();
  if(motion.matches){setState("settled");return}
  setState("overview");
  timers.push(setTimeout(function(){setState("transfer")},350));
  timers.push(setTimeout(function(){setState("settled");clearPlayback()},1900));
}
function reset(){clearPlayback();setState("overview")}
function showFallback(){
  if(chart)chart.dispose();chart=null;
  plot.classList.add("failed");byId("fallback").hidden=false;
}
function listen(node,type,handler){
  node.addEventListener(type,handler);removers.push(function(){node.removeEventListener(type,handler)});
}
function dispose(){
  if(disposed)return;
  disposed=true;clearPlayback();cancelAnimationFrame(resizeFrame);
  if(observer)observer.disconnect();
  if(chart)chart.dispose();removers.splice(0).forEach(function(remove){remove()});
  window.__NOTALE_READY__=false;
}
listen(replayButton,"click",replay);listen(resetButton,"click",reset);
listen(motion,"change",function(event){if(event.matches){clearPlayback();setState("settled")}});
listen(window,"pagehide",dispose);
Deck.init({title:"太阳落山后，电从哪里来？",keys:false});
try{
  if(!window.echarts)throw Error("ECharts unavailable");
  chart=echarts.init(host,null,{renderer:"svg"});chart.setOption(chartOption(),{notMerge:true});
  if(window.ResizeObserver){observer=new ResizeObserver(scheduleResize);observer.observe(plot)}
  scheduleResize();
}catch(error){showFallback()}
if(motion.matches)setState("settled");
window.__NOTALE_READY__=true;
}());
```
  </file>
</sample>
