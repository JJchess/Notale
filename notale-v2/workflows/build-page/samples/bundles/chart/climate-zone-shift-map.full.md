<sample id="climate-zone-shift-map" category="chart" variant="full">
  <file path="samples/chart/climate-zone-shift-map/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Present-day and projected 2070 Köppen climate zones, with 70 global cities.">
  <title>Climate zones are moving</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
    :root{--bg:#e8e9ea;--text:#111315;--font-sans:Arial,Helvetica,sans-serif;--focus:#111315;--pad-x:0px}
    #stage{background:#e8e9ea;isolation:isolate}
    .maps{position:absolute;inset:0}.map-native{position:absolute;left:8px;top:0;width:1584px;height:900px}
    .map-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
    #futureMap{opacity:0;transition:opacity 2s linear}.is-future #futureMap{opacity:1}
    .top-wash,.bottom-wash{position:absolute;z-index:2;pointer-events:none}
    .top-wash{inset:0 auto auto 0;width:660px;height:230px;background:linear-gradient(115deg,rgba(232,233,234,.99) 0 72%,rgba(232,233,234,.72) 84%,transparent 100%)}
    .bottom-wash{inset:auto 0 0 0;height:128px;background:linear-gradient(0deg,rgba(232,233,234,.98),rgba(232,233,234,.78) 58%,transparent)}
    header{position:absolute;z-index:5;left:34px;top:27px;width:570px}
    h1{font-size:46px;line-height:.98;letter-spacing:-2.1px;max-width:560px}
    .deck{margin-top:13px;width:525px;font-size:17px;line-height:1.35}
    .facts{display:flex;align-items:flex-end;gap:18px;margin-top:15px}
    .fact{display:grid;grid-template-columns:auto auto;align-items:baseline;gap:7px;padding-right:18px;border-right:1px solid #777}
    .fact:last-child{border:0}.fact strong{font-size:25px;letter-spacing:-.8px}.fact span{font-size:13px;line-height:1.08;width:84px}
    .projection-note{margin-top:10px;width:540px;font-size:13px;line-height:1.3;color:#45484a}
    .years{position:absolute;z-index:8;top:24px;left:50%;transform:translateX(-50%);display:flex;gap:7px;padding:4px;border-radius:999px;background:rgba(247,247,247,.86);box-shadow:0 1px 8px #0002}
    .years button{border:0;border-radius:999px;background:transparent;padding:8px 18px;font-size:20px;font-weight:700;cursor:pointer;min-width:96px;transition:background .3s,color .3s}
    .years button[aria-pressed=true]{background:#111315;color:#fff}
    .state-note{position:absolute;z-index:7;top:80px;left:50%;width:300px;height:20px;transform:translateX(-50%);opacity:0;pointer-events:none;font-size:13px;text-align:center}
    .hotspots{position:absolute;z-index:4;left:8px;top:0;width:1584px;height:900px}.city{position:absolute;width:22px;height:22px;border:0;border-radius:50%;padding:0;background:transparent;cursor:crosshair}
    .city:focus-visible{outline:2px solid #111315;outline-offset:2px;background:#fff9}
    .tip{position:absolute;z-index:12;width:292px;padding:12px 14px;background:#111315;color:#fff;border-radius:3px;box-shadow:0 5px 18px #0004;pointer-events:none}
    .tip b{display:block;font-size:17px;margin-bottom:6px}.tip p{font-size:13px;line-height:1.4}.tip .temp{margin-top:5px;color:#d9dcde}
    .legend{position:absolute;z-index:8;left:34px;bottom:30px;display:flex;align-items:end;gap:14px}
    .legend-title{width:100px;padding-bottom:5px;font-size:12px;line-height:1.2;text-transform:uppercase;letter-spacing:.7px}
    .zone{width:126px;border:0;border-bottom:2px solid transparent;background:transparent;padding:5px 4px 7px;text-align:left;cursor:pointer;transition:opacity .2s,border-color .2s}
    .has-focus .zone:not([aria-pressed=true]){opacity:.38}.zone[aria-pressed=true]{border-color:#111315}
    .ramp{display:block;height:8px;margin-bottom:6px;border:1px solid #0002}
    .zone span:last-child{font-size:13px;font-weight:700}
    [data-zone=tropical] .ramp{background:linear-gradient(90deg,#eaf4af 0 33%,#aff4c5 33% 66%,#daf4af 66%)}
    [data-zone=arid] .ramp{background:linear-gradient(90deg,#ffb098 0 25%,#ffe870 25% 50%,#ffd5a4 50% 75%,#ffd0c1 75%)}
    [data-zone=temperate] .ramp{background:linear-gradient(90deg,#bcf7ff 0 11%,#bfdbf0 11% 22%,#969600 22% 33%,#bcc7ff 33% 44%,#79c7ff 44% 55%,#e8e8e8 55% 66%,#3690d1 66% 77%,#bcdfff 77% 88%,#96ff96 88%)}
    [data-zone=cold] .ramp{background:linear-gradient(90deg,#ffc0cb 0 8%,#e6e6fa 8% 16%,#da70d6 16% 24%,#ba55d3 24% 32%,#f8cbff 32% 40%,#d8bfd8 40% 48%,#dda0dd 48% 56%,#ee82ee 56% 64%,#cbd6ff 64% 73%,#e2cbff 73% 82%,#c71585 82% 91%,#ff69b4 91%)}
    [data-zone=polar] .ramp{background:linear-gradient(90deg,#ececec 0 50%,#f6f6f6 50%)}
    .render-fallback{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 14px;background:#e8e9ea;border:1px solid #777b7e;font-size:14px}
    footer{position:absolute;z-index:8;right:15px;bottom:9px;font-size:11px;color:#55595c;text-align:right}footer a{color:inherit}
    @media(prefers-reduced-motion:reduce){.climate-map,.years button,.state-note{transition:none!important}}
  </style>
</head>
<body>
<main id="stage" class="is-present" aria-labelledby="title">
  <figure class="maps" role="img" aria-label="Natural Earth world map rendered in the browser from Beck Köppen classification data. It compares 30 climate subclasses at present and in a 2070 projection; 70 city points retain fixed geographic positions while climate colors crossfade.">
    <div class="map-native" aria-hidden="true">
      <canvas id="baseMap" class="map-canvas"></canvas>
      <canvas id="presentMap" class="map-canvas climate-map"></canvas>
      <canvas id="futureMap" class="map-canvas climate-map"></canvas>
      <canvas id="mapLabels" class="map-canvas"></canvas>
    </div>
    <p id="renderFallback" class="render-fallback" hidden>The map renderer is unavailable. The findings and 70 city records remain accessible.</p>
  </figure>
  <div class="hotspots" id="hotspots" aria-label="70 city data points"></div>
  <div class="top-wash"></div><div class="bottom-wash"></div>
  <header>
    <h1 id="title">Climate zones are moving</h1>
    <p class="deck">By 2070, tropical and arid zones expand while temperate bands push poleward. The same 70 cities stay fixed so the shift is visible in place.</p>
    <div class="facts" aria-label="Key findings">
      <div class="fact"><strong>45 / 70</strong><span>cities change subclass</span></div>
      <div class="fact"><strong>16 → 1</strong><span>cold-climate cities</span></div>
    </div>
    <p class="projection-note">The 2070 state is an RCP8.5 ensemble projection of 2071-2100 conditions, not an observation.</p>
  </header>
  <div class="years" role="group" aria-label="Map year">
    <button type="button" data-year="present" aria-pressed="true">Present Day</button>
    <button type="button" data-year="future" aria-pressed="false">2070</button>
  </div>
  <div id="stateNote" class="state-note" role="status" aria-live="polite">Present-day classifications</div>
  <nav class="legend" aria-label="Köppen climate zones">
    <div class="legend-title">Köppen zones<br>subclass colors</div>
    <button class="zone" type="button" data-zone="tropical" aria-pressed="false"><span class="ramp"></span><span>Tropical</span></button>
    <button class="zone" type="button" data-zone="arid" aria-pressed="false"><span class="ramp"></span><span>Arid</span></button>
    <button class="zone" type="button" data-zone="temperate" aria-pressed="false"><span class="ramp"></span><span>Temperate</span></button>
    <button class="zone" type="button" data-zone="cold" aria-pressed="false"><span class="ramp"></span><span>Cold</span></button>
    <button class="zone" type="button" data-zone="polar" aria-pressed="false"><span class="ramp"></span><span>Polar</span></button>
  </nav>
  <div id="tip" class="tip" role="status" hidden></div>
  <footer>Climate data: <a href="https://doi.org/10.6084/m9.figshare.6396959">Beck et al.</a>. City records and palette: <a href="https://pudding.cool/2024/06/climate-zones/">The Pudding</a>. Natural Earth projection.</footer>
</main>
<script src="assets/base.js"></script>
<script src="assets/data/cities-screen.js"></script>
<script src="assets/data/climate-grid.js"></script>
<script src="assets/native-map.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/climate-zone-shift-map/pages/assets/native-map.js">
```javascript
(() => {
  "use strict";

  const MAP_W = 1584;
  const MAP_H = 900;
  const SCALE_X = 300.2534121448773;
  const SCALE_Y = 300.82036333324055;
  const TX = 792.1181901144718;
  const TY = 450.0005585915445;
  const PALETTE = [
    null,
    "#eaf4af", "#aff4c5", "#daf4af",
    "#ffb098", "#ffe870", "#ffd5a4", "#ffd0c1",
    "#bcf7ff", "#bfdbf0", "#969600", "#bcc7ff", "#79c7ff", "#e8e8e8",
    "#3690d1", "#bcdfff", "#96ff96",
    "#ffc0cb", "#e6e6fa", "#da70d6", "#ba55d3", "#f8cbff", "#d8bfd8",
    "#dda0dd", "#ee82ee", "#cbd6ff", "#e2cbff", "#c71585", "#ff69b4",
    "#ececec", "#f6f6f6"
  ];
  const ZONE_RANGE = {
    tropical: [1, 3],
    arid: [4, 7],
    temperate: [8, 16],
    cold: [17, 28],
    polar: [29, 30]
  };
  const OCEANS = [
    [1270, 43, "Arctic Ocean"],
    [129, 302, "North\nPacific\nOcean"],
    [830, 281, "North\nAtlantic\nOcean"],
    [213, 782, "South\nPacific\nOcean"],
    [949, 753, "South\nAtlantic\nOcean"],
    [1475, 728, "Indian\nOcean"]
  ];

  const byId = id => document.getElementById(id);
  const [stage, stateNote, tip, hotspots, baseCanvas, presentCanvas, futureCanvas, labelsCanvas] =
    ["stage", "stateNote", "tip", "hotspots", "baseMap", "presentMap", "futureMap", "mapLabels"].map(byId);
  const yearButtons = [...document.querySelectorAll("[data-year]")];
  const zoneButtons = [...document.querySelectorAll("[data-zone]")];
  const aborter = new AbortController();
  const signal = aborter.signal;
  const listen = (target, type, handler, options = {}) => {
    target.addEventListener(type, handler, { ...options, signal });
  };

  let currentYear = "present";
  let currentFocus = "";
  let noteTimer = 0;
  let destroyed = false;
  let grid = null;
  let offResize = [];

  const colorToRgba = (hex, alpha = 255) => {
    if (!hex) return [0, 0, 0, 0];
    const value = Number.parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255, alpha];
  };

  const naturalEarth = (longitude, latitude) => {
    const lambda = longitude * Math.PI / 180;
    const phi = latitude * Math.PI / 180;
    const phi2 = phi * phi;
    const phi4 = phi2 * phi2;
    const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * phi4 * phi4 *
      (-0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4)));
    const y = phi * (1.007226 + phi2 *
      (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
    return [TX + SCALE_X * x, TY - SCALE_Y * y];
  };

  function expandState(rows, width, height) {
    const values = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const row = rows[y];
      for (let run = 0; run < row.length; run += 3) {
        const x = row[run];
        const length = row[run + 1];
        const category = row[run + 2];
        values.fill(category, y * width + x, y * width + x + length);
      }
    }
    return values;
  }

  function decodeGrid(packed) {
    if (!packed || !Array.isArray(packed.present) || !Array.isArray(packed.future)) throw new Error("Local climate-grid data is missing");
    const { width, height } = packed;
    if (width !== MAP_W || height !== MAP_H) throw new Error("Climate-grid dimensions do not match the map");
    return {
      width,
      height,
      present: expandState(packed.present, width, height),
      future: expandState(packed.future, width, height)
    };
  }

  function drawBoundary(ctx) {
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = "#e0e2e3";
    ctx.beginPath();
    let point = naturalEarth(-180, 90);
    ctx.moveTo(point[0], point[1]);
    for (let lon = -178; lon <= 180; lon += 2) {
      point = naturalEarth(lon, 90);
      ctx.lineTo(point[0], point[1]);
    }
    for (let lat = 88; lat >= -90; lat -= 2) {
      point = naturalEarth(180, lat);
      ctx.lineTo(point[0], point[1]);
    }
    for (let lon = 178; lon >= -180; lon -= 2) {
      point = naturalEarth(lon, -90);
      ctx.lineTo(point[0], point[1]);
    }
    for (let lat = -88; lat <= 90; lat += 2) {
      point = naturalEarth(-180, lat);
      ctx.lineTo(point[0], point[1]);
    }
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.fillStyle = "#92979a";
    ctx.font = "italic 12px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [x, y, label] of OCEANS) {
      label.split("\n").forEach((line, index, lines) => {
        drawSpacedText(ctx, line, x, y + (index - (lines.length - 1) / 2) * 18, 3.2);
      });
    }
    ctx.restore();
  }

  function drawSpacedText(ctx, text, centerX, y, spacing) {
    const letters = [...text];
    const widths = letters.map(letter => ctx.measureText(letter).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (letters.length - 1);
    let x = centerX - total / 2;
    letters.forEach((letter, index) => {
      ctx.fillText(letter, x + widths[index] / 2, y);
      x += widths[index] + spacing;
    });
  }

  function imageFor(values, focus) {
    const canvas = document.createElement("canvas");
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    const context = canvas.getContext("2d", { alpha: true });
    const image = context.createImageData(MAP_W, MAP_H);
    const pixels = image.data;
    const range = focus ? ZONE_RANGE[focus] : null;
    const colors = PALETTE.map((hex, category) => {
      const inFocus = !range || (category >= range[0] && category <= range[1]);
      return colorToRgba(hex, inFocus ? 255 : 38);
    });
    for (let index = 0; index < values.length; index += 1) {
      const color = colors[values[index]];
      const target = index * 4;
      pixels[target] = color[0];
      pixels[target + 1] = color[1];
      pixels[target + 2] = color[2];
      pixels[target + 3] = color[3];
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  function fitAndDraw(canvas, source) {
    const ctx = Deck.fit(canvas);
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, 0, 0, MAP_W, MAP_H);
  }

  function drawClassification() {
    if (!grid || destroyed) return;
    for (const [canvas, values] of [[presentCanvas, grid.present], [futureCanvas, grid.future]]) {
      const image = imageFor(values, currentFocus);
      fitAndDraw(canvas, image);
      canvas.__source = image;
    }
  }

  function drawBaseCanvas() {
    const source = document.createElement("canvas");
    source.width = MAP_W;
    source.height = MAP_H;
    drawBoundary(source.getContext("2d"));
    baseCanvas.__source = source;
    fitAndDraw(baseCanvas, source);
  }

  function labelCandidates(city, width) {
    const height = 16;
    return [
      { x: city.x - width / 2, y: city.y - 20, tx: city.x, ty: city.y - 8, align: "center" },
      { x: city.x - width / 2, y: city.y + 8, tx: city.x, ty: city.y + 19, align: "center" },
      { x: city.x + 8, y: city.y - height / 2, tx: city.x + 9, ty: city.y + 4, align: "left" },
      { x: city.x - width - 8, y: city.y - height / 2, tx: city.x - 9, ty: city.y + 4, align: "right" }
    ].map(candidate => ({ ...candidate, w: width, h: height }));
  }

  const overlaps = (a, b) => !(
    a.x + a.w + 3 < b.x || b.x + b.w + 3 < a.x ||
    a.y + a.h + 2 < b.y || b.y + b.h + 2 < a.y
  );

  function drawLabels(ctx) {
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    const cities = window.CLIMATE_CITIES || [];
    const occupied = [];
    const placements = [];
    ctx.font = "600 14px Arial, Helvetica, sans-serif";
    for (const city of cities) {
      const name = city.name.replace(/\s{2,}/g, " ");
      const width = ctx.measureText(name).width;
      const choice = labelCandidates(city, width).find(candidate =>
        candidate.x >= 4 && candidate.x + candidate.w <= MAP_W - 4 &&
        candidate.y >= 8 && candidate.y + candidate.h <= MAP_H - 8 &&
        !occupied.some(rect => overlaps(candidate, rect))
      );
      if (choice) {
        occupied.push(choice);
        placements.push({ ...choice, name });
      }
    }

    ctx.lineJoin = "round";
    ctx.lineWidth = 3.8;
    ctx.strokeStyle = "rgba(255,255,255,.96)";
    ctx.fillStyle = "#111315";
    ctx.font = "600 14px Arial, Helvetica, sans-serif";
    for (const placement of placements) {
      ctx.textAlign = placement.align;
      ctx.strokeText(placement.name, placement.tx, placement.ty);
      ctx.fillText(placement.name, placement.tx, placement.ty);
    }
    for (const city of cities) {
      ctx.beginPath();
      ctx.arc(city.x, city.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "#111315";
      ctx.stroke();
    }
    labelsCanvas.dataset.visibleLabels = String(placements.length);
  }

  function drawLabelCanvas() {
    const source = document.createElement("canvas");
    source.width = MAP_W;
    source.height = MAP_H;
    drawLabels(source.getContext("2d"));
    labelsCanvas.__source = source;
    fitAndDraw(labelsCanvas, source);
  }

  function installResize(canvas) {
    offResize.push(Deck.onResize(() => {
      if (!canvas.__source || destroyed) return;
      const expected = Deck.ratio();
      if (Math.abs((canvas.__r || 0) - expected) > 0.01) fitAndDraw(canvas, canvas.__source);
    }));
  }

  function setYear(nextYear) {
    if (nextYear !== "present" && nextYear !== "future") return;
    currentYear = nextYear;
    const isFuture = currentYear === "future";
    clearTimeout(noteTimer);
    stage.classList.toggle("is-future", isFuture);
    stage.classList.toggle("is-present", !isFuture);
    yearButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.year === currentYear)));
    const settled = isFuture ? "2070 projected classifications" : "Present-day classifications";
    if (Deck.reduced()) {
      stateNote.textContent = settled;
    } else {
      stateNote.textContent = `Transitioning to ${isFuture ? "2070" : "Present Day"}`;
      noteTimer = window.setTimeout(() => { stateNote.textContent = settled; }, 2000);
    }
  }

  function setFocus(nextFocus) {
    const normalized = ZONE_RANGE[nextFocus] ? nextFocus : "";
    if (normalized === currentFocus) return;
    currentFocus = normalized;
    stage.classList.toggle("has-focus", Boolean(currentFocus));
    zoneButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.zone === currentFocus)));
    drawClassification();
    stateNote.textContent = currentFocus
      ? `${currentFocus[0].toUpperCase()}${currentFocus.slice(1)} zone highlighted`
      : currentYear === "future" ? "2070 projected classifications" : "Present-day classifications";
  }

  const signed = value => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

  function showTip(city) {
    const delta = city.temp_2070 - city.temp_2023;
    tip.innerHTML = `<b>${city.name}</b><p>${city.type_2023}<br><span aria-hidden="true">→</span> ${city.type_2070}</p><p class="temp">Annual mean ${city.temp_2023.toFixed(1)}° → ${city.temp_2070.toFixed(1)}°C (${signed(delta)}°)</p>`;
    tip.style.left = `${Deck.clamp(city.x + 8 + (city.x > 950 ? -305 : 34), 20, 1288)}px`;
    tip.style.top = `${Deck.clamp(city.y - 58, 118, 745)}px`;
    tip.hidden = false;
  }

  function installCities() {
    const cities = window.CLIMATE_CITIES || [];
    for (const city of cities) {
      const button = document.createElement("button");
      const reveal = () => showTip(city);
      button.className = "city";
      button.type = "button";
      button.style.left = `${city.x - 11}px`;
      button.style.top = `${city.y - 11}px`;
      button.setAttribute("aria-label", `${city.name}: ${city.type_2023} to ${city.type_2070}, ${signed(city.temp_2070 - city.temp_2023)}°C`);
      ["mouseenter", "focus", "click"].forEach(type => listen(button, type, reveal));
      listen(button, "mouseleave", () => { if (document.activeElement !== button) tip.hidden = true; });
      listen(button, "blur", () => { tip.hidden = true; });
      hotspots.append(button);
    }
  }

  function reset() {
    tip.hidden = true;
    setFocus("");
    setYear("present");
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(noteTimer);
    aborter.abort();
    offResize.forEach(off => off());
    offResize = [];
    [baseCanvas, presentCanvas, futureCanvas, labelsCanvas].forEach(canvas => {
      canvas.__source = null;
      canvas.width = 1;
      canvas.height = 1;
    });
    grid = null;
  }

  const ready = Promise.resolve().then(() => {
    try {
      grid = decodeGrid(window.CLIMATE_GRID_RLE);
      window.CLIMATE_GRID_RLE = null;
      drawClassification();
      stage.classList.add("renderer-ready");
      stateNote.textContent = "Present-day classifications";
      return true;
    } catch (error) {
      console.error(error);
      stage.classList.add("renderer-error");
      stateNote.textContent = "Climate-grid data could not be loaded";
      byId("renderFallback").hidden = false;
      return false;
    }
  });

  drawBaseCanvas();
  drawLabelCanvas();
  installCities();
  [baseCanvas, presentCanvas, futureCanvas, labelsCanvas].forEach(installResize);

  yearButtons.forEach(button => listen(button, "click", () => setYear(button.dataset.year)));
  listen(document.querySelector(".years"), "keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "1", "2"].includes(event.key)) return;
    event.preventDefault();
    const useFuture = ["ArrowRight", "End", "2"].includes(event.key);
    setYear(useFuture ? "future" : "present");
    yearButtons[useFuture ? 1 : 0].focus();
  });
  zoneButtons.forEach(button => {
    const select = () => setFocus(button.dataset.zone);
    ["pointerenter", "focus", "click"].forEach(type => listen(button, type, select));
    listen(button, "pointerleave", () => { if (document.activeElement !== button) setFocus(""); });
    listen(button, "blur", () => setFocus(""));
  });
  listen(document, "keydown", event => {
    if (event.key === "Escape") {
      setFocus("");
      tip.hidden = true;
      document.activeElement?.blur();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.target !== document.body) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") setYear(event.key === "ArrowRight" ? "future" : "present");
  });
  listen(window, "resize", () => { tip.hidden = true; });
  listen(window, "pagehide", destroy, { once: true });

  window.ClimateChart = {
    ready,
    setYear,
    setFocus,
    reset,
    destroy,
    getState: () => ({ year: currentYear, focus: currentFocus, cities: (window.CLIMATE_CITIES || []).length, renderer: "canvas-natural-earth-rle" })
  };
})();
```
  </file>
</sample>
