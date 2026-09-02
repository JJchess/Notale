<sample id="magnetic-field" category="generative" variant="full">
  <file path="samples/generative/magnetic-field/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#10110f">
  <title>磁场｜看不见的秩序</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
:root{
  --bg:#10110f;
  --surface:#22231f;
  --text:#f2eee2;
  --text-soft:#c9c3b5;
  --muted:#87857c;
  --line:#4a4b43;
  --field:#b8b3a2;
  --field-bright:#eee7d6;
  --north:#bd4f3b;
  --south:#315f86;
  --focus:#d8a83f;
  --pad-x:98px;
  --font-sans:"Noto Sans SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  --font-mono:"SFMono-Regular","Cascadia Code","Roboto Mono",ui-monospace,monospace;
  --stage-w:1600px;
  --stage-h:900px;
}

html,body{ width:100%; height:100%; }
body{ background:#090a08; }

#stage{
  isolation:isolate;
  padding:0 var(--pad-x);
  background:var(--bg);
  color:var(--text);
  contain:layout paint;
}

#field{
  z-index:1;
  max-width:none;
  pointer-events:none;
}

.cover-copy{
  position:absolute;
  left:var(--pad-x);
  top:125px;
  width:530px;
  z-index:5;
  pointer-events:none;
}

h1{
  display:flex;
  align-items:flex-end;
  margin-top:56px;
  color:var(--text);
  font-size:192px;
  font-weight:650;
  line-height:.84;
  letter-spacing:-.1em;
  white-space:nowrap;
}

.subtitle-row{
  display:flex;
  align-items:center;
  gap:20px;
  margin-top:52px;
}

.subtitle-row::before{
  content:"";
  width:44px;
  height:1px;
  flex:0 0 auto;
  background:var(--north);
}

.subtitle{
  color:var(--text-soft);
  font-size:27px;
  font-weight:400;
  line-height:1.2;
  letter-spacing:.3em;
  white-space:nowrap;
}

.dipole{
  position:absolute;
  left:982px;
  top:412px;
  width:324px;
  height:76px;
  z-index:4;
  margin:0;
  pointer-events:none;
}

.magnet-core{
  position:absolute;
  inset:0;
  display:grid;
  grid-template-columns:1fr 1fr;
  overflow:hidden;
  background:var(--surface);
  box-shadow:0 18px 46px rgba(0,0,0,.28);
}

.pole{
  display:flex;
  align-items:center;
  min-width:0;
  padding:0 25px;
  font-family:var(--font-mono);
  font-size:18px;
  font-weight:700;
  line-height:1;
  letter-spacing:.08em;
  text-transform:uppercase;
}

.pole-s{
  justify-content:flex-start;
  color:var(--text);
  background:var(--south);
  border-right:1px solid rgba(242,238,226,.5);
}

.pole-n{
  justify-content:flex-end;
  color:var(--text);
  background:var(--north);
}
  </style>
</head>
<body>
  <main id="stage" aria-labelledby="cover-title">
    <canvas id="field" class="cv-fill" aria-hidden="true"></canvas>

    <section class="cover-copy" aria-label="封面标题">
      <h1 id="cover-title"><span class="glyph">磁</span><span class="glyph">场</span></h1>
      <div class="subtitle-row">
        <p class="subtitle">看不见的秩序</p>
      </div>
    </section>

    <figure class="dipole" role="img" aria-label="一枚水平放置的磁偶极，流线从右侧北极出发，绕行后汇入左侧南极。">
      <div class="magnet-core">
        <span class="pole pole-s">S</span>
        <span class="pole pole-n">N</span>
      </div>
    </figure>
    <span id="live-status" class="sr-only" aria-live="polite"></span>

  </main>

  <script src="assets/lib/seedrandom.min.js"></script>
  <script src="assets/base.js"></script>
  <script>
(function () {
  'use strict';

  var W = 1600;
  var H = 900;
  var REPRESENTATIVE_MS = 5200;
  var CONFIG = Object.freeze({
    seed: 'notale-magnetic-01',
    lineCount: 92,
    integrationStep: 3.25,
    maxSteps: 1900,
    north: Object.freeze({ x: 1282, y: 450, q: 1 }),
    south: Object.freeze({ x: 994, y: 450, q: -1 }),
    quiet: Object.freeze({ cx: 382, cy: 431, rx: 356, ry: 342 })
  });
  var POLES = [CONFIG.north, CONFIG.south];
  var noop = function () {};

  var canvas = document.getElementById('field');
  var liveStatus = document.getElementById('live-status');
  var media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var staticLayer = document.createElement('canvas');
  var ctx = null;
  var model = null;
  var stopLoop = noop;
  var offResize = noop;
  var lastTime = REPRESENTATIVE_MS;
  var paused = false;
  var cleaned = false;
  var resizeQueued = 0;
  var announceTimer = 0;

  Deck.init({ title: '磁场｜看不见的秩序', keys: false });
  var palette = {};

  function readStaticPalette() {
    palette.bg = Deck.rgb('bg');
    palette.field = Deck.rgb('field');
    palette.fieldBright = Deck.rgb('field-bright');
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function hypot(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function smoothstep(a, b, value) {
    var t = Deck.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function quietDistance(x, y) {
    var q = CONFIG.quiet;
    return hypot((x - q.cx) / q.rx, (y - q.cy) / q.ry);
  }

  function insideMagnet(x, y) {
    return x > 982 && x < 1306 && y > 404 && y < 496;
  }

  function vectorAt(x, y) {
    var fx = 0;
    var fy = 0;

    for (var i = 0; i < POLES.length; i += 1) {
      var pole = POLES[i];
      var dx = x - pole.x;
      var dy = y - pole.y;
      var r2 = dx * dx + dy * dy + 340;
      var inv = pole.q / Math.pow(r2, 1.5);
      fx += dx * inv;
      fy += dy * inv;
    }

    var strength = hypot(fx, fy);
    if (strength < 1e-12) return { x: 1, y: 0, strength: 0 };
    fx /= strength;
    fy /= strength;

    var d = quietDistance(x, y);
    if (d < 1.34) {
      var q = CONFIG.quiet;
      var ox = (x - q.cx) / (q.rx * q.rx);
      var oy = (y - q.cy) / (q.ry * q.ry);
      var om = hypot(ox, oy) || 1;
      ox /= om;
      oy /= om;
      var weight = Math.pow((1.34 - d) / 1.34, 1.45) * 0.94;
      fx = fx * (1 - weight) + ox * weight;
      fy = fy * (1 - weight) + oy * weight;
      var mixed = hypot(fx, fy) || 1;
      fx /= mixed;
      fy /= mixed;
    }

    return { x: fx, y: fy, strength: strength };
  }

  function traceLine(angle, radialOffset) {
    var north = CONFIG.north;
    var south = CONFIG.south;
    var radius = 25.5 + radialOffset;
    var x = north.x + Math.cos(angle) * radius;
    var y = north.y + Math.sin(angle) * radius;
    var points = [];
    var escaped = 0;

    for (var i = 0; i < CONFIG.maxSteps; i += 1) {
      if (i % 2 === 0) points.push({ x: x, y: y });
      if (i > 14 && hypot(x - south.x, y - south.y) < 24) break;

      var f1 = vectorAt(x, y);
      var mx = x + f1.x * CONFIG.integrationStep * 0.5;
      var my = y + f1.y * CONFIG.integrationStep * 0.5;
      var f2 = vectorAt(mx, my);
      x += f2.x * CONFIG.integrationStep;
      y += f2.y * CONFIG.integrationStep;

      if (x < -760 || x > 2420 || y < -1050 || y > 1950) escaped += 1;
      else escaped = 0;
      if (escaped > 24) break;
    }

    if (points.length < 8) return null;

    var lengths = [0];
    var total = 0;
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (var p = 0; p < points.length; p += 1) {
      minX = Math.min(minX, points[p].x);
      maxX = Math.max(maxX, points[p].x);
      minY = Math.min(minY, points[p].y);
      maxY = Math.max(maxY, points[p].y);
      if (p > 0) {
        total += hypot(points[p].x - points[p - 1].x, points[p].y - points[p - 1].y);
        lengths.push(total);
      }
    }

    return {
      points: points,
      lengths: lengths,
      total: total,
      angle: angle,
      bounds: { minX: minX, maxX: maxX, minY: minY, maxY: maxY }
    };
  }

  function buildModel() {
    var pathRng = new Math.seedrandom(CONFIG.seed + '/streamlines');
    var paths = [];

    for (var i = 0; i < CONFIG.lineCount; i += 1) {
      var evenAngle = Math.PI * 2 * (i + 0.5) / CONFIG.lineCount;
      var jitter = (pathRng() - 0.5) * 0.026;
      var radialOffset = (pathRng() - 0.5) * 4.2;
      var path = traceLine(evenAngle + jitter, radialOffset);
      if (!path) continue;
      path.primary = i % 9 === 2 || i % 13 === 5;
      path.alpha = 0.12 + pathRng() * 0.11 + (path.primary ? 0.17 : 0);
      path.width = path.primary ? 1.45 + pathRng() * 0.55 : 0.62 + pathRng() * 0.48;
      paths.push(path);
    }

    var candidates = paths.filter(function (path) {
      var verticalSpan = path.bounds.maxY - path.bounds.minY;
      return path.total > 510 && path.total < 5600 && verticalSpan > 130;
    }).sort(function (a, b) { return a.angle - b.angle; });

    if (candidates.length < 5) candidates = paths.slice().sort(function (a, b) { return b.total - a.total; });
    var trajectoryRng = new Math.seedrandom(CONFIG.seed + '/trajectories');
    var picks = [0.08, 0.27, 0.49, 0.71, 0.9];
    var trajectories = picks.map(function (position, index) {
      var pathIndex = Math.min(candidates.length - 1, Math.floor(position * candidates.length));
      return {
        path: candidates[Math.max(0, pathIndex)],
        phase: (0.11 + index * 0.173 + trajectoryRng() * 0.08) % 1,
        period: 10400 + index * 880 + trajectoryRng() * 1500
      };
    }).filter(function (item) { return !!item.path; });

    return { paths: paths, trajectories: trajectories };
  }

  function samplePath(path, u) {
    if (!path || !path.points.length) return null;
    var target = Deck.clamp(u, 0, 1) * path.total;
    var lo = 0;
    var hi = path.lengths.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (path.lengths[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    var index = Math.max(1, lo);
    var a = path.points[index - 1];
    var b = path.points[index];
    var d0 = path.lengths[index - 1];
    var d1 = path.lengths[index];
    var mix = d1 === d0 ? 0 : (target - d0) / (d1 - d0);
    return {
      x: Deck.lerp(a.x, b.x, mix),
      y: Deck.lerp(a.y, b.y, mix),
      angle: Math.atan2(b.y - a.y, b.x - a.x)
    };
  }

  function drawVectorGlyphs(g) {
    var glyphRng = new Math.seedrandom(CONFIG.seed + '/glyphs');
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    for (var y = 106; y <= 806; y += 68) {
      for (var x = 734; x <= 1510; x += 68) {
        var px = x + (glyphRng() - 0.5) * 10;
        var py = y + (glyphRng() - 0.5) * 10;
        if (quietDistance(px, py) < 1.17 || insideMagnet(px, py)) continue;
        var field = vectorAt(px, py);
        var intensity = Deck.clamp((Math.log(field.strength + 1e-8) + 18.4) / 6, 0, 1);
        var length = 8 + intensity * 8;
        var x1 = px - field.x * length * 0.5;
        var y1 = py - field.y * length * 0.5;
        var x2 = px + field.x * length * 0.5;
        var y2 = py + field.y * length * 0.5;
        var alpha = 0.075 + intensity * 0.09;

        g.strokeStyle = rgba(palette.field, alpha);
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();

        var wing = 2.5;
        var angle = Math.atan2(field.y, field.x);
        g.beginPath();
        g.moveTo(x2, y2);
        g.lineTo(x2 - wing * Math.cos(angle - 0.62), y2 - wing * Math.sin(angle - 0.62));
        g.moveTo(x2, y2);
        g.lineTo(x2 - wing * Math.cos(angle + 0.62), y2 - wing * Math.sin(angle + 0.62));
        g.stroke();
      }
    }
    g.restore();
  }

  function makeVisiblePath(g, path) {
    g.beginPath();
    var drawing = false;
    for (var i = 0; i < path.points.length; i += 1) {
      var point = path.points[i];
      var hidden = quietDistance(point.x, point.y) < 1.01 || insideMagnet(point.x, point.y);
      if (hidden) {
        drawing = false;
      } else if (!drawing) {
        g.moveTo(point.x, point.y);
        drawing = true;
      } else {
        g.lineTo(point.x, point.y);
      }
    }
  }

  function drawArrow(g, path, u, alpha) {
    var point = samplePath(path, u);
    if (!point || quietDistance(point.x, point.y) < 1.12 || insideMagnet(point.x, point.y)) return;
    var size = 5.4;
    g.save();
    g.translate(point.x, point.y);
    g.rotate(point.angle);
    g.fillStyle = rgba(palette.fieldBright, alpha);
    g.beginPath();
    g.moveTo(size, 0);
    g.lineTo(-size * 0.72, -size * 0.62);
    g.lineTo(-size * 0.28, 0);
    g.lineTo(-size * 0.72, size * 0.62);
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawStatic() {
    var ratio = canvas.__r || 1;
    if (staticLayer.width !== canvas.width || staticLayer.height !== canvas.height) {
      staticLayer.width = canvas.width;
      staticLayer.height = canvas.height;
    }
    var g = staticLayer.getContext('2d');
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, W, H);

    g.fillStyle = rgba(palette.bg, 1);
    g.fillRect(0, 0, W, H);

    drawVectorGlyphs(g);

    g.save();
    g.globalCompositeOperation = 'source-over';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    model.paths.forEach(function (path) {
      makeVisiblePath(g, path);
      g.strokeStyle = rgba(palette.field, path.alpha);
      g.lineWidth = path.width;
      g.stroke();
      if (path.primary) {
        drawArrow(g, path, 0.28, 0.53);
        drawArrow(g, path, 0.62, 0.42);
      }
    });
    g.restore();

  }

  function drawTrajectories(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';

    model.trajectories.forEach(function (trajectory) {
      var u = (trajectory.phase + time / trajectory.period) % 1;
      var fade = smoothstep(0.025, 0.12, u) * (1 - smoothstep(0.86, 0.975, u));
      var tone = palette.fieldBright;
      var previous = null;
      var segments = 24;

      for (var i = segments; i >= 0; i -= 1) {
        var tailU = u - i * 0.0037;
        if (tailU <= 0) {
          previous = null;
          continue;
        }
        var point = samplePath(trajectory.path, tailU);
        if (!point || quietDistance(point.x, point.y) < 1.02 || insideMagnet(point.x, point.y)) {
          previous = null;
          continue;
        }
        if (previous) {
          var progress = 1 - i / segments;
          ctx.strokeStyle = rgba(tone, fade * progress * progress * 0.58);
          ctx.lineWidth = 0.55 + progress * 1.65;
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        previous = point;
      }

      var head = samplePath(trajectory.path, u);
      if (!head || fade <= 0.01 || quietDistance(head.x, head.y) < 1.02 || insideMagnet(head.x, head.y)) return;
      ctx.fillStyle = rgba(tone, fade);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function render(time) {
    if (!ctx || !model) return;
    palette.fieldBright = Deck.rgb('field-bright');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(staticLayer, 0, 0, W, H);
    drawTrajectories(time);
  }

  function rebuild() {
    ctx = Deck.fit(canvas);
    if (!ctx) return;
    readStaticPalette();
    model = buildModel();
    drawStatic();
    render(lastTime);
  }

  function startMotion() {
    stopMotion();
    if (Deck.reduced() || paused || cleaned) {
      render(REPRESENTATIVE_MS);
      lastTime = REPRESENTATIVE_MS;
      return;
    }

    var baseTime = lastTime;
    var lastPaint = -100;
    stopLoop = Deck.loop(function (elapsed) {
      lastTime = baseTime + elapsed;
      if (elapsed - lastPaint < 32) return;
      lastPaint = elapsed;
      render(lastTime);
    }, { still: 0 });
  }

  function resetField(announce) {
    stopMotion();
    lastTime = REPRESENTATIVE_MS;
    paused = false;
    rebuild();
    startMotion();
    if (announce) announceState('磁场已按固定种子重置');
  }

  function announceState(message) {
    liveStatus.textContent = message;
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(function () {
      liveStatus.textContent = '';
    }, 2200);
  }

  function togglePause() {
    if (Deck.reduced()) {
      announceState('系统已启用减少动态，磁场保持在代表帧');
      return;
    }
    paused = !paused;
    if (paused) {
      stopMotion();
      render(lastTime);
      announceState('磁场轨迹已暂停');
    } else {
      announceState('磁场轨迹继续运动');
      startMotion();
    }
  }

  function onKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target && event.target.tagName;
    if (target === 'INPUT' || target === 'TEXTAREA' || target === 'SELECT' || (event.target && event.target.isContentEditable)) return;
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      resetField(true);
    } else if (event.code === 'Space') {
      event.preventDefault();
      togglePause();
    }
  }

  function onMotionPreference() {
    stopMotion();
    lastTime = REPRESENTATIVE_MS;
    paused = false;
    render(lastTime);
    if (!Deck.reduced()) startMotion();
  }

  function onResize() {
    window.cancelAnimationFrame(resizeQueued);
    resizeQueued = window.requestAnimationFrame(function () {
      resizeQueued = 0;
      rebuild();
    });
  }

  function stopMotion() {
    stopLoop();
    stopLoop = noop;
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    stopMotion();
    offResize();
    window.cancelAnimationFrame(resizeQueued);
    window.clearTimeout(announceTimer);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('pagehide', cleanup);
    if (media) {
      if (media.removeEventListener) media.removeEventListener('change', onMotionPreference);
      else if (media.removeListener) media.removeListener(onMotionPreference);
    }
  }

  document.addEventListener('keydown', onKeydown);
  window.addEventListener('pagehide', cleanup);
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onMotionPreference);
    else if (media.addListener) media.addListener(onMotionPreference);
  }
  offResize = Deck.onResize(onResize);

  rebuild();
  startMotion();
})();
  </script>
</body>
</html>
```
  </file>
</sample>
