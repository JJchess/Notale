<sample id="gimbal" category="3d" variant="full">
  <file path="samples/3d/gimbal/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>陀螺仪为什么能保持方向？｜真实刚体演算</title>
  <link rel="stylesheet" href="assets/base.css">
</head>
<body>
  <main id="stage" aria-labelledby="page-title">
    <header class="topbar">
      <div>
        <h1 id="page-title">陀螺仪为什么能保持方向？</h1>
        <p class="claim"><strong>三个万向环让外壳绕着转子转动；高速自转让主轴难以偏离原方向。</strong> 姿态与读数来自三维刚体求解。</p>
      </div>
    </header>

    <section class="scene-panel" id="scene-host" aria-label="陀螺仪三维刚体仿真">
      <canvas id="scene-canvas" aria-label="外壳倾斜、万向环转动而高速转子轴接近原空间方向的三维仿真"></canvas>
      <div class="scene-head" aria-hidden="true"><span class="scene-status" id="scene-status">最终状态 · 4.70 s</span></div>
      <div class="phase-card" aria-live="polite"><div class="phase-kicker" id="phase-kicker">主轴偏移 1.5°</div><div class="phase-title" id="phase-title">外壳改变约 45°，主轴仍接近起始方向</div><div class="phase-copy" id="phase-copy">万向环隔离外壳姿态；较大的角动量减小同一角冲量造成的轴向偏移。</div></div>
      <div class="axis-tag" id="reference-tag"><small>起始方向 · 空间 +X</small>原主轴方向</div>
      <div class="axis-tag" id="current-tag"><small>当前方向 · 转子轴</small>演算后主轴</div>
      <div class="part-legend" aria-label="部件图例"><span class="part-chip"><b>X</b>外环</span><span class="part-chip"><b>Y</b>中环</span><span class="part-chip"><b>Z</b>内环</span><span class="part-chip"><b>S</b>转子</span></div>
      <div class="progress-track" aria-hidden="true"><div class="progress-fill" id="progress-fill"></div></div>
      <div class="loading" id="loading">正在求解刚体运动…</div>
      <div id="fallback" hidden>
        <svg viewBox="0 0 760 470" role="img" aria-label="倾斜外壳、三层万向环和保持方向的转子轴示意图"><g fill="none" stroke-linecap="round"><rect x="175" y="78" width="390" height="305" rx="12" transform="rotate(24 370 230)" stroke="#46565b" stroke-width="9" opacity=".65"/><ellipse cx="370" cy="230" rx="175" ry="145" stroke="#315e69" stroke-width="11" transform="rotate(18 370 230)"/><ellipse cx="370" cy="230" rx="112" ry="150" stroke="#718d8d" stroke-width="11" transform="rotate(-27 370 230)"/><ellipse cx="370" cy="230" rx="142" ry="66" stroke="#99928a" stroke-width="11" transform="rotate(57 370 230)"/><circle cx="370" cy="230" r="62" stroke="#c65a34" stroke-width="16"/><path d="M112 230H630" stroke="#c65a34" stroke-width="8"/><path d="M630 230l-24-14v28z" fill="#c65a34" stroke="none"/><path d="M112 245H630" stroke="#172326" stroke-width="2" stroke-dasharray="8 8" opacity=".65"/></g></svg>
        <div class="fallback-copy"><h2>外壳倾斜，主轴方向几乎不变</h2><p>三个旋转关节允许万向环逐层让位，转子不必跟随外壳。高速自转建立角动量 <strong>L = Iω</strong>，同一横向角冲量只造成较小的轴线偏移。</p></div>
      </div>
    </section>

    <aside class="evidence-panel" aria-label="仿真证据">
      <div class="panel-title">角动量越大，轴越难偏转</div>
      <div class="equation"><div class="equation-main">L = Iω</div><p>惯量相同，转速提高会增大角动量，减小同一横向角冲量造成的偏移。</p><div class="equation-condition">6 kg · 52 rad/s · 10 N·m × 0.70 s</div></div>
      <section class="comparison" aria-labelledby="comparison-title">
        <h2 id="comparison-title">同一力矩结束时</h2><div class="comparison-note"><span>同质量、同惯量，只改初始转速</span><b id="bar-scale">0–50°</b></div>
        <div class="compare-row spin"><div class="compare-top"><span>高速旋转</span><strong id="spin-drift">1.4°</strong></div><div class="bar"><i id="spin-bar" style="--value:2.82%"></i></div></div>
        <div class="compare-row still"><div class="compare-top"><span>停止旋转</span><strong id="still-drift">41.1°</strong></div><div class="bar"><i id="still-bar" style="--value:82.28%"></i></div></div>
      </section>
      <div class="metrics" aria-label="关键仿真结果"><div class="metric"><span>外壳姿态变化</span><strong id="housing-angle">45.0°</strong></div><div class="metric"><span>主转子轴偏移</span><strong id="main-drift">1.5°</strong></div></div>
      <div class="solver-note">1/240 s 固定步长 · 7 个刚体 · 4 个旋转关节</div>
    </aside>

    <nav class="controls" aria-label="命名视角与仿真控制">
      <button class="view-btn" type="button" data-view="independent" aria-pressed="true">独立姿态</button>
      <button class="view-btn" type="button" data-view="nested" aria-pressed="false">嵌套总览</button>
      <button class="view-btn" type="button" data-view="axes" aria-pressed="false">正交轴向</button>
      <button class="view-btn" type="button" data-view="exploded" aria-pressed="false">轴向爆炸</button>
      <span class="control-spacer" aria-hidden="true"></span>
      <button class="action-btn primary" id="play-button" type="button">重新演算</button><button class="action-btn" id="reset-button" type="button">复位</button>
    </nav>
  </main>
  <script src="assets/lib/three.min.js"></script>
  <script src="assets/base.js"></script>
  <script type="module" src="media/gimbal-sim.mjs"></script>
</body>
</html>
```
  </file>
  <file path="samples/3d/gimbal/pages/media/gimbal-physics.mjs">
```javascript
/**
 * Deterministic, renderer-independent rigid-body model for the gimbal page.
 *
 * The bodies have no colliders because this is an ideal, centred mechanism:
 * gravity is zero, every centre of mass is at the common pivot, the bearings
 * are frictionless, and all four constraints are revolute joints. Rapier still
 * solves the complete coupled 3D rotational dynamics; the two detached probe
 * bodies provide a controlled comparison for the same world-space impulse.
 */

const { freeze } = Object;

export const PHYSICS = freeze({
  timestep: 1 / 240,
  rotorSpin: 52,
  disturbanceTorque: 10,
  housingStartStep: 180,
  housingEndStep: 660,
  torqueStartStep: 840,
  torqueEndStep: 1008,
  finalStep: 1128,
  visibleBodyCount: 5,
  probeBodyCount: 2,
  revoluteJointCount: 4
});

const RINGS = freeze({
  outer: { mass: 2.4, radius: 2.62, normal: 'z' },
  middle: { mass: 2.0, radius: 2.16, normal: 'x' },
  inner: { mass: 1.7, radius: 1.70, normal: 'y' }
});

export const ROTOR_PARTS = freeze({
  rim: freeze({ mass: 4.4, majorRadius: 1.08, tubeRadius: 0.18 }),
  spokes: freeze({ count: 4, massEach: 0.1, x: 0.12, y: 1.84, z: 0.08 }),
  hub: freeze({ mass: 0.7, radius: 0.29, length: 0.62 }),
  shaft: freeze({ mass: 0.5, radius: 0.075, length: 4.05 })
});

const VISIBLE_BODY_KEYS = freeze(['housing', 'outer', 'middle', 'inner', 'rotor']);
const ZERO = freeze({ x: 0, y: 0, z: 0 });
const IDENTITY = freeze({ x: 0, y: 0, z: 0, w: 1 });
const AXIS = freeze({
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 }
});

function thinRingInertia({ mass, radius, normal }) {
  const normalMoment = mass * radius * radius;
  const diameterMoment = normalMoment / 2;
  const inertia = { x: diameterMoment, y: diameterMoment, z: diameterMoment };
  inertia[normal] = normalMoment;
  return freeze(inertia);
}

function cylinderInertia(mass, radius, length) {
  return { axial: 0.5 * mass * radius ** 2, transverse: mass * (3 * radius ** 2 + length ** 2) / 12 };
}

/** Derive the rotor tensor from the exact primitives drawn by gimbal-sim.mjs. */
export function deriveRotorModel(parts = ROTOR_PARTS) {
  const { rim, spokes, hub, shaft } = parts;
  const rimAxial = rim.mass * (
    rim.majorRadius * rim.majorRadius + 0.75 * rim.tubeRadius * rim.tubeRadius
  );
  const rimTransverse = rim.mass * (
    0.5 * rim.majorRadius * rim.majorRadius + 0.625 * rim.tubeRadius * rim.tubeRadius
  );

  const spokeIx = spokes.massEach * (spokes.y * spokes.y + spokes.z * spokes.z) / 12;
  const spokeIy = spokes.massEach * (spokes.x * spokes.x + spokes.z * spokes.z) / 12;
  const spokeIz = spokes.massEach * (spokes.x * spokes.x + spokes.y * spokes.y) / 12;
  // Four bars are evenly distributed around X, so their summed Y/Z moments match.
  const spokeTransverse = spokes.count * (spokeIy + spokeIz) / 2;
  const hubI = cylinderInertia(hub.mass, hub.radius, hub.length);
  const shaftI = cylinderInertia(shaft.mass, shaft.radius, shaft.length);

  const mass = rim.mass + spokes.count * spokes.massEach + hub.mass + shaft.mass;
  const axial = rimAxial + spokes.count * spokeIx + hubI.axial + shaftI.axial;
  const transverse = rimTransverse + spokeTransverse + hubI.transverse + shaftI.transverse;
  return freeze({ mass, inertia: freeze({ x: axial, y: transverse, z: transverse }) });
}

function ringModel(spec) {
  return freeze({ mass: spec.mass, radius: spec.radius, inertia: thinRingInertia(spec) });
}

export const MODEL = freeze({
  rings: freeze({
    outer: ringModel(RINGS.outer),
    middle: ringModel(RINGS.middle),
    inner: ringModel(RINGS.inner)
  }),
  rotor: deriveRotorModel()
});

const torqueSteps = PHYSICS.torqueEndStep - PHYSICS.torqueStartStep;
const torqueDuration = torqueSteps * PHYSICS.timestep;
const angularImpulse = PHYSICS.disturbanceTorque * torqueDuration;
export const ANALYTIC = freeze({
  angularImpulse,
  torqueDuration,
  spinningDriftRadians: Math.atan(angularImpulse / (MODEL.rotor.inertia.x * PHYSICS.rotorSpin)),
  stillDriftRadians: 0.5 * PHYSICS.disturbanceTorque * torqueDuration ** 2 / MODEL.rotor.inertia.z
});

export function quaternionFromEulerXYZ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return freeze({
    x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3
  });
}

export const HOUSING_TARGET = quaternionFromEulerXYZ(0.48, -0.34, 0.62);

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function slerpIdentityInto(target, t, out) {
  const cosHalfTheta = clamp(target.w, -1, 1);
  const halfTheta = Math.acos(cosHalfTheta);
  if (halfTheta < 1e-12) {
    out.x = 0; out.y = 0; out.z = 0; out.w = 1;
    return out;
  }
  const sinHalfTheta = Math.sin(halfTheta);
  const targetScale = Math.sin(t * halfTheta) / sinHalfTheta;
  out.x = target.x * targetScale;
  out.y = target.y * targetScale;
  out.z = target.z * targetScale;
  out.w = Math.sin((1 - t) * halfTheta) / sinHalfTheta + target.w * targetScale;
  return out;
}

function axisXFromQuaternion(rotation, out) {
  const { x, y, z, w } = rotation;
  out.x = 1 - 2 * (y * y + z * z);
  out.y = 2 * (x * y + w * z);
  out.z = 2 * (x * z - w * y);
  return out;
}

function axisDriftRadians(body, scratchAxis) {
  axisXFromQuaternion(body.rotation(), scratchAxis);
  return Math.acos(clamp(scratchAxis.x, -1, 1));
}

function quaternionAngleRadians(rotation) { return 2 * Math.acos(clamp(Math.abs(rotation.w), -1, 1)); }

function primitiveTransform(body) {
  const p = body.translation();
  const q = body.rotation();
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] };
}

function bodyDescription(desc, mass, inertia, angularVelocity = null) {
  desc.setAdditionalMassProperties(mass, ZERO, inertia, IDENTITY).setAngularDamping(0);
  if (angularVelocity) desc.setAngvel(angularVelocity);
  return desc;
}

export class GimbalPhysics {
  constructor(RAPIER) {
    if (!RAPIER || !RAPIER.World) throw new TypeError('A ready Rapier module is required.');
    this.RAPIER = RAPIER;
    this.world = null;
    this.bodies = null;
    this.joints = [];
    this.stepIndex = 0;
    this._housingRotation = { x: 0, y: 0, z: 0, w: 1 };
    this._torqueImpulse = { x: 0, y: 0, z: PHYSICS.disturbanceTorque * PHYSICS.timestep };
    this._scratchAxis = { x: 1, y: 0, z: 0 };
    this._comparison = null;
    this.reset();
  }

  reset() {
    this.disposeWorld();
    const RAPIER = this.RAPIER;
    const world = new RAPIER.World(ZERO);
    world.timestep = PHYSICS.timestep;
    if (world.integrationParameters && 'numSolverIterations' in world.integrationParameters) {
      world.integrationParameters.numSolverIterations = 32;
    }

    const dynamicBody = (model, angularVelocity = null, x = 0) => world.createRigidBody(
      bodyDescription(RAPIER.RigidBodyDesc.dynamic(), model.mass, model.inertia, angularVelocity)
        .setTranslation(x, 0, 0)
    );
    const housing = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const outer = dynamicBody(MODEL.rings.outer);
    const middle = dynamicBody(MODEL.rings.middle);
    const inner = dynamicBody(MODEL.rings.inner);
    const initialSpin = { x: PHYSICS.rotorSpin, y: 0, z: 0 };
    const rotor = dynamicBody(MODEL.rotor, initialSpin);
    const spinProbe = dynamicBody(MODEL.rotor, initialSpin, 30);
    const stillProbe = dynamicBody(MODEL.rotor, null, 60);

    this.joints = [
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.x), housing, outer, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.y), outer, middle, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.z), middle, inner, true),
      world.createImpulseJoint(RAPIER.JointData.revolute(ZERO, ZERO, AXIS.x), inner, rotor, true)
    ];
    this.world = world;
    this.bodies = { housing, outer, middle, inner, rotor, spinProbe, stillProbe };
    this.stepIndex = 0;
    this._comparison = null;
    return this;
  }

  step() {
    if (!this.world) throw new Error('The physics world has been disposed.');
    const housingProgress = smoothstep(
      (this.stepIndex + 1 - PHYSICS.housingStartStep) /
      (PHYSICS.housingEndStep - PHYSICS.housingStartStep)
    );
    const rotation = slerpIdentityInto(HOUSING_TARGET, housingProgress, this._housingRotation);
    this.bodies.housing.setNextKinematicRotation(rotation);

    // Apply exactly 168 fixed-step impulses: 10 N·m × (1/240 s) = 7 N·m·s total.
    if (this.stepIndex >= PHYSICS.torqueStartStep && this.stepIndex < PHYSICS.torqueEndStep) {
      this.bodies.rotor.applyTorqueImpulse(this._torqueImpulse, true);
      this.bodies.spinProbe.applyTorqueImpulse(this._torqueImpulse, true);
      this.bodies.stillProbe.applyTorqueImpulse(this._torqueImpulse, true);
    }
    this.world.step();
    this.stepIndex += 1;
    if (this.stepIndex === PHYSICS.torqueEndStep) {
      this._comparison = {
        spinningDriftRadians: axisDriftRadians(this.bodies.spinProbe, this._scratchAxis),
        stillDriftRadians: axisDriftRadians(this.bodies.stillProbe, this._scratchAxis)
      };
    }
    return this.stepIndex;
  }

  runToStep(targetStep) {
    const numericTarget = Number(targetStep);
    const target = Number.isFinite(numericTarget)
      ? clamp(Math.round(numericTarget), 0, PHYSICS.finalStep)
      : 0;
    while (this.stepIndex < target) this.step();
    return this.snapshot();
  }

  metrics() {
    const { housing, rotor, spinProbe, stillProbe } = this.bodies;
    const rotorRotation = rotor.rotation();
    axisXFromQuaternion(rotorRotation, this._scratchAxis);
    const angularVelocity = rotor.angvel();
    const axialRadiansPerSecond =
      angularVelocity.x * this._scratchAxis.x +
      angularVelocity.y * this._scratchAxis.y +
      angularVelocity.z * this._scratchAxis.z;
    const comparison = this._comparison || {
      spinningDriftRadians: axisDriftRadians(spinProbe, this._scratchAxis),
      stillDriftRadians: axisDriftRadians(stillProbe, this._scratchAxis)
    };
    return {
      housingAngleRadians: quaternionAngleRadians(housing.rotation()),
      mainDriftRadians: axisDriftRadians(rotor, this._scratchAxis),
      spinningDriftRadians: comparison.spinningDriftRadians,
      stillDriftRadians: comparison.stillDriftRadians,
      rotorRpm: Math.abs(axialRadiansPerSecond) * 60 / (2 * Math.PI)
    };
  }

  snapshot() {
    const transforms = {};
    for (const key of VISIBLE_BODY_KEYS) transforms[key] = primitiveTransform(this.bodies[key]);
    const rotorAngularVelocity = this.bodies.rotor.angvel();
    return {
      stepIndex: this.stepIndex,
      time: this.stepIndex * PHYSICS.timestep,
      transforms,
      metrics: this.metrics(),
      rotorAngularVelocity: [rotorAngularVelocity.x, rotorAngularVelocity.y, rotorAngularVelocity.z]
    };
  }

  validationState() {
    const probeInertia = this.bodies.spinProbe.principalInertia();
    return {
      stepIndex: this.stepIndex,
      probeMass: this.bodies.spinProbe.mass(),
      probeInertia: [probeInertia.x, probeInertia.y, probeInertia.z],
      snapshot: this.snapshot()
    };
  }

  disposeWorld() {
    this.world?.free?.();
    this.world = null;
    this.bodies = null;
    this.joints = [];
  }

  dispose() { this.disposeWorld(); }
}
```
  </file>
  <file path="samples/3d/gimbal/pages/media/gimbal-sim.mjs">
```javascript
import {
  ANALYTIC,
  GimbalPhysics,
  MODEL,
  PHYSICS,
  ROTOR_PARTS
} from './gimbal-physics.mjs';

const loading = document.getElementById('loading');
const fallback = document.getElementById('fallback');

function fail(reason) {
  loading.hidden = true;
  fallback.hidden = false;
  fallback.dataset.reason = reason;
}

let RAPIER;
try {
  const module = await import('../assets/lib/rapier3d-deterministic/dist/rapier.mjs');
  RAPIER = module.default;
  await RAPIER.init();
} catch (error) {
  fail(error?.message || 'physics-unavailable');
}

if (RAPIER) initialize(RAPIER);

function initialize(RAPIER) {
  'use strict';
  const { THREE, Deck } = window;
  if (!THREE || !Deck) {
    fail('chassis-unavailable');
    return;
  }

  Deck.init({ title: '陀螺仪为什么能保持方向？｜真实刚体演算', keys: false });

  const $ = id => document.getElementById(id);
  const vec3 = (...xyz) => new THREE.Vector3(...xyz);
  const host = $('scene-host');
  const canvas = $('scene-canvas');
  const playButton = $('play-button');
  const resetButton = $('reset-button');
  const viewButtons = document.querySelectorAll('.view-btn');
  const sceneStatus = $('scene-status');
  const phaseKicker = $('phase-kicker');
  const phaseTitle = $('phase-title');
  const phaseCopy = $('phase-copy');
  const progressFill = $('progress-fill');
  const referenceTag = $('reference-tag');
  const currentTag = $('current-tag');
  const spinDriftEl = $('spin-drift');
  const stillDriftEl = $('still-drift');
  const spinBar = $('spin-bar');
  const stillBar = $('still-bar');
  const barScale = $('bar-scale');
  const housingAngleEl = $('housing-angle');
  const mainDriftEl = $('main-drift');

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  let disposed = false;
  let raf = 0;
  let resizeObserver;
  const listeners = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (error) {
    fail(error?.message || 'webgl-unavailable');
    return;
  }
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);

  const css = getComputedStyle($('stage'));
  const token = name => css.getPropertyValue(name).trim();
  const colors = {
    housing: token('--housing'),
    outer: token('--outer'),
    middle: token('--middle'),
    inner: token('--inner'),
    rotor: token('--rotor'),
    rotorDark: token('--rotor-dark'),
    steel: token('--steel'),
    ink: token('--ink'),
    danger: token('--still')
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  const lookTarget = vec3();

  function addLight(light, position) {
    light.position.set(...position);
    scene.add(light);
  }
  scene.add(new THREE.HemisphereLight(0xf7fbfc, 0x536267, 1.65));
  addLight(new THREE.DirectionalLight(0xffffff, 2.35), [-5, 8, 7]);
  addLight(new THREE.PointLight(0xbfd1d4, 1.35, 24), [6, 2, -5]);
  addLight(new THREE.PointLight(0xffd0ad, 0.6, 16), [-2, -3, 4]);

  const geometries = new Set();
  const materials = new Set();
  const geo = value => (geometries.add(value), value);
  const mat = value => (materials.add(value), value);
  const cylinder = (radius, length, segments) =>
    geo(new THREE.CylinderGeometry(radius, radius, length, segments));

  function makeMaterial(color, metalness = 0.7, roughness = 0.28, opacity = 1) {
    return mat(new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(color).multiplyScalar(0.018)
    }));
  }

  function lineMaterial(color, opacity, options) {
    return mat(new THREE.LineBasicMaterial({ color, transparent: true, opacity, ...options }));
  }

  function dashedMaterial(color, opacity, dashSize, gapSize) {
    return mat(new THREE.LineDashedMaterial({
      color, dashSize, gapSize, transparent: true, opacity, depthTest: false
    }));
  }

  function flatMaterial(color, opacity) {
    return mat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  }

  const palette = {
    housing: makeMaterial(colors.housing, 0.72, 0.38, 0.70),
    outer: makeMaterial(colors.outer, 0.74, 0.26, 0.94),
    middle: makeMaterial(colors.middle, 0.72, 0.25, 0.94),
    inner: makeMaterial(colors.inner, 0.74, 0.25, 0.96),
    rotor: makeMaterial(colors.rotor, 0.82, 0.20),
    rotorDark: makeMaterial(colors.rotorDark, 0.80, 0.30),
    steel: makeMaterial(colors.steel, 0.88, 0.18, 0.95)
  };
  const edgeMats = Object.fromEntries([
    ['housing', 0.56], ['outer', 0.78], ['middle', 0.78], ['inner', 0.78], ['rotor', 0.88]
  ].map(([name, opacity]) => [name, lineMaterial(token(`--${name}-edge`), opacity)]));

  function addMesh(parent, geometry, material, edgeMaterial, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    if (edgeMaterial) {
      const edges = new THREE.LineSegments(geo(new THREE.EdgesGeometry(geometry, 28)), edgeMaterial);
      edges.renderOrder = 2;
      mesh.add(edges);
    }
    return mesh;
  }

  function addBox(parent, size, material, edgeMaterial, position, rotation) {
    return addMesh(parent, geo(new THREE.BoxGeometry(...size)), material, edgeMaterial, position, rotation);
  }

  function orientCylinderAlong(mesh, axis) {
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  }

  const visual = Object.fromEntries(
    ['housing', 'outer', 'middle', 'inner', 'rotor'].map(name => [name, new THREE.Group()])
  );
  Object.values(visual).forEach(group => scene.add(group));

  function buildHousing() {
    const group = visual.housing;
    [-0.18, 0.18].forEach(z => {
      addBox(group, [6.85, 0.16, 0.16], palette.housing, edgeMats.housing, [0, 3.22, z]);
      addBox(group, [6.85, 0.16, 0.16], palette.housing, edgeMats.housing, [0, -3.22, z]);
      addBox(group, [0.16, 6.30, 0.16], palette.housing, edgeMats.housing, [-3.43, 0, z]);
      addBox(group, [0.16, 6.30, 0.16], palette.housing, edgeMats.housing, [3.43, 0, z]);
    });
    [-1, 1].forEach(sign => {
      addBox(group, [0.78, 0.44, 0.58], palette.housing, edgeMats.housing, [sign * 3.12, 0, 0]);
      const shaft = addMesh(group, cylinder(0.11, 0.82, 24), palette.steel, edgeMats.housing,
        [sign * 3.0, 0, 0]);
      orientCylinderAlong(shaft, 'x');
    });
    [[-3.24, -3.03], [3.24, -3.03], [-3.24, 3.03], [3.24, 3.03]].forEach(([x, y]) => {
      const bolt = addMesh(group, cylinder(0.09, 0.21, 18), palette.steel, null, [x, y, 0.27]);
      bolt.rotation.x = Math.PI / 2;
    });
  }

  function buildRing(group, radius, planeRotation, jointAxis, material, edgeMaterial) {
    const plane = new THREE.Group();
    plane.rotation.set(...planeRotation);
    group.add(plane);
    const rail = geo(new THREE.TorusGeometry(radius, 0.075, 12, 128));
    addMesh(plane, rail, material, edgeMaterial, [0, 0, -0.09]);
    addMesh(plane, rail, material, edgeMaterial, [0, 0, 0.09]);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      addBox(plane, [0.34, 0.14, 0.32], material, edgeMaterial,
        [Math.cos(angle) * radius, Math.sin(angle) * radius, 0], [0, 0, angle]);
    }
    [-1, 1].forEach(sign => {
      const position = [0, 0, 0];
      if (jointAxis === 'x') position[0] = sign * radius;
      if (jointAxis === 'y') position[1] = sign * radius;
      if (jointAxis === 'z') position[2] = sign * radius;
      const bearing = addMesh(group, cylinder(0.19, 0.46, 28), palette.steel, edgeMaterial, position);
      orientCylinderAlong(bearing, jointAxis);
    });
  }

  function buildRotorBearings() {
    [-1, 1].forEach(sign => {
      addBox(visual.inner, [0.46, 0.56, 0.56], palette.inner, edgeMats.inner, [sign * 1.48, 0, 0]);
      const collar = addMesh(visual.inner, cylinder(0.22, 0.34, 28), palette.steel,
        edgeMats.inner, [sign * 1.72, 0, 0]);
      orientCylinderAlong(collar, 'x');
    });
  }

  function buildRotor() {
    const group = visual.rotor;
    const { rim: rimPart, spokes, hub: hubPart, shaft: shaftPart } = ROTOR_PARTS;
    const rim = addMesh(group,
      geo(new THREE.TorusGeometry(rimPart.majorRadius, rimPart.tubeRadius, 18, 128)),
      palette.rotor, edgeMats.rotor);
    rim.rotation.y = Math.PI / 2;

    for (let index = 0; index < spokes.count; index += 1) {
      addBox(group, [spokes.x, spokes.y, spokes.z], palette.rotorDark, edgeMats.rotor,
        [0, 0, 0], [index * Math.PI / spokes.count, 0, 0]);
    }
    const hub = addMesh(group, cylinder(hubPart.radius, hubPart.length, 36), palette.steel, edgeMats.rotor);
    orientCylinderAlong(hub, 'x');
    const shaft = addMesh(group, cylinder(shaftPart.radius, shaftPart.length, 28), palette.steel, edgeMats.rotor);
    orientCylinderAlong(shaft, 'x');
    const marker = addMesh(group, geo(new THREE.SphereGeometry(0.13, 20, 14)),
      makeMaterial(token('--marker'), 0.2, 0.25), null, [0, rimPart.majorRadius, 0]);
    marker.renderOrder = 4;
  }

  buildHousing();
  buildRing(visual.outer, MODEL.rings.outer.radius, [0, 0, 0], 'x', palette.outer, edgeMats.outer);
  buildRing(visual.middle, MODEL.rings.middle.radius, [0, Math.PI / 2, 0], 'y', palette.middle, edgeMats.middle);
  buildRing(visual.inner, MODEL.rings.inner.radius, [Math.PI / 2, 0, 0], 'z', palette.inner, edgeMats.inner);
  buildRotorBearings();
  buildRotor();

  const grid = new THREE.GridHelper(15, 30, 0x81969b, 0xb8c5c8);
  grid.position.y = -3.7;
  grid.material.transparent = true;
  grid.material.opacity = 0.52;
  scene.add(grid);

  const axisMaterials = [colors.outer, colors.middle, colors.inner]
    .map(color => lineMaterial(color, 0.16, { depthTest: false }));
  const axesGroup = new THREE.Group();
  scene.add(axesGroup);
  [
    [[-3.7, 0, 0], [3.7, 0, 0]],
    [[0, -3.7, 0], [0, 3.7, 0]],
    [[0, 0, -3.7], [0, 0, 3.7]]
  ].forEach((points, index) => {
    const geometry = geo(new THREE.BufferGeometry().setFromPoints(points.map(point => vec3(...point))));
    axesGroup.add(new THREE.Line(geometry, axisMaterials[index]));
  });

  const ghostMat = dashedMaterial(colors.ink, 0.27, 0.18, 0.13);
  const ghostPoints = [
    [-3.43, -3.22, 0],
    [3.43, -3.22, 0],
    [3.43, 3.22, 0],
    [-3.43, 3.22, 0],
    [-3.43, -3.22, 0]
  ].map(point => vec3(...point));
  const ghostHousing = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(ghostPoints)), ghostMat);
  ghostHousing.computeLineDistances();
  scene.add(ghostHousing);

  function makeArrow(color, dashed = false) {
    const group = new THREE.Group();
    const arrowLineMaterial = dashed
      ? dashedMaterial(color, 0.66, 0.17, 0.12)
      : lineMaterial(color, 0.98, { depthTest: false });
    const points = [vec3(), vec3(4.25, 0, 0)];
    const line = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(points)), arrowLineMaterial);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 8;
    group.add(line);
    const coneMaterial = flatMaterial(color, dashed ? 0.66 : 0.98);
    const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(0.14, 0.42, 20)), coneMaterial);
    cone.position.x = 4.25;
    cone.rotation.z = -Math.PI / 2;
    cone.renderOrder = 8;
    group.add(cone);
    scene.add(group);
    return group;
  }
  const referenceArrow = makeArrow(colors.ink, true);
  referenceArrow.position.y = 0.08;
  const rotorArrow = makeArrow(colors.rotor);
  rotorArrow.position.y = -0.08;

  const torqueGroup = new THREE.Group();
  const torqueMat = lineMaterial(colors.danger, 0.9, { depthTest: false });
  const torquePoints = [];
  for (let index = 0; index <= 36; index += 1) {
    const angle = -0.25 + index / 36 * Math.PI * 1.18;
    torquePoints.push(vec3(Math.cos(angle) * 1.42, Math.sin(angle) * 1.42, 0));
  }
  const torqueLine = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(torquePoints)), torqueMat);
  torqueLine.renderOrder = 9;
  torqueGroup.add(torqueLine);
  const torqueCone = new THREE.Mesh(geo(new THREE.ConeGeometry(0.13, 0.38, 18)),
    flatMaterial(colors.danger, 0.9));
  const torqueAngle = -0.25 + Math.PI * 1.18;
  torqueCone.position.set(Math.cos(torqueAngle) * 1.42, Math.sin(torqueAngle) * 1.42, 0);
  torqueCone.rotation.z = torqueAngle - Math.PI / 2;
  torqueCone.renderOrder = 9;
  torqueGroup.add(torqueCone);
  torqueGroup.position.z = 0.32;
  torqueGroup.visible = false;
  scene.add(torqueGroup);

  const rotorAxis = vec3(1), currentAxis = vec3(1), projected = vec3();
  const referencePoint = vec3(), currentPoint = vec3(), wheelDirection = vec3();
  const visualQuaternion = new THREE.Quaternion();

  const phase = (kicker, title, copy) => ({ kicker, title, copy });
  const PHASES = {
    spin: phase('转子转速 52 rad/s', '高速转子先建立角动量',
      '橙色轴线表示转子主轴；起始时它指向固定的空间 +X。'),
    housing: phase('外壳开始转动', '三个关节逐层让位',
      'X、Y、Z 旋转自由度吸收外壳姿态变化，转子不必被硬拖着转。'),
    isolated: phase('外壳姿态变化 45°', '转子轴仍指向原方向',
      '虚线是起始 +X；实线转子轴仍与它几乎重合。'),
    torque: phase('横向力矩 10 N·m × 0.70 s', '旋转与静止的偏移开始分开',
      '10 N·m 持续 0.70 s；右侧比较来自两个同惯量探针刚体。'),
    decisive: phase('主轴偏移 1.5°', '外壳改变约 45°，主轴仍接近起始方向',
      '万向环隔离外壳姿态；较大的角动量减小同一角冲量造成的轴向偏移。'),
    nested: phase('五个同心刚体', '所有部件共用一个转动中心',
      '外壳、三层万向环与转子同心嵌套；材质色区分各个刚体。'),
    axes: phase('旋转轴 X / Y / Z / X', '相邻铰链的轴向互相垂直',
      '前三个自由度分解外壳姿态，最后一个 X 轴让转子自转。'),
    exploded: phase('四处旋转约束', '沿装配轴看清约束链',
      '外壳、外环、中环、内环与转子依次相连；轴承块标出相邻刚体的连接。')
  };

  const view = (position, target, axes, ghost, pose, phase) =>
    ({ position, target, axes, ghost, pose, phase });
  const VIEWS = {
    independent: view([-8.4, 5.2, 9.8], [0, 0, 0], 0.30, 0.28, 'final', 'decisive'),
    nested: view([-8.3, 5.7, 10.5], [0, 0, 0], 0.12, 0, 'identity', 'nested'),
    axes: view([7.8, 5.9, 10.8], [0, 0, 0], 0.92, 0, 'identity', 'axes'),
    exploded: view([0, 5.4, 23.2], [-0.7, 0, 0], 0.10, 0, 'exploded', 'exploded')
  };

  let physics = null;
  let finalSnapshot = null;
  let activeSnapshot = null;
  let mode = 'settled';
  let currentView = 'independent';
  let activePhase = '';
  let accumulator = 0;
  let lastNow = 0;
  let cameraTween = null;

  function replacePhysics() {
    physics?.dispose();
    physics = new GimbalPhysics(RAPIER);
  }

  function solveFinal() {
    replacePhysics();
    finalSnapshot = physics.runToStep(PHYSICS.finalStep);
    activeSnapshot = finalSnapshot;
    return finalSnapshot;
  }

  function syncSnapshot(snapshot) {
    if (!snapshot) return;
    for (const [key, transform] of Object.entries(snapshot.transforms)) {
      visual[key].position.fromArray(transform.position);
      visual[key].quaternion.fromArray(transform.quaternion);
    }
  }

  function setAuthoredPose(kind) {
    Object.values(visual).forEach(group => {
      group.position.set(0, 0, 0);
      group.quaternion.identity();
    });
    if (kind === 'exploded') {
      visual.housing.position.x = -7;
      visual.outer.position.x = -3.4;
      visual.middle.position.x = -0.5;
      visual.inner.position.x = 2.35;
      visual.rotor.position.x = 5.25;
    }
  }

  function phaseForStep(stepIndex) {
    if (stepIndex < PHYSICS.housingStartStep) return 'spin';
    if (stepIndex < PHYSICS.housingEndStep) return 'housing';
    if (stepIndex < PHYSICS.torqueStartStep) return 'isolated';
    if (stepIndex < PHYSICS.torqueEndStep) return 'torque';
    return 'decisive';
  }

  function setPhase(key, force = false) {
    if (!force && activePhase === key) return;
    const phase = PHASES[key];
    activePhase = key;
    phaseKicker.textContent = phase.kicker;
    phaseTitle.textContent = phase.title;
    phaseCopy.textContent = phase.copy;
  }

  function setViewButtons() {
    viewButtons.forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.view === currentView)));
  }

  function setViewEffects(view) {
    axisMaterials.forEach(material => material.opacity = view.axes);
    ghostMat.opacity = view.ghost;
    ghostHousing.visible = view.ghost > 0;
  }

  function updateControls() {
    const running = mode === 'playing';
    const paused = mode === 'paused';
    playButton.classList.toggle('is-running', running);
    canvas.classList.toggle('is-locked', running || mode === 'transitioning');
    let copy;
    if (running) {
      copy = ['刚体演算中 · 240 Hz', '暂停', '暂停刚体演算'];
    } else if (paused) {
      copy = ['演算已暂停', '继续', '继续刚体演算'];
    } else if (mode === 'transitioning') {
      copy = ['切换观察角度', '重新演算', '从头重新演算'];
    } else {
      copy = [currentView === 'independent' ? '最终状态 · 4.70 s' : '最终结果保留',
        '重新演算', '从头重新演算'];
    }
    [sceneStatus.textContent, playButton.textContent] = copy;
    playButton.setAttribute('aria-label', copy[2]);
  }

  function setText(element, value) { if (element.textContent !== value) element.textContent = value; }

  const degrees = radians => radians * 180 / Math.PI;
  let comparisonScaleDegrees = 50;
  function updateTelemetry(snapshot) {
    if (!snapshot) return;
    const metrics = snapshot.metrics;
    const spinDegrees = degrees(metrics.spinningDriftRadians);
    const stillDegrees = degrees(metrics.stillDriftRadians);
    const mainDegrees = degrees(metrics.mainDriftRadians);
    const housingDegrees = degrees(metrics.housingAngleRadians);
    const finalStillDegrees = finalSnapshot
      ? degrees(finalSnapshot.metrics.stillDriftRadians)
      : stillDegrees;
    comparisonScaleDegrees = Math.max(50, Math.ceil(finalStillDegrees / 10) * 10);
    setText(spinDriftEl, `${spinDegrees.toFixed(1)}°`);
    setText(stillDriftEl, `${stillDegrees.toFixed(1)}°`);
    setText(housingAngleEl, `${housingDegrees.toFixed(1)}°`);
    setText(mainDriftEl, `${mainDegrees.toFixed(1)}°`);
    setText(barScale, `0–${comparisonScaleDegrees}°`);
    spinBar.style.setProperty('--value', `${Math.min(100, spinDegrees / comparisonScaleDegrees * 100)}%`);
    stillBar.style.setProperty('--value', `${Math.min(100, stillDegrees / comparisonScaleDegrees * 100)}%`);
  }

  function visualRotorAxis() {
    visual.rotor.getWorldQuaternion(visualQuaternion);
    return currentAxis.copy(rotorAxis).applyQuaternion(visualQuaternion).normalize();
  }

  function projectTag(element, point, dx, dy) {
    projected.copy(point).project(camera);
    const x = (projected.x * 0.5 + 0.5) * host.clientWidth + dx;
    const y = (-projected.y * 0.5 + 0.5) * host.clientHeight + dy;
    element.style.left = `${Math.max(12, Math.min(host.clientWidth - 190, x))}px`;
    element.style.top = `${Math.max(54, Math.min(host.clientHeight - 66, y))}px`;
  }

  function updateArrows() {
    const axis = visualRotorAxis();
    rotorArrow.quaternion.setFromUnitVectors(rotorAxis, axis);
    const visible = currentView === 'independent';
    referenceArrow.visible = visible;
    rotorArrow.visible = visible;
    referenceTag.hidden = !visible;
    currentTag.hidden = !visible;
    if (!visible) return;
    referencePoint.set(4.38, 0.12, 0);
    currentPoint.copy(axis).multiplyScalar(4.38);
    currentPoint.y -= 0.12;
    projectTag(referenceTag, referencePoint, 14, -26);
    projectTag(currentTag, currentPoint, 14, 31);
  }

  function render() {
    if (disposed) return;
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    updateArrows();
    updateTelemetry(activeSnapshot || finalSnapshot);
    renderer.render(scene, camera);
  }

  function startLoop() { if (!raf && !disposed) raf = requestAnimationFrame(tick); }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function cancelCameraTween() {
    cameraTween = null;
    if (mode === 'transitioning') mode = 'settled';
  }

  function updateCameraTween(now) {
    if (!cameraTween) return false;
    const raw = Math.min(1, (now - cameraTween.start) / cameraTween.duration);
    const eased = 1 - (1 - raw) ** 4;
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    lookTarget.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (raw >= 1) {
      cameraTween = null;
      mode = 'settled';
      updateControls();
      return false;
    }
    return true;
  }

  let dragging = false;
  let dragId = -1;
  const drag = { x: 0, y: 0, azimuth: 0, elevation: 0, radius: 0 };

  function stopDragging() {
    if (!dragging) return;
    if (canvas.hasPointerCapture?.(dragId)) canvas.releasePointerCapture(dragId);
    dragging = false;
    dragId = -1;
  }

  function cancelActiveWork() {
    stopLoop();
    cancelCameraTween();
    stopDragging();
    accumulator = 0;
  }

  function presentView(id, instant = false) {
    const view = VIEWS[id];
    currentView = id;
    setViewButtons();
    activeSnapshot = finalSnapshot;
    if (view.pose === 'final') syncSnapshot(finalSnapshot);
    else setAuthoredPose(view.pose);
    torqueGroup.visible = false;
    progressFill.style.transform = 'scaleX(1)';
    setViewEffects(view);
    setPhase(view.phase);

    const toPosition = vec3(...view.position);
    const toTarget = vec3(...view.target);
    if (instant || reduced) {
      camera.position.copy(toPosition);
      lookTarget.copy(toTarget);
      mode = 'settled';
      updateControls();
      render();
    } else {
      mode = 'transitioning';
      cameraTween = {
        start: performance.now(),
        duration: id === 'exploded' ? 900 : 620,
        fromPosition: camera.position.clone(),
        toPosition,
        fromTarget: lookTarget.clone(),
        toTarget
      };
      updateControls();
      startLoop();
    }
    return true;
  }

  function goToView(id, instant = false) {
    if (!VIEWS[id]) return false;
    const leavingLiveRun = mode === 'playing' || mode === 'paused';
    cancelActiveWork();
    if (leavingLiveRun) solveFinal();
    mode = 'settled';
    return presentView(id, instant);
  }

  function presentIndependent(snapshot, nextMode) {
    const step = snapshot.stepIndex;
    const view = VIEWS.independent;
    activeSnapshot = snapshot;
    syncSnapshot(snapshot);
    currentView = 'independent';
    setViewButtons();
    camera.position.set(...view.position);
    lookTarget.set(...view.target);
    setViewEffects(view);
    torqueGroup.visible = step >= PHYSICS.torqueStartStep && step < PHYSICS.torqueEndStep;
    progressFill.style.transform = `scaleX(${step / PHYSICS.finalStep})`;
    setPhase(phaseForStep(step), true);
    mode = nextMode;
    updateControls();
    render();
  }

  function finishSimulation() {
    activeSnapshot = physics.snapshot();
    finalSnapshot = activeSnapshot;
    syncSnapshot(activeSnapshot);
    torqueGroup.visible = false;
    progressFill.style.transform = 'scaleX(1)';
    setPhase('decisive');
    mode = 'settled';
    updateControls();
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    let needsNext = updateCameraTween(now);

    if (mode === 'playing') {
      accumulator += Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      let stepsThisFrame = 0;
      while (
        accumulator >= PHYSICS.timestep &&
        physics.stepIndex < PHYSICS.finalStep &&
        stepsThisFrame < 24
      ) {
        physics.step();
        accumulator -= PHYSICS.timestep;
        stepsThisFrame += 1;
      }
      activeSnapshot = physics.snapshot();
      syncSnapshot(activeSnapshot);
      setPhase(phaseForStep(activeSnapshot.stepIndex));
      torqueGroup.visible = activeSnapshot.stepIndex >= PHYSICS.torqueStartStep &&
        activeSnapshot.stepIndex < PHYSICS.torqueEndStep;
      progressFill.style.transform = `scaleX(${activeSnapshot.stepIndex / PHYSICS.finalStep})`;
      if (physics.stepIndex >= PHYSICS.finalStep) finishSimulation();
      else needsNext = true;
    }

    render();
    if (needsNext) startLoop();
  }

  function startSimulation() {
    cancelActiveWork();
    replacePhysics();
    lastNow = performance.now();
    presentIndependent(physics.snapshot(), 'playing');
    startLoop();
  }

  function pauseSimulation() {
    if (mode !== 'playing') return;
    stopLoop();
    mode = 'paused';
    updateControls();
    render();
  }

  function resumeSimulation() {
    if (mode !== 'paused') return;
    mode = 'playing';
    lastNow = performance.now();
    updateControls();
    startLoop();
  }

  function reset() {
    cancelActiveWork();
    solveFinal();
    mode = 'settled';
    presentView('independent', true);
  }

  function playToggle() {
    if (reduced) {
      reset();
      return;
    }
    if (mode === 'playing') pauseSimulation();
    else if (mode === 'paused') resumeSimulation();
    else startSimulation();
  }

  function seekSimulation(timeSeconds) {
    cancelActiveWork();
    const seconds = Number(timeSeconds) || 0;
    replacePhysics();
    const snapshot = physics.runToStep(Math.round(seconds / PHYSICS.timestep));
    if (snapshot.stepIndex === PHYSICS.finalStep) finalSnapshot = snapshot;
    presentIndependent(snapshot, snapshot.stepIndex === PHYSICS.finalStep ? 'settled' : 'paused');
  }

  function pointerDown(event) {
    if (event.button !== 0 || mode === 'playing' || mode === 'transitioning') return;
    dragging = true;
    dragId = event.pointerId;
    wheelDirection.copy(camera.position).sub(lookTarget);
    drag.radius = wheelDirection.length();
    drag.azimuth = Math.atan2(wheelDirection.x, wheelDirection.z);
    drag.elevation = Math.asin(wheelDirection.y / drag.radius);
    drag.x = event.clientX;
    drag.y = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragging || event.pointerId !== dragId) return;
    const azimuth = drag.azimuth - (event.clientX - drag.x) * 0.006;
    const elevation = Math.max(-0.2, Math.min(1.25, drag.elevation + (event.clientY - drag.y) * 0.005));
    const cosine = Math.cos(elevation);
    camera.position.set(
      lookTarget.x + Math.sin(azimuth) * cosine * drag.radius,
      lookTarget.y + Math.sin(elevation) * drag.radius,
      lookTarget.z + Math.cos(azimuth) * cosine * drag.radius
    );
    render();
  }

  function pointerUp(event) { if (dragging && event.pointerId === dragId) stopDragging(); }

  function wheel(event) {
    event.preventDefault();
    if (mode === 'playing' || mode === 'transitioning') return;
    wheelDirection.copy(camera.position).sub(lookTarget);
    const radius = Math.max(6.5, Math.min(28, wheelDirection.length() * Math.exp(event.deltaY * 0.001)));
    camera.position.copy(lookTarget).add(wheelDirection.setLength(radius));
    render();
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable) return;
    const keys = ['independent', 'nested', 'axes', 'exploded'];
    const number = Number(event.key);
    if (number >= 1 && number <= 4) {
      event.preventDefault();
      goToView(keys[number - 1]);
    } else if (event.key === ' ') {
      event.preventDefault();
      playToggle();
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      reset();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const index = keys.indexOf(currentView);
      goToView(keys[(index + delta + keys.length) % keys.length]);
    }
  }

  function resize() {
    if (disposed) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(1.6, Math.max(1, devicePixelRatio || 1)));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  function onReduced(event) {
    reduced = event.matches;
    if (reduced && (mode === 'playing' || mode === 'transitioning')) reset();
  }

  function disposeMaterial(material) {
    if (Array.isArray(material)) material.forEach(entry => entry.dispose());
    else if (material && material.dispose) material.dispose();
  }

  let pageApi;
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    stopDragging();
    resizeObserver?.disconnect();
    while (listeners.length) listeners.pop()();
    physics?.dispose();
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    if (grid.geometry) grid.geometry.dispose();
    disposeMaterial(grid.material);
    renderer.renderLists?.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (window.__gimbalPage === pageApi) delete window.__gimbalPage;
  }

  viewButtons.forEach(button => listen(button, 'click', () => goToView(button.dataset.view)));
  [
    [playButton, 'click', playToggle], [resetButton, 'click', reset], [document, 'keydown', onKey],
    [canvas, 'pointerdown', pointerDown], [canvas, 'pointermove', pointerMove]
  ].forEach(args => listen(...args));
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => listen(canvas, type, pointerUp));
  listen(canvas, 'wheel', wheel, { passive: false });
  listen(window, 'pagehide', dispose, { once: true });
  listen(reducedQuery, 'change', onReduced);
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else {
    listen(window, 'resize', resize);
  }

  solveFinal();
  loading.hidden = true;
  presentView('independent', true);
  resize();

  pageApi = {
    play: playToggle,
    reset,
    seek: seekSimulation,
    goToView,
    dispose,
    getState: () => {
      const snapshot = activeSnapshot || finalSnapshot;
      const metrics = snapshot.metrics;
      return {
        engine: 'Rapier 3D deterministic-compat 0.20.0',
        timestep: PHYSICS.timestep,
        rigidBodies: PHYSICS.visibleBodyCount + PHYSICS.probeBodyCount,
        visibleBodies: PHYSICS.visibleBodyCount,
        probeBodies: PHYSICS.probeBodyCount,
        revoluteJoints: PHYSICS.revoluteJointCount,
        mode,
        view: currentView,
        simStep: snapshot.stepIndex,
        simTime: snapshot.time,
        spinDrift: degrees(metrics.spinningDriftRadians),
        stillDrift: degrees(metrics.stillDriftRadians),
        mainAxisDrift: degrees(metrics.mainDriftRadians),
        housingAngle: degrees(metrics.housingAngleRadians),
        rotorRpm: metrics.rotorRpm,
        rotorQuaternion: snapshot.transforms.rotor.quaternion.slice(),
        housingQuaternion: snapshot.transforms.housing.quaternion.slice(),
        rotorAngularVelocity: snapshot.rotorAngularVelocity.slice(),
        rotorMass: MODEL.rotor.mass,
        rotorInertia: [MODEL.rotor.inertia.x, MODEL.rotor.inertia.y, MODEL.rotor.inertia.z],
        analyticSpinDrift: degrees(ANALYTIC.spinningDriftRadians),
        analyticStillDrift: degrees(ANALYTIC.stillDriftRadians),
        comparisonScaleDegrees,
        cameraTransition: !!cameraTween,
        dragging,
        reduced,
        disposed,
        canvases: document.querySelectorAll('canvas').length
      };
    }
  };
  window.__gimbalPage = pageApi;
}
```
  </file>
</sample>
