(() => {
	"use strict";
	const stage=document.querySelector("#stage");
	const canvas=document.querySelector("#gl");
	const cards=[...document.querySelectorAll(".surface")];
	const track=document.querySelector(".track");
	const detail=document.querySelector(".detail");
	const reduced=Deck.reduced();
	const controller=new AbortController();
	const textures=[];
	let renderer, camera, scene, geometry, material, mesh, uniforms, stopResize;
	let frame=0, current=0, hover=-1, detailIndex=-1;
	let scroll=0, targetScroll=0, released=false;
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
	function listen(target, type, handler) {
		target.addEventListener(type, handler, { signal:controller.signal });
	}
	function render(immediate=false, time=0) {
		if (!renderer || released) return;
		scroll=immediate ? targetScroll : scroll + .075 * (targetScroll - scroll);
		track.style.transform = `translate3d(${-scroll}px,0,0)`;
		const active = detailIndex >= 0;
		const targetX = active ? 370 : 400 + 480 * current;
		const targetY = active ? 450 : 375 + current % 2 * 72;
		const amount = immediate ? 1 : .09;
		const reveal = active || hover === current || reduced;
		mesh.position.x += (targetX - 800 - mesh.position.x) * amount;
		mesh.position.y += (450 - targetY - mesh.position.y) * amount;
		mesh.scale.x += ((active ? 520 : 360) - mesh.scale.x) * amount;
		mesh.scale.y += ((active ? 720 : 500) - mesh.scale.y) * amount;
		uniforms.progress.value += ((reveal ? 1 : 0) - uniforms.progress.value) * amount;
		uniforms.time.value = time * .001;
		renderer.render(scene, camera);
	}
	function animate(time) {
		render(false, time);
		frame = requestAnimationFrame(animate);
	}
	function select(index) {
		current = Deck.clamp(index, 0, 2);
		targetScroll = 0;
		stage.style.setProperty("--bg", cards[current].dataset.bg);
		stage.style.setProperty("--ink", cards[current].dataset.ink);
		cards.forEach((card, cardIndex) => card.toggleAttribute("aria-current", cardIndex === current));
		if (uniforms) {
			uniforms.surfaceTexture.value = textures[2 * current];
			uniforms.pathTexture.value = textures[2 * current + 1];
		}
		render(reduced);
	}
	function openDetail(index) {
		detailIndex = index;
		if (index < 0) {
			stage.classList.remove("on");
			cards[current].focus({preventScroll:true});
		} else {
			const card = cards[index];
			select(index);
			detail.querySelector("h2").textContent = card.querySelector("b").textContent;
			detail.querySelector("p").textContent = card.dataset.copy;
			stage.classList.add("on");
			detail.querySelector(".close").focus();
		}
	}
	function reset() {
		document.activeElement?.blur();
		detailIndex = hover = -1;
		scroll = targetScroll = 0;
		if (uniforms) uniforms.progress.value = 0;
		stage.classList.remove("on");
		select(0);
		render(true);
	}
	function release() {
		if (released) return;
		released = true;
		material?.dispose();
		textures.forEach(texture => texture.dispose());
		geometry?.dispose();
		renderer?.dispose();
		renderer?.forceContextLoss?.();
	}
	function dispose() {
		cancelAnimationFrame(frame);
		stopResize?.();
		controller.abort();
		release();
	}
	const loader=new THREE.TextureLoader();
	const urls = cards.flatMap(card => {
		const image = card.querySelector("img").src;
		return [image, image.replace(".svg", "-path.svg")];
	});
	const load=url => new Promise((resolve, reject) => {
		textures.push(loader.load(url, resolve, undefined, reject));
	});
	function fail() {
		release();
		stage.classList.add("fallback");
	}
	function resize() {
		if (!renderer) return;
		renderer.setPixelRatio(Deck.ratio());
		renderer.setSize(1600, 900, false);
		render(true);
	}
	Promise.all(urls.map(load)).then(() => {
		if (released) return;
		try {
			renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
			camera = new THREE.OrthographicCamera(-800, 800, 450, -450, 1, 20);
			camera.position.z = 5;
			geometry = new THREE.PlaneGeometry(1, 1);
			scene = new THREE.Scene();
			uniforms = {
				surfaceTexture:{ value:textures[0] }, pathTexture:{ value:textures[1] },
				progress:{ value:0 }, time:{ value:0 }, opacity:{ value:1 }, mouse:{ value:new THREE.Vector2(.5, .5) }
			};
			material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
			mesh = new THREE.Mesh(geometry, material);
			mesh.scale.set(360, 500, 1);
			scene.add(mesh);
			resize();
			stage.classList.add("ok");
			if (!reduced) frame = requestAnimationFrame(animate);
		} catch {
			fail();
		}
	}).catch(fail);
	cards.forEach((card, index) => {
		["mouseenter", "focus"].forEach(type =>
			listen(card, type, () => { hover = index; select(index); }));
		listen(card, "mouseleave", () => { hover = -1; render(reduced); });
		listen(card, "click", () => openDetail(index));
	});
	listen(document.querySelector(".close"), "click", () => openDetail(-1));
	listen(document.querySelector(".reset"), "click", reset);
	listen(document, "keydown", event => {
		if (event.key.toLowerCase() === "r") reset();
		else if (event.key === "Escape" && detailIndex >= 0) openDetail(-1);
		else if (detailIndex < 0 && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
			event.preventDefault();
			select(current + (event.key === "ArrowRight" ? 1 : -1));
			cards[current].focus();
		}
	});
	listen(window, "pagehide", dispose);
	stopResize = Deck.onResize(resize);
	select(0);
})();
