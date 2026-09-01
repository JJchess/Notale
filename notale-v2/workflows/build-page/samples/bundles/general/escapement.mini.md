<sample id="escapement" category="general" variant="mini">
  <file path="samples/general/escapement/mini/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>擒</title><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="styles.css"></head>
<body><main id="stage"><h1>擒纵机构把连续推力切成一齿一步</h1>
<figure><div id="view"><canvas id="mechanism"></canvas><svg id="fallback" viewBox="0 0 1420 520" hidden>
<g transform="translate(710 250) scale(72 -72)" fill="none">
<g transform="rotate(24 -3.55 0)" class="wheel"><circle cx="-3.55" r="1.85" pathLength="30" stroke-dasharray="1 1"/><circle cx="-3.55" r=".38"/></g>
<g transform="rotate(3)"><path d="M-.3.25L-1.5 1.4L-1.7 1.1L-1 .35L-.7 0L-1-.35L-1.7-1.1L-1.5-1.4L-.3-.25L3-.2L3.2 0L3 .2Z" class="fork"/><path d="M-1.74 1.1h.75v.28h-.75zm0-2.48h.75v.28h-.75z" class="pallet"/></g>
<g transform="rotate(18 4 0)" class="balance"><circle cx="4" r="2"/><path d="M4 0V2m0-2-1.7-1m1.7 1 1.7-1M4 0q1-1 1 0t-1 1"/></g>
</g></svg></div>
<figcaption><div><h2 id="stateName"></h2><p id="stateCopy"></p></div><b id="reading"></b></figcaption></figure>
<nav><button id="play">播放</button><div id="states"><button data-index="0">锁住</button><button data-index="1">放开</button><button data-index="2">走一齿</button><button data-index="3">再锁住</button></div><button id="reset">复位</button></nav>
</main><script src="assets/base.js"></script><script src="assets/lib/three.min.js"></script><script src="mechanism.js"></script></body></html>
```
  </file>
  <file path="samples/general/escapement/mini/pages/mechanism.js">
```javascript
(function(){
"use strict";
const get=document.getElementById.bind(document),canvas=get("mechanism"),view=get("view");
const stateName=get("stateName"),stateCopy=get("stateCopy"),reading=get("reading");
const playButton=get("play"),resetButton=get("reset"),buttons=[...document.querySelectorAll("[data-index]")];
const reduced=matchMedia("(prefers-reduced-motion: reduce)"),events=new AbortController();
const makeState=(id,name,copy,read,wheel,fork,balance)=>({id,name,copy,read,wheel,fork,balance});
const STATES=[makeState("lock","锁住","上方锁瓦顶住齿尖；轮受力但不动。","0 齿",0,-.06,-.28),
 makeState("release","放开","摆轮移开上方锁瓦，轮齿获得短通道。","刚解锁",.032,-.014,-.08),
 makeState("step","走一齿","轮跨过一个齿距，经擒纵叉推一下摆轮。","前进 1 齿",.36,.061,.14),
 makeState("relock","再锁住","下方锁瓦接住下一齿；轮转 2π/15 后停住。","停在 1 齿",Math.PI*2/15,.057,.32)];
const state={progress:reduced.matches?3:0,frame:0,playing:false,disposed:false};
let renderer,scene,camera,root,wheel,fork,balance,spring,entryPallet,exitPallet,offResize;
const clamp=value=>Deck.clamp(value,0,3),lerp=Deck.lerp;
const ease=value=>1-Math.pow(1-value,3);
function listen(target,type,handler){target.addEventListener(type,handler,{signal:events.signal})}
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.05})}
function mesh(geometry,paint){return new THREE.Mesh(geometry,paint)}
function bar(length,width,paint){const geometry=new THREE.BoxGeometry(length,width,.25);geometry.translate(length/2,0,0);return mesh(geometry,paint)}
function buildWheel(){
 const group=new THREE.Group(),paint=material(0x54b9aa);group.position.x=-3.55;
 group.add(mesh(new THREE.TorusGeometry(1.72,.14,8,60),paint));
 const toothGeometry=new THREE.ConeGeometry(.23,.46,3);
 for(let index=0;index<15;index++){const angle=index*Math.PI*2/15,tooth=mesh(toothGeometry,paint);
  tooth.position.set(Math.cos(angle)*1.92,Math.sin(angle)*1.92,0);tooth.rotation.z=angle-Math.PI/2;group.add(tooth)}
 for(let index=0;index<5;index++){const spoke=bar(1.55,.18,paint);spoke.rotation.z=index*Math.PI*2/5;group.add(spoke)}
 group.add(mesh(new THREE.CylinderGeometry(.42,.42,.42,40).rotateX(Math.PI/2),paint));return group;
}
function buildFork(){
 const group=new THREE.Group(),paint=material(0x589bd4),jewel=material(0xf28aa0),pallets=[];
 group.add(bar(3.1,.48,paint));
 for(const side of [-1,1]){const arm=bar(1.75,.34,paint);arm.rotation.z=side*2.36;group.add(arm);
  const pallet=mesh(new THREE.BoxGeometry(.75,.28,.34),jewel);pallet.position.set(-1.47,side*1.22,.35);
  pallets.push(pallet);group.add(pallet)}
 [entryPallet,exitPallet]=pallets;group.position.z=.3;return group;
}
function buildBalance(){
 const group=new THREE.Group(),paint=material(0xc47fd2);group.position.set(4,.04,.08);
 group.add(mesh(new THREE.TorusGeometry(1.84,.17,12,64),paint));
 for(let index=0;index<3;index++){const spoke=bar(1.72,.17,paint);spoke.rotation.z=Math.PI/2+index*Math.PI*2/3;group.add(spoke)}
 group.add(mesh(new THREE.CylinderGeometry(.42,.42,.4,40).rotateX(Math.PI/2),paint));return group;
}
function buildSpring(){
 const points=[];for(let index=0;index<150;index++){const amount=index/149,angle=amount*Math.PI*11.8,radius=.18+amount*1.48;
  points.push(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,-.2))}
 const curve=new THREE.CatmullRomCurve3(points),geometry=new THREE.TubeGeometry(curve,180,.027,7,false);
 const group=new THREE.Group();group.position.set(4,.04,-.08);group.add(mesh(geometry,material(0x737b79)));return group;
}
function initThree(){
 if(!window.THREE)throw Error("Three unavailable");
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
 scene=new THREE.Scene();
 camera=new THREE.OrthographicCamera(-8,8,3,-3,.1,40);camera.position.set(0,0,18);
 scene.add(new THREE.HemisphereLight(0xffffff,0xd6ddda,1.7));
 const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(-4,7,12);scene.add(light);
 root=new THREE.Group();root.rotation.set(-.3,.09,-.025);scene.add(root);
 wheel=buildWheel();fork=buildFork();balance=buildBalance();spring=buildSpring();root.add(wheel,fork,balance,spring);
}
function visualAt(progress){
 const low=Math.floor(progress),high=Math.min(3,low+1),amount=progress-low;
 return["wheel","fork","balance"].map(key=>lerp(STATES[low][key],STATES[high][key],amount));
}
function render(){if(renderer)renderer.render(scene,camera)}
function apply(progress){
 state.progress=clamp(progress);const angles=visualAt(state.progress),index=Math.round(state.progress),current=STATES[index];
 if(wheel){wheel.rotation.z=angles[0];fork.rotation.z=angles[1];balance.rotation.z=angles[2];spring.rotation.z=angles[2]*.08;
  entryPallet.scale.setScalar(1+.13*Math.max(0,1-state.progress));
  exitPallet.scale.setScalar(1+.13*Math.max(0,state.progress-2));render()}
 stateName.textContent=current.name;stateCopy.textContent=current.copy;reading.textContent=current.read;
 buttons.forEach((button,buttonIndex)=>button.toggleAttribute("aria-current",buttonIndex===index));
}
function stop(){cancelAnimationFrame(state.frame);state.frame=0;state.playing=false;playButton.textContent="播放"}
function animateTo(target,duration=700,playMode=false){
 stop();if(playMode){state.playing=true;playButton.textContent="暂停"}
 if(reduced.matches||duration===0){apply(target);stop();return}
 const start=state.progress,started=performance.now();
 function frame(now){const amount=Math.min(1,(now-started)/duration);apply(lerp(start,target,ease(amount)));
  if(amount<1&&(!playMode||state.playing))state.frame=requestAnimationFrame(frame);else stop()}
 state.frame=requestAnimationFrame(frame);
}
function goTo(index,instant){if(!state.disposed)animateTo(clamp(+index||0),instant?0:700)}
function play(){
 if(state.disposed)return;if(state.playing){stop();return}if(state.progress>2.98)apply(0);
 animateTo(3,2800,true);
}
function reset(){stop();apply(0)}
function resize(){
 if(!renderer)return;const width=view.clientWidth,height=view.clientHeight,ratio=Deck.ratio();
 renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);const span=5.5,widthSpan=span*width/height;
 camera.left=-widthSpan/2;camera.right=widthSpan/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();render();
}
function dispose(){
 if(state.disposed)return;state.disposed=true;stop();events.abort();offResize&&offResize();
 if(root)root.traverse(item=>{item.geometry&&item.geometry.dispose();item.material&&item.material.dispose()});
 if(renderer){renderer.dispose();renderer.forceContextLoss();renderer=null}window.__NOTALE_READY__=false;
}
try{initThree()}catch{state.progress=3;canvas.hidden=true;get("fallback").removeAttribute("hidden");document.querySelector("nav").hidden=true}
offResize=Deck.onResize(resize);resize();apply(state.progress);
listen(playButton,"click",play);listen(resetButton,"click",reset);
buttons.forEach(button=>listen(button,"click",()=>goTo(+button.dataset.index)));
listen(window,"pagehide",dispose);
window.MiniEscapement={goTo,play,reset,dispose,inspect:()=>({
 progress:state.progress,index:Math.round(state.progress),id:STATES[Math.round(state.progress)].id,
 playing:state.playing,teeth:15,parts:{fork:1,pallets:2,balance:1,hairspring:1},
 wheel:visualAt(state.progress)[0],fork:visualAt(state.progress)[1],renderer:renderer?"webgl":"fallback",disposed:state.disposed
})};window.__NOTALE_READY__=true;
}());
```
  </file>
</sample>
