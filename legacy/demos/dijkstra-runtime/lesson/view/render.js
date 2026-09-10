const SVG_NS = "http://www.w3.org/2000/svg";
const edgeElements = new Map();
const nodeElements = new Map();
const edgeLayer = document.querySelector("#edgeLayer");
const nodeLayer = document.querySelector("#nodeLayer");
const graph = document.querySelector("#network");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function svg(name, className) {
  const element = document.createElementNS(SVG_NS, name);
  if (className) element.setAttribute("class", className);
  return element;
}

function ensureEdge(id) {
  if (edgeElements.has(id)) return edgeElements.get(id);
  const root = svg("g", "edge");
  root.dataset.entityId = id;
  const line = svg("line", "edge-line");
  const weight = svg("text", "edge-weight");
  root.append(line, weight);
  edgeLayer.append(root);
  const record = { root, line, weight };
  edgeElements.set(id, record);
  return record;
}

function ensureNode(id) {
  if (nodeElements.has(id)) return nodeElements.get(id);
  const root = svg("g", "node");
  root.dataset.entityId = id;
  const halo = svg("circle", "node-halo");
  halo.setAttribute("r", "30");
  const ring = svg("circle", "node-ring");
  ring.setAttribute("r", "23");
  const core = svg("circle", "node-core");
  core.setAttribute("r", "2.2");
  const label = svg("text", "node-label");
  label.setAttribute("y", "-4");
  const distance = svg("text", "node-distance");
  distance.setAttribute("y", "14");
  const caption = svg("text", "node-caption");
  caption.setAttribute("y", "41");
  root.append(halo, ring, core, label, distance, caption);
  nodeLayer.append(root);
  const record = { root, label, distance, caption };
  nodeElements.set(id, record);
  return record;
}

function positionsFor(nodes) {
  const result = new Map();
  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const x = Number.isFinite(Number(node.x)) ? Number(node.x) : 350 + Math.cos(angle) * 220;
    const y = Number.isFinite(Number(node.y)) ? Number(node.y) + 66 : 264 + Math.sin(angle) * 165;
    result.set(String(node.id), { x, y });
  });
  return result;
}

function clippedLine(source, target, radius = 29) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: source.x + ux * radius,
    y1: source.y + uy * radius,
    x2: target.x - ux * radius,
    y2: target.y - uy * radius,
    mx: (source.x + target.x) / 2,
    my: (source.y + target.y) / 2 - 6,
  };
}

function focusRoles(step) {
  const result = new Map();
  for (const item of list(step?.focus)) {
    const id = String(item?.id ?? "");
    if (!id) continue;
    if (!result.has(id)) result.set(id, new Set());
    result.get(id).add(String(item.role || "focus"));
  }
  return result;
}

function nodeStatus(node, roles, changed) {
  if (changed.has(String(node.id))) return "changed";
  const ownRoles = roles.get(String(node.id)) || new Set();
  if (ownRoles.has("current")) return "current";
  if (ownRoles.has("neighbor")) return "neighbor";
  if (ownRoles.has("frontier")) return "frontier";
  return String(node.status || "unseen");
}

function captionFor(node, status) {
  if (status === "changed") return "DISTANCE WRITE";
  if (status === "current") return "SETTLE NEXT";
  if (status === "neighbor") return "INSPECT";
  if (status === "frontier") return "QUEUED";
  if (status === "settled") return node.parent ? `VIA ${node.parent}` : "SETTLED";
  return "";
}

function operationFor(step) {
  const state = step?.state || {};
  const relax = state.relax;
  if (relax) {
    return {
      label: `RELAX / ${relax.from} → ${relax.to}`,
      expression: `${relax.base} + ${relax.weight} = ${relax.candidate}`,
      detail: relax.accepted
        ? `写入 d(${relax.to})：${relax.known} → ${relax.candidate}`
        : `与当前 d(${relax.to}) = ${relax.known} 比较`,
      tone: relax.accepted ? "accepted" : "active",
    };
  }
  if (state.complete) {
    const settled = list(state.nodes).filter((node) => node.status === "settled").length;
    return { label: "SHORTEST-PATH TREE", expression: `${settled} NODES SETTLED`, detail: "紫色细边组成从 A 出发的最短路径树", tone: "complete" };
  }
  const current = list(step?.focus).find((item) => item?.role === "current")?.id;
  if (current) {
    const distance = list(state.nodes).find((node) => String(node.id) === String(current))?.distance ?? "∞";
    return { label: "EXTRACT MIN", expression: `${current} · d = ${distance}`, detail: "确定最小暂定距离，随后逐条检查相邻边", tone: "active" };
  }
  return { label: "WAITING", expression: "d(A) = 0", detail: "A 将首先出队", tone: "neutral" };
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const nodes = list(state.nodes);
  const edges = list(state.edges);
  const positions = positionsFor(nodes);
  const roles = focusRoles(step);
  const changed = new Set(list(step?.changes).map((item) => String(item?.id ?? "")));
  const liveEdges = new Set();
  const liveNodes = new Set();

  edges.forEach((edge) => {
    const id = String(edge.id || [edge.source, edge.target].sort().join("--"));
    const source = positions.get(String(edge.source));
    const target = positions.get(String(edge.target));
    if (!source || !target) return;
    liveEdges.add(id);
    const record = ensureEdge(id);
    const geometry = clippedLine(source, target);
    for (const key of ["x1", "y1", "x2", "y2"]) record.line.setAttribute(key, String(geometry[key]));
    record.weight.setAttribute("x", String(geometry.mx));
    record.weight.setAttribute("y", String(geometry.my));
    record.weight.textContent = String(edge.weight ?? "");
    const ownRoles = roles.get(id) || new Set();
    record.root.dataset.status = ownRoles.has("shortest-tree") ? "tree" : ownRoles.has("edge") ? "active" : "idle";
  });

  nodes.forEach((node) => {
    const id = String(node.id);
    const point = positions.get(id);
    liveNodes.add(id);
    const record = ensureNode(id);
    const status = nodeStatus(node, roles, changed);
    record.root.setAttribute("transform", `translate(${point.x} ${point.y})`);
    record.root.dataset.status = status;
    record.root.setAttribute("aria-label", `节点 ${id}，距离 ${node.distance ?? "∞"}，${captionFor(node, status)}`);
    record.label.textContent = String(node.label ?? id);
    record.distance.textContent = `d ${node.distance ?? "∞"}`;
    record.caption.textContent = captionFor(node, status);
  });

  for (const [id, record] of edgeElements) {
    if (liveEdges.has(id)) continue;
    record.root.remove();
    edgeElements.delete(id);
  }
  for (const [id, record] of nodeElements) {
    if (liveNodes.has(id)) continue;
    record.root.remove();
    nodeElements.delete(id);
  }

  const queue = list(state.queue);
  document.querySelector("#queueItems").textContent = queue.length
    ? queue.map((item) => `${item.node} · ${item.distance ?? "∞"}`).join("   ·   ")
    : "EMPTY";
  const operation = operationFor(step);
  const operationRoot = document.querySelector("#operation");
  operationRoot.dataset.tone = operation.tone;
  document.querySelector("#operationLabel").textContent = operation.label;
  document.querySelector("#operationExpression").textContent = operation.expression;
  document.querySelector("#operationDetail").textContent = operation.detail;

  const settled = nodes.filter((node) => node.status === "settled").length;
  document.querySelector("#graphProgress").textContent = `SETTLED ${settled} · FRONTIER ${queue.length}`;
  document.querySelector("#graphDescription").textContent = step?.annotation || "Dijkstra 当前执行状态";
  graph.setAttribute("aria-label", `${step?.annotation || "Dijkstra 当前执行状态"}；队列 ${queue.map((item) => item.node).join("、") || "为空"}`);
};
