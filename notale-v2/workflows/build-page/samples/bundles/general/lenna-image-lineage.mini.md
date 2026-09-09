<sample id="lenna-image-lineage" category="general" variant="mini">
  <file path="samples/general/lenna-image-lineage/mini/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>How one image persists through copies</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="page.css">
</head>
<body>
  <main id="stage">
    <h1 class="sr-only">How one image persists through copies</h1>
    <div id="grid" aria-hidden="true"></div>
    <div id="memes" class="layer"></div>
    <div id="contexts" class="layer"></div>
    <figure id="portrait"><img src="assets/img/lenna-pixels.png" alt="Recurring 84 by 84 pixel portrait"></figure>
    <aside id="caption" aria-live="polite">
      <p>Five familiar images establish the starting group.</p>
      <p>Each image becomes an origin. Twenty more copies fill the field.</p>
      <p>The same portrait recurs inside code, coursework, forums, and tools.</p>
      <p>Five sources produce 20 echoes and recur in five contexts. Every route resolves to the same 84 × 84 pixel portrait.</p>
      <nav>
        <button id="previous" type="button">Back</button>
        <span id="progress">1 / 4</span>
        <button id="next" type="button">Next</button>
        <button id="reset" type="button">Reset</button>
      </nav>
    </aside>
  </main>
  <script src="assets/base.js"></script>
  <script src="assets/lib/gsap.min.js"></script>
  <script src="story.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/lenna-image-lineage/mini/pages/page.css">
```css
:root{--deep:#390a29;--field:#440d31;--paper:#fffaf5;--ink:#282828;--focus:#a5f2d5}
body,#stage{background:var(--deep)}
#stage{position:fixed}
#grid,.layer{position:absolute;inset:0}
#grid{
background:var(--field);
 background-image:linear-gradient(#17031157 1px,transparent 1px),linear-gradient(90deg,#17031157 1px,transparent 1px);
  background-size:15px 15px
}
.layer{z-index:2;pointer-events:none}
#contexts{z-index:4}
.network-image{
  position:absolute;left:0;top:0;width:200px;height:200px;
  border:8px solid currentColor;background:currentColor;object-fit:cover;
  transform-origin:50% 50%
}
#portrait{
  position:absolute;left:200px;top:156px;z-index:5;width:588px;height:588px;
  margin:0;opacity:0;transform-origin:50% 50%
}
#portrait img{width:100%;height:100%;max-width:none;image-rendering:pixelated}
#portrait:after{
  content:"";position:absolute;inset:0;
  background-image:linear-gradient(#280d1d1a 1px,transparent 1px),linear-gradient(90deg,#280d1d1a 1px,transparent 1px);
  background-size:7px 7px
}
#caption{
  position:absolute;left:1140px;top:290px;z-index:20;width:360px;height:320px;
  padding:30px 32px;background:var(--paper);color:var(--ink)
}
#caption p{
  position:absolute;inset:30px 32px 86px;display:flex;align-items:center;margin:0;
  font-size:27px;font-weight:650;line-height:1.38;letter-spacing:-.018em;
  visibility:hidden;opacity:0
}
#caption p:first-child{visibility:visible;opacity:1}
nav{
  position:absolute;left:32px;right:32px;bottom:24px;display:flex;align-items:center;
  gap:12px;border-top:1px solid #cbbfc4;padding-top:14px
}
button{border:0;border-bottom:1px solid;padding:4px 1px;background:none;font:650 15px/1.2 inherit;cursor:pointer}
button:disabled{opacity:.3}
#progress{margin-right:auto;font:600 14px/1 inherit;color:#715c65}
#stage.has-fallback :is(#grid,#contexts,.echo,nav){display:none}
#stage.has-fallback .seed{opacity:1!important}
#stage.has-fallback #portrait{left:760px;top:156px;opacity:1!important;transform:scale(1)!important}
#stage.has-fallback #caption{left:1160px;top:326px}
#stage.has-fallback #caption p{display:none}
#stage.has-fallback #caption p:nth-child(4){display:flex;visibility:visible!important;opacity:1!important}
```
  </file>
  <file path="samples/general/lenna-image-lineage/mini/pages/story.js">
```javascript
(function(){
  "use strict";
  var names=["five","field","contexts","portrait"],times=[0,3.3,6.2,8.75];
  var colors=["#f29f80","#d96666","#a64153","#586fa6","#f2c299"];
  var seeds=[[174,30],[846,80],[510,350],[174,620],[896,570]];
  var origins=[[334,292],[574,310],[482,450],[346,594],[622,570]];
  var field=[[18,18],[234,36],[452,12],[670,44],[886,18],[52,226],[270,250],[488,218],[706,245],[924,220],[14,438],[232,420],[450,458],[668,428],[886,450],[44,650],[262,678],[480,642],[698,680],[916,654]];
  var order=[8,11,7,12,3,16,6,13,2,17,10,9,14,1,18,5,15,4,19,0];
  var contextPositions=[[124,80],[846,30],[460,350],[174,570],[796,620]];
  var anchors=[[315,294],[540,225],[474,446],[330,650],[674,580]];
  var byId=document.getElementById.bind(document);
  var stage=byId("stage"),memes=byId("memes"),contexts=byId("contexts");
  var portrait=byId("portrait"),grid=byId("grid"),captions=[].slice.call(document.querySelectorAll("#caption p"));
  var previous=byId("previous"),next=byId("next"),reset=byId("reset"),progress=byId("progress");
  var seedNodes=[],echoNodes=[],contextNodes=[],removers=[],timeline,navigation;
  var target=0,disposed=false,reduced=matchMedia("(prefers-reduced-motion: reduce)");

  function listen(node,type,handler,options){
    node.addEventListener(type,handler,options);
    removers.push(function(){node.removeEventListener(type,handler,options)});
  }
  function appendImages(list,layer,className,count,folder){
    for(var index=0;index<count;index++){
      var node=document.createElement("img"),number=index+1;
      node.className="network-image "+className;
      node.src="assets/img/"+folder+"/pic"+number+".jpg";
      node.alt=className==="echo"?"":className+" image "+number;
      node.dataset.identity=className+"-"+number;node.draggable=false;
      layer.appendChild(node);list.push(node);
    }
  }
  listen(stage,"error",showFallback,true);
  appendImages(seedNodes,memes,"seed",5,"memes");
  appendImages(echoNodes,memes,"echo",20,"memes");
  appendImages(contextNodes,contexts,"context",5,"screenshots");

  function showFallback(){
    if(stage.classList.contains("has-fallback"))return;
    dispose();stage.classList.add("has-fallback");stage.dataset.state="fallback";
    [[80,180],[300,180],[520,180],[190,400],[410,400]].forEach(function(point,index){
      seedNodes[index].style.transform="translate("+point[0]+"px,"+point[1]+"px)";
    });
    if(window.Deck)Deck.resize();window.__NOTALE_READY__=true;
  }
  if(!window.Deck||!window.gsap){showFallback();return}

  function place(node,point,offset,scale,opacity,color,layer){
    gsap.set(node,{x:point[0]-offset,y:point[1]-offset,scale:scale,opacity:opacity,
      color:color,borderColor:color,backgroundColor:color,zIndex:layer});
  }
  seedNodes.forEach(function(node,index){place(node,seeds[index],0,1,1,colors[index],1)});
  echoNodes.forEach(function(node,index){place(node,origins[index%5],100,.035,0,colors[index%5],10+index)});
  contextNodes.forEach(function(node,index){place(node,origins[index],100,.035,0,"#a5f2d5",40+index)});
  gsap.set(portrait,{opacity:0,scale:.54});gsap.set(captions.slice(1),{autoAlpha:0,y:18});

  timeline=gsap.timeline({paused:true,defaults:{ease:"power2.inOut"}});
  names.forEach(function(name,index){timeline.addLabel(name,times[index])});
  timeline.to(seedNodes,{opacity:.2,duration:1.05,stagger:.04,ease:"power2.out"},.18);
  order.forEach(function(fieldIndex,step){
    timeline.to(echoNodes[fieldIndex],{x:field[fieldIndex][0],y:field[fieldIndex][1],scale:1,
      opacity:1,duration:1.45,ease:"expo.out"},.45+step*.065);
  });
  timeline.to(seedNodes.concat(echoNodes),{opacity:0,scale:.84,duration:.95,stagger:.01,ease:"power2.in"},3.55);
  contextNodes.forEach(function(node,index){
    timeline.to(node,{x:contextPositions[index][0],y:contextPositions[index][1],scale:1,
      opacity:1,duration:1.5,ease:"expo.out"},3.75+index*.14);
    timeline.to(node,{x:anchors[index][0]-100,y:anchors[index][1]-100,scale:.18,opacity:.72,
      borderColor:colors[index],backgroundColor:colors[index],duration:1.55,ease:"power3.inOut"},6.25+index*.06);
  });
  timeline.to(portrait,{opacity:.46,scale:.76,duration:1.3,ease:"power2.out"},6.55);
  timeline.to(grid,{opacity:.24,duration:1.2},6.55);
  timeline.to(contextNodes,{opacity:0,scale:.055,duration:.9,stagger:.055,ease:"power2.in"},7.25);
  timeline.to(portrait,{opacity:1,scale:1,duration:1.5,ease:"power3.out"},7.25);
  timeline.to(grid,{opacity:0,duration:1.1},7.25);
  timeline.pause(0);

  function settle(index){
    target=index;navigation=null;stage.dataset.state=names[index];
    progress.textContent=(index+1)+" / 4";previous.disabled=index===0;next.disabled=index===3;
    gsap.set(captions,{autoAlpha:0,y:18});gsap.set(captions[index],{autoAlpha:1,y:0});
  }
  function goTo(index,immediate){
    if(disposed)return;
    index=Math.max(0,Math.min(3,index));if(navigation)navigation.kill();target=index;
    if(immediate||reduced.matches){timeline.pause(times[index],false);settle(index);return}
    gsap.to(captions,{autoAlpha:0,y:-18,duration:.25});
    gsap.fromTo(captions[index],{autoAlpha:0,y:18},{autoAlpha:1,y:0,duration:.4});
    navigation=gsap.to(timeline,{time:times[index],duration:1.4,
      ease:"power2.inOut",overwrite:true,onComplete:function(){settle(index)}});
  }
  function onKey(event){
    if(event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.key==="ArrowRight"||event.key==="ArrowDown"){event.preventDefault();goTo(target+1)}
    if(event.key==="ArrowLeft"||event.key==="ArrowUp"){event.preventDefault();goTo(target-1)}
    if(event.key.toLowerCase()==="r"||event.key==="Home"){event.preventDefault();goTo(0)}
  }
  function dispose(){
    if(disposed)return;
    disposed=true;if(navigation)navigation.kill();if(timeline)timeline.kill();
    removers.splice(0).forEach(function(remove){remove()});window.__NOTALE_READY__=false;
  }
  listen(previous,"click",function(){goTo(target-1)});
  listen(next,"click",function(){goTo(target+1)});
  listen(reset,"click",function(){goTo(0)});
  listen(document,"keydown",onKey);
  listen(reduced,"change",function(){if(reduced.matches)goTo(target,true)});
  listen(window,"pagehide",dispose);
  Deck.init({keys:false,title:"How one image persists through copies"});settle(0);
  window.MiniLineage={goTo:goTo,dispose:dispose};
  window.__NOTALE_READY__=true;
}());
```
  </file>
</sample>
