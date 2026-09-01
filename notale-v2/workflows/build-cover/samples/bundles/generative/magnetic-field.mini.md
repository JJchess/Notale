<sample id="magnetic-field" category="generative" variant="mini">
  <file path="samples/generative/magnetic-field/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="theme-color" content="#10110f">
 <title>磁场｜看不见的秩序</title>
 <link rel="stylesheet" href="assets/base.css">
 <link rel="stylesheet" href="assets/style.css">
</head>
<body>
 <main id="stage" aria-labelledby="cover-title">
 <canvas id="field" class="cv-fill" aria-hidden="true"></canvas>
 <section class="cover-copy" aria-label="封面标题">
 <h1 id="cover-title">磁场</h1>
 <p class="subtitle">看不见的秩序</p>
 </section>
 <figure class="dipole" role="img"
 aria-label="水平磁偶极。磁力线从右侧北极出发，绕过标题区域，汇入左侧南极。">
 <div class="magnet-core">
 <span class="pole south">S</span><span class="pole north">N</span>
 </div>
 </figure>
 <p class="fallback-copy" role="status">磁力线由 N 极出发，绕过标题，汇入 S 极。</p>
 </main>
 <script src="assets/lib/seedrandom.min.js"></script>
 <script src="assets/base.js"></script>
 <script src="assets/app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/generative/magnetic-field/mini/pages/assets/app.js">
```javascript
(() => {
 "use strict";

 const WIDTH = 1600;
 const HEIGHT = 900;
 const REPRESENTATIVE_TIME = 5200;
 const SEED = "notale-magnetic-01";
 const NORTH = { x: 1282, y: 450, charge: 1 };
 const SOUTH = { x: 994, y: 450, charge: -1 };
 const POLES = [NORTH, SOUTH];
 const TITLE_FIELD = { x: 382, y: 431, radiusX: 356, radiusY: 342 };
 const canvas = document.querySelector("#field");
 const stage = document.querySelector("#stage");
 const staticLayer = document.createElement("canvas");
 const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
 const listeners = new AbortController();
 let context;
 let model;
 let currentTime = 0;
 let resizeFrame = 0;
 let disposed = false;
 let stopLoop = () => {};
 let removeResize = () => {};

 Deck.init({ title: "磁场｜看不见的秩序", keys: false });

 function distance(x, y) {
 return Math.hypot(x, y);
 }

 function titleDistance(x, y) {
 return distance(
 (x - TITLE_FIELD.x) / TITLE_FIELD.radiusX,
 (y - TITLE_FIELD.y) / TITLE_FIELD.radiusY
 );
 }

 function insideMagnet(x, y) {
 return x > 982 && x < 1306 && y > 404 && y < 496;
 }

 function fieldAt(x, y) {
 let fieldX = 0;
 let fieldY = 0;
 for (const pole of POLES) {
 const deltaX = x - pole.x;
 const deltaY = y - pole.y;
 const radiusSquared = deltaX * deltaX + deltaY * deltaY + 340;
 const influence = pole.charge / Math.pow(radiusSquared, 1.5);
 fieldX += deltaX * influence;
 fieldY += deltaY * influence;
 }
 const strength = distance(fieldX, fieldY);
 if (strength < 1e-12) return { x: 1, y: 0 };
 fieldX /= strength;
 fieldY /= strength;

 return { x: fieldX, y: fieldY };
 }

 function integrateLine(angle, radialOffset) {
 const step = 3.25;
 let x = NORTH.x + Math.cos(angle) * (25.5 + radialOffset);
 let y = NORTH.y + Math.sin(angle) * (25.5 + radialOffset);
 const points = [];
 let escapedSteps = 0;
 for (let index = 0; index < 1900; index += 1) {
 if (index % 2 === 0) {
 points.push({ x, y });
 }
 if (index > 14 && distance(x - SOUTH.x, y - SOUTH.y) < 24) break;
 const first = fieldAt(x, y);
 const middle = fieldAt(x + first.x * step / 2, y + first.y * step / 2);
 x += middle.x * step;
 y += middle.y * step;
 const escaped = x < -760 || x > 2420 || y < -1050 || y > 1950;
 escapedSteps = escaped ? escapedSteps + 1 : 0;
 if (escapedSteps > 24) break;
 }
 if (points.length < 8) return null;
 return { points };
 }

 function buildModel() {
 const random = new Math.seedrandom(`${SEED}/streamlines`);
 const paths = [];
 let tracerPath;
 for (let index = 0; index < 84; index += 1) {
 const evenAngle = Math.PI * 2 * (index + .5) / 84;
 const angle = evenAngle + (random() - .5) * .026;
 const path = integrateLine(angle, (random() - .5) * 4.2);
 if (!path) continue;
 path.alpha = .13 + random() * .12;
 path.width = .65 + random() * .7;
 paths.push(path);
 if (index === 27) tracerPath = path;
 }
 return {
 paths,
 tracer: { path: tracerPath || paths[0], phase: .2, period: 11800 }
 };
 }

 function samplePath(path, progress) {
 const position = Math.max(0, Math.min(1, progress)) * (path.points.length - 1);
 const index = Math.max(1, Math.ceil(position));
 const start = path.points[index - 1];
 const end = path.points[index];
 const amount = position - index + 1;
 return {
 x: start.x + (end.x - start.x) * amount,
 y: start.y + (end.y - start.y) * amount
 };
 }

 function color(rgb, alpha) {
 return `rgba(${rgb.join(",")},${alpha})`;
 }

 function drawVisiblePath(target, path) {
 target.beginPath();
 let drawing = false;
 for (const point of path.points) {
 const hidden = titleDistance(point.x, point.y) < 1.01 || insideMagnet(point.x, point.y);
 if (hidden) drawing = false;
 else if (!drawing) {
 target.moveTo(point.x, point.y);
 drawing = true;
 } else target.lineTo(point.x, point.y);
 }
 }

 function drawStatic() {
 staticLayer.width = canvas.width;
 staticLayer.height = canvas.height;
 const target = staticLayer.getContext("2d");
 if (!target) throw new Error("Static canvas unavailable");
 const ratio = canvas.__r || 1;
 target.setTransform(ratio, 0, 0, ratio, 0, 0);
 target.fillStyle = color(Deck.rgb("bg"), 1);
 target.fillRect(0, 0, WIDTH, HEIGHT);
 target.lineCap = "round";
 target.lineJoin = "round";
 const fieldColor = Deck.rgb("field");
 for (const path of model.paths) {
 drawVisiblePath(target, path);
 target.strokeStyle = color(fieldColor, path.alpha);
 target.lineWidth = path.width;
 target.stroke();
 }
 }

 function drawTracer(time) {
 const tracer = model.tracer;
 const progress = (tracer.phase + time / tracer.period) % 1;
 const bright = Deck.rgb("field-bright");
 let previous = null;
 context.lineCap = "round";
 for (let index = 34; index >= 0; index -= 1) {
 const tailProgress = progress - index * .0045;
 if (tailProgress <= 0) continue;
 const point = samplePath(tracer.path, tailProgress);
 const hidden = titleDistance(point.x, point.y) < 1.02 || insideMagnet(point.x, point.y);
 if (hidden) {
 previous = null;
 continue;
 }
 if (previous) {
 const weight = 1 - index / 34;
 context.strokeStyle = color(bright, weight * weight * .86);
 context.lineWidth = .55 + weight * 2.4;
 context.beginPath();
 context.moveTo(previous.x, previous.y);
 context.lineTo(point.x, point.y);
 context.stroke();
 }
 previous = point;
 }
 const head = samplePath(tracer.path, progress);
 if (titleDistance(head.x, head.y) < 1.02 || insideMagnet(head.x, head.y)) return;
 context.fillStyle = color(bright, .96);
 context.beginPath();
 context.arc(head.x, head.y, 2.8, 0, Math.PI * 2);
 context.fill();
 }

 function render(time) {
 if (!context || !model || disposed) return;
 currentTime = time;
 context.clearRect(0, 0, WIDTH, HEIGHT);
 context.drawImage(staticLayer, 0, 0, WIDTH, HEIGHT);
 drawTracer(time);
 }

 function activateFallback() {
 stopLoop();
 stage.classList.add("field-fallback");
 }

 function rebuild() {
 if (!Math.seedrandom) return activateFallback();
 try {
 context = Deck.fit(canvas);
 if (!context) return activateFallback();
 model = buildModel();
 drawStatic();
 render(currentTime);
 } catch {
 activateFallback();
 }
 }

 function startMotion() {
 stopLoop();
 if (stage.classList.contains("field-fallback")) return;
 stopLoop = Deck.loop(time => {
 render(time);
 }, { still: REPRESENTATIVE_TIME });
 }

 function reset() {
 if (disposed) return;
 stopLoop();
 currentTime = 0;
 rebuild();
 startMotion();
 }

 function queueResize() {
 cancelAnimationFrame(resizeFrame);
 resizeFrame = requestAnimationFrame(() => {
 resizeFrame = 0;
 rebuild();
 });
 }

 function cleanup() {
 if (disposed) return;
 disposed = true;
 stopLoop();
 removeResize();
 cancelAnimationFrame(resizeFrame);
 listeners.abort();
 }

 document.addEventListener("keydown", event => {
 if (event.key === "r" || event.key === "R") reset();
 }, { signal: listeners.signal });
 motionPreference.addEventListener("change", reset, { signal: listeners.signal });
 window.addEventListener("pagehide", cleanup, { signal: listeners.signal, once: true });
 removeResize = Deck.onResize(queueResize);
 rebuild();
 startMotion();
})();
```
  </file>
</sample>
