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
