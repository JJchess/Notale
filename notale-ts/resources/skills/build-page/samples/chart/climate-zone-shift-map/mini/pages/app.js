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
