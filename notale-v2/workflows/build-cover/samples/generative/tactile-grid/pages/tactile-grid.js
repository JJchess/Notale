import * as THREE from "three";
import {EffectComposer} from "./media/three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "./media/three/examples/jsm/postprocessing/RenderPass.js";
import {ShaderPass} from "./media/three/examples/jsm/postprocessing/ShaderPass.js";
import {OutputPass} from "./media/three/examples/jsm/postprocessing/OutputPass.js";

const WIDTH = 1600;
const HEIGHT = 900;
const GRID_SIZE = 40;
const TRAIL_CAPACITY = 128;
const INITIAL_SEED = 9137;
const canvas = document.querySelector("canvas");
const stage = document.querySelector("main");
const reducedMotion = Deck.reduced();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: true});
} catch {
  showWebGLFallback();
}
if (renderer) start(renderer);

function showWebGLFallback() {
  document.documentElement.classList.add("webgl-fallback");
  const state = () => ({trail: 0, seed: INITIAL_SEED, auto: 0, renderer: null});
  const destroy = () => {
    removeEventListener("pagehide", destroy);
    if (window.__TACTILE__ === publicApi) delete window.__TACTILE__;
  };
  const publicApi = {reset() {}, destroy, state};
  window.__TACTILE__ = publicApi;
  addEventListener("pagehide", destroy);
}

function start(renderer) {
  let seed = INITIAL_SEED;
  let trailPoints = [];
  let lastPointerPoint;
  let targetX = 0;
  let targetY = 0;
  let cameraX = 0;
  let cameraY = 0;
  let idleTime = 0;
  let autoMode = 1;
  let autoTime = 0;
  let disposed = false;
  let keyboardX = 0;
  let keyboardZ = 0;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor("#808080");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#fff").multiplyScalar(.5);
  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, .1, 200);

  const ambientLight = new THREE.AmbientLight("#fff", .5);
  const keyLight = new THREE.DirectionalLight("#fff", 4);
  const fillLight = new THREE.DirectionalLight("#fff", 1);
  keyLight.position.set(-20, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, {
    near: .1,
    far: 60,
    left: -22,
    right: 22,
    top: 22,
    bottom: -22,
  });
  keyLight.shadow.bias = .0001;
  keyLight.shadow.radius = 6;
  fillLight.position.set(10, 5, -3);
  scene.add(ambientLight, keyLight, fillLight);

  const trailData = new Float32Array(TRAIL_CAPACITY * 4);
  const trailTexture = new THREE.DataTexture(
    trailData,
    TRAIL_CAPACITY,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  trailTexture.needsUpdate = true;
  const waveUniforms = {
    uTrailTexture: {value: trailTexture},
    uTrailCount: {value: 0},
    uFadeTime: {value: 2},
    uWaveSpeed: {value: 6},
    uWaveFreq: {value: 1.2},
    uWaveWidth: {value: 3},
    uAmplitude: {value: .4},
    uJitter: {value: .2},
    uMaxHeight: {value: .4},
    uColorBase: {value: new THREE.Color("#fff")},
    uColorHigh: {value: new THREE.Color("#0055ff")},
  };

  const waveVertexHeader = `#include <common>
varying float vHeight;
attribute vec2 aOffset;
uniform sampler2D uTrailTexture;
uniform int uTrailCount;
uniform float uWaveSpeed, uWaveFreq, uWaveWidth, uFadeTime;
uniform float uAmplitude, uJitter, uMaxHeight;

vec2 hash2(vec2 point) {
  point = vec2(
    dot(point, vec2(127.1, 311.7)),
    dot(point, vec2(269.5, 183.3))
  );
  return fract(sin(point) * 43758.5453123) - .5;
}`;
  const waveVertexPosition = `#include <begin_vertex>
vHeight = 0.;
if (position.y > 0.) {
  vec2 samplePosition = aOffset + hash2(aOffset) * uJitter;
  float heightSum = 0.;
  float weightSum = 0.;
  for (int index = 0; index < uTrailCount; index++) {
    vec4 trailPoint = texture2D(
      uTrailTexture,
      vec2((float(index) + .5) / 128., .5)
    );
    float distanceToPoint = length(samplePosition - trailPoint.rg);
    float waveRadius = distanceToPoint - uWaveSpeed * trailPoint.b;
    float waveEnvelope = exp(
      -waveRadius * waveRadius / (uWaveWidth * uWaveWidth)
    );
    float timeFade = exp(-trailPoint.b / uFadeTime);
    float distanceFade = 1. / (1. + distanceToPoint * .1);
    float weight = timeFade * waveEnvelope * distanceFade * trailPoint.a;
    heightSum += weight * cos(uWaveFreq * waveRadius);
    weightSum += weight;
  }
  heightSum /= max(weightSum, 1.);
  float displacement = clamp(
    heightSum * uAmplitude,
    -uMaxHeight,
    uMaxHeight
  );
  transformed.y += displacement;
  vHeight = displacement;
}`;
  const waveFragmentHeader = `#include <common>
varying float vHeight;
uniform vec3 uColorBase, uColorHigh;
uniform float uMaxHeight;`;
  const waveFragmentColor = `#include <color_fragment>
diffuseColor.rgb = mix(
  uColorBase,
  uColorHigh,
  clamp(vHeight / uMaxHeight, 0., 1.)
);`;

  function injectWaveShader(shader, colorByHeight) {
    Object.assign(shader.uniforms, waveUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", waveVertexHeader)
      .replace("#include <begin_vertex>", waveVertexPosition);
    if (!colorByHeight) return;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", waveFragmentHeader)
      .replace("#include <color_fragment>", waveFragmentColor);
  }

  const pinGeometry = new THREE.BoxGeometry(.8, 3, .8);
  const pinOffsets = new THREE.InstancedBufferAttribute(
    new Float32Array(GRID_SIZE * GRID_SIZE * 2),
    2,
  );
  pinGeometry.setAttribute("aOffset", pinOffsets);
  const pinMaterial = new THREE.MeshPhongMaterial({color: "#fff"});
  const pinDepthMaterial = new THREE.MeshDepthMaterial();
  pinMaterial.onBeforeCompile = shader => injectWaveShader(shader, true);
  pinDepthMaterial.onBeforeCompile = shader => injectWaveShader(shader, false);

  const pinGrid = new THREE.InstancedMesh(
    pinGeometry,
    pinMaterial,
    GRID_SIZE * GRID_SIZE,
  );
  const pin = new THREE.Object3D();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let column = 0; column < GRID_SIZE; column++) {
      const index = row * GRID_SIZE + column;
      const x = row * .81 - 15.795;
      const z = column * .81 - 15.795;
      pin.position.set(x, 0, z);
      pin.updateMatrix();
      pinGrid.setMatrixAt(index, pin.matrix);
      pinOffsets.setXY(index, x, z);
    }
  }
  pinOffsets.needsUpdate = true;
  pinGrid.instanceMatrix.needsUpdate = true;
  pinGrid.castShadow = true;
  pinGrid.receiveShadow = true;
  pinGrid.customDepthMaterial = pinDepthMaterial;
  scene.add(pinGrid);

  const tactilePostEffect = {
    uniforms: {
      tDiffuse: {value: null},
      shiftAmount: {value: .005},
      vignetteRadius: {value: .3},
      vignetteSoftness: {value: .3},
    },
    vertexShader: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`,
    fragmentShader: `uniform sampler2D tDiffuse;
uniform float shiftAmount, vignetteRadius, vignetteSoftness;
varying vec2 vUv;

void main() {
  vec2 center = vec2(.5);
  float distanceFromCenter = distance(vUv, center);
  float vignette = smoothstep(
    vignetteRadius,
    vignetteRadius + vignetteSoftness,
    distanceFromCenter
  );
  float shift = shiftAmount * vignette;
  vec2 direction = vec2(sign(vUv.x - .5), sign(vUv.y - .5)) * shift;
  vec3 shiftedColor = vec3(
    texture2D(tDiffuse, vUv + direction).r,
    texture2D(tDiffuse, vUv).g,
    texture2D(tDiffuse, vUv - direction).b
  );
  gl_FragColor = vec4(shiftedColor * (1. - vignette * .5), 1.);
}`,
  };
  const composer = new EffectComposer(renderer);
  const scenePass = new RenderPass(scene, camera);
  const tactilePass = new ShaderPass(tactilePostEffect);
  const outputPass = new OutputPass();
  composer.addPass(scenePass);
  composer.addPass(tactilePass);
  composer.addPass(outputPass);

  function nextRandom() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }

  function addTrailPoint(x, z, amplitude = .9) {
    if (trailPoints.length === TRAIL_CAPACITY) trailPoints.shift();
    trailPoints.push({
      x,
      z,
      age: reducedMotion ? .55 : 0,
      amplitude,
    });
  }

  function reset() {
    if (disposed) return;
    seed = INITIAL_SEED;
    trailPoints = [];
    lastPointerPoint = null;
    targetX = 0;
    targetY = 0;
    cameraX = 0;
    cameraY = 0;
    idleTime = 0;
    autoTime = 0;
    keyboardX = 0;
    keyboardZ = 0;
    autoMode = 1;
    if (reducedMotion) {
      addTrailPoint(-4, 3);
      addTrailPoint(4, -2);
    }
    renderFrame(0, 0);
  }

  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const intersection = new THREE.Vector3();
  const pointer = new THREE.Vector2();

  function addPointerWave(event) {
    const position = Deck.pt(canvas, event);
    targetX = position.x / WIDTH * 2 - 1;
    targetY = 1 - position.y / HEIGHT * 2;
    pointer.set(targetX, targetY);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(interactionPlane, intersection)) return;

    const distance = lastPointerPoint
      ? Math.hypot(intersection.x - lastPointerPoint.x, intersection.z - lastPointerPoint.z)
      : 0;
    if (lastPointerPoint && distance < .1) return;
    addTrailPoint(intersection.x, intersection.z, distance);
    lastPointerPoint = {x: intersection.x, z: intersection.z};
    idleTime = 0;
    autoTime = 0;
    autoMode = 0;
    if (reducedMotion) renderFrame(0, 0);
  }

  function handlePointerDown(event) {
    stage.focus();
    addPointerWave(event);
  }
  canvas.addEventListener("pointermove", addPointerWave);
  canvas.addEventListener("pointerdown", handlePointerDown);

  function handleKeydown(event) {
    if (event.key.toLowerCase() === "r") {
      reset();
      return;
    }
    const step = 1.62;
    let addWave = false;
    if (event.key === "ArrowLeft") keyboardX -= step;
    else if (event.key === "ArrowRight") keyboardX += step;
    else if (event.key === "ArrowUp") keyboardZ -= step;
    else if (event.key === "ArrowDown") keyboardZ += step;
    else if (event.key === "Enter" || event.key === " ") addWave = true;
    else return;

    keyboardX = THREE.MathUtils.clamp(keyboardX, -16, 16);
    keyboardZ = THREE.MathUtils.clamp(keyboardZ, -16, 16);
    targetX = keyboardX / 16;
    targetY = -keyboardZ / 16;
    if (addWave) {
      addTrailPoint(keyboardX, keyboardZ);
      idleTime = 0;
      autoTime = 0;
      autoMode = 0;
    }
    event.preventDefault();
    if (reducedMotion) renderFrame(0, 0);
  }
  stage.addEventListener("keydown", handleKeydown);

  function uploadTrailTexture() {
    const count = Math.min(trailPoints.length, TRAIL_CAPACITY);
    for (let index = 0; index < count; index++) {
      const point = trailPoints[index];
      const offset = index * 4;
      trailData[offset] = point.x;
      trailData[offset + 1] = point.z;
      trailData[offset + 2] = point.age;
      trailData[offset + 3] = point.amplitude;
    }
    trailTexture.needsUpdate = true;
    waveUniforms.uTrailCount.value = count;
  }

  function updateCamera() {
    cameraX += (targetX - cameraX) * .04;
    cameraY += (targetY - cameraY) * .04;
    const pitch = cameraY * Math.PI * .03;
    const yaw = cameraX * Math.PI * .05;
    camera.position.set(
      -12 * Math.cos(pitch) * Math.sin(yaw),
      12 * Math.cos(pitch) * Math.cos(yaw),
      12 * Math.sin(pitch),
    );
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  }

  function renderFrame(_elapsed, deltaMilliseconds) {
    const delta = deltaMilliseconds / 1000;
    if (!reducedMotion) {
      for (let index = trailPoints.length - 1; index >= 0; index--) {
        trailPoints[index].age += delta;
        if (trailPoints[index].age > 8) trailPoints.splice(index, 1);
      }
      idleTime += delta;
      if (idleTime >= 3 && !autoMode) {
        autoMode = 1;
        autoTime = 0;
      }
      autoTime += autoMode ? delta : 0;
      if (autoMode && autoTime >= 1.5) {
        addTrailPoint(
          (nextRandom() * .5 - .25) * 32.4,
          (nextRandom() * .5 - .25) * 32.4,
          .8 + nextRandom() * .2,
        );
        autoTime = 0;
      }
    }
    uploadTrailTexture();
    updateCamera();
    composer.render();
  }

  function resizeRenderer() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(WIDTH, HEIGHT, false);
    composer.setSize(WIDTH, HEIGHT);
    camera.aspect = WIDTH / HEIGHT;
    camera.updateProjectionMatrix();
  }

  resizeRenderer();
  const removeResize = Deck.onResize(resizeRenderer);
  const stopLoop = Deck.loop(renderFrame, {still: 1800});
  if (reducedMotion) reset();
  else {
    gsap.fromTo(
      ".intro",
      {opacity: 0, y: 20},
      {duration: 1, opacity: 1, y: 0, stagger: .1, ease: "power3.out", delay: .5},
    );
  }
  Deck.init({keys: false});

  function destroy() {
    if (disposed) return;
    disposed = true;
    removeEventListener("pagehide", destroy);
    stopLoop();
    removeResize();
    canvas.removeEventListener("pointermove", addPointerWave);
    canvas.removeEventListener("pointerdown", handlePointerDown);
    stage.removeEventListener("keydown", handleKeydown);
    gsap.killTweensOf(".intro");
    trailTexture.dispose();
    pinGeometry.dispose();
    pinMaterial.dispose();
    pinDepthMaterial.dispose();
    tactilePass.dispose();
    outputPass.dispose();
    composer.dispose();
    renderer.dispose();
    if (window.__TACTILE__ === publicApi) delete window.__TACTILE__;
  }

  const publicApi = {
    reset,
    destroy,
    state: () => ({
      trail: trailPoints.length,
      seed,
      auto: autoMode,
      renderer: renderer.info.render,
    }),
  };
  window.__TACTILE__ = publicApi;
  addEventListener("pagehide", destroy);
}
