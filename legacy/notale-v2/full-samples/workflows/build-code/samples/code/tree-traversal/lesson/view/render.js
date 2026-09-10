const SVG_NS = "http://www.w3.org/2000/svg";
const nodes = new Map();
const edges = new Map();
const orderItems = new Map();

const nodeLayer = document.querySelector("#nodeLayer");
const edgeLayer = document.querySelector("#edgeLayer");
const visitBeam = document.querySelector("#visitBeam");
const visitOrder = document.querySelector("#visitOrder");
const visitCount = document.querySelector("#visitCount");
const annotation = document.querySelector("#viewAnnotation");
const stackReadout = document.querySelector("#stackReadout");
const treeDescription = document.querySelector("#treeDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureNode(id) {
  if (nodes.has(id)) return nodes.get(id);
  const root = svgElement("g", { class: "tree-node" });
  root.dataset.entityId = id;
  const halo = svgElement("circle", { class: "node-halo", r: "34" });
  const ring = svgElement("circle", { class: "node-ring", r: "27" });
  const core = svgElement("circle", { class: "node-core", r: "20" });
  const value = svgElement("text", { class: "node-value", y: "5" });
  const index = svgElement("text", { class: "node-index", y: "48" });
  root.append(halo, ring, core, value, index);
  nodeLayer.append(root);
  const record = { root, value, index };
  nodes.set(id, record);
  return record;
}

function ensureEdge(id) {
  if (edges.has(id)) return edges.get(id);
  const line = svgElement("line", { class: "tree-edge" });
  line.dataset.entityId = id;
  edgeLayer.append(line);
  edges.set(id, line);
  return line;
}

function ensureOrder(value, index) {
  const key = `${index}:${value}`;
  if (orderItems.has(key)) return orderItems.get(key);
  const item = document.createElement("li");
  item.dataset.order = String(index + 1).padStart(2, "0");
  item.textContent = String(value);
  visitOrder.append(item);
  orderItems.set(key, item);
  return item;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const nodeRows = list(state.nodes);
  const positions = new Map(nodeRows.map((node) => [String(node.id), node]));
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeNodes = new Set();

  for (const node of nodeRows) {
    const id = String(node.id);
    activeNodes.add(id);
    const record = ensureNode(id);
    record.root.setAttribute("transform", `translate(${Number(node.x) || 0} ${Number(node.y) || 0})`);
    record.root.dataset.status = node.status || "pending";
    record.root.dataset.changed = String(changed.has(id));
    if (focus.has(id)) record.root.dataset.focus = focus.get(id);
    else delete record.root.dataset.focus;
    record.value.textContent = String(node.label ?? id);
    const order = list(state.visited).findIndex((value) => String(value) === id);
    record.index.textContent = order >= 0 ? `VISIT ${String(order + 1).padStart(2, "0")}` : "WAIT";
    record.root.setAttribute("aria-label", `节点 ${node.label ?? id}，${order >= 0 ? `第 ${order + 1} 个访问` : "尚未访问"}`);
  }
  for (const [id, record] of nodes) {
    if (activeNodes.has(id)) continue;
    record.root.remove();
    nodes.delete(id);
  }

  const activeEdges = new Set();
  for (const edge of list(state.edges)) {
    const id = String(edge.id || `${edge.source}--${edge.target}`);
    const source = positions.get(String(edge.source));
    const target = positions.get(String(edge.target));
    if (!source || !target) continue;
    activeEdges.add(id);
    const line = ensureEdge(id);
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
    line.dataset.active = String(source.status === "visited" && target.status === "visited");
  }
  for (const [id, line] of edges) {
    if (activeEdges.has(id)) continue;
    line.remove();
    edges.delete(id);
  }

  const visited = list(state.visited);
  const points = visited
    .map((value) => positions.get(String(value)))
    .filter(Boolean)
    .map((node) => `${node.x},${node.y}`);
  visitBeam.setAttribute("d", points.length ? `M ${points.join(" L ")}` : "");

  const activeOrder = new Set();
  visited.forEach((value, index) => {
    const key = `${index}:${value}`;
    activeOrder.add(key);
    ensureOrder(value, index);
  });
  for (const [key, item] of orderItems) {
    if (activeOrder.has(key)) continue;
    item.remove();
    orderItems.delete(key);
  }

  visitCount.textContent = `${String(visited.length).padStart(2, "0")} / ${String(nodeRows.length).padStart(2, "0")}`;
  annotation.textContent = step?.annotation || "观察递归焦点和访问次序。";
  const stack = list(state.stack);
  stackReadout.textContent = `STACK · ${stack.length ? stack.join(" → ") : "EMPTY"}`;
  treeDescription.textContent = `已按中序访问 ${visited.length} 个节点；当前递归栈为 ${stack.join("，") || "空"}。`;
};
