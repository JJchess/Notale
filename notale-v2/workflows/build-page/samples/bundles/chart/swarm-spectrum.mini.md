<sample id="swarm-spectrum" category="chart" variant="mini">
  <file path="samples/chart/swarm-spectrum/mini/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Generalists and specialists</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="styles.css">
  <script>document.documentElement.classList.add("js")</script>
</head>
<body>
  <main id="stage">
    <figure class="swarm" aria-label="Simile nouns by predictability and occurrence count.">
      <div class="annotation" aria-hidden="true"><span>← Generalists</span><span>Specialists →</span></div>
      <div class="legend"><span># of occurrences</span><div aria-hidden="true"><i></i><i></i><i></i></div></div>
      <div class="chart">
        <svg id="chart" role="img" aria-label="101 directly labelled simile nouns from 0 to 100% predictability."></svg>
        <aside id="tip" class="tooltip" hidden></aside>
      </div>
      <figcaption>Predictability score<br>(Simpson’s diversity index)</figcaption>
      <section class="fallback">
        <h1>Generalists and specialists</h1>
        <p>Position runs from varied pairings at 0% to predictable pairings at 100%; area represents occurrences.</p>
        <p>Hell scores 4.23%; cucumber 92.45%. Stone is largest at 2,880. Seventy-five of 101 fall below 50%.</p>
      </section>
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
  <file path="samples/chart/swarm-spectrum/mini/pages/swarm.js">
```javascript
(function () {
  "use strict";
  const HEIGHT = 720, PADDING = 3;
  const chart = document.querySelector("#chart");
  const tooltip = document.querySelector("#tip");
  const swarm = document.querySelector(".swarm");
  const aborter = new AbortController();
  let pinned = null, disposed = false;

  if (!window.Deck) {
    document.documentElement.classList.remove("js");
    return;
  }
  Deck.init({ keys:false });

  function listen(target, type, handler) {
    target.addEventListener(type, handler, { signal:aborter.signal });
  }
  function recordFrom(event) {
    return event.target.closest?.(".node")?.__record;
  }
  const percent = value => `${(value * 100).toFixed(2)}%`;

  function placeTooltip(record) {
    let left = record.x + 36;
    if (left + 168 > swarm.clientWidth - 8) left = record.x - 172;
    tooltip.style.left = `${Math.max(8, Math.min(left, swarm.clientWidth - 176))}px`;
    tooltip.style.top = `${Math.max(32, Math.min(record.y + 20, 650))}px`;
  }
  function inspect(record, shouldPin = false) {
    if (!record || disposed) return;
    if (shouldPin) pinned = pinned === record ? null : record;
    if (shouldPin && !pinned) return reset();
    chart.querySelectorAll(".node").forEach(node =>
      node.toggleAttribute("aria-current", node.__record === pinned));
    tooltip.innerHTML = `<strong>${record.vehicle}</strong><span>${percent(record.score)} · ${record.totalCount.toLocaleString("en-US")} occurrences</span>`;
    placeTooltip(record);
    tooltip.hidden = false;
  }
  function leave() {
    if (pinned || disposed) return;
    tooltip.hidden = true;
  }
  function reset() {
    if (disposed) return;
    pinned = null;
    tooltip.hidden = true;
    chart.querySelectorAll("[aria-current]").forEach(node => node.removeAttribute("aria-current"));
  }

  // Exact deterministic tangent dodge from the full sample.
  function dodge(data, centerY) {
    const placed = [];
    data.forEach(record => {
      const intervals = [0, 0];
      placed.forEach(other => {
        if (Math.abs(record.x - other.x) > record.radius + other.radius + PADDING) return;
        const deltaX = record.x - other.x;
        const tangent = record.radius + other.radius + PADDING;
        const deltaY = Math.sqrt(Math.max(0, tangent ** 2 - deltaX ** 2));
        intervals.push(other.offset - deltaY, other.offset + deltaY);
      });
      const candidates = intervals.slice().sort((first, second) => Math.abs(first) - Math.abs(second));
      candidate: for (const value of candidates) {
        for (let index = 0; index < intervals.length; index += 2) {
          if (intervals[index] + 1e-6 < value && value < intervals[index + 1] - 1e-6) continue candidate;
        }
        record.offset = value;
        break;
      }
      placed.push(record);
    });
    data.forEach(record => { record.y = centerY + record.offset; });
  }
  function parseData(csv) {
    if (typeof csv !== "string") throw new Error("Simile data is unavailable");
    return csv.trim().split(/\r?\n/).slice(1).map(line => {
      const fields = line.split(",");
      return {
        vehicle:fields[0], score:Number(fields[1]), totalCount:Number(fields[2])
      };
    }).filter(record => record.totalCount >= 200);
  }
  function render(data) {
    const left = 54, right = 1509, baseline = HEIGHT - 22;
    const counts = data.map(record => record.totalCount);
    const minimum = Math.min(...counts), maximum = Math.max(...counts);
    data.forEach(record => {
      record.x = left + (right - left) * record.score;
      record.radius = 8 + 40 * Math.sqrt(record.totalCount / maximum);
      record.fontSize = Math.round(12 + 8 * (record.totalCount - minimum) / (maximum - minimum));
      record.offset = 0;
    });
    data.sort((first, second) => second.totalCount - first.totalCount);
    dodge(data, baseline / 2);
    const ticks = Array.from({ length:21 }, (_, index) => {
      const position = left + (right - left) * index / 20;
      return `<g class="tick" transform="translate(${position} ${baseline})" text-anchor="middle"><line y2="6"/><text y="9" dominant-baseline="hanging">${index * 5}%</text></g>`;
    }).join("");
    const marks = data.map(record => `<g class="node" tabindex="0" role="button"
      aria-label="${record.vehicle}, ${percent(record.score)}, ${record.totalCount.toLocaleString("en-US")} occurrences"
      transform="translate(${record.x} ${record.y})"><circle class="hit" r="${Math.max(22, record.radius)}"/>
      <circle class="bubble" r="${record.radius}"/><text class="label" font-size="${record.fontSize}">${record.vehicle}</text></g>`).join("");
    chart.setAttribute("viewBox", `0 0 1568 ${HEIGHT}`);
    chart.innerHTML = ticks + marks;
    chart.querySelectorAll(".node").forEach((node, index) => { node.__record = data[index]; });
  }

  try {
    const records = parseData(window.SIMILE_CSV);
    if (records.length !== 101) throw new Error("Unexpected simile data");
    render(records.map(record => ({ ...record })));
  } catch (error) {
    document.documentElement.classList.remove("js");
  }

  listen(chart, "pointerover", event => { if (!pinned) inspect(recordFrom(event)); });
  listen(chart, "pointerout", event => { if (!event.relatedTarget?.closest?.(".node")) leave(); });
  listen(chart, "focusin", event => { if (!pinned) inspect(recordFrom(event)); });
  listen(chart, "focusout", event => { if (!event.relatedTarget?.closest?.(".node")) leave(); });
  listen(chart, "click", event => inspect(recordFrom(event), true));
  listen(chart, "keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    inspect(recordFrom(event), true);
  });
  listen(window, "keydown", event => { if (event.key === "Escape") reset(); });

  function dispose() {
    if (disposed) return;
    reset();
    disposed = true;
    aborter.abort();
  }
  listen(window, "pagehide", dispose);
  window.SwarmMini = { reset, dispose };
}());
```
  </file>
</sample>
