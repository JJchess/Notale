<sample id="climate-zone-shift-map" category="chart" variant="mini">
  <file path="samples/chart/climate-zone-shift-map/mini/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Climate lines move</title>
<link rel="stylesheet" href="assets/base.css">
<style>
:root{--bg:#dfe9e9;--text:#18201f;--focus:#164b58;--paper:rgba(248,247,240,.94);--font-sans:Arial,Helvetica,sans-serif}
#stage{position:fixed}
.map{position:absolute;left:236.8px;top:160px;width:1126.4px;height:640px}
.map>canvas,.fallback{position:absolute;inset:0;width:100%;height:100%}
#future,.future{opacity:0;transition:opacity 1.1s cubic-bezier(.4,0,.2,1)}
.show-future #future,.show-future .future{opacity:1}
.instant #future,.instant .future{transition:none}
header,.controls,.city-copy,.legend{background:var(--paper)}
header{position:absolute;z-index:4;left:36px;top:30px;width:565px;padding:16px 19px;border-left:5px solid #164b58}
.eyebrow{font-size:13px;letter-spacing:.12em;font-weight:700;color:#355b61}
h1{font:500 42px/.98 Georgia,serif;margin:7px 0 8px;letter-spacing:-.025em}
header p{font-size:16px;line-height:1.35}
.controls{position:absolute;z-index:5;right:34px;top:32px;display:flex;border:1px solid #667875}
.controls button{height:48px;padding:0 17px;border:0;border-right:1px solid #879592;background:transparent;font-weight:700;cursor:pointer}
.controls button:last-child{border:0}
.controls [aria-pressed=true]{color:#fff;background:#164b58}
.annotation{position:absolute;z-index:3;left:640px;top:30px;width:430px;pointer-events:none}
.city-point{position:absolute;z-index:3;width:14px;height:14px;transform:translate(-50%,-50%);border:3px solid #fff;background:#18201f;outline:2px solid #18201f;border-radius:50%}
.city-copy{padding:9px 13px;border-top:3px solid #18201f}
.city-copy strong{font:600 21px Georgia,serif}
.city-copy p{font-size:14px;line-height:1.3;margin-top:4px}
.city-copy span{display:inline-block;width:9px;height:9px;margin-right:6px;border:1px solid #333}
.present-row span{background:#cbd6ff}.future-row span{background:#bcdfff}
.future-row,.is-future .present-row{opacity:.52}
.is-future .future-row{opacity:1;font-weight:700}
.legend{position:absolute;z-index:4;left:36px;right:36px;bottom:26px;height:59px;padding:10px 13px;display:grid;grid-template-columns:180px 1fr 260px;gap:13px;align-items:center;border-top:1px solid #667875}
.legend strong,#stateNote{font-size:14px;font-weight:700}
.palette{height:21px;display:grid;grid-template-columns:repeat(30,1fr);border:1px solid #596865}
#stateNote{text-align:right;line-height:1.3}
.fallback{display:grid;grid-template:repeat(25,1fr)/repeat(44,1fr)}
.failure{position:absolute;z-index:3;inset:280px 480px;padding:35px;background:#f8f7f0;border:2px solid;text-align:center}
.failure h2{font:30px Georgia,serif;margin-bottom:10px}.failure p{font-size:17px;line-height:1.4}
</style>
</head>
<body>
<main id="stage">
<div class="map" aria-label="2023 and 2070 Köppen-Geiger map">
  <canvas id="present"></canvas><canvas id="future"></canvas>
  <div id="fallbackPresent" class="fallback" hidden></div>
  <div id="fallbackFuture" class="fallback future" hidden></div>
  <i class="city-point" id="cityPoint" aria-hidden="true"></i>
  <section class="failure" id="failure" hidden><h2>Grid unavailable</h2><p>Oslo still records a cold-to-temperate shift. Reload to restore the full field.</p></section>
</div>
  <aside class="annotation" id="annotation"><div class="city-copy">
    <strong>Oslo</strong>
    <p class="present-row"><span></span>2023 · Cold, no dry season, warm summer · 5.3°C</p>
    <p class="future-row"><span></span>2070 · Temperate, no dry season, warm summer · 8.3°C</p>
  </div></aside>
<header><div class="eyebrow">KÖPPEN–GEIGER · 5 ARC-MINUTE GRID</div>
  <h1>Climate lines move.</h1>
  <p>Land stays fixed; pixel classes change.</p>
</header>
<nav class="controls" aria-label="Map year">
  <button type="button" data-year="present" aria-pressed="true">Present day</button>
  <button type="button" data-year="future" aria-pressed="false">2070 projection</button>
  <button type="button" id="reset">Reset</button>
</nav>
<footer class="legend"><strong>30 subclasses · one key</strong>
  <div class="palette" id="palette" aria-label="Thirty subclass colors"></div>
  <div id="stateNote" role="status" aria-live="polite">Loading climate grid…</div>
</footer>
</main>
<script src="assets/base.js"></script>
<script src="assets/data/climate-grid.js"></script>
<script src="app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/climate-zone-shift-map/mini/pages/app.js">
```javascript
(() => {
"use strict";
const width = 1584, height = 900;
const palette = [null,
  "#eaf4af", "#aff4c5", "#daf4af", "#ffb098", "#ffe870", "#ffd5a4", "#ffd0c1",
  "#bcf7ff", "#bfdbf0", "#969600", "#bcc7ff", "#79c7ff", "#e8e8e8", "#3690d1",
  "#bcdfff", "#96ff96", "#ffc0cb", "#e6e6fa", "#da70d6", "#ba55d3", "#f8cbff",
  "#d8bfd8", "#dda0dd", "#ee82ee", "#cbd6ff", "#e2cbff", "#c71585", "#ff69b4",
  "#ececec", "#f6f6f6"];
const byId = id => document.getElementById(id);
const [stage, presentCanvas, futureCanvas, presentGrid, futureGrid, annotation, note] =
  ["stage", "present", "future", "fallbackPresent", "fallbackFuture", "annotation", "stateNote"].map(byId);
const yearButtons = [...document.querySelectorAll("[data-year]")];
const aborter = new AbortController(), signal = aborter.signal;
let target = 0, disposed = false, renderer = "loading";
function naturalEarth(longitude, latitude) {
  const lambda = longitude * Math.PI / 180, phi = latitude * Math.PI / 180;
  const phi2 = phi * phi, phi4 = phi2 * phi2;
  const projectedX = lambda * (0.8707 - 0.131979 * phi2 + phi4 ** 3 *
    (-0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4)));
  const projectedY = phi * (1.007226 + phi2 *
    (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [792.1181901144718 + 300.2534121448773 * projectedX,
    450.0005585915445 - 300.82036333324055 * projectedY];
}
function expand(rows) {
  if (!rows || rows.length !== height) throw new Error("Incomplete RLE rows");
  const values = new Uint8Array(width * height);
  rows.forEach((row, rowIndex) => {
    for (let run = 0; run < row.length; run += 3) {
      const start = row[run], length = row[run + 1], category = row[run + 2];
      values.fill(category, rowIndex * width + start, rowIndex * width + start + length);
    }
  });
  return values;
}
function paint(canvas, values) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const image = context.createImageData(width, height);
  const colors = palette.map(color => color && [...[1, 3, 5].map(position =>
    Number.parseInt(color.slice(position, position + 2), 16)), 255]);
  for (let index = 0; index < values.length; index += 1) {
    const color = colors[values[index]];
    if (color) image.data.set(color, index * 4);
  }
  context.putImageData(image, 0, 0);
  return true;
}
function buildFallback(host, values) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 1100; index += 1) {
    const column = index % 44, row = Math.floor(index / 44);
    const sourceX = Math.floor((column + .5) * width / 44);
    const sourceY = Math.floor((row + .5) * height / 25);
    const cell = document.createElement("i");
    cell.style.background = palette[values[sourceY * width + sourceX]] || "transparent";
    fragment.append(cell);
  }
  host.append(fragment);
  host.hidden = false;
}
function setYear(year, instant = Deck.reduced()) {
  if (disposed) return;
  target = year === "future" ? 1 : 0;
  if (instant) stage.classList.add("instant");
  stage.classList.toggle("show-future", Boolean(target));
  annotation.classList.toggle("is-future", Boolean(target));
  yearButtons.forEach(button => button.setAttribute("aria-pressed",
    String((button.dataset.year === "future") === Boolean(target))));
  note.textContent = target ? "2070 projected classifications" : "Present-day classifications";
  if (instant) {
    void stage.offsetWidth;
    stage.classList.remove("instant");
  }
}
function reset() {
  if (disposed) return;
  setYear("present", true);
}
function dispose() {
  if (disposed) return;
  disposed = true;
  aborter.abort();
  presentCanvas.width = futureCanvas.width = 1;
}
function start() {
  Deck.init({ title: "Climate lines move", keys: false });
  byId("palette").innerHTML = palette.slice(1)
    .map(color => `<i style="background:${color}"></i>`).join("");
  const cityPoint = naturalEarth(10.7480333, 59.9186361);
  byId("cityPoint").style.left = `${cityPoint[0]/width*100}%`;
  byId("cityPoint").style.top = `${cityPoint[1]/height*100}%`;
  try {
    const packed = window.CLIMATE_GRID_RLE;
    if (!packed || packed.width !== width || packed.height !== height) throw new Error("Grid unavailable");
    const grid = { present: expand(packed.present), future: expand(packed.future) };
    window.CLIMATE_GRID_RLE = null;
    if (paint(presentCanvas, grid.present) && paint(futureCanvas, grid.future)) {
      renderer = "canvas-natural-earth-rle";
    } else {
      buildFallback(presentGrid, grid.present);
      buildFallback(futureGrid, grid.future);
      presentCanvas.hidden = futureCanvas.hidden = true;
      renderer = "dom-grid-natural-earth-rle";
    }
  } catch {
    byId("failure").hidden = false;
    annotation.hidden = true;
    yearButtons.forEach(button => { button.disabled = true; });
    renderer = "data-fallback";
  }
  note.textContent = "Present-day classifications";
}
yearButtons.forEach(button => button.addEventListener("click",
  () => setYear(button.dataset.year), { signal }));
byId("reset").addEventListener("click", reset, { signal });
window.addEventListener("pagehide", dispose, { once: true, signal });
window.ClimateMapMini = { setYear, reset, dispose,
  snapshot: () => ({ mix: Number.parseFloat(getComputedStyle(futureCanvas).opacity),
    target, renderer, disposed, width, height,
    classes: 30, cityPoint: naturalEarth(10.7480333, 59.9186361) }) };
start();
})();
```
  </file>
</sample>
