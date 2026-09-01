<sample id="population-mountains" category="3d" variant="full">
  <file path="samples/3d/population-mountains/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>人口山脉</title>
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="assets/page.css">
</head>
<body>
<main id="stage">
  <section class="copy" aria-labelledby="title">
    <h1 id="title">人口山脉</h1>
    <p class="lead">同样的一平方公里，在俯视图里是颜色；相机倾斜后，<strong>居民越多，地形越高。</strong></p>
    <div class="readout" aria-live="polite">
      <h2 id="viewTitle">俯视分布</h2>
      <p id="viewText">颜色先回答人口集中在哪里。高度属于同一组网格，只是被俯视视线压平。</p>
    </div>
    <nav aria-label="人口地形命名视点">
      <button data-view="top" aria-pressed="true" disabled>俯视分布</button>
      <button data-view="tilt" aria-pressed="false" disabled>倾斜显高</button>
      <button data-view="profile" aria-pressed="false" disabled>侧看峰值</button>
    </nav>
  </section>
  <section class="scene" id="scene">
    <canvas class="cv-fill" id="gl" aria-label="纽约地区一平方公里人口网格三维地形；三个视点只移动相机"></canvas>
    <div class="legend">
      <b>每 1 km² 居民数</b><i></i><span><em>1</em><em>50,299</em></span>
    </div>
    <svg class="mark" aria-hidden="true"><line id="leader"/><circle id="dot" r="5"/></svg>
    <div class="peak" id="peak"><b>最高网格</b><strong>50,299 人</strong><span>每 1 km²</span></div>
    <div class="north"><b>N</b><i></i></div>
    <div class="scale"><i></i><span>10 km</span></div>
    <p class="source" id="stats">正在读取本地人口字段…</p>
    <div class="fallback" id="fallback" hidden>
      <h2>人口密度侧视剖面</h2>
      <p>WebGL 不可用。剖面仍取自相同的 1 km² 人口字段；柱高与居民数成正比。</p>
      <canvas id="fallbackChart" width="900" height="390" aria-label="93 km 东西向人口密度剖面，最高网格 50,299 人"></canvas>
    </div>
  </section>
</main>
<script src="assets/lib/three.min.js"></script>
<script src="assets/base.js"></script>
<script src="assets/population-data.js"></script>
<script src="assets/page.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/3d/population-mountains/pages/assets/page.js">
```javascript
(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const byId = id => document.getElementById(id);
  const [sceneHost, canvas, peak, leader, dot, viewTitle, viewText, stats] =
    ["scene", "gl", "peak", "leader", "dot", "viewTitle", "viewText", "stats"].map(byId);
  const nav = $("nav");
  const viewButtons = [...nav.querySelectorAll("button")];

  const VIEW_COPY = {
    top: {
      title:"俯视分布",
      text:"颜色先回答人口集中在哪里。高度属于同一组网格，只是被俯视视线压平。"
    },
    tilt: {
      title:"倾斜显高",
      text:"相机下降后，人口字段成为可见高度。高密网格沿城市核心连成峰脊。"
    },
    profile: {
      title:"侧看峰值",
      text:"最低视角把 50,299 人的最高网格与外围低密单元放在同一条地平线上。"
    }
  };
  const ELEVATION_SCALE = 2500;

  let renderer, scene, camera, views, target, peakWorld, projected;
  let frame = 0;
  let resizeOff = () => {};
  let autoTimers = [];
  let disposed = false;
  let currentView = "top";
  let transitioning = false;
  let publicApi;

  function clearAuto() {
    autoTimers.forEach(clearTimeout);
    autoTimers = [];
  }

  function updateCopy(name) {
    const content = VIEW_COPY[name];
    currentView = name;
    sceneHost.dataset.view = name;
    viewTitle.textContent = content.title;
    viewText.textContent = content.text;
    viewButtons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.view === name));
    });
  }

  function render() {
    if (disposed || !renderer) return;
    renderer.render(scene, camera);
    projected.copy(peakWorld).project(camera);
    const pointX = (.5 * projected.x + .5) * sceneHost.clientWidth;
    const pointY = (.5 * -projected.y + .5) * sceneHost.clientHeight;
    const labelX = Deck.clamp(pointX + 27, 12, sceneHost.clientWidth - 160);
    const labelY = Deck.clamp(pointY - 78, 110, sceneHost.clientHeight - 96);
    Object.assign(peak.style, { left:`${labelX}px`, top:`${labelY}px` });
    [["x1", pointX], ["y1", pointY], ["x2", labelX], ["y2", labelY + 38]].forEach(([name, value]) => {
      leader.setAttribute(name, value);
    });
    dot.setAttribute("cx", pointX);
    dot.setAttribute("cy", pointY);
  }

  function setView(name, immediate = false) {
    if (!views?.[name] || disposed) return;
    updateCopy(name);
    cancelAnimationFrame(frame);

    const destination = views[name];
    const startPosition = camera.position.clone();
    const startUp = camera.up.clone();
    const startTarget = target.clone();
    const started = performance.now();
    const duration = immediate || Deck.reduced() ? 0 : 1350;
    transitioning = duration > 0;

    function tick(now) {
      if (disposed) return;
      const raw = duration ? Math.min(1, (now - started) / duration) : 1;
      const amount = 1 - (1 - raw) ** 3;
      camera.position.lerpVectors(startPosition, destination.position, amount);
      camera.up.lerpVectors(startUp, destination.up, amount).normalize();
      target.lerpVectors(startTarget, destination.target, amount);
      camera.lookAt(target);
      render();
      if (raw < 1) frame = requestAnimationFrame(tick);
      else transitioning = false;
    }

    tick(started);
  }

  function resize() {
    if (!renderer || disposed) return;
    const { clientWidth:width, clientHeight:height } = sceneHost;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  function onNav(event) {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    clearAuto();
    setView(button.dataset.view);
  }

  function showFallback(data) {
    currentView = "profile";
    sceneHost.dataset.view = "profile";
    [canvas, peak, $(".legend"), $(".north"), $(".scale")].forEach(element => { element.hidden = true; });
    $(".mark").setAttribute("hidden", "");
    byId("fallback").hidden = false;
    viewTitle.textContent = "侧视峰值";
    viewText.textContent = "同一人口字段按东西向列取最大值，柱高仍与居民数成正比。";
    window.__POPULATION_READY__ = true;
    if (!data) {
      stats.textContent = "本地人口字段无法读取";
      return;
    }

    const chart = byId("fallbackChart");
    const context = chart.getContext("2d");
    const columns = Array(data.sourceWindow.width).fill(0);
    data.cells.forEach(([, column, , population]) => {
      columns[column] = Math.max(columns[column], population);
    });
    context.clearRect(0, 0, chart.width, chart.height);
    context.fillStyle = "#f3ba7c";
    columns.forEach((population, column) => {
      context.fillRect(9.2 * column, 360 - population / 155, 7.8, population / 155);
    });
    context.fillStyle = "#e14018";
    context.fillRect(9.2 * data.peak.column, 360 - data.maxPopulation / 155, 7.8, data.maxPopulation / 155);
    context.fillStyle = "#282828";
    context.font = '16px "PingFang SC",Arial,sans-serif';
    context.fillText("93 km 东西向范围", 20, 384);
    context.fillText("最高网格 50,299 人", 585, 28);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearAuto();
    cancelAnimationFrame(frame);
    resizeOff();
    nav.removeEventListener("click", onNav);
    window.removeEventListener("pagehide", dispose);

    if (scene) {
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          const owned = Array.isArray(object.material) ? object.material : [object.material];
          owned.forEach(material => materials.add(material));
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    }
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
    window.__POPULATION_READY__ = false;
    if (window.PopulationScene === publicApi) delete window.PopulationScene;
  }

  function init(data) {
    if (!data) {
      showFallback();
      return;
    }

    stats.textContent = `GHS-POP 2020　${data.cellCount.toLocaleString("zh-CN")} 个有居民网格　区域合计 ${data.totalPopulation.toLocaleString("zh-CN")} 人`;
    if (!window.WebGLRenderingContext) {
      showFallback(data);
      return;
    }

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:"high-performance" });
    } catch (error) {
      showFallback(data);
      return;
    }

    renderer.setClearColor(0xf7f7f7);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, .1, 400);
    target = new THREE.Vector3();
    projected = new THREE.Vector3();

    const { width, height } = data.sourceWindow;
    const centerX = (width - 1) / 2;
    const centerZ = (height - 1) / 2;
    const fill = new THREE.HemisphereLight(0xf6f8f8, 0x76868b, 1.7);
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(-62, 105, 68);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left:-80, right:80, top:80, bottom:-80, near:1, far:240 });
    key.shadow.bias = -.00035;
    scene.add(fill, key);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 10, height + 10),
      new THREE.MeshStandardMaterial({ color:0xf2f0ed, roughness:1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.07;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(width + 10, 10, 0xa8a5a5, 0xd7d3d3);
    grid.scale.z = (height + 10) / (width + 10);
    grid.position.y = -.03;
    scene.add(grid);

    const cellGeometry = new THREE.BoxGeometry(.88, 1, .88);
    const cellMaterial = new THREE.MeshStandardMaterial({ roughness:.78, metalness:0 });
    const transform = new THREE.Object3D();
    const mixedColor = new THREE.Color();
    const populationStops = [
      [4, new THREE.Color(0xfbeee0)],
      [1000, new THREE.Color(0xf3ba7c)],
      [6000, new THREE.Color(0xf32020)],
      [20000, new THREE.Color(0x830707)],
      [40000, new THREE.Color(0x4b0707)]
    ];
    function populationColor(value) {
      if (value <= populationStops[0][0]) return mixedColor.copy(populationStops[0][1]);
      for (let index = 1; index < populationStops.length; index += 1) {
        const lower = populationStops[index - 1];
        const upper = populationStops[index];
        if (value <= upper[0]) {
          const amount = (value - lower[0]) / (upper[0] - lower[0]);
          return mixedColor.copy(lower[1]).lerp(upper[1], amount);
        }
      }
      return mixedColor.copy(populationStops.at(-1)[1]);
    }

    const populationMesh = new THREE.InstancedMesh(cellGeometry, cellMaterial, data.cells.length);
    data.cells.forEach(([, column, row, population], index) => {
      const elevation = population / ELEVATION_SCALE;
      transform.position.set(column - centerX, elevation / 2, row - centerZ);
      transform.scale.set(1, elevation, 1);
      transform.updateMatrix();
      populationMesh.setMatrixAt(index, transform.matrix);
      populationMesh.setColorAt(index, populationColor(population));
    });
    populationMesh.castShadow = true;
    populationMesh.receiveShadow = true;
    populationMesh.frustumCulled = false;
    populationMesh.userData.entities = data.cells.map(([id]) => id);
    scene.add(populationMesh);

    peakWorld = new THREE.Vector3(
      data.peak.column - centerX,
      data.maxPopulation / ELEVATION_SCALE + .4,
      data.peak.row - centerZ
    );

    const makeView = (position, up, focus) => ({
      position:new THREE.Vector3(...position),
      up:new THREE.Vector3(...up),
      target:new THREE.Vector3(...focus)
    });
    views = {
      top:makeView([0,160,.01], [0,0,-1], [0,0,0]),
      tilt:makeView([88,78,102], [0,1,0], [0,5,0]),
      profile:makeView([105,34,122], [0,1,0], [0,6,0])
    };

    viewButtons.forEach(button => { button.disabled = false; });
    nav.addEventListener("click", onNav);
    resizeOff = Deck.onResize(resize);
    resize();

    if (Deck.reduced()) {
      setView("profile", true);
    } else {
      setView("top", true);
      autoTimers = [
        setTimeout(() => setView("tilt"), 1500),
        setTimeout(() => setView("profile"), 4300)
      ];
    }
    window.__POPULATION_READY__ = true;
  }

  Deck.init({ keys:false, title:"人口山脉" });
  window.addEventListener("pagehide", dispose);
  publicApi = {
    setView:(name, immediate=true) => {
      if (!views?.[name] || disposed) return;
      clearAuto();
      setView(name, immediate);
    },
    reset:() => { clearAuto(); setView("top", true); },
    getState:() => ({ view:currentView, transitioning, ready:window.__POPULATION_READY__ === true, disposed }),
    dispose
  };
  window.PopulationScene = publicApi;
  init(window.POPULATION_DATA);
})();
```
  </file>
</sample>
