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
