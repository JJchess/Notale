(function () {
  "use strict";

  // Generated payload: {width,height,frame,land,countries,zones:[[class,path],...]}
  var data = window.CLIMATE_MAP_DATA;
  var root = document.getElementById("native-map");
  var baseCanvas = document.getElementById("map-base");
  var detailCanvas = document.getElementById("map-detail");
  var zoneCanvases = document.querySelectorAll(".map-zone");
  if (!data || !root || !baseCanvas || !detailCanvas || zoneCanvases.length !== 3 || typeof Path2D !== "function") return;

  var canvases = [baseCanvas].concat(Array.from(zoneCanvases), detailCanvas);
  if (canvases.some(function (canvas) { return !canvas.getContext("2d"); })) return;

  var colors = {
    1: "#eaf4af", 2: "#aff4c5", 3: "#daf4af",
    4: "#ffb098", 5: "#ffe870", 6: "#ffd5a4", 7: "#ffd0c1",
    8: "#bcf7ff", 9: "#bfdbf0", 10: "#969600", 11: "#bcc7ff",
    12: "#79c7ff", 14: "#3690d1", 15: "#bcdfff", 16: "#96ff96",
    17: "#ffc0cb", 18: "#e6e6fa", 19: "#da70d6", 20: "#ba55d3",
    21: "#f8cbff", 22: "#d8bfd8", 23: "#dda0dd", 24: "#ee82ee",
    25: "#cbd6ff", 26: "#e2cbff", 27: "#c71585", 28: "#ff69b4",
    29: "#ececec", 30: "#f6f6f6"
  };
  var reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
  var representative = [1, 1, 0.24];
  var raf = 0;
  var disposed = false;
  var manual = false;
  var startedAt = performance.now();
  var lastPhase = 0;
  var cleanups = [];

  function context(canvas) {
    return canvas.getContext("2d");
  }

  function fillPath(ctx, path, fill) {
    ctx.fillStyle = fill;
    ctx.fill(path, "evenodd");
  }

  function paintBase() {
    var ctx = context(baseCanvas);
    fillPath(ctx, new Path2D(data.frame), "#dddddd");
    fillPath(ctx, new Path2D(data.land), "#f7f7f7");
  }

  // Rasterize three bands once; animation only composites their opacity.
  function paintZones() {
    var contexts = Array.from(zoneCanvases, context);
    data.zones.forEach(function (entry) {
      var dn = entry[0];
      var fill = colors[dn];
      if (!fill) return;
      var groupIndex = dn <= 7 ? 0 : dn <= 16 ? 1 : 2;
      fillPath(contexts[groupIndex], new Path2D(entry[1]), fill);
    });
  }

  function project(lon, lat) {
    var lambda = lon * Math.PI / 180;
    var phi = Math.max(-90, Math.min(90, lat)) * Math.PI / 180;
    var phi2 = phi * phi;
    var phi4 = phi2 * phi2;
    var x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
    var y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
    return [800 + 300 * x, 450 - 300 * y];
  }

  function oceanLabel(ctx, lines, lon, lat) {
    var point = project(lon, lat);
    ctx.save();
    ctx.fillStyle = "rgba(92,92,92,.50)";
    ctx.font = "10px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    lines.forEach(function (line, index) {
      ctx.fillText(line, point[0], point[1] + (index - (lines.length - 1) / 2) * 14);
    });
    ctx.restore();
  }

  function paintDetails() {
    var ctx = context(detailCanvas);
    ctx.strokeStyle = "rgba(158,158,158,.44)";
    ctx.lineWidth = 0.65;
    ctx.stroke(new Path2D(data.countries));
    oceanLabel(ctx, ["ARCTIC OCEAN"], 0, 78);
    oceanLabel(ctx, ["NORTH", "PACIFIC", "OCEAN"], -145, 31);
    oceanLabel(ctx, ["NORTH", "ATLANTIC", "OCEAN"], -35, 34);
    oceanLabel(ctx, ["SOUTH", "PACIFIC", "OCEAN"], -145, -30);
    oceanLabel(ctx, ["SOUTH", "ATLANTIC", "OCEAN"], -27, -28);
    oceanLabel(ctx, ["INDIAN", "OCEAN"], 82, -27);
  }

  function wave(phase, offset) {
    var local = ((phase - offset) % 4200 + 4200) % 4200;
    return 0.1 + 0.9 * (0.5 + 0.5 * Math.cos(local / 4200 * Math.PI * 2));
  }

  // Hold for 700ms, then blend into the staggered 4200ms climate cycle.
  function opacities(phase) {
    if (phase <= 700) return representative;
    var animationPhase = phase - 700;
    var target = [wave(animationPhase, 0), wave(animationPhase, 1400), 0.08 + 0.6 * wave(animationPhase, 2800)];
    if (animationPhase >= 700) return target;
    var blend = animationPhase / 700;
    return target.map(function (opacity, index) { return representative[index] + (opacity - representative[index]) * blend; });
  }

  function renderAt(phase) {
    lastPhase = Math.max(0, Number(phase) || 0);
    var values = reduceQuery.matches ? representative : opacities(lastPhase);
    zoneCanvases.forEach(function (canvas, index) {
      canvas.style.opacity = values[index].toFixed(4);
    });
    root.dataset.phase = reduceQuery.matches ? "reduced" : String(Math.round(lastPhase));
    root.dataset.opacity = values.map(function (value) { return value.toFixed(3); }).join(",");
    return values.slice();
  }

  function frame(now) {
    raf = 0;
    if (disposed || manual || document.hidden || reduceQuery.matches) return;
    renderAt(now - startedAt);
    raf = requestAnimationFrame(frame);
  }

  function schedule() {
    if (disposed || manual || document.hidden || reduceQuery.matches || raf) return;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function play() {
    if (disposed) return;
    manual = false;
    startedAt = performance.now() - lastPhase;
    schedule();
  }

  function setPhase(phase) {
    manual = true;
    stop();
    return renderAt(phase);
  }

  function syncVisibility() {
    if (document.hidden) stop();
    else if (!manual) play();
  }

  function syncMotion() {
    stop();
    if (reduceQuery.matches) renderAt(lastPhase);
    else play();
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    cleanups.push(function () { target.removeEventListener(type, handler); });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    cleanups.splice(0).forEach(function (cleanup) { cleanup(); });
    root.dataset.phase = "disposed";
  }

  paintBase();
  paintZones();
  paintDetails();
  window.CLIMATE_MAP_DATA = null;
  renderAt(0);
  listen(document, "visibilitychange", syncVisibility);
  listen(window, "pagehide", dispose);
  listen(reduceQuery, "change", syncMotion);
  schedule();

  window.__climateCover = {
    renderAt: setPhase,
    play: play,
    dispose: dispose,
    getState: function () {
      return {
        disposed: disposed,
        manual: manual,
        reduced: reduceQuery.matches,
        hidden: document.hidden,
        phase: lastPhase,
        activeRaf: Boolean(raf),
        ownedListeners: cleanups.length,
        opacity: root.dataset.opacity
      };
    }
  };
})();
