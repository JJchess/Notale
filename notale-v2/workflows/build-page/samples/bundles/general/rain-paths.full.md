<sample id="rain-paths" category="general" variant="full">
  <file path="samples/general/rain-paths/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>雨落下之后</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="theme.css">
</head>
<body>
<main id="stage" class="no-pan">
  <canvas id="gl" class="cv-fill" aria-hidden="true"></canvas>
  <header class="top">
    <span>城市雨洪剖面</span><i class="rule"></i><span>Surface/path</span>
    <span class="count">01—05</span>
  </header>
  <h1 class="hero"><span>雨落下</span><span>之后</span></h1>
  <p class="cl"><small>同一场雨 · 不同去路</small>表面结构决定水是<strong>立刻离开</strong>，还是被城市慢慢接住。</p>

  <section id="rail">
    <div class="trk">
      <button class="t" data-bg="#354445" data-ink="#dcebd7" data-rule="峰值来得早"
        data-copy="致密表面几乎不给水向下的缝隙。雨滴迅速合流，沿坡度奔向最低处，排水口在短时间内承受最高压力。"
        aria-label="沥青路面，水沿表面快速汇流">
        <img src="media/01-asphalt.svg" alt="雨中的沥青表面"><span class="no">01</span>
        <b>沥青路面</b><span class="r">水的去路 · 快速径流</span>
      </button>
      <button class="t" data-bg="#544147" data-ink="#f5d9cb" data-rule="削慢汇流"
        data-copy="砖缝与颗粒基层把连续水流拆成许多细流。水先穿过面层，再进入碎石空隙，因此抵达管网的时间被向后推迟。"
        aria-label="透水铺装，水穿过缝隙下渗">
        <img src="media/02-pavers.svg" alt="湿润的透水砖"><span class="no">02</span>
        <b>透水铺装</b><span class="r">水的去路 · 穿缝下渗</span>
      </button>
      <button class="t" data-bg="#3c4934" data-ink="#e3efbd" data-rule="就地滞留"
        data-copy="下凹地形先把雨水留在植物之间。根系打开土壤孔隙，水在土层中横向扩散、向下渗透，污染物也被截留。"
        aria-label="雨水花园，水在根区停留">
        <img src="media/03-garden.svg" alt="积雨的下凹花园"><span class="no">03</span>
        <b>雨水花园</b><span class="r">水的去路 · 根区滞留</span>
      </button>
      <button class="t" data-bg="#3f4f55" data-ink="#f0e4d7" data-rule="延迟排放"
        data-copy="植被与基质先截住屋顶上的雨。部分水重新蒸散，剩余水穿过过滤层，从排水层缓慢离开，屋面不再只是一块硬壳。"
        aria-label="绿色屋顶，水被基质截留">
        <img src="media/04-roof.svg" alt="雨中的绿色屋顶"><span class="no">04</span>
        <b>绿色屋顶</b><span class="r">水的去路 · 基质截留</span>
      </button>
      <button class="t" data-bg="#29474b" data-ink="#efe2aa" data-rule="缓慢释放"
        data-copy="浅水、茎秆与曲折岸线共同增加阻力。水在根区停留并绕行，流速降低，最终以更平缓的节奏回到河道。"
        aria-label="城市湿地，水绕行后缓释">
        <img src="media/05-wetland.svg" alt="雨后的城市湿地"><span class="no">05</span>
        <b>城市湿地</b><span class="r">水的去路 · 绕行缓释</span>
      </button>
    </div>
  </section>

  <div class="pg" aria-hidden="true"><i></i></div>
  <aside class="dt" aria-live="polite">
    <button class="x" aria-label="返回列表">×</button>
    <div class="dc"><span class="dn"></span><h2></h2><span class="dr"></span><p></p><span class="dd"></span></div>
  </aside>
</main>
<script src="assets/base.js"></script>
<script src="assets/lib/three.min.js"></script>
<script src="rain-paths.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/rain-paths/pages/theme.css">
```css
:root { --bg:#354445; --text:#dcebd7; --ink:#dcebd7; --line:#dcebd744; --focus:#fff; --font-sans:Inter,"Noto Sans SC","PingFang SC",sans-serif; --serif:"Songti SC",STSong,serif; }
body { background:#172021; }
button { border:0; background:0 0; color:inherit; }
#stage { isolation:isolate; background:var(--bg); color:var(--ink); transition:.65s; }
#gl { z-index:2; pointer-events:none; }
.top { position:absolute; z-index:4; top:31px; left:42px; right:42px; display:flex; align-items:center; font-size:12px; letter-spacing:.18em; }
.rule { width:36px; height:1px; margin:0 16px; background:currentColor; opacity:.55; }
.count { margin-left:auto; }
.hero { position:absolute; left:60px; top:102px; font:400 146px/.79 var(--serif); letter-spacing:-.09em; opacity:.105; }
.hero span { display:block; }
.hero span + span { margin-left:155px; }
.cl { position:absolute; z-index:4; left:72px; top:675px; width:270px; font:20px/1.5 var(--serif); }
.cl small { display:block; margin-bottom:10px; font:11px var(--font-sans); letter-spacing:.16em; }
.cl strong { font-weight:400; }
#rail { position:absolute; z-index:3; inset:125px 0 92px; overflow:hidden; }
.trk { display:flex; gap:220px; width:max-content; height:620px; padding-left:300px; transform:translate3d(0,0,0); }
.t { position:relative; flex:none; width:360px; height:500px; padding:0; text-align:left; box-shadow:inset 0 0 0 1px #ffffff24; }
.t:nth-child(2n) { margin-top:72px; }
.t img { width:100%; height:100%; object-fit:cover; }
.ok .t img { visibility:hidden; }
.t .no { position:absolute; top:14px; right:14px; font-size:11px; letter-spacing:.12em; }
.t b { position:absolute; left:-74px; bottom:64px; width:490px; font:400 49px/1 var(--serif); letter-spacing:-.055em; text-shadow:0 2px 18px #0004; }
.r { position:absolute; left:-18px; bottom:24px; font-size:12px; letter-spacing:.1em; }
.t::before { content:"移入 · 看路径"; position:absolute; right:-26px; top:14px; font-size:10px; letter-spacing:.12em; writing-mode:vertical-rl; opacity:.65; }
.pg { position:absolute; z-index:4; left:690px; bottom:40px; width:220px; height:2px; background:#ffffff33; }
.pg i { display:block; height:100%; background:currentColor; transform:scaleX(.05); transform-origin:left; }
.dt { position:absolute; z-index:6; inset:0; opacity:0; pointer-events:none; background:linear-gradient(90deg,transparent 48%,var(--bg) 57%); transition:.45s; }
.on .dt { opacity:1; pointer-events:auto; }
.on .cl, .on .count, .on .trk { visibility:hidden; }
.on .hero, .on .pg { opacity:0; }
.dc { position:absolute; left:840px; top:165px; width:600px; }
.dn { font-size:12px; letter-spacing:.2em; opacity:.7; }
.dt h2 { margin:38px 0 28px; font:400 78px var(--serif); letter-spacing:-.07em; }
.dr { font-size:14px; letter-spacing:.12em; }
.dt p { width:500px; margin-top:68px; font:24px/1.75 var(--serif); }
.dd { display:block; margin-top:28px; padding-top:20px; border-top:1px solid var(--line); font-size:12px; letter-spacing:.14em; }
.x { position:absolute; right:130px; top:31px; width:36px; height:36px; font-size:24px; line-height:1; }
```
  </file>
  <file path="samples/general/rain-paths/pages/rain-paths.js">
```javascript
(() => {
  "use strict";

  const stage = document.querySelector("#stage");
  const canvas = document.querySelector("#gl");
  const cards = [...document.querySelectorAll(".t")];
  const track = document.querySelector(".trk");
  const progressLine = document.querySelector(".pg i");
  const detail = document.querySelector(".dt");
  const inDetail = selector => detail.querySelector(selector);
  const reducedMotion = Deck.reduced();
  const cardCount = cards.length;
  const aborter = new AbortController();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const CARD_STEP = 580;

  let renderer, camera, planeGeometry, removeResize;
  let ownedTextures = [];
  let graphicsReleased = false;
  let frameId = 0;
  let disposed = false;
  let ready = false;
  let fallback = false;
  let currentIndex = 0;
  let targetScroll = 0;
  let scroll = 0;
  let hoverIndex = -1;
  let detailIndex = -1;
  let pointerStart = 0;
  let suppressClick = false;
  const surfaces = [];

  const vertexShader = `varying vec2 uvPoint;
void main(){
  uvPoint=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;

  const fragmentShader = `uniform sampler2D surfaceTexture,pathTexture;
uniform float progress,time,opacity;
uniform vec2 mouse;
varying vec2 uvPoint;
float hash(vec2 point){return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5);}
float noise(vec2 point){
  vec2 cell=floor(point),local=fract(point);
  local=local*local*(3.-2.*local);
  return mix(mix(hash(cell),hash(cell+vec2(1,0)),local.x),mix(hash(cell+vec2(0,1)),hash(cell+1.),local.x),local.y);
}
float field(vec2 point){return noise(point)*.58+noise(point*2.07)*.28+noise(point*4.13)*.14;}
void main(){
  float grain=field(uvPoint*5.+vec2(time*.035,-time*.025)),wave=sin(progress*3.1416);
  float distance=length((uvPoint-mouse)*vec2(.78,1.))-progress*.93+.08+(grain-.5)*.32*wave;
  float mask=smoothstep(.075,-.075,distance);
  vec2 warp=vec2(grain-.5,field(uvPoint.yx*7.-time*.02)-.5)*.055*wave;
  vec3 surface=texture2D(surfaceTexture,uvPoint+warp).rgb;
  vec3 path=texture2D(pathTexture,uvPoint-warp*1.3).rgb;
  vec3 color=mix(surface,path,mask);
  color+=vec3(.16,.3,.28)*smoothstep(.11,0.,abs(distance))*wave;
  gl_FragColor=vec4(color,opacity);
}`;

  function listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal:aborter.signal });
  }

  function applyColors(index) {
    stage.style.setProperty("--bg", cards[index].dataset.bg);
    stage.style.setProperty("--ink", cards[index].dataset.ink);
  }

  function selectIndex(index) {
    if (disposed) return;
    currentIndex = clamp(index, 0, cardCount - 1);
    targetScroll = CARD_STEP * currentIndex;
    applyColors(currentIndex);
    progressLine.style.transform = `scaleX(${.05 + .95 * currentIndex / (cardCount - 1)})`;
    renderScene(reducedMotion);
  }

  function openDetail(index) {
    if (disposed) return;
    detailIndex = index;
    if (index < 0) {
      stage.classList.remove("on");
      cards[currentIndex].focus();
    } else {
      const card = cards[index];
      currentIndex = index;
      inDetail(".dn").textContent = `0${index + 1} / SURFACE`;
      inDetail("h2").textContent = card.querySelector("b").textContent;
      inDetail(".dr").textContent = card.querySelector(".r").textContent;
      inDetail("p").textContent = card.dataset.copy;
      inDetail(".dd").textContent = card.dataset.rule;
      stage.classList.add("on");
      applyColors(index);
      inDetail(".x").focus();
    }
    renderScene(reducedMotion);
  }

  function reset() {
    if (disposed) return;
    document.activeElement?.blur();
    detailIndex = hoverIndex = -1;
    currentIndex = 0;
    scroll = targetScroll = 0;
    surfaces.forEach(surface => { surface.uniforms.progress.value = 0; });
    stage.classList.remove("on");
    selectIndex(0);
    renderScene(true);
  }

  function renderScene(immediate = false, time = 0) {
    if (!renderer || disposed) return;
    scroll = immediate ? targetScroll : scroll + .075 * (targetScroll - scroll);
    track.style.transform = `translate3d(${-scroll}px,0,0)`;
    surfaces.forEach((surface, index) => {
      const active = detailIndex === index;
      const width = detailIndex < 0 ? 360 : 520;
      const height = detailIndex < 0 ? 500 : 720;
      const targetX = active ? 370 : 480 + CARD_STEP * index - scroll;
      const targetY = active ? 450 : 375 + index % 2 * 72;
      const opacity = detailIndex < 0 || active ? 1 : 0;
      const pathProgress = active || detailIndex < 0 && hoverIndex === index ? 1 : 0;
      const amount = immediate ? 1 : .09;
      surface.mesh.position.x += (targetX - 800 - surface.mesh.position.x) * amount;
      surface.mesh.position.y += (450 - targetY - surface.mesh.position.y) * amount;
      surface.mesh.scale.x += (width - surface.mesh.scale.x) * amount;
      surface.mesh.scale.y += (height - surface.mesh.scale.y) * amount;
      surface.uniforms.opacity.value += (opacity - surface.uniforms.opacity.value) * amount;
      surface.uniforms.progress.value += (pathProgress - surface.uniforms.progress.value) * amount;
      surface.uniforms.time.value = .001 * time;
    });
    renderer.render(surfaces[0].scene, camera);
  }

  function animate(time) {
    frameId = 0;
    if (disposed || document.hidden) return;
    renderScene(false, time);
    frameId = requestAnimationFrame(animate);
  }

  function releaseGraphics() {
    if (graphicsReleased) return;
    graphicsReleased = true;
    surfaces.forEach(surface => surface.material.dispose());
    ownedTextures.forEach(texture => texture.dispose());
    planeGeometry?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }

  const loader = new THREE.TextureLoader();
  const loadingTextures = [];
  const loadTexture = url => new Promise((resolve, reject) => {
    loadingTextures.push(loader.load(url, resolve, undefined, reject));
  });
  const textureUrls = cards.flatMap(card => {
    const image = card.querySelector("img").src;
    return [image, image.replace(".svg", "-path.svg")];
  });

  Promise.all(textureUrls.map(loadTexture)).then(textures => {
    if (disposed) {
      textures.forEach(texture => texture.dispose());
      return;
    }
    ownedTextures = textures;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
      renderer.setPixelRatio(Deck.ratio());
      renderer.setSize(1600, 900, false);
      camera = new THREE.OrthographicCamera(-800, 800, 450, -450, 1, 20);
      camera.position.z = 5;
      planeGeometry = new THREE.PlaneGeometry(1, 1);
      const scene = new THREE.Scene();

      for (let index = 0; index < cardCount; index++) {
        const uniforms = {
          surfaceTexture:{ value:textures[2 * index] },
          pathTexture:{ value:textures[2 * index + 1] },
          progress:{ value:0 }, time:{ value:0 }, opacity:{ value:1 },
          mouse:{ value:new THREE.Vector2(.5, .5) }
        };
        const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent:true });
        const mesh = new THREE.Mesh(planeGeometry, material);
        mesh.scale.set(360, 500, 1);
        scene.add(mesh);
        surfaces.push({ uniforms, material, mesh, scene });
      }
      stage.classList.add("ok");
      ready = true;
      renderScene(true);
      if (!reducedMotion) frameId = requestAnimationFrame(animate);
    } catch (error) {
      releaseGraphics();
      renderer = null;
      fallback = ready = true;
    }
  }).catch(() => {
    loadingTextures.forEach(texture => texture.dispose());
    graphicsReleased = true;
    fallback = ready = true;
  });

  cards.forEach((card, index) => {
    listen(card, "mouseenter", () => { hoverIndex = index; selectIndex(index); });
    listen(card, "mouseleave", () => { hoverIndex = -1; renderScene(reducedMotion); });
    listen(card, "focus", () => { hoverIndex = index; selectIndex(index); });
    listen(card, "blur", () => { hoverIndex = -1; renderScene(reducedMotion); });
    listen(card, "pointermove", event => {
      if (!surfaces[index]) return;
      const bounds = card.getBoundingClientRect();
      surfaces[index].uniforms.mouse.value.set(
        (event.clientX - bounds.left) / bounds.width,
        1 - (event.clientY - bounds.top) / bounds.height
      );
    });
    listen(card, "click", event => {
      if (suppressClick) {
        event.preventDefault();
        suppressClick = false;
      } else openDetail(index);
    });
  });

  listen(stage, "wheel", event => {
    if (detailIndex >= 0) return;
    event.preventDefault();
    targetScroll = clamp(targetScroll + 1.15 * (event.deltaX || event.deltaY), 0, CARD_STEP * (cardCount - 1));
    currentIndex = Math.round(targetScroll / CARD_STEP);
    applyColors(currentIndex);
    progressLine.style.transform = `scaleX(${.05 + .95 * currentIndex / (cardCount - 1)})`;
    renderScene(reducedMotion);
  }, { passive:false });

  listen(stage, "pointerdown", event => { pointerStart = event.clientX; suppressClick = false; });
  listen(stage, "pointerup", event => {
    const distance = event.clientX - pointerStart;
    if (Math.abs(distance) > 45) {
      suppressClick = true;
      selectIndex(currentIndex + (distance < 0 ? 1 : -1));
    }
  });
  listen(stage, "pointercancel", () => { suppressClick = false; });

  listen(document, "keydown", event => {
    if (event.key === "r" || event.key === "R") reset();
    else if (event.key === "Escape" && detailIndex >= 0) openDetail(-1);
    else if (detailIndex < 0 && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      selectIndex(currentIndex + (event.key === "ArrowRight" ? 1 : -1));
      cards[currentIndex].focus();
    }
  });
  listen(inDetail(".x"), "click", () => openDetail(-1));
  listen(document, "visibilitychange", () => {
    if (!reducedMotion && !document.hidden && !frameId && !disposed) frameId = requestAnimationFrame(animate);
  });

  removeResize = Deck.onResize(() => {
    if (!renderer || disposed) return;
    renderer.setPixelRatio(Deck.ratio());
    renderer.setSize(1600, 900, false);
    renderScene(true);
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
    removeResize();
    aborter.abort();
    releaseGraphics();
  }

  listen(window, "pagehide", dispose);
  selectIndex(0);

  window.RainPaths = {
    selectIndex,
    openDetail,
    reset,
    renderAt:time => renderScene(true, time),
    dispose,
    getState:() => ({
      ready, fallback, disposed, currentIndex, hoverIndex, detailIndex,
      targetScroll, scroll, surfaces:surfaces.length,
      progress:surfaces.map(surface => surface.uniforms.progress.value)
    })
  };
})();
```
  </file>
</sample>
