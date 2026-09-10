<sample id="swarm-spectrum" category="chart" variant="full">
  <file path="samples/chart/swarm-spectrum/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Generalists and specialists</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="styles.css">
  <script>document.documentElement.classList.add("js")</script>
</head>
<body>
  <main id="stage">
    <figure class="swarm" aria-label="Generalists and specialists. The scale runs from zero percent for generalists to one hundred percent for specialists. Hell is least predictable at 4.23 percent, cucumber is most predictable at 92.45 percent, and stone is largest with 2,880 occurrences.">
      <div class="legend">
        <div># of occurrences</div>
        <div class="legend-items" aria-hidden="true">
          <i class="legend-circle" style="width:12.65px;height:12.65px"></i>
          <i class="legend-circle" style="width:17.89px;height:17.89px"></i>
          <i class="legend-circle" style="width:25.3px;height:25.3px"></i>
        </div>
      </div>
      <div class="annotation" aria-hidden="true">
        <div>← Generalists</div>
        <div>Specialists →</div>
      </div>
      <div class="chart">
        <svg id="chart" role="img" aria-label="One hundred and one nouns arranged by predictability from zero to one hundred percent. Circle area represents occurrences; every noun is directly labelled."></svg>
        <aside id="tip" class="tooltip" hidden></aside>
      </div>
      <figcaption class="axis-label">Predictability score<br>(Simpson’s diversity index)</figcaption>
      <div class="fallback">
        <h1>Generalists and specialists</h1>
        <dl>
          <dt>What the position means</dt>
          <dd>0% means a noun appears across many adjectives; 100% means its adjective pairing is highly predictable.</dd>
          <dt>What the area means</dt>
          <dd>Circle area encodes occurrence count. Stone is largest at 2,880 occurrences.</dd>
          <dt>Extremes</dt>
          <dd>Hell scores 4.23%; cucumber scores 92.45%. Seventy-five of 101 nouns fall below 50%.</dd>
        </dl>
      </div>
    </figure>
    <p class="takeaway">75 of 101 nouns score below 50%; the densest interval is 20–25%.</p>
  </main>
  <script src="assets/base.js"></script>
  <script src="data/simpson.js"></script>
  <script src="swarm.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/swarm-spectrum/pages/styles.css">
```css
:root{--stage-w:1600px;--stage-h:900px;--bg:#fff;--text:#1a1d21;--focus:#1a1d21;--font-sans:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;--purple-light:oklch(.79 .20 301);--purple-dark:oklch(.45 .12 301)}
#stage{background:#fff;padding-top:1px}
.swarm{width:100%;max-width:1600px;margin:31px auto 0;padding:0 16px;position:relative;user-select:none}
.chart{position:relative}
#chart{width:100%;height:auto;cursor:pointer}
.annotation{position:absolute;inset:0 0 auto;display:flex;justify-content:space-between;padding:0 16px;text-transform:uppercase;font-size:12px;line-height:1.4}
.legend{position:absolute;top:0;left:50%;transform:translateX(-50%);display:flex;align-items:center;flex-direction:column;text-transform:uppercase;font-size:12px;line-height:1.4}
.legend-items{display:flex;align-items:center;gap:4px}
.legend-circle{border-radius:50%;background:var(--purple-light)}
.axis-label{text-align:center;margin-top:16px;font-size:12px;line-height:1.2;text-transform:uppercase}
.bubble{fill:var(--purple-light)}
.label{fill:#fff;stroke:var(--purple-dark);stroke-width:4px;stroke-linejoin:round;paint-order:stroke fill;font-weight:bold;text-anchor:middle;dominant-baseline:central;pointer-events:none}
.tick{font-size:11px;fill:currentColor;opacity:.8;font-variant-numeric:tabular-nums}
.tick line{stroke:currentColor}
.hit{fill:transparent}
.node:focus{outline:none}
.node:focus .bubble{stroke:#1a1d21;stroke-width:3px}
.tooltip{position:absolute;z-index:3;width:160px;padding:8px 16px;border:2px solid #1a1d21;border-radius:4px;background:#fff;color:#1a1d21;font-size:12px;line-height:1.25;pointer-events:none}
.tooltip strong{display:block;margin-bottom:4px;color:oklch(.55 .14 301);font-size:12px}
.tooltip p{margin:0}
.tooltip h2{font-size:12px;margin-top:4px}
.tooltip ul{margin:0;padding-left:16px}
.tooltip li{color:oklch(.56 .06 202);font-size:12px;line-height:1.2}
.takeaway{width:600px;margin:16px auto 0;font-family:Iowan Old Style,Times New Roman,Times,serif;font-size:18px;line-height:1.6}
.fallback{position:absolute;inset:48px 16px 80px;z-index:4;background:#fff;padding:80px 120px;font:18px/1.55 var(--font-sans)}
.fallback h1{font-size:30px;margin-bottom:16px}
.fallback dt{font-weight:bold}
.fallback dd{margin:0 0 10px}
.js .fallback{display:none}
html:not(.js) .legend,html:not(.js) .annotation,html:not(.js) .axis-label,html:not(.js) .takeaway{display:none}
html:not(.js) .fallback{position:fixed;inset:0;padding:140px 180px}
@media(prefers-reduced-motion:reduce){.tooltip{transition:none}}
```
  </file>
  <file path="samples/chart/swarm-spectrum/pages/swarm.js">
```javascript
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const WIDTH = 1568, HEIGHT = 720, MAX_RADIUS = 48;
  const svg = document.querySelector("#chart");
  const tip = document.querySelector("#tip");
  const swarm = document.querySelector(".swarm");
  const aborter = new AbortController();
  const { signal } = aborter;
  let pinned = null, nodes = [], disposed = false;

  if (!window.Deck) {
    document.documentElement.classList.remove("js");
    return;
  }
  Deck.init({ keys: false });

  function makeSvg(tag, attributes, text) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));
    if (text != null) element.textContent = text;
    return element;
  }

  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, { ...options, signal });
  const formatCount = value => value.toLocaleString("en-US");
  const formatPercent = value => `${(value * 100).toFixed(2)}%`;

  function hideTooltip(force) {
    if (pinned && !force) return;
    tip.hidden = true;
    nodes.forEach(node => node.removeAttribute("aria-current"));
  }

  function placeTooltip(datum, event) {
    const point = event && event.clientX != null ? Deck.pt(svg, event) : datum;
    let x = 16 + point.x + 20, y = point.y + 20;
    if (x + 160 > swarm.clientWidth - 8) x = 16 + point.x - 180;
    tip.style.left = `${Math.max(8, Math.min(x, swarm.clientWidth - 168))}px`;
    tip.style.top = `${Math.max(32, Math.min(y, 650))}px`;
  }

  function showTooltip(datum, node, event, pin) {
    if (pin) pinned = pinned === datum ? null : datum;
    if (!pinned && pin) return hideTooltip(true);
    nodes.forEach(item => item.toggleAttribute("aria-current", item === node));
    tip.innerHTML = `<strong>${datum.vehicle}</strong><p>${formatCount(datum.totalCount)} occurrences across ${formatCount(datum.adjectiveCount)} adjectives</p><h2>Top adjectives:</h2><ul>${datum.top.map(word => `<li>${word}</li>`).join("")}</ul>`;
    placeTooltip(datum, event);
    tip.hidden = false;
  }

  function reset() {
    pinned = null;
    hideTooltip(true);
  }

  // Deterministic SveltePlot dodgeY port: test tangent candidates in symmetric order.
  function dodge(data, centerY) {
    const placed = [];
    data.forEach(datum => {
      const intervals = [0, 0];
      placed.forEach(other => {
        if (other.x - other.r > datum.x + datum.r + 3 || other.x + other.r < datum.x - datum.r - 3) return;
        const dx = datum.x - other.x;
        const radius = 3 + datum.r + other.r;
        const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx));
        intervals.push(other.dy - dy, other.dy + dy);
      });
      const candidates = intervals.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
      candidate: for (const value of candidates) {
        for (let index = 0; index < intervals.length; index += 2) {
          if (intervals[index] + 1e-6 < value && value < intervals[index + 1] - 1e-6) continue candidate;
        }
        datum.dy = value;
        break;
      }
      placed.push(datum);
    });
    data.forEach(datum => { datum.y = datum.dy + centerY; });
  }

  function parseData(csv) {
    return csv.trim().split(/\r?\n/).slice(1).map(line => {
      const fields = line.split(",");
      return { vehicle: fields[0], score: +fields[1], totalCount: +fields[2], adjectiveCount: +fields[3], top: fields[4].split("|") };
    }).filter(datum => datum.totalCount >= 200);
  }

  function bindNode(node, datum) {
    listen(node, "pointerenter", event => { if (!pinned) showTooltip(datum, node, event); });
    listen(node, "pointermove", event => { if (!pinned) placeTooltip(datum, event); });
    listen(node, "pointerleave", () => hideTooltip(false));
    listen(node, "focus", () => { if (!pinned) showTooltip(datum, node); });
    listen(node, "blur", () => hideTooltip(false));
    listen(node, "click", event => showTooltip(datum, node, event, true));
    listen(node, "keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      showTooltip(datum, node, null, true);
    });
  }

  function render(data) {
    const left = 6 + MAX_RADIUS, right = WIDTH - 11 - MAX_RADIUS, baseline = HEIGHT - 22;
    const counts = data.map(datum => datum.totalCount);
    const minCount = Math.min(...counts), maxCount = Math.max(...counts);
    data.forEach(datum => {
      datum.x = left + (right - left) * datum.score;
      datum.r = 8 + 40 * Math.sqrt(datum.totalCount / maxCount);
      datum.fontSize = Math.round(12 + 8 * (datum.totalCount - minCount) / (maxCount - minCount));
      datum.dy = 0;
    });
    data.sort((a, b) => b.totalCount - a.totalCount);
    dodge(data, baseline / 2);

    svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute("width", WIDTH);
    svg.setAttribute("height", HEIGHT);
    svg.replaceChildren(
      makeSvg("title", {}, "Predictability score for 101 simile nouns"),
      makeSvg("desc", {}, "Horizontal position is Simpson’s diversity index. Circle area represents occurrence count.")
    );
    for (let index = 0; index <= 20; index += 1) {
      const x = left + (right - left) * index / 20;
      const tick = makeSvg("g", { class: "tick", transform: `translate(${x} ${baseline})`, "text-anchor": "middle" });
      tick.append(makeSvg("line", { y2: 6 }));
      tick.append(makeSvg("text", { y: 9, "dominant-baseline": "hanging" }, `${index * 5}%`));
      svg.append(tick);
    }
    data.forEach(datum => {
      const node = makeSvg("g", {
        class: "node", tabindex: "0", role: "button",
        "aria-label": `${datum.vehicle}, ${formatPercent(datum.score)}, ${formatCount(datum.totalCount)} occurrences across ${datum.adjectiveCount} adjectives; top adjectives ${datum.top.join(", ")}`,
        transform: `translate(${datum.x} ${datum.y})`
      });
      node.append(makeSvg("circle", { class: "hit", r: Math.max(22, datum.r) }));
      node.append(makeSvg("circle", { class: "bubble", r: datum.r }));
      node.append(makeSvg("text", { class: "label", "font-size": datum.fontSize }, datum.vehicle));
      bindNode(node, datum);
      svg.append(node);
      nodes.push(node);
    });
  }

  try {
    const canonical = parseData(SIMILE_CSV);
    if (canonical.length !== 101 || Math.min(...canonical.map(datum => datum.score)) !== .04231077062560599 || Math.max(...canonical.map(datum => datum.totalCount)) !== 2880) throw new Error("Unexpected simile data");
    render(canonical.map(datum => ({ ...datum })));
  } catch (error) {
    document.documentElement.classList.remove("js");
  }

  const offResize = Deck.onResize(() => { if (!tip.hidden && pinned) placeTooltip(pinned); });
  function teardown() {
    if (disposed) return;
    disposed = true;
    reset();
    aborter.abort();
    offResize();
  }
  listen(window, "keydown", event => { if (event.key === "Escape") reset(); });
  listen(window, "pagehide", teardown, { once: true });
}());
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="data/simpson.js">observation rows (named species, Simpson's diversity index, occurrence count) that the beeswarm positions and sizes</omitted>
</sample>
