const SVG_NS = "http://www.w3.org/2000/svg";
const cells = new Map();
const queueRows = new Map();

const cellLayer = document.querySelector("#cellLayer");
const pathLine = document.querySelector("#pathLine");
const sonar = document.querySelector("#sonar");
const queueItems = document.querySelector("#queueItems");
const annotation = document.querySelector("#viewAnnotation");
const distanceReadout = document.querySelector("#distanceReadout");
const gridDescription = document.querySelector("#gridDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cellId(row, column) {
  return `${row}-${column}`;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureCell(id) {
  if (cells.has(id)) return cells.get(id);
  const root = svgElement("g", { class: "grid-cell" });
  root.dataset.entityId = id;
  const base = svgElement("rect", { class: "cell-base", x: "6", y: "6", width: "88", height: "88", rx: "3" });
  const contour = svgElement("circle", { class: "cell-contour", cx: "50", cy: "50", r: "25" });
  const distance = svgElement("text", { class: "cell-distance", x: "50", y: "56" });
  const marker = svgElement("text", { class: "cell-marker", x: "50", y: "57" });
  root.append(base, contour, distance, marker);
  cellLayer.append(root);
  const record = { root, distance, marker };
  cells.set(id, record);
  return record;
}

function queueKey(value, index) {
  return `${index}:${value[0]}-${value[1]}`;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const grid = list(state.grid);
  const visited = new Set(list(state.visited).map(([row, column]) => cellId(row, column)));
  const path = list(state.path);
  const pathIds = new Set(path.map(([row, column]) => cellId(row, column)));
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const active = new Set();
  const distances = state.distances || {};

  grid.forEach((rowValue, row) => {
    Array.from(String(rowValue)).forEach((value, column) => {
      const id = cellId(row, column);
      active.add(id);
      const record = ensureCell(id);
      record.root.setAttribute("transform", `translate(${column * 100} ${row * 100})`);
      record.root.dataset.type = value === "#" ? "wall" : "open";
      record.root.dataset.visited = String(visited.has(id));
      record.root.dataset.changed = String(changed.has(id));
      record.root.dataset.onPath = String(pathIds.has(id));
      if (focus.has(id)) record.root.dataset.focus = focus.get(id);
      else delete record.root.dataset.focus;
      record.marker.textContent = value === "S" || value === "G" ? value : "";
      record.distance.textContent = value !== "#" && value !== "S" && value !== "G" && id in distances ? String(distances[id]) : "";
      const status = value === "#" ? "墙" : pathIds.has(id) ? "最短路径" : visited.has(id) ? `已发现，距离 ${distances[id]}` : "未发现";
      record.root.setAttribute("aria-label", `第 ${row} 行第 ${column} 列，${value === "S" ? "起点" : value === "G" ? "终点" : status}`);
    });
  });
  for (const [id, record] of cells) {
    if (active.has(id)) continue;
    record.root.remove();
    cells.delete(id);
  }

  pathLine.setAttribute("points", path.map(([row, column]) => `${column * 100 + 50},${row * 100 + 50}`).join(" "));

  const current = list(state.current);
  if (current.length === 2) {
    sonar.hidden = false;
    sonar.setAttribute("transform", `translate(${current[1] * 100 + 50} ${current[0] * 100 + 50})`);
  } else {
    sonar.hidden = true;
  }

  const queue = list(state.queue);
  const activeQueue = new Set();
  queue.slice(0, 10).forEach((value, index) => {
    const key = queueKey(value, index);
    activeQueue.add(key);
    let item = queueRows.get(key);
    if (!item) {
      item = document.createElement("li");
      queueRows.set(key, item);
      queueItems.append(item);
    }
    item.textContent = `(${value[0]},${value[1]})`;
  });
  for (const [key, item] of queueRows) {
    if (activeQueue.has(key)) continue;
    item.remove();
    queueRows.delete(key);
  }

  const currentDistance = current.length === 2 ? distances[cellId(current[0], current[1])] ?? 0 : 0;
  distanceReadout.textContent = state.complete ? `SHORTEST = ${Math.max(0, path.length - 1)}` : `d = ${currentDistance}`;
  annotation.textContent = step?.annotation || "观察搜索波前如何逐层扩散。";
  gridDescription.textContent = `已经发现 ${visited.size} 个开放格；队列中有 ${queue.length} 个格点；${path.length ? `当前路径长 ${path.length - 1} 步` : "尚未形成完整路径"}。`;
};
