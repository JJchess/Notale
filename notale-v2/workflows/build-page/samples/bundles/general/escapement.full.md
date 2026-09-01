<sample id="escapement" category="general" variant="full">
  <file path="samples/general/escapement/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>机械钟为什么不会一下走完？｜Notale</title>
 <link rel="icon" href="data:,">
 <link rel="stylesheet" href="assets/base.css">
</head>
<body>
 <main id="stage" aria-label="机械钟擒纵机构解释页">
  <header class="intro">
   <h1>机械钟为什么不会一下走完？</h1>
  </header>
  <figure class="mechanism" aria-labelledby="stateTitle">
   <div id="renderShell" class="render-shell" data-dragging="false">
    <canvas id="mechanismCanvas" role="img" aria-label="可轻微拖动查看的三维擒纵机构：青绿色擒纵轮、蓝色擒纵叉、紫色摆轮、游丝和两块红宝石锁瓦。"></canvas>
    <svg class="annotation-layer" viewBox="0 0 1420 466" aria-hidden="true">
     <text x="22" y="223" class="annotation-label annotation-red">发条一直在推</text>
     <text x="364" y="28" class="annotation-label annotation-strong">一齿距</text>
     <g class="component-callout wheel">
      <text x="145" y="76">擒纵轮</text>
      <path class="callout-swatch" d="M145 88H195"/>
      <path id="wheelCalloutLine" class="callout-leader" d="M208 82H270L320 96L340 100"/>
      <circle id="wheelCalloutDot" class="callout-dot" cx="340" cy="100" r="4"/>
     </g>
     <g class="component-callout pallets">
      <text x="540" y="52">锁瓦 ×2</text>
      <path class="callout-swatch" d="M540 64H590"/>
      <path class="callout-leader" d="M603 58L626 78"/>
      <path id="entryCalloutLine" class="callout-leader" d="M626 78L600 92"/>
      <path id="exitCalloutLine" class="callout-leader" d="M626 78V298L600 315"/>
      <circle id="entryCalloutDot" class="callout-dot" cx="600" cy="92" r="4"/>
      <circle id="exitCalloutDot" class="callout-dot" cx="600" cy="315" r="4"/>
     </g>
     <g class="component-callout balance">
      <text x="1210" y="70">摆轮</text>
      <path class="callout-swatch" d="M1210 82H1255"/>
      <path id="balanceCalloutLine" class="callout-leader" d="M1196 78L1174 78L1160 120"/>
      <circle id="balanceCalloutDot" class="callout-dot" cx="1160" cy="120" r="4"/>
     </g>
     <g class="component-callout fork">
      <text x="740" y="430">擒纵叉</text>
      <path class="callout-swatch" d="M740 442H795"/>
      <path id="forkCalloutLine" class="callout-leader" d="M725 424L710 380V230L710 210"/>
      <circle id="forkCalloutDot" class="callout-dot" cx="710" cy="210" r="4"/>
     </g>
    </svg>
    <svg class="fallback-svg" viewBox="0 0 1420 466" role="img" aria-label="擒纵机构决定性静帧">
     <g transform="translate(412 228)" fill="none" stroke-linejoin="round">
      <circle r="158" stroke="#2d7770" stroke-width="34"/>
      <circle r="158" stroke="#62bfb2" stroke-width="26"/>
      <g stroke="#62bfb2" stroke-width="18">
       <path d="M0-37V-148"/><path d="M0-37V-148" transform="rotate(72)"/><path d="M0-37V-148" transform="rotate(144)"/><path d="M0-37V-148" transform="rotate(216)"/><path d="M0-37V-148" transform="rotate(288)"/>
      </g>
      <circle r="37" fill="#62bfb2" stroke="#2d7770" stroke-width="3"/>
     </g>
     <path d="M716 208C680 171 655 139 631 111L589 151L649 197C669 219 669 237 649 259L589 305L631 345C655 317 680 285 716 248L949 248L1008 230L949 208Z" fill="#64a8df" stroke="#2f6792" stroke-width="3"/>
     <g fill="#f28aa0" stroke="#ab4158" stroke-width="3">
      <rect x="573" y="127" width="74" height="26" rx="4" transform="rotate(8 610 140)"/>
      <rect x="573" y="300" width="74" height="26" rx="4" transform="rotate(-35 610 313)"/>
     </g>
     <g transform="translate(1082 228)" fill="none" stroke-linejoin="round">
      <circle r="174" stroke="#7f4d8b" stroke-width="34"/>
      <circle r="174" stroke="#ca8ed7" stroke-width="26"/>
      <g stroke="#ca8ed7" stroke-width="16">
       <path d="M0-38V-161"/><path d="M0-38V-161" transform="rotate(120)"/><path d="M0-38V-161" transform="rotate(240)"/>
      </g>
      <circle r="42" fill="#ca8ed7" stroke="#7f4d8b" stroke-width="3"/>
     </g>
    </svg>
    <p class="fallback-note">当前浏览器使用静态机构图。</p>
   </div>
   <figcaption aria-live="polite">
    <div class="state-heading">
     <h2 id="stateTitle">锁住</h2>
    </div>
    <p id="stateCopy" class="state-copy"><strong>上方锁瓦顶住齿尖。</strong>发条仍在施力，但擒纵轮的位移是零。</p>
    <p class="wheel-reading"><b id="wheelReading">停住 · 0 齿</b></p>
   </figcaption>
  </figure>
  <section class="controls" aria-label="擒纵周期控制">
   <div class="transport">
    <button id="playButton" class="play-button" type="button" aria-label="播放一个完整擒纵周期" data-playing="false">
     <span class="play-icon" aria-hidden="true"></span>
    </button>
    <div class="transport-copy"><strong id="playLabel">播放一个周期</strong></div>
   </div>
   <div id="timelineWrap" class="timeline-wrap">
    <div class="track"></div><div class="track-fill"></div>
    <input id="timeline" type="range" min="0" max="3" step="0.001" value="0" aria-label="拖动查看擒纵周期">
    <div class="beats" role="group" aria-label="直接查看四个状态">
     <button class="beat" type="button" data-state="0" aria-current="step">1 锁住</button>
     <button class="beat" type="button" data-state="1">2 放开</button>
     <button class="beat" type="button" data-state="2">3 走一齿</button>
     <button class="beat" type="button" data-state="3">4 再锁住</button>
    </div>
   </div>
   <div class="reset-area">
    <button id="resetButton" class="reset-button" type="button">回到开始</button>
   </div>
  </section>
 </main>
 <script src="assets/base.js"></script>
 <script src="assets/lib/three.min.js"></script>
 <script src="mechanism.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/escapement/pages/mechanism.js">
```javascript
(function () {
 'use strict';
 // Canonical mechanism states: geometry and copy derive from this table.
 const STATES = [
  {
   id: 'lock',
   title: '锁住',
   lead: '上方锁瓦顶住齿尖。',
   copy: '发条仍在施力，但擒纵轮的位移是零。',
   reading: '停住 · 0 齿',
   wheel: 0,
   fork: -0.06,
   balance: -0.28,
   entry: 1,
   exit: 0,
   roller: 0,
   impulse: 0,
   forkMotion: 0,
   balanceMotion: 0
  },
  {
   id: 'release',
   title: '放开',
   lead: '摆轮带动擒纵叉。',
   copy: '上方锁瓦退开，轮齿只获得一次短暂的通道。',
   reading: '刚解锁 · 0 齿',
   wheel: 0.032,
   fork: -0.014,
   balance: -0.08,
   entry: 0.22,
   exit: 0,
   roller: 0.9,
   impulse: 0.05,
   forkMotion: 1,
   balanceMotion: 0.9
  },
  {
   id: 'step',
   title: '走一齿',
   lead: '擒纵轮跨过恰好一个齿距。',
   copy: '与此同时，它沿擒纵叉给摆轮一次短促的推力。',
   reading: '前进 · 1 齿',
   wheel: 0.36,
   fork: 0.061,
   balance: 0.14,
   entry: 0,
   exit: 0.2,
   roller: 1,
   impulse: 1,
   forkMotion: 0.35,
   balanceMotion: 0.35
  },
  {
   id: 'relock',
   title: '再锁住',
   lead: '另一块锁瓦接住下一枚齿。',
   copy: '擒纵轮再次停住，等待摆轮从反方向回来。',
   reading: '停住 · 1 齿',
   wheel: Math.PI * 2 / 15,
   fork: 0.057,
   balance: 0.32,
   entry: 0,
   exit: 1,
   roller: 0.12,
   impulse: 0,
   forkMotion: 0,
   balanceMotion: 0
  }
 ];
 const COLORS = {
  paper: 0xf8f8f6,
  teal: 0x54b9aa,
  tealEdge: 0x2d7770,
  blue: 0x589bd4,
  blueEdge: 0x2f6792,
  violet: 0xc47fd2,
  violetEdge: 0x7f4d8b,
  ruby: 0xf28aa0,
  rubyEdge: 0xab4158,
  rubyLight: 0xffccd6,
  amber: 0xf2bf43,
  red: 0xe5655d,
  spring: 0x7f8785,
  neutral: 0xcbd0cd,
  shadow: 0x66706d
 };
 const byId = id => document.getElementById(id);
 const stage = byId('stage');
 const renderShell = byId('renderShell');
 const canvas = byId('mechanismCanvas');
 const stateTitle = byId('stateTitle');
 const stateCopy = byId('stateCopy');
 const wheelReading = byId('wheelReading');
 const playButton = byId('playButton');
 const playLabel = byId('playLabel');
 const resetButton = byId('resetButton');
 const timeline = byId('timeline');
 const trackFill = document.querySelector('.track-fill');
 const beatButtons = [...document.querySelectorAll('.beat')];
 const calloutNodes = {
  wheelLine: byId('wheelCalloutLine'), wheelDot: byId('wheelCalloutDot'),
  forkLine: byId('forkCalloutLine'), forkDot: byId('forkCalloutDot'),
  balanceLine: byId('balanceCalloutLine'), balanceDot: byId('balanceCalloutDot'),
  entryLine: byId('entryCalloutLine'), entryDot: byId('entryCalloutDot'),
  exitLine: byId('exitCalloutLine'), exitDot: byId('exitCalloutDot')
 };
 const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
 const aborter = new AbortController();
 const calloutAnchors = {}, ownedGeometries = [], ownedMaterials = [];
 const defaultView = { x: -0.3, y: 0.09, z: -0.025 };
 let reducedOverride = null, offResize, resizeObserver;
 let currentProgress = reduceQuery.matches ? 2 : 0, currentCopy = -1;
 let animationFrame = 0, renderFrame = 0, playTimer = 0, playGeneration = 0;
 let playing = false, destroyed = false, activePointer = null;
 let renderer, scene, camera, viewRoot, assembly;
 let wheelGroup, forkGroup, balanceGroup, springGroup;
 let entryHalo, exitHalo, rollerHalo;
 let impulseMaterial, forkMotionMaterial, balanceMotionMaterial, pitchActiveMaterial;
 let projectionVector, publicApi;
 function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
 }
 function lerp(a, b, t) {
  return a + (b - a) * t;
 }
 function ease(t) {
  return 1 - Math.pow(1 - t, 3);
 }
 function reduced() {
  return reducedOverride === null ? reduceQuery.matches : reducedOverride;
 }
 function listen(target, type, handler, options = {}) {
  target.addEventListener(type, handler, { ...options, signal: aborter.signal });
 }
 function visualAt(progress) {
  var low = Math.floor(progress);
  var high = Math.min(STATES.length - 1, low + 1);
  var t = progress - low;
  var a = STATES[low];
  var b = STATES[high];
  return {
   wheel: lerp(a.wheel, b.wheel, t),
   fork: lerp(a.fork, b.fork, t),
   balance: lerp(a.balance, b.balance, t),
   entry: lerp(a.entry, b.entry, t),
   exit: lerp(a.exit, b.exit, t),
   roller: lerp(a.roller, b.roller, t),
   impulse: lerp(a.impulse, b.impulse, t),
   forkMotion: lerp(a.forkMotion, b.forkMotion, t),
   balanceMotion: lerp(a.balanceMotion, b.balanceMotion, t)
  };
 }
 function trackGeometry(geometry) {
  ownedGeometries.push(geometry);
  return geometry;
 }
 function trackMaterial(material) {
  ownedMaterials.push(material);
  return material;
 }
 function standardMaterial(color, roughness = 0.46, metalness = 0.04) {
  return trackMaterial(new THREE.MeshStandardMaterial({
   color, roughness, metalness,
   side: THREE.DoubleSide,
   polygonOffset: true,
   polygonOffsetFactor: 1,
   polygonOffsetUnits: 1
  }));
 }
 function jewelMaterial(color, opacity) {
  var material = new THREE.MeshPhysicalMaterial({
   color,
   roughness: 0.14,
   metalness: 0,
   transparent: true,
   opacity,
   clearcoat: 1,
   clearcoatRoughness: 0.14,
   reflectivity: 0.7,
   side: THREE.DoubleSide,
   depthWrite: true,
   polygonOffset: true,
   polygonOffsetFactor: 1,
   polygonOffsetUnits: 1
  });
  return trackMaterial(material);
 }
 function edgeMaterial(color, opacity) {
  return trackMaterial(new THREE.LineBasicMaterial({
   color,
   transparent: opacity < 1,
   opacity,
   depthWrite: false,
   toneMapped: false
  }));
 }
 const mats = {};
 function createMaterials() {
  mats.wheel = standardMaterial(COLORS.teal, 0.42, 0.05);
  mats.wheelEdge = edgeMaterial(COLORS.tealEdge, 0.86);
  mats.fork = standardMaterial(COLORS.blue, 0.4, 0.04);
  mats.forkEdge = edgeMaterial(COLORS.blueEdge, 0.88);
  mats.balance = standardMaterial(COLORS.violet, 0.44, 0.03);
  mats.balanceEdge = edgeMaterial(COLORS.violetEdge, 0.86);
  mats.jewel = jewelMaterial(COLORS.ruby, 0.82);
  mats.jewelEdge = edgeMaterial(COLORS.rubyEdge, 0.9);
  mats.jewelGlint = jewelMaterial(COLORS.rubyLight, 0.5);
  mats.spring = standardMaterial(COLORS.spring, 0.58, 0.16);
  mats.red = standardMaterial(COLORS.red, 0.4, 0.03);
  mats.amber = standardMaterial(COLORS.amber, 0.38, 0.02);
  mats.neutral = standardMaterial(COLORS.neutral, 0.56, 0.01);
 }
 function outlined(geometry, material, lineMaterial, threshold) {
  geometry.computeVertexNormals();
  var group = new THREE.Group();
  var mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  group.add(mesh);
  var edgeGeometry = trackGeometry(new THREE.EdgesGeometry(geometry, threshold || 28));
  var edges = new THREE.LineSegments(edgeGeometry, lineMaterial);
  edges.renderOrder = 3;
  group.add(edges);
  return group;
 }
 function shapeFromPoints(points) {
  var shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length; i++) {
   shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
 }
 function extrude(shape, depth, bevel = 0.045) {
  var geometry = new THREE.ExtrudeGeometry(shape, {
   depth,
   steps: 1,
   curveSegments: 48,
   bevelEnabled: bevel > 0,
   bevelSegments: 2,
   bevelSize: bevel,
   bevelThickness: bevel
  });
  geometry.translate(0, 0, -depth / 2);
  return trackGeometry(geometry);
 }
 function annulusShape(outerRadius, innerRadius) {
  var shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  var hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
 }
 function escapeWheelShape(teeth, rootRadius, tipRadius, holeRadius) {
  var points = [];
  var step = Math.PI * 2 / teeth;
  for (var i = 0; i < teeth; i++) {
   var a = Math.PI / 2 + i * step;
   var specs = [
    [-0.5, rootRadius],
    [-0.23, rootRadius],
    [-0.12, tipRadius * 0.91],
    [0.04, tipRadius],
    [0.28, tipRadius * 0.95],
    [0.39, rootRadius * 1.02],
    [0.5, rootRadius]
   ];
   specs.forEach(function (spec) {
    var angle = a + spec[0] * step;
    points.push(new THREE.Vector2(
     Math.cos(angle) * spec[1],
     Math.sin(angle) * spec[1]
    ));
   });
  }
  var shape = shapeFromPoints(points);
  var hole = new THREE.Path();
  hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
 }
 function simpleGearShape(teeth, rootRadius, tipRadius, holeRadius) {
  var points = [];
  var step = Math.PI * 2 / teeth;
  for (var i = 0; i < teeth; i++) {
   var center = Math.PI / 2 + i * step;
   [
    [center - step * 0.5, rootRadius],
    [center - step * 0.22, rootRadius],
    [center - step * 0.18, tipRadius],
    [center + step * 0.18, tipRadius],
    [center + step * 0.22, rootRadius],
    [center + step * 0.5, rootRadius]
   ].forEach(function (spec) {
    points.push(new THREE.Vector2(
     Math.cos(spec[0]) * spec[1],
     Math.sin(spec[0]) * spec[1]
    ));
   });
  }
  var shape = shapeFromPoints(points);
  if (holeRadius) {
   var hole = new THREE.Path();
   hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
   shape.holes.push(hole);
  }
  return shape;
 }
 function barGeometry(start, end, startWidth, endWidth, depth) {
  var dx = end.x - start.x;
  var dy = end.y - start.y;
  var length = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / length;
  var ny = dx / length;
  return extrude(shapeFromPoints([
   new THREE.Vector2(start.x + nx * startWidth, start.y + ny * startWidth),
   new THREE.Vector2(end.x + nx * endWidth, end.y + ny * endWidth),
   new THREE.Vector2(end.x - nx * endWidth, end.y - ny * endWidth),
   new THREE.Vector2(start.x - nx * startWidth, start.y - ny * startWidth)
  ]), depth, 0.035);
 }
 function addBar(parent, start, end, startWidth, endWidth, depth, material, lineMaterial, z) {
  var object = outlined(
   barGeometry(start, end, startWidth, endWidth, depth),
   material,
   lineMaterial,
   30
  );
  object.position.z = z || 0;
  parent.add(object);
  return object;
 }
 function cylinder(radius, depth, material, lineMaterial, z, segments) {
  var geometry = trackGeometry(new THREE.CylinderGeometry(
   radius,
   radius,
   depth,
   segments || 64,
   1,
   false
  ));
  geometry.rotateX(Math.PI / 2);
  var object = outlined(geometry, material, lineMaterial, 34);
  object.position.z = z || 0;
  return object;
 }
 function rectangle(width, height, depth, material, lineMaterial) {
  var shape = shapeFromPoints([
   new THREE.Vector2(-width / 2, -height / 2),
   new THREE.Vector2(width / 2, -height / 2),
   new THREE.Vector2(width / 2, height / 2),
   new THREE.Vector2(-width / 2, height / 2)
  ]);
  return outlined(extrude(shape, depth, 0.045), material, lineMaterial, 27);
 }
 function createWheel() {
  var group = new THREE.Group();
  group.position.set(-3.55, 0, 0);
  var rim = outlined(
   extrude(escapeWheelShape(15, 1.77, 2.2, 1.49), 0.3, 0.042),
   mats.wheel,
   mats.wheelEdge,
   24
  );
  group.add(rim);
  for (var i = 0; i < 5; i++) {
   var angle = Math.PI / 2 + i * Math.PI * 2 / 5;
   addBar(
    group,
    new THREE.Vector2(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28),
    new THREE.Vector2(Math.cos(angle) * 1.56, Math.sin(angle) * 1.56),
    0.14,
    0.09,
    0.25,
    mats.wheel,
    mats.wheelEdge,
    0.02
   );
  }
  group.add(cylinder(0.43, 0.42, mats.wheel, mats.wheelEdge, 0.07));
  group.add(cylinder(0.16, 0.52, standardMaterial(COLORS.tealEdge, 0.36, 0.12), mats.wheelEdge, 0.13));
  var pinion = outlined(
   extrude(simpleGearShape(10, 0.35, 0.53, 0.15), 0.34, 0.035),
   mats.wheel,
   mats.wheelEdge,
   25
  );
  pinion.position.z = 0.4;
  group.add(pinion);
  return group;
 }
 function forkShape() {
  return shapeFromPoints([
   new THREE.Vector2(-0.28, 0.25),
   new THREE.Vector2(-0.58, 0.58),
   new THREE.Vector2(-0.82, 1.1),
   new THREE.Vector2(-1.37, 1.48),
   new THREE.Vector2(-1.64, 1.16),
   new THREE.Vector2(-1.14, 0.8),
   new THREE.Vector2(-0.98, 0.38),
   new THREE.Vector2(-0.72, 0),
   new THREE.Vector2(-0.98, -0.38),
   new THREE.Vector2(-1.14, -0.8),
   new THREE.Vector2(-1.64, -1.16),
   new THREE.Vector2(-1.37, -1.48),
   new THREE.Vector2(-0.82, -1.1),
   new THREE.Vector2(-0.58, -0.58),
   new THREE.Vector2(-0.28, -0.25),
   new THREE.Vector2(2.45, -0.25),
   new THREE.Vector2(2.78, -0.48),
   new THREE.Vector2(3.12, -0.48),
   new THREE.Vector2(2.94, -0.18),
   new THREE.Vector2(3.25, -0.08),
   new THREE.Vector2(3.25, 0.08),
   new THREE.Vector2(2.94, 0.18),
   new THREE.Vector2(3.12, 0.48),
   new THREE.Vector2(2.78, 0.48),
   new THREE.Vector2(2.45, 0.25)
  ]);
 }
 function createPallet(position, rotation) {
  var pallet = new THREE.Group();
  pallet.position.set(position.x, position.y, 0.38);
  pallet.rotation.z = rotation;
  var jewel = rectangle(0.72, 0.26, 0.3, mats.jewel, mats.jewelEdge);
  pallet.add(jewel);
  var glint = rectangle(0.48, 0.045, 0.035, mats.jewelGlint, mats.jewelEdge);
  glint.position.set(-0.03, 0.055, 0.185);
  glint.scale.y = 0.7;
  pallet.add(glint);
  return pallet;
 }
 function halo(color) {
  var geometry = trackGeometry(new THREE.RingGeometry(0.22, 0.31, 64));
  var material = trackMaterial(new THREE.MeshBasicMaterial({
   color,
   transparent: true,
   opacity: 0,
   depthTest: false,
   depthWrite: false,
   side: THREE.DoubleSide,
   toneMapped: false
  }));
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 1.08;
  mesh.renderOrder = 20;
  return mesh;
 }
 function createFork() {
  var group = new THREE.Group();
  group.position.set(0, 0, 0.3);
  var body = outlined(extrude(forkShape(), 0.34, 0.055), mats.fork, mats.forkEdge, 27);
  group.add(body);
  group.add(cylinder(0.31, 0.48, mats.fork, mats.forkEdge, 0.08));
  group.add(cylinder(0.12, 0.56, standardMaterial(COLORS.blueEdge, 0.34, 0.12), mats.forkEdge, 0.13));
  var topPallet = createPallet(new THREE.Vector2(-1.47, 1.22), -0.14);
  var bottomPallet = createPallet(new THREE.Vector2(-1.47, -1.22), 0.62);
  group.add(topPallet, bottomPallet);
  entryHalo = halo(COLORS.amber);
  entryHalo.position.set(-1.47, 1.22, 1.08);
  exitHalo = halo(COLORS.amber);
  exitHalo.position.set(-1.47, -1.22, 1.08);
  group.add(entryHalo, exitHalo);
  return group;
 }
 function createSpiral() {
  var points = [];
  for (var i = 0; i <= 230; i++) {
   var t = i / 230;
   var angle = t * Math.PI * 11.8;
   var radius = 0.18 + t * 1.48;
   points.push(new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    -0.1
   ));
  }
  var curve = new THREE.CatmullRomCurve3(points);
  var geometry = trackGeometry(new THREE.TubeGeometry(curve, 260, 0.029, 8, false));
  var mesh = new THREE.Mesh(geometry, mats.spring);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
 }
 function createBalance() {
  var group = new THREE.Group();
  group.position.set(4, 0.04, 0.08);
  group.add(outlined(
   extrude(annulusShape(2.0, 1.7), 0.32, 0.05),
   mats.balance,
   mats.balanceEdge,
   30
  ));
  [Math.PI / 2, Math.PI / 2 + Math.PI * 2 / 3, Math.PI / 2 + Math.PI * 4 / 3].forEach(function (angle) {
   addBar(
    group,
    new THREE.Vector2(Math.cos(angle) * 0.3, Math.sin(angle) * 0.3),
    new THREE.Vector2(Math.cos(angle) * 1.76, Math.sin(angle) * 1.76),
    0.14,
    0.09,
    0.27,
    mats.balance,
    mats.balanceEdge,
    0.02
   );
  });
  group.add(cylinder(0.48, 0.44, mats.balance, mats.balanceEdge, 0.08));
  group.add(cylinder(0.2, 0.54, standardMaterial(COLORS.violetEdge, 0.34, 0.1), mats.balanceEdge, 0.15));
  var roller = cylinder(0.61, 0.16, mats.jewel, mats.jewelEdge, -0.24);
  group.add(roller);
  var rollerJewel = cylinder(0.15, 0.28, mats.jewel, mats.jewelEdge, 0.38);
  rollerJewel.position.x = -0.7;
  group.add(rollerJewel);
  rollerHalo = halo(COLORS.amber);
  rollerHalo.position.set(-0.7, 0, 1.08);
  group.add(rollerHalo);
  return group;
 }
 function tubeThrough(points, radius, material) {
  var curve = new THREE.CatmullRomCurve3(points);
  var geometry = trackGeometry(new THREE.TubeGeometry(curve, 90, radius, 9, false));
  var mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.renderOrder = 8;
  return { mesh, curve };
 }
 function arrowHead(curve, radius, length, material) {
  var geometry = trackGeometry(new THREE.ConeGeometry(radius, length, 24));
  var mesh = new THREE.Mesh(geometry, material);
  var end = curve.getPoint(1);
  var tangent = curve.getTangent(1).normalize();
  mesh.position.copy(end);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  mesh.castShadow = true;
  mesh.renderOrder = 9;
  return mesh;
 }
 function transparentStandard(color, opacity) {
  var material = standardMaterial(color, 0.4, 0.02);
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  return material;
 }
 function createEvidenceMarks() {
  var torquePoints = [];
  for (var i = 0; i <= 48; i++) {
   var torqueAngle = (140 + i * (165 / 48)) * Math.PI / 180;
   torquePoints.push(new THREE.Vector3(
    -3.55 + Math.cos(torqueAngle) * 2.55,
    Math.sin(torqueAngle) * 2.55,
    0.8
   ));
  }
  var torque = tubeThrough(torquePoints, 0.026, mats.red);
  assembly.add(torque.mesh, arrowHead(torque.curve, 0.12, 0.34, mats.red));
  var guidePoints = [];
  for (var g = 0; g <= 24; g++) {
   var guideAngle = (78 + g) * Math.PI / 180;
   guidePoints.push(new THREE.Vector3(
    -3.55 + Math.cos(guideAngle) * 2.47,
    Math.sin(guideAngle) * 2.47,
    0.83
   ));
  }
  var guide = tubeThrough(guidePoints, 0.018, mats.neutral);
  assembly.add(guide.mesh);
  pitchActiveMaterial = transparentStandard(COLORS.tealEdge, 0);
  var activeGuide = tubeThrough(guidePoints, 0.032, pitchActiveMaterial);
  assembly.add(activeGuide.mesh);
  var impulse = tubeThrough([
   new THREE.Vector3(-1.47, -1.18, 1.02),
   new THREE.Vector3(0, 0, 1.04),
   new THREE.Vector3(3.3, 0.04, 1.04)
  ], 0.034, transparentStandard(COLORS.amber, 0));
  impulseMaterial = impulse.mesh.material;
  assembly.add(impulse.mesh, arrowHead(impulse.curve, 0.12, 0.32, impulseMaterial));
  var forkArcPoints = [];
  for (var f = 0; f <= 24; f++) {
   var forkAngle = (132 + f * (88 / 24)) * Math.PI / 180;
   forkArcPoints.push(new THREE.Vector3(
    Math.cos(forkAngle) * 0.9,
    Math.sin(forkAngle) * 0.9,
    1.12
   ));
  }
  forkMotionMaterial = transparentStandard(COLORS.blueEdge, 0);
  var forkArc = tubeThrough(forkArcPoints, 0.025, forkMotionMaterial);
  assembly.add(forkArc.mesh, arrowHead(forkArc.curve, 0.09, 0.24, forkMotionMaterial));
  var balanceArcPoints = [];
  for (var b = 0; b <= 28; b++) {
   var balanceAngle = (64 + b * (55 / 28)) * Math.PI / 180;
   balanceArcPoints.push(new THREE.Vector3(
    4 + Math.cos(balanceAngle) * 2.34,
    0.04 + Math.sin(balanceAngle) * 2.34,
    0.85
   ));
  }
  balanceMotionMaterial = transparentStandard(COLORS.violetEdge, 0);
  var balanceArc = tubeThrough(balanceArcPoints, 0.024, balanceMotionMaterial);
  assembly.add(balanceArc.mesh, arrowHead(balanceArc.curve, 0.09, 0.24, balanceMotionMaterial));
 }
 function setOpacity(material, opacity) {
  if (!material) return;
  var nextOpacity = clamp(opacity, 0, 1);
  var nextTransparent = nextOpacity < 0.999;
  if (material.transparent !== nextTransparent) {
   material.transparent = nextTransparent;
   material.needsUpdate = true;
  }
  material.opacity = nextOpacity;
  material.depthWrite = nextOpacity > 0.9;
 }
 function initThree() {
  if (!window.THREE) throw new Error('Three.js unavailable');
  renderer = new THREE.WebGLRenderer({
   canvas,
   antialias: true,
   alpha: true,
   preserveDrawingBuffer: true,
   powerPreference: 'high-performance'
  });
  renderer.setClearColor(COLORS.paper, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping) {
   renderer.toneMapping = THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure = 1.1;
  }
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-8, 8, 3, -3, 0.1, 50);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe4e1, 1.5));
  var keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
  keyLight.position.set(-5, 8, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);
  var fillLight = new THREE.DirectionalLight(0xbfd7ff, 0.72);
  fillLight.position.set(8, -3, 9);
  scene.add(fillLight);
  viewRoot = new THREE.Group();
  viewRoot.rotation.set(defaultView.x, defaultView.y, defaultView.z);
  scene.add(viewRoot);
  assembly = new THREE.Group();
  assembly.position.set(-0.08, -0.02, 0);
  viewRoot.add(assembly);
  createMaterials();
  wheelGroup = createWheel();
  forkGroup = createFork();
  balanceGroup = createBalance();
  springGroup = new THREE.Group();
  springGroup.position.set(4, 0.04, -0.06);
  springGroup.add(createSpiral());
  assembly.add(wheelGroup, springGroup, balanceGroup, forkGroup);
  calloutAnchors.wheel = new THREE.Object3D();
  calloutAnchors.wheel.position.set(-0.76, 1.58, 0.62);
  wheelGroup.add(calloutAnchors.wheel);
  calloutAnchors.fork = new THREE.Object3D();
  calloutAnchors.fork.position.set(0, 0, 0.92);
  forkGroup.add(calloutAnchors.fork);
  calloutAnchors.balance = new THREE.Object3D();
  calloutAnchors.balance.position.set(0.82, 1.62, 0.64);
  balanceGroup.add(calloutAnchors.balance);
  calloutAnchors.entry = entryHalo;
  calloutAnchors.exit = exitHalo;
  projectionVector = new THREE.Vector3();
  createEvidenceMarks();
  var shadowMaterial = trackMaterial(new THREE.ShadowMaterial({
   color: COLORS.shadow,
   transparent: true,
   opacity: 0.038,
   depthWrite: false
  }));
  var shadowPlane = new THREE.Mesh(
   trackGeometry(new THREE.PlaneGeometry(15, 5.5)),
   shadowMaterial
  );
  shadowPlane.position.set(0, -0.05, -0.85);
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = -1;
  viewRoot.add(shadowPlane);
 }
 function renderCopy(index) {
  if (index === currentCopy) return;
  currentCopy = index;
  var state = STATES[index];
  stateTitle.textContent = state.title;
  stateCopy.innerHTML = '<strong>' + state.lead + '</strong>' + state.copy;
  wheelReading.textContent = state.reading;
  beatButtons.forEach(function (button, buttonIndex) {
   if (buttonIndex === index) button.setAttribute('aria-current', 'step');
   else button.removeAttribute('aria-current');
  });
 }
 function projectAnchor(object) {
  object.getWorldPosition(projectionVector);
  projectionVector.project(camera);
  return {
   x: (projectionVector.x * 0.5 + 0.5) * renderShell.clientWidth,
   y: (-projectionVector.y * 0.5 + 0.5) * renderShell.clientHeight
  };
 }
 function pointText(point) {
  return point.x.toFixed(1) + ' ' + point.y.toFixed(1);
 }
 function placeDot(node, point) {
  node.setAttribute('cx', point.x.toFixed(1));
  node.setAttribute('cy', point.y.toFixed(1));
 }
 function updateCallouts() {
  if (!camera || !projectionVector || !calloutAnchors.wheel) return;
  var wheel = projectAnchor(calloutAnchors.wheel);
  var fork = projectAnchor(calloutAnchors.fork);
  var balance = projectAnchor(calloutAnchors.balance);
  var entry = projectAnchor(calloutAnchors.entry);
  var exit = projectAnchor(calloutAnchors.exit);
  calloutNodes.wheelLine.setAttribute(
   'd',
   'M208 82H270L' + pointText({ x: wheel.x - 24, y: wheel.y - 14 }) + 'L' + pointText(wheel)
  );
  calloutNodes.forkLine.setAttribute(
   'd',
   'M725 424L710 380L' + pointText({ x: fork.x, y: fork.y + 24 }) + 'L' + pointText(fork)
  );
  calloutNodes.balanceLine.setAttribute(
   'd',
   'M1196 78H1174L' + pointText({ x: balance.x + 20, y: balance.y - 18 }) + 'L' + pointText(balance)
  );
  calloutNodes.entryLine.setAttribute(
   'd',
   'M626 78L' + pointText({ x: entry.x + 18, y: entry.y - 12 }) + 'L' + pointText(entry)
  );
  calloutNodes.exitLine.setAttribute(
   'd',
   'M626 78V' + (exit.y + 12).toFixed(1) + 'L' +
    pointText({ x: exit.x + 18, y: exit.y + 10 }) + 'L' + pointText(exit)
  );
  placeDot(calloutNodes.wheelDot, wheel);
  placeDot(calloutNodes.forkDot, fork);
  placeDot(calloutNodes.balanceDot, balance);
  placeDot(calloutNodes.entryDot, entry);
  placeDot(calloutNodes.exitDot, exit);
 }
 function requestRender() {
  if (!renderer || destroyed || renderFrame) return;
  renderFrame = requestAnimationFrame(function () {
   renderFrame = 0;
   scene.updateMatrixWorld(true);
   updateCallouts();
   renderer.render(scene, camera);
  });
 }
 function applyProgress(progress) {
  currentProgress = clamp(Number(progress) || 0, 0, 3);
  var visual = visualAt(currentProgress);
  if (wheelGroup) wheelGroup.rotation.z = visual.wheel;
  if (forkGroup) forkGroup.rotation.z = visual.fork;
  if (balanceGroup) balanceGroup.rotation.z = visual.balance;
  if (springGroup) springGroup.rotation.z = visual.balance * 0.08;
  if (entryHalo) entryHalo.material.opacity = visual.entry * 0.95;
  if (exitHalo) exitHalo.material.opacity = visual.exit * 0.95;
  if (rollerHalo) rollerHalo.material.opacity = visual.roller * 0.9;
  setOpacity(impulseMaterial, visual.impulse * 0.94);
  setOpacity(forkMotionMaterial, visual.forkMotion * 0.82);
  setOpacity(balanceMotionMaterial, visual.balanceMotion * 0.78);
  setOpacity(pitchActiveMaterial, 0.08 + clamp(visual.wheel / (Math.PI * 2 / 15), 0, 1) * 0.92);
  timeline.value = currentProgress.toFixed(3);
  trackFill.style.transform = 'scaleX(' + (currentProgress / 3).toFixed(4) + ')';
  renderCopy(Math.round(currentProgress));
  requestRender();
 }
 function resizeRenderer() {
  if (!renderer || destroyed) return;
  var width = renderShell.clientWidth;
  var height = renderShell.clientHeight;
  if (!width || !height) return;
  var ratio = Deck && Deck.ratio ? Deck.ratio() : Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(Math.min(2.25, ratio));
  renderer.setSize(width, height, false);
  var aspect = width / height;
  var frustumHeight = 5.48;
  camera.left = -frustumHeight * aspect / 2;
  camera.right = frustumHeight * aspect / 2;
  camera.top = frustumHeight / 2;
  camera.bottom = -frustumHeight / 2;
  camera.updateProjectionMatrix();
  requestRender();
 }
 function cancelAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
 }
 function setPlaying(value) {
  playing = value;
  playButton.dataset.playing = value ? 'true' : 'false';
  playButton.setAttribute('aria-label', value ? '暂停擒纵周期' : '播放一个完整擒纵周期');
  playLabel.textContent = value ? '暂停' : '播放一个周期';
 }
 function stopPlayback(settle) {
  playGeneration++;
  clearTimeout(playTimer);
  playTimer = 0;
  cancelAnimation();
  if (settle) applyProgress(Math.round(currentProgress));
  setPlaying(false);
 }
 function animateTo(target, duration, done) {
  cancelAnimation();
  target = clamp(target, 0, 3);
  if (reduced() || duration <= 0) {
   applyProgress(target);
   if (done) done();
   return;
  }
  var from = currentProgress;
  var started = performance.now();
  function frame(now) {
   if (destroyed) return;
   var t = Math.min(1, (now - started) / duration);
   applyProgress(lerp(from, target, ease(t)));
   if (t < 1) animationFrame = requestAnimationFrame(frame);
   else {
    animationFrame = 0;
    if (done) done();
   }
  }
  animationFrame = requestAnimationFrame(frame);
 }
 function goTo(index, instant) {
  if (destroyed) return;
  stopPlayback(false);
  animateTo(clamp(Number(index) || 0, 0, 3), instant ? 0 : 700);
 }
 function play() {
  if (destroyed) return;
  if (playing) {
   stopPlayback(true);
   return;
  }
  stopPlayback(false);
  if (currentProgress > 2.9) applyProgress(0);
  setPlaying(true);
  var generation = ++playGeneration;
  var next = Math.max(1, Math.floor(currentProgress + 0.001) + 1);
  function advance() {
   if (!playing || destroyed || generation !== playGeneration) return;
   if (next > 3) {
    setPlaying(false);
    return;
   }
   animateTo(next, reduced() ? 0 : 740, function () {
    next++;
    playTimer = setTimeout(advance, reduced() ? 520 : 680);
   });
  }
  playTimer = setTimeout(advance, reduced() ? 180 : 360);
 }
 function resetView() {
  if (!viewRoot || destroyed) return;
  viewRoot.rotation.set(defaultView.x, defaultView.y, defaultView.z);
  requestRender();
 }
 function reset() {
  if (destroyed) return;
  stopPlayback(false);
  resetView();
  applyProgress(0);
 }
 function bindViewDrag() {
  var dragging = false;
  var start = null;
  var startRotation = null;
  listen(canvas, 'pointerdown', function (event) {
   if (!viewRoot) return;
   dragging = true;
   activePointer = event.pointerId;
   renderShell.dataset.dragging = 'true';
   canvas.setPointerCapture(event.pointerId);
   start = Deck.pt(renderShell, event);
   startRotation = { x: viewRoot.rotation.x, y: viewRoot.rotation.y };
  });
  listen(canvas, 'pointermove', function (event) {
   if (!dragging || !viewRoot) return;
   var point = Deck.pt(renderShell, event);
   viewRoot.rotation.y = clamp(startRotation.y + (point.x - start.x) * 0.002, -0.2, 0.3);
   viewRoot.rotation.x = clamp(startRotation.x + (point.y - start.y) * 0.002, -0.52, -0.12);
   requestRender();
  });
  function endDrag(event) {
   if (!dragging && activePointer === null) return;
   dragging = false;
   renderShell.dataset.dragging = 'false';
   var pointerId = activePointer === null ? event.pointerId : activePointer;
   activePointer = null;
   if (event.type !== 'lostpointercapture' && canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
   }
  }
  listen(canvas, 'pointerup', endDrag);
  listen(canvas, 'pointercancel', endDrag);
  listen(canvas, 'lostpointercapture', endDrag);
  listen(canvas, 'dblclick', resetView);
 }
 function onKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  var target = event.target;
  var tag = target && target.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
  if (event.key === 'ArrowRight') {
   event.preventDefault();
   goTo(Math.min(3, Math.round(currentProgress) + 1));
  } else if (event.key === 'ArrowLeft') {
   event.preventDefault();
   goTo(Math.max(0, Math.round(currentProgress) - 1));
  } else if (event.key === ' ' || event.code === 'Space') {
   event.preventDefault();
   play();
  } else if (event.key === 'r' || event.key === 'R' || event.key === 'Escape') {
   event.preventDefault();
   reset();
  } else if (/^[1-4]$/.test(event.key)) {
   event.preventDefault();
   goTo(Number(event.key) - 1);
  }
 }
 function onReducedChange() {
  reducedOverride = null;
  stopPlayback(false);
  applyProgress(reduceQuery.matches ? 2 : 0);
 }
 function cleanup() {
  if (destroyed) return;
  destroyed = true;
  stopPlayback(false);
  if (activePointer !== null && canvas.hasPointerCapture(activePointer)) {
   canvas.releasePointerCapture(activePointer);
  }
  activePointer = null;
  renderShell.dataset.dragging = 'false';
  if (renderFrame) cancelAnimationFrame(renderFrame);
  renderFrame = 0;
  aborter.abort();
  if (offResize) offResize();
  if (resizeObserver) resizeObserver.disconnect();
  if (reduceQuery.removeEventListener) reduceQuery.removeEventListener('change', onReducedChange);
  else reduceQuery.removeListener(onReducedChange);
  releaseGraphics();
  if (window.__escapement === publicApi) delete window.__escapement;
 }
 function releaseGraphics() {
  ownedGeometries.splice(0).forEach(function (geometry) { geometry.dispose(); });
  ownedMaterials.splice(0).forEach(function (material) { material.dispose(); });
  if (renderer) {
   renderer.dispose();
   if (renderer.forceContextLoss) renderer.forceContextLoss();
   renderer = null;
  }
 }
 Deck.init({ title: '机械钟为什么不会一下走完？｜Notale', keys: false });
 try {
  initThree();
  bindViewDrag();
 } catch (error) {
  stage.classList.add('webgl-failed');
  releaseGraphics();
  console.warn('WebGL fallback active:', error && error.message ? error.message : error);
 }
 applyProgress(currentProgress);
 resizeRenderer();
 resizeObserver = new ResizeObserver(resizeRenderer);
 resizeObserver.observe(renderShell);
 offResize = Deck.onResize(resizeRenderer);
 listen(playButton, 'click', play);
 listen(resetButton, 'click', reset);
 listen(timeline, 'input', function () {
  stopPlayback(false);
  applyProgress(timeline.value);
 });
 beatButtons.forEach(function (button) {
  listen(button, 'click', function () {
   goTo(button.dataset.state);
  });
 });
 listen(document, 'keydown', onKey);
 listen(document, 'visibilitychange', function () {
  if (document.hidden && playing) stopPlayback(true);
 });
 listen(window, 'pagehide', cleanup, { once: true });
 if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onReducedChange);
 else reduceQuery.addListener(onReducedChange);
 publicApi = {
  goTo: function (index, animate) {
   goTo(index, animate !== false);
  },
  setProgress: function (progress) {
   if (destroyed) return;
   stopPlayback(false);
   applyProgress(progress);
  },
  play,
  reset,
  resetView,
  getState: function () {
   return {
    progress: currentProgress,
    index: Math.round(currentProgress),
    id: STATES[Math.round(currentProgress)].id,
    playing,
    reduced: reduced(),
    renderer: destroyed ? 'disposed' : renderer ? 'webgl' : 'fallback',
    disposed: destroyed
   };
  },
  setReducedForTest: function (value) {
   if (destroyed) return;
   reducedOverride = !!value;
   stopPlayback(false);
   applyProgress(reducedOverride ? 2 : 0);
  },
  clearReducedOverride: function () {
   if (destroyed) return;
   reducedOverride = null;
   reset();
  },
  destroy: cleanup
 };
 window.__escapement = publicApi;
})();
```
  </file>
</sample>
