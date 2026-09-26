<sample id="population-mountains" category="3d" variant="mini">
  <file path="samples/3d/population-mountains/mini/pages/index.html">
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
		<p class="lead">同样的一平方公里，在俯视图里是颜色；相机下降后，<strong>居民越多，地形越高。</strong></p>
		<nav>
			<button data-view="top" aria-pressed="true">俯视分布</button>
			<button data-view="profile" aria-pressed="false">侧看峰值</button>
			<button data-reset>复位</button>
		</nav>
	</section>
	<section class="scene" id="scene">
		<canvas class="cv-fill" id="gl" aria-label="纽约地区一平方公里人口网格三维地形"></canvas>
		<div class="legend"><b>每 1 km² 居民数</b><i></i><span><em>1</em><em>50,299</em></span></div>
		<div class="peak" id="peak"><b>最高网格</b><strong>50,299 人</strong><span>每 1 km²</span></div>
		<p class="source" id="stats">正在读取本地人口字段…</p>
		<div class="fallback" id="fallback" hidden>
			<h2>东西向列峰剖面 · 峰值 50,299 人</h2>
			<canvas id="fallbackChart" width="900" height="390"></canvas>
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
  <file path="samples/3d/population-mountains/mini/pages/assets/page.css">
```css
:root{
  --bg:#f7f7f7;--text:#282828;
  --muted:#5a4e52;--rule:#d0cccc;--hot:#e14018;--focus:#772521;
  --font-sans:"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif
}
#stage{position:fixed;transition:none}
.copy{
  position:absolute;z-index:5;top:58px;left:32px;width:260px;padding:18px;
  background:#fff;border:1px solid var(--rule);border-radius:5px;
  box-shadow:0 3px 3px 1px rgba(0,0,0,.11)
}
.copy h1{margin:0 0 13px;color:var(--hot);font-size:40px;font-weight:400;line-height:1.15;letter-spacing:-.035em}
.lead{color:var(--muted);font-size:16px;line-height:1.7}.lead strong{font-weight:600}
h2{margin:0 0 6px;color:#333;font-size:20px;font-weight:500;line-height:1.4}
nav{display:flex;margin-top:24px}
button{
  flex:1;margin-left:-1px;padding:5px 7px;border:1px solid #c7c7c7;background:#fff;
  color:var(--muted);font:400 13px/1.5 var(--font-sans);cursor:pointer
}
button:first-child{margin-left:0;border-radius:5px 0 0 5px}
button:last-child{border-radius:0 5px 5px 0}
button[aria-pressed=true]{background:#f5f5f5;box-shadow:inset 0 3px 5px rgba(0,0,0,.125);color:var(--text);font-weight:500}
.scene{position:absolute;inset:0;overflow:hidden}#gl{z-index:1}
.legend{position:absolute;z-index:3;top:62px;right:58px;width:232px;color:var(--muted);font-size:13px}
.legend b{display:block;margin-bottom:11px;color:var(--text)}
.legend i{display:block;height:8px;background:linear-gradient(90deg,#fbeee0,#f3ba7c 20%,#f32020 45%,#830707 72%,#4b0707)}
.legend span{display:flex;justify-content:space-between;margin-top:7px}.legend em{font-style:normal}
.peak{position:absolute;z-index:3;left:1405px;top:200px;width:148px;padding:10px 12px;background:rgba(255,255,255,.94);border:1px solid var(--rule);pointer-events:none;transition:left 1.35s ease-out,top 1.35s ease-out}
.scene[data-view=profile] .peak{left:1405px;top:200px}
.peak b,.peak span{display:block;color:var(--muted);font-size:13px}
.peak strong{display:block;margin:3px 0;color:var(--hot);font-size:20px}
.source{position:absolute;z-index:3;left:42px;bottom:27px;color:var(--muted);font-size:13px}
.fallback{position:absolute;z-index:8;inset:145px 70px 90px 430px;padding:38px;background:#efefef}
.fallback canvas{width:100%;height:390px}
```
  </file>
  <file path="samples/3d/population-mountains/mini/pages/assets/page.js">
```javascript
(() => {
	"use strict";
	const data = window.POPULATION_DATA;
	const byId = id => document.getElementById(id);
	const host = byId("scene");
	const canvas = byId("gl");
	const nav = document.querySelector("nav");
	const viewButtons = [...nav.querySelectorAll("[data-view]")];
	let renderer,scene,camera,target,views;
	let animationFrame,stopResize;
	function chooseView(name) {
		host.dataset.view = name;
		viewButtons.forEach(button =>
			button.setAttribute("aria-pressed", button.dataset.view === name));
	}
	function moveTo(name, immediate = false) {
		if (!views?.[name]) return;
		chooseView(name);
		cancelAnimationFrame(animationFrame);
		const view = views[name];
		const fromPosition = camera.position.clone();
		const fromUp = camera.up.clone();
		const fromTarget = target.clone();
		const startTime = performance.now();
		const duration = immediate || Deck.reduced() ? 0 : 1350;
		function tick(now) {
			const progress = duration ? Math.min(1, (now - startTime) / duration) : 1;
			const eased = 1 - (1 - progress) ** 3;
			camera.position.lerpVectors(fromPosition, view.position, eased);
			camera.up.lerpVectors(fromUp, view.up, eased).normalize();
			target.lerpVectors(fromTarget, view.target, eased);
			camera.lookAt(target);
			renderer.render(scene, camera);
			if (progress < 1) animationFrame = requestAnimationFrame(tick);
		}
		tick(startTime);
	}
	function resize() {
		renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
		renderer.setSize(host.clientWidth, host.clientHeight, false);
		camera.aspect = host.clientWidth / host.clientHeight;
		camera.updateProjectionMatrix();
		renderer.render(scene, camera);
	}
	function showFallback() {
		chooseView("profile");
		[canvas, byId("peak"), document.querySelector(".legend")]
			.forEach(element => { element.hidden = true; });
		byId("fallback").hidden = false;
		if (!data) {
			byId("stats").textContent = "本地人口字段无法读取";
			return;
		}
		const columns = Array(data.sourceWindow.width).fill(0);
		data.cells.forEach(([, column, , population]) =>
			columns[column] = Math.max(columns[column], population));
		const context = byId("fallbackChart").getContext("2d");
		context.fillStyle = "#f3ba7c";
		columns.forEach((population, column) =>
			context.fillRect(9.2 * column, 360 - population / 155, 7.8, population / 155));
		context.fillStyle = "#e14018";
		context.fillRect(9.2 * data.peak.column, 360 - data.maxPopulation / 155, 7.8, data.maxPopulation / 155);
	}
	function dispose() {
		cancelAnimationFrame(animationFrame);
		stopResize?.();
		nav.onclick = null;
		scene?.traverse(object => {
			object.geometry?.dispose();
			[].concat(object.material || []).forEach(material => material.dispose());
		});
		renderer?.dispose();
		renderer?.forceContextLoss?.();
	}
	function addPopulation() {
		const centerX = (data.sourceWindow.width - 1) / 2;
		const centerZ = (data.sourceWindow.height - 1) / 2;
		const geometry = new THREE.BoxGeometry(.88, 1, .88);
		const material = new THREE.MeshStandardMaterial({ roughness:.78 });
		const transform = new THREE.Object3D();
		const color = new THREE.Color();
		const stops = [
			[4, new THREE.Color(0xfbeee0)], [1000, new THREE.Color(0xf3ba7c)],
			[6000, new THREE.Color(0xf32020)], [20000, new THREE.Color(0x830707)],
			[40000, new THREE.Color(0x4b0707)]
		];
		function populationColor(value) {
			const upperIndex = stops.findIndex(([limit]) => value <= limit);
			if (upperIndex < 0) return color.copy(stops.at(-1)[1]);
			if (upperIndex === 0) return color.copy(stops[0][1]);
			const lower = stops[upperIndex - 1];
			const upper = stops[upperIndex];
			const amount = (value - lower[0]) / (upper[0] - lower[0]);
			return color.copy(lower[1]).lerp(upper[1], amount);
		}
		const mesh = new THREE.InstancedMesh(geometry, material, data.cells.length);
		data.cells.forEach(([, column, row, population], index) => {
			const height = population / 2500;
			transform.position.set(column - centerX, height / 2, row - centerZ);
			transform.scale.set(1, height, 1);
			transform.updateMatrix();
			mesh.setMatrixAt(index, transform.matrix);
			mesh.setColorAt(index, populationColor(population));
		});
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		scene.add(mesh);
	}
	function init() {
		if (data) {
			byId("stats").textContent = `GHS-POP 2020　${data.cellCount.toLocaleString("zh-CN")} 个网格　区域合计 ${data.totalPopulation.toLocaleString("zh-CN")} 人`;
		}
		if (!data || !window.THREE) return showFallback();
		try {
			renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
		} catch {
			return showFallback();
		}
		renderer.setClearColor(0xf7f7f7);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(32, 1, .1, 400);
		target = new THREE.Vector3();
		const fill = new THREE.HemisphereLight(0xf6f8f8, 0x76868b, 1.7);
		const key = new THREE.DirectionalLight(0xffffff, 2.7);
		key.position.set(-62, 105, 68);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		Object.assign(key.shadow.camera, { left:-80, right:80, top:80, bottom:-80, near:1, far:240 });
		key.shadow.bias = -.00035;
		scene.add(fill, key);
		const width = data.sourceWindow.width;
		const height = data.sourceWindow.height;
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(width + 10, height + 10),
			new THREE.MeshStandardMaterial({ color:0xf2f0ed })
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -.07;
		ground.receiveShadow = true;
		const grid = new THREE.GridHelper(width + 10, 10, 0xa8a5a5, 0xd7d3d3);
		grid.scale.z = (height + 10) / (width + 10);
		grid.position.y = -.03;
		scene.add(ground, grid);
		addPopulation();
		const makeView = (position, up, focus) => ({
			position:new THREE.Vector3(...position),
			up:new THREE.Vector3(...up),
			target:new THREE.Vector3(...focus)
		});
		views = {
			top:makeView([0,160,.01], [0,0,-1], [0,0,0]),
			profile:makeView([105,34,122], [0,1,0], [0,6,0])
		};
		stopResize = Deck.onResize(resize);
		resize();
		moveTo(Deck.reduced() ? "profile" : "top", true);
	}
	nav.onclick = event => {
		const button = event.target.closest("button");
		if (button?.dataset.view) moveTo(button.dataset.view);
		if (button?.hasAttribute("data-reset")) moveTo("top");
	};
	window.addEventListener("pagehide", dispose, { once:true });
	init();
})();
```
  </file>
</sample>
