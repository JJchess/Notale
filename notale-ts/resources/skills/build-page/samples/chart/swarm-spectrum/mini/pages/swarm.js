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
