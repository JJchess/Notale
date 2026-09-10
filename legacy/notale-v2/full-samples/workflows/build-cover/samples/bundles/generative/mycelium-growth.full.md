<sample id="mycelium-growth" category="generative" variant="full">
  <file path="samples/generative/mycelium-growth/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>菌丝｜地下的生长网络</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
:root{
  --stage-w:1600px;
  --stage-h:900px;
  --bg:#11140f;
  --surface:#1b2018;
  --text:#f0eadc;
  --text-soft:#beb6a6;
  --muted:#837d70;
  --line:#45483c;
  --mycelium:#c8c5b0;
  --mycelium-hot:#eee2c3;
  --nutrient:#bd8437;
  --spore:#7b9276;
  --signal:#d2ad56;
  --focus:#d2ad56;
  --font-sans:"Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;
  --font-display:"Noto Serif CJK SC","Songti SC","STSong","Times New Roman",serif;
}

html,body{ width:100%; height:100%; }

#stage{
  isolation:isolate;
  background:var(--bg);
  color:var(--text);
  overflow:hidden;
}

.field{
  position:absolute;
  inset:0;
  z-index:1;
  overflow:hidden;
}

.field canvas{ pointer-events:none; }
#ambient-canvas{ z-index:2; }

.cover-copy{
  position:absolute;
  left:92px;
  top:185px;
  z-index:7;
  width:570px;
}

h1{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  font-weight:500;
}

.title-cn{
  font-family:var(--font-display);
  font-size:194px;
  line-height:.86;
  letter-spacing:-.08em;
}

.subtitle{
  position:relative;
  margin-top:50px;
  padding-top:25px;
  padding-left:7px;
  color:var(--text-soft);
  font-size:29px;
  font-weight:400;
  letter-spacing:.14em;
  line-height:1.35;
}

.subtitle::before{
  content:"";
  position:absolute;
  top:0;
  left:7px;
  width:54px;
  height:1px;
  background:var(--nutrient);
}

  </style>
</head>
<body>
  <main id="stage" aria-labelledby="cover-title">
    <figure class="field" role="img" aria-label="固定孢子点生出的菌丝网络向营养源探索。分支由能量阈值触发，营养被占用后，后续尖端转向尚未耗竭的资源，最终形成连接且稠密的地下网络。">
      <canvas id="growth-canvas" class="cv-fill" aria-hidden="true"></canvas>
      <canvas id="ambient-canvas" class="cv-fill" aria-hidden="true"></canvas>
    </figure>

    <header class="cover-copy">
      <h1 id="cover-title">
        <span class="title-cn">菌丝</span>
      </h1>
      <p class="subtitle">地下的生长网络</p>
    </header>
    <span id="live-status" class="sr-only" aria-live="polite"></span>
  </main>

  <script src="assets/base.js"></script>
  <script>
(function(){
  'use strict';

  var freeze=Object.freeze;
  var CONFIG=freeze({
    seed:4217,
    steps:940,
    stepSize:6.2,
    maxTips:164,
    maxSegments:11000,
    branchEnergy:31,
    branchCooldown:18,
    energyCost:.205,
    harvestRate:1.72,
    harvestGain:1.28,
    titleZone:freeze({x:64,y:104,w:624,h:478}),
    representativeTime:4800
  });

  var SPORES=freeze([
    freeze({x:205,y:748,angle:-.13,energy:34}),
    freeze({x:493,y:790,angle:-.58,energy:35}),
    freeze({x:852,y:817,angle:-1.23,energy:36}),
    freeze({x:1425,y:730,angle:-2.32,energy:34})
  ]);

  var NUTRIENTS=freeze([
    freeze({x:706,y:661,r:31,amount:122}),
    freeze({x:760,y:406,r:26,amount:118}),
    freeze({x:918,y:536,r:36,amount:168}),
    freeze({x:1032,y:236,r:28,amount:126}),
    freeze({x:1196,y:378,r:39,amount:184}),
    freeze({x:1375,y:217,r:27,amount:116}),
    freeze({x:1444,y:472,r:33,amount:150}),
    freeze({x:1216,y:674,r:35,amount:172})
  ]);
  var STILL=CONFIG.representativeTime;
  var TAU=Math.PI*2;

  var growthCanvas=document.getElementById('growth-canvas');
  var ambientCanvas=document.getElementById('ambient-canvas');
  var liveStatus=document.getElementById('live-status');
  var stage=document.getElementById('stage');
  var model=null;
  var staticFit=null;
  var ambientFit=null;
  var ambientCtx=null;
  var motionStop=null;
  var lastMotionTime=STILL;
  var media=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;

  function rngFrom(seed){
    var state=(seed>>>0)||1;
    return function(){
      state+=0x6D2B79F5;
      var t=state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function gridKey(x,y){ return (Math.floor(x/24))+','+(Math.floor(y/24)); }

  function addNode(grid,node){
    var key=gridKey(node.x,node.y);
    var bucket=grid.get(key);
    if(!bucket){ bucket=[]; grid.set(key,bucket); }
    bucket.push(node);
  }

  function nearbyNodes(grid,x,y){
    var out=[];
    var gx=Math.floor(x/24),gy=Math.floor(y/24);
    for(var ox=-1;ox<=1;ox++){
      for(var oy=-1;oy<=1;oy++){
        var bucket=grid.get((gx+ox)+','+(gy+oy));
        if(bucket) for(var i=0;i<bucket.length;i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  function angleBlend(current,target,amount){
    var delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
    return current+delta*amount;
  }

  function insideTitle(x,y,pad){
    var z=CONFIG.titleZone;
    return x>z.x-pad&&x<z.x+z.w+pad&&y>z.y-pad&&y<z.y+z.h+pad;
  }

  function fnvSignature(segments,nutrients){
    var hash=2166136261;
    function mix(value){
      hash^=(Math.round(value*10)&0xffff);
      hash=Math.imul(hash,16777619)>>>0;
    }
    for(var i=0;i<segments.length;i+=17){
      mix(segments[i].x2);mix(segments[i].y2);mix(segments[i].tipId);
    }
    for(var j=0;j<nutrients.length;j++) mix(nutrients[j].amount);
    return ('00000000'+hash.toString(16)).slice(-8);
  }

  function buildModel(){
    var random=rngFrom(CONFIG.seed);
    var nutrients=NUTRIENTS.map(function(n,i){
      return {id:i,x:n.x,y:n.y,r:n.r,amount:n.amount,initial:n.amount,harvested:0,visits:0};
    });
    var grid=new Map();
    var segments=[];
    var junctions=[];
    var tips=[];
    var paths=new Map();
    var nextId=0;

    SPORES.forEach(function(s,sporeIndex){
      var tip={id:nextId++,spore:sporeIndex,x:s.x,y:s.y,angle:s.angle,energy:s.energy,age:0,depth:0,cooldown:0,alive:true};
      tips.push(tip);
      paths.set(tip.id,[]);
      addNode(grid,{x:s.x,y:s.y,tipId:tip.id,spore:sporeIndex,step:0});
    });

    for(var step=0;step<CONFIG.steps&&tips.length&&segments.length<CONFIG.maxSegments;step++){
      var nextTips=[];
      var born=[];

      for(var ti=0;ti<tips.length;ti++){
        var tip=tips[ti];
        if(!tip.alive||tip.energy<4.5) continue;

        var ax=0,ay=0,totalPull=0;
        for(var ni=0;ni<nutrients.length;ni++){
          var n=nutrients[ni];
          if(n.amount<=.5) continue;
          var dx=n.x-tip.x,dy=n.y-tip.y;
          var d2=dx*dx+dy*dy;
          var d=Math.sqrt(d2)||1;
          var pull=(.12+.88*(n.amount/n.initial))*n.initial/(d2+3900);
          ax+=dx/d*pull;ay+=dy/d*pull;totalPull+=pull;
        }

        if(totalPull>0){ ax/=totalPull;ay/=totalPull; }
        else { ax=Math.cos(tip.angle);ay=Math.sin(tip.angle); }

        var close=nearbyNodes(grid,tip.x,tip.y);
        var rx=0,ry=0,closestOther=null,closestOtherDist=Infinity;
        for(var ci=0;ci<close.length;ci++){
          var node=close[ci];
          var ox=tip.x-node.x,oy=tip.y-node.y;
          var od=Math.sqrt(ox*ox+oy*oy)||.001;
          if(node.tipId!==tip.id&&od<closestOtherDist&&step-node.step>14){
            closestOtherDist=od;closestOther=node;
          }
          if(od<21&&step-node.step>4){
            var repel=(21-od)/21;
            rx+=ox/od*repel;ry+=oy/od*repel;
          }
        }

        var target=Math.atan2(ay+ry*.34,ax+rx*.34);
        tip.angle=angleBlend(tip.angle,target,.22);
        tip.angle+=(random()-.5)*(.32+Math.min(.16,tip.depth*.025));

        var nx=tip.x+Math.cos(tip.angle)*CONFIG.stepSize;
        var ny=tip.y+Math.sin(tip.angle)*CONFIG.stepSize;

        if(insideTitle(nx,ny,8)){
          var z=CONFIG.titleZone;
          var down=Math.abs(ny-(z.y+z.h));
          var right=Math.abs(nx-(z.x+z.w));
          var escape=down<right?Math.PI/2:0;
          tip.angle=angleBlend(tip.angle,escape,.86)+(random()-.5)*.16;
          nx=tip.x+Math.cos(tip.angle)*CONFIG.stepSize;
          ny=tip.y+Math.sin(tip.angle)*CONFIG.stepSize;
          if(insideTitle(nx,ny,2)){ tip.alive=false;continue; }
        }

        if(nx<58||nx>1542||ny<62||ny>842){
          tip.angle+=Math.PI*.72;
          nx=tip.x+Math.cos(tip.angle)*CONFIG.stepSize;
          ny=tip.y+Math.sin(tip.angle)*CONFIG.stepSize;
          tip.energy-=2.1;
        }

        var fused=false;
        if(closestOther&&closestOtherDist<11.2&&tip.age>22&&junctions.length<124&&random()<.24){
          nx=closestOther.x;ny=closestOther.y;fused=true;
          tip.energy+=2.8;
        }

        var seg={
          x1:tip.x,y1:tip.y,x2:nx,y2:ny,tipId:tip.id,spore:tip.spore,
          depth:tip.depth,step:step,energy:tip.energy,fusion:fused
        };
        segments.push(seg);
        paths.get(tip.id).push(seg);
        tip.x=nx;tip.y=ny;tip.age++;tip.cooldown++;
        tip.energy-=CONFIG.energyCost*(1+tip.depth*.045);

        var harvestedNow=0;
        for(var hi=0;hi<nutrients.length;hi++){
          var source=nutrients[hi];
          var hx=source.x-tip.x,hy=source.y-tip.y;
          var hd=Math.sqrt(hx*hx+hy*hy);
          if(hd<source.r+11&&source.amount>0){
            var take=Math.min(source.amount,CONFIG.harvestRate*(1-hd/(source.r+18))+.22);
            if(take>0){
              source.amount-=take;
              source.harvested+=take;
              source.visits++;
              harvestedNow+=take;
              tip.energy+=take*CONFIG.harvestGain;
            }
          }
        }

        addNode(grid,{x:tip.x,y:tip.y,tipId:tip.id,spore:tip.spore,step:step});

        if(fused){
          junctions.push({x:tip.x,y:tip.y,step:step,kind:'fusion'});
          tip.alive=false;
        }

        var branchReadiness=tip.energy-CONFIG.branchEnergy+Math.min(8,harvestedNow*5);
        if(tip.alive&&branchReadiness>0&&tip.cooldown>CONFIG.branchCooldown&&nextId<CONFIG.maxTips){
          var chance=.085+Math.min(.22,(branchReadiness/38));
          if(random()<chance){
            var split=.43+random()*.26;
            var turn=(random()<.5?-1:1)*split;
            var childEnergy=tip.energy*(.42+random()*.04);
            tip.energy-=childEnergy;
            tip.angle-=turn*.31;
            tip.cooldown=0;
            var child={
              id:nextId++,spore:tip.spore,x:tip.x,y:tip.y,angle:tip.angle+turn,
              energy:childEnergy,age:0,depth:tip.depth+1,cooldown:0,alive:true
            };
            paths.set(child.id,[]);
            born.push(child);
            junctions.push({x:tip.x,y:tip.y,step:step,kind:'branch'});
          }
        }

        if(tip.age>225+tip.depth*16) tip.energy-=.7;
        if(tip.alive&&tip.energy>=4.5) nextTips.push(tip);
      }

      for(var bi=0;bi<born.length;bi++) nextTips.push(born[bi]);
      tips=nextTips;
    }

    var pathList=[];
    paths.forEach(function(path,id){
      if(path.length>18){
        var cumulative=[0],length=0;
        for(var i=0;i<path.length;i++){
          var p=path[i];
          length+=Math.hypot(p.x2-p.x1,p.y2-p.y1);
          cumulative.push(length);
        }
        pathList.push({id:id,segments:path,cumulative:cumulative,length:length});
      }
    });
    pathList.sort(function(a,b){ return b.length-a.length||a.id-b.id; });

    var result={
      segments:segments,
      junctions:junctions,
      nutrients:nutrients,
      paths:pathList.slice(0,28)
    };
    result.signature=fnvSignature(segments,nutrients);
    return result;
  }

  function color(name,alpha){ return Deck.rgba(name,alpha); }

  function circle(ctx,x,y,r){ ctx.beginPath();ctx.arc(x,y,r,0,TAU); }

  function drawSoil(ctx,w,h){
    var grad=ctx.createLinearGradient(0,0,w,h);
    grad.addColorStop(0,'#11140f');
    grad.addColorStop(.5,'#171a13');
    grad.addColorStop(1,'#20251b');
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.lineWidth=1;
    for(var band=0;band<7;band++){
      var by=154+band*102;
      ctx.beginPath();
      for(var x=0;x<=w;x+=24){
        var envelope=Math.max(0,(x-430)/1170);
        var y=by+Math.sin(x*.008+band*.83)*13*envelope+Math.sin(x*.019-band)*4;
        if(x===0) ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle='rgba(138,132,108,'+(0.035+band*.004)+')';
      ctx.stroke();
    }
    ctx.restore();

    var grain=rngFrom(CONFIG.seed+99);
    ctx.fillStyle='rgba(203,193,164,.075)';
    for(var i=0;i<1500;i++){
      var gx=grain()*w,gy=grain()*h;
      var density=.16+.84*Math.pow(gx/w,1.6);
      if(grain()<density) ctx.fillRect(gx,gy,grain()<.84?1:1.7,grain()<.84?1:1.7);
    }
  }

  function drawNetwork(ctx){
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.globalCompositeOperation='source-over';

    for(var depth=0;depth<7;depth++){
      ctx.beginPath();
      for(var i=0;i<model.segments.length;i++){
        var s=model.segments[i];
        if(s.fusion||Math.min(6,s.depth)!==depth) continue;
        ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);
      }
      ctx.strokeStyle='rgba(17,20,15,.72)';
      ctx.lineWidth=4.8-Math.min(depth,5)*.35;
      ctx.stroke();
    }

    for(var d=0;d<7;d++){
      ctx.beginPath();
      for(var j=0;j<model.segments.length;j++){
        var seg=model.segments[j];
        if(seg.fusion||Math.min(6,seg.depth)!==d) continue;
        ctx.moveTo(seg.x1,seg.y1);ctx.lineTo(seg.x2,seg.y2);
      }
      ctx.strokeStyle=d<2?color('mycelium-hot',.74):color('mycelium',.6-Math.min(d,5)*.034);
      ctx.lineWidth=Math.max(1,2.2-d*.17);
      ctx.stroke();
    }

    ctx.beginPath();
    for(var f=0;f<model.segments.length;f++){
      var fs=model.segments[f];
      if(!fs.fusion) continue;
      ctx.moveTo(fs.x1,fs.y1);ctx.lineTo(fs.x2,fs.y2);
    }
    ctx.strokeStyle=color('nutrient',.68);ctx.lineWidth=1.5;ctx.stroke();

    ctx.fillStyle=color('mycelium-hot',.34);
    for(var k=0;k<model.segments.length;k+=31){
      var dot=model.segments[k];
      if(insideTitle(dot.x2,dot.y2,0)) continue;
      circle(ctx,dot.x2,dot.y2,dot.depth<2?1.15:.75);ctx.fill();
    }
    ctx.restore();

    for(var q=0;q<model.junctions.length;q++){
      var junction=model.junctions[q];
      ctx.fillStyle=junction.kind==='fusion'?color('nutrient',.76):color('mycelium-hot',.64);
      circle(ctx,junction.x,junction.y,junction.kind==='fusion'?3.2:2.25);ctx.fill();
    }
  }

  function drawSpore(ctx,spore){
    ctx.save();ctx.translate(spore.x,spore.y);
    ctx.strokeStyle=color('spore',.78);ctx.fillStyle=color('spore',.2);ctx.lineWidth=1.4;
    circle(ctx,0,0,10);ctx.fill();ctx.stroke();
    circle(ctx,0,0,3.6);ctx.fillStyle=color('mycelium-hot',.88);ctx.fill();
    ctx.restore();
  }

  function drawNutrient(ctx,source){
    var remaining=Math.max(0,source.amount/source.initial);
    ctx.save();ctx.translate(source.x,source.y);
    ctx.strokeStyle=color('nutrient',.42+remaining*.28);ctx.lineWidth=1.2;
    circle(ctx,0,0,source.r*.74);ctx.stroke();
    ctx.fillStyle=color('nutrient',.2+remaining*.52);
    circle(ctx,0,0,source.r*(.2+remaining*.34));ctx.fill();
    ctx.fillStyle=color('mycelium-hot',.72);
    circle(ctx,-source.r*.12,-source.r*.12,2.1);ctx.fill();
    ctx.restore();
  }

  function drawStatic(ctx,w,h){
    if(!model) return;
    ctx.clearRect(0,0,w,h);
    drawSoil(ctx,w,h);
    drawNetwork(ctx);
    for(var i=0;i<SPORES.length;i++) drawSpore(ctx,SPORES[i]);
    for(var j=0;j<model.nutrients.length;j++) drawNutrient(ctx,model.nutrients[j]);
  }

  function pointOnPath(path,fraction){
    var target=path.length*fraction;
    var list=path.cumulative;
    var lo=0,hi=list.length-1;
    while(lo<hi){
      var mid=(lo+hi)>>1;
      if(list[mid]<target) lo=mid+1;else hi=mid;
    }
    var index=Math.max(0,lo-1);
    var seg=path.segments[Math.min(index,path.segments.length-1)];
    var start=list[index],span=(list[index+1]-start)||1;
    var local=(target-start)/span;
    return {x:Deck.lerp(seg.x1,seg.x2,local),y:Deck.lerp(seg.y1,seg.y2,local)};
  }

  function drawAmbient(time){
    if(!ambientCtx||!model) return;
    var ctx=ambientCtx,w=ambientCanvas.__w||1600,h=ambientCanvas.__h||900;
    ctx.clearRect(0,0,w,h);
    ctx.save();ctx.globalCompositeOperation='source-over';
    ctx.fillStyle=color('mycelium-hot',.86);

    for(var i=0;i<model.paths.length;i++){
      var path=model.paths[i];
      var phase=((time/8600)+i*.137)%1;
      var p=pointOnPath(path,phase);
      if(insideTitle(p.x,p.y,0)) continue;
      var radius=1.5+(i%3)*.35;
      circle(ctx,p.x,p.y,radius);ctx.fill();
    }
    ctx.restore();
  }

  function startMotion(){
    if(motionStop){ motionStop();motionStop=null; }
    motionStop=Deck.loop(function(t){
      lastMotionTime=t;
      drawAmbient(lastMotionTime);
    },{still:STILL});
  }

  function resetCover(announce){
    var previous=model&&model.signature;
    model=buildModel();
    lastMotionTime=STILL;
    stage.dataset.modelSignature=model.signature;
    stage.dataset.segmentCount=String(model.segments.length);
    if(staticFit) staticFit.redraw();
    if(ambientFit) ambientFit.redraw();
    drawAmbient(STILL);
    if(announce){
      liveStatus.textContent='已按固定 seed 4217 重新生成。模型签名 '+model.signature+'，与重置前'+(previous===model.signature?'一致。':'不同。');
    }
  }

  function onKeydown(event){
    if(event.metaKey||event.ctrlKey||event.altKey) return;
    var target=event.target&&event.target.tagName;
    if(target==='INPUT'||target==='TEXTAREA'||target==='SELECT'||(event.target&&event.target.isContentEditable)) return;
    if(event.key==='r'||event.key==='R'){
      event.preventDefault();resetCover(true);
    }
  }

  function onMotionPreference(){
    startMotion();
  }

  function cleanup(){
    if(motionStop) motionStop();
    if(staticFit) staticFit.stop();
    if(ambientFit) ambientFit.stop();
    document.removeEventListener('keydown',onKeydown);
    if(media){
      if(media.removeEventListener) media.removeEventListener('change',onMotionPreference);
      else if(media.removeListener) media.removeListener(onMotionPreference);
    }
  }

  Deck.init({title:'菌丝｜地下的生长网络',keys:false});
  model=buildModel();
  stage.dataset.modelSignature=model.signature;
  stage.dataset.segmentCount=String(model.segments.length);
  staticFit=Deck.autofit(growthCanvas,drawStatic);
  ambientFit=Deck.autofit(ambientCanvas,function(ctx){
    ambientCtx=ctx;drawAmbient(Deck.reduced()?STILL:lastMotionTime);
  });
  startMotion();

  document.addEventListener('keydown',onKeydown);
  if(media){
    if(media.addEventListener) media.addEventListener('change',onMotionPreference);
    else if(media.addListener) media.addListener(onMotionPreference);
  }
  window.addEventListener('pagehide',cleanup,{once:true});
})();
  </script>
</body>
</html>
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
