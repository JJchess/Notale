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
