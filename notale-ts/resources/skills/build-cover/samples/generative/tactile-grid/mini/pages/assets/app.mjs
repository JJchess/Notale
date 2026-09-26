import * as THREE from "three";

const WIDTH = 1600;
const HEIGHT = 900;
const GRID_SIZE = 40;
const SEED = 9137;
const stage = document.querySelector("#stage");
const canvas = document.querySelector("#webgl");
const fallback = document.querySelector("#fallback");
const reduced = Deck.reduced();
const listeners = new AbortController();

Deck.init({ title: "触觉界面", keys: false });

function seededCenter() {
	let state = SEED;
	const random = () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4294967296;
	};
	return [(random() - .5) * 12, (random() - .5) * 7];
}

function showFallback() {
	document.documentElement.classList.add("webgl-fallback");
	const [centerX, centerZ] = seededCenter();
	let pins = "";
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let column = 0; column < GRID_SIZE; column++) {
			const x = (column - 19.5) * .82;
			const z = (row - 19.5) * .82;
			if (Math.abs(x) > 8.2 || Math.abs(z) > 4.8) continue;
			const phase = Math.hypot(x - centerX, z - centerZ) - .82 * 6;
			const height = Math.cos(phase * 1.25) * Math.exp(-phase * phase / 7) * .48;
			const blue = Math.min(1, Math.max(0, height / .48));
			const mix = (base, high) => Math.round(base + (high - base) * blue);
			const left = Math.max(0, 800 + x * 103 - 39);
			const top = Math.max(0, 450 + z * 103 - 39);
			const width = Math.min(1600, 800 + x * 103 + 39) - left;
			const heightPx = Math.min(900, 450 + z * 103 + 39) - top;
			pins += `<rect x="${left}" y="${top}" width="${width}" height="${heightPx}" ` +
				`fill="rgb(${mix(244, 7)} ${mix(244, 94)} ${mix(242, 232)})"/>`;
		}
	}
	fallback.innerHTML = `<g stroke="#6b6b6b" stroke-width=".35">${pins}</g>`;
}

let renderer;
try {
	renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
	showFallback();
}

if (renderer) start(renderer);

function start(renderer) {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color("#858585");
	const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, .1, 120);
	camera.position.set(0, 12, 0);
	camera.up.set(0, 0, -1);
	camera.lookAt(0, 0, 0);

	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.35;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	const ambient = new THREE.AmbientLight("#ffffff", .8);
	const key = new THREE.DirectionalLight("#ffffff", 3.2);
	const fill = new THREE.DirectionalLight("#dbe4ff", 1.3);
	key.position.set(-18, 24, 12);
	fill.position.set(16, 10, -12);
	key.castShadow = true;
	key.shadow.mapSize.set(1024, 1024);
	Object.assign(key.shadow.camera, {
		near: 1, far: 80, left: -24, right: 24, top: 24, bottom: -24
	});
	key.shadow.bias = -.0003;
	key.shadow.radius = 4;
	scene.add(ambient, key, fill);

	const waveData = new Float32Array(4);
	const waveTexture = new THREE.DataTexture(waveData, 1, 1, THREE.RGBAFormat, THREE.FloatType);
	waveTexture.needsUpdate = true;
	const waveUniforms = {
		uWaveTexture: { value: waveTexture },
		uColorBase: { value: new THREE.Color("#f4f4f2") },
		uColorHigh: { value: new THREE.Color("#075ee8") }
	};
	const vertexHeader = `#include <common>
varying float vHeight;
attribute vec2 aGrid;
uniform sampler2D uWaveTexture;`;
	const vertexWave = `#include <begin_vertex>
vec4 wave = texture2D(uWaveTexture, vec2(.5));
float phase = distance(aGrid, wave.xy) - wave.z * 6.;
float envelope = exp(-phase * phase / 7.);
vHeight = cos(phase * 1.25) * envelope * wave.w * .48;
if (position.y > 0.) transformed.y += vHeight;`;
	const fragmentHeader = `#include <common>
varying float vHeight;
uniform vec3 uColorBase, uColorHigh;`;
	const fragmentColor = `#include <color_fragment>
diffuseColor.rgb = mix(uColorBase, uColorHigh, clamp(vHeight / .48, 0., 1.));`;

	function injectWaveShader(shader, colorByHeight) {
		Object.assign(shader.uniforms, waveUniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", vertexHeader)
			.replace("#include <begin_vertex>", vertexWave);
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", colorByHeight ? fragmentHeader :
				"#include <common>\nvarying float vHeight;");
		if (colorByHeight) shader.fragmentShader = shader.fragmentShader
			.replace("#include <color_fragment>", fragmentColor);
	}

	const geometry = new THREE.BoxGeometry(.76, 2.8, .76);
	const offsets = new THREE.InstancedBufferAttribute(new Float32Array(GRID_SIZE * GRID_SIZE * 2), 2);
	geometry.setAttribute("aGrid", offsets);
	const material = new THREE.MeshPhongMaterial({ color: "#ffffff", shininess: 38 });
	const depthMaterial = new THREE.MeshDepthMaterial();
	material.onBeforeCompile = shader => injectWaveShader(shader, true);
	depthMaterial.onBeforeCompile = shader => injectWaveShader(shader, false);
	const pins = new THREE.InstancedMesh(geometry, material, GRID_SIZE * GRID_SIZE);
	const pin = new THREE.Object3D();
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let column = 0; column < GRID_SIZE; column++) {
			const index = row * GRID_SIZE + column;
			const x = (column - 19.5) * .82;
			const z = (row - 19.5) * .82;
			pin.position.set(x, 0, z);
			pin.updateMatrix();
			pins.setMatrixAt(index, pin.matrix);
			offsets.setXY(index, x, z);
		}
	}
	offsets.needsUpdate = true;
	pins.instanceMatrix.needsUpdate = true;
	pins.castShadow = true;
	pins.receiveShadow = true;
	pins.customDepthMaterial = depthMaterial;
	scene.add(pins);

	const raycaster = new THREE.Raycaster();
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
	const hit = new THREE.Vector3();
	const pointer = new THREE.Vector2();

	function setWave(x, z, representative = reduced) {
		waveData.set([Deck.clamp(x, -16, 16), Deck.clamp(z, -16, 16), representative ? .82 : 0, 1]);
		waveTexture.needsUpdate = true;
		if (reduced) renderer.render(scene, camera);
	}

	function reset() {
		const [x, z] = seededCenter();
		setWave(x, z, reduced);
	}

	stage.addEventListener("pointerdown", event => {
		const point = Deck.pt(stage, event);
		pointer.set(point.x / WIDTH * 2 - 1, 1 - point.y / HEIGHT * 2);
		raycaster.setFromCamera(pointer, camera);
		if (raycaster.ray.intersectPlane(plane, hit)) setWave(hit.x, hit.z);
		stage.focus({ preventScroll: true });
	}, { signal: listeners.signal });
	document.addEventListener("keydown", event => {
		if (event.key.toLowerCase() === "r") reset();
		else if (event.key === "Enter" && document.activeElement === stage) {
			event.preventDefault();
			setWave(0, 0);
		}
	}, { signal: listeners.signal });

	function resize() {
		renderer.setPixelRatio(Math.min(devicePixelRatio * Deck.s, 2));
		renderer.setSize(WIDTH, HEIGHT, false);
		if (reduced) renderer.render(scene, camera);
	}

	function renderFrame(_time, deltaMilliseconds) {
		if (!reduced) {
			waveData[2] = Math.min(6, waveData[2] + Math.min(deltaMilliseconds, 50) / 1000);
			waveTexture.needsUpdate = true;
		}
		renderer.render(scene, camera);
	}

	resize();
	reset();
	const stopResize = Deck.onResize(resize);
	const stopLoop = Deck.loop(renderFrame, { still: 820 });

	window.addEventListener("pagehide", () => {
		stopLoop();
		stopResize();
		listeners.abort();
		waveTexture.dispose();
		geometry.dispose();
		material.dispose();
		depthMaterial.dispose();
		renderer.renderLists.dispose();
		renderer.dispose();
		renderer.forceContextLoss();
	}, { signal: listeners.signal, once: true });
}
