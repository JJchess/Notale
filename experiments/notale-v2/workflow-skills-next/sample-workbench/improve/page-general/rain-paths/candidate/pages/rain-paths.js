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
