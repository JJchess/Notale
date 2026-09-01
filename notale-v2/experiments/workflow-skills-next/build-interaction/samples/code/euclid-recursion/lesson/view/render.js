const SVG_NS = "http://www.w3.org/2000/svg";
const calls = new Map();
const connectors = new Map();

const callLayer = document.querySelector("#callLayer");
const connectorLayer = document.querySelector("#connectorLayer");
const annotation = document.querySelector("#viewAnnotation");
const resultReadout = document.querySelector("#resultReadout");
const ladderDescription = document.querySelector("#ladderDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureCall(id) {
  if (calls.has(id)) return calls.get(id);
  const root = svgElement("g", { class: "call-row" });
  root.dataset.entityId = id;
  const depth = svgElement("text", { class: "depth-label", x: "34", y: "4" });
  const equation = svgElement("text", { class: "equation-label", x: "118", y: "4" });
  const segments = svgElement("g", { class: "segments" });
  const remainder = svgElement("rect", { class: "remainder-segment", y: "22", height: "9" });
  const remainderLabel = svgElement("text", { class: "remainder-label", y: "47" });
  root.append(depth, equation, segments, remainder, remainderLabel);
  callLayer.append(root);
  const record = { root, depth, equation, segments, remainder, remainderLabel, segmentRows: new Map() };
  calls.set(id, record);
  return record;
}

function syncSegments(record, count, width, startX) {
  const active = new Set();
  for (let index = 0; index < count; index += 1) {
    const key = String(index);
    active.add(key);
    let segment = record.segmentRows.get(key);
    if (!segment) {
      segment = svgElement("rect", { class: "quotient-segment", y: "22", height: "9" });
      record.segments.append(segment);
      record.segmentRows.set(key, segment);
    }
    segment.setAttribute("x", String(startX + index * width));
    segment.setAttribute("width", String(Math.max(1, width - 1)));
  }
  for (const [key, segment] of record.segmentRows) {
    if (active.has(key)) continue;
    segment.remove();
    record.segmentRows.delete(key);
  }
}

function ensureConnector(id) {
  if (connectors.has(id)) return connectors.get(id);
  const path = svgElement("path", { class: "descent-connector" });
  connectorLayer.append(path);
  connectors.set(id, path);
  return path;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const frames = list(state.frames);
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeCalls = new Set();
  const maxA = Math.max(1, ...frames.map((frame) => Math.abs(Number(frame.a) || 0)));
  const spacing = frames.length > 1 ? Math.min(102, 390 / (frames.length - 1)) : 102;
  const startY = frames.length > 3 ? 38 : 82;
  const startX = 118;
  const scale = 570 / maxA;

  frames.forEach((frame, index) => {
    const id = String(frame.id || `call-${index}`);
    activeCalls.add(id);
    const record = ensureCall(id);
    const y = startY + index * spacing;
    record.root.setAttribute("transform", `translate(0 ${y})`);
    record.root.dataset.changed = String(changed.has(id));
    record.root.dataset.complete = String(Boolean(state.complete) && index === frames.length - 1);
    if (focus.has(id)) record.root.dataset.focus = focus.get(id);
    else delete record.root.dataset.focus;

    const a = Number(frame.a) || 0;
    const b = Number(frame.b) || 0;
    const quotient = Number.isInteger(frame.quotient) ? frame.quotient : 0;
    const remainder = Number(frame.remainder) || 0;
    const bWidth = Math.max(0, Math.abs(b) * scale);
    const remainderWidth = Math.max(b === 0 ? Math.abs(a) * scale : 0, Math.abs(remainder) * scale);
    syncSegments(record, quotient || (b === 0 ? 0 : 1), bWidth, startX);
    record.remainder.setAttribute("x", String(startX + quotient * bWidth));
    record.remainder.setAttribute("width", String(Math.max(2, remainderWidth)));
    record.depth.textContent = `DEPTH ${String(frame.depth ?? index).padStart(2, "0")}`;
    record.equation.textContent = b === 0 ? `gcd(${a}, 0) → ${a}` : `${a} = ${quotient} × ${b} + ${remainder}`;
    const remainderEnd = startX + quotient * bWidth + Math.max(2, remainderWidth);
    record.remainderLabel.setAttribute("x", String(Math.min(748, remainderEnd)));
    record.remainderLabel.textContent = b === 0 ? `GCD ${a}` : `r ${remainder}`;
    const callDescription = b === 0
      ? `递归深度 ${index}，基例返回 ${a}`
      : `递归深度 ${index}，${a} 除以 ${b}，余数 ${remainder}`;
    record.root.setAttribute("aria-label", callDescription);
  });
  for (const [id, record] of calls) {
    if (activeCalls.has(id)) continue;
    record.root.remove();
    calls.delete(id);
  }

  const activeConnectors = new Set();
  for (let index = 0; index < frames.length - 1; index += 1) {
    const id = `${frames[index].id}--${frames[index + 1].id}`;
    activeConnectors.add(id);
    const current = frames[index];
    const y = startY + index * spacing;
    const nextY = startY + (index + 1) * spacing;
    const bWidth = Math.abs(Number(current.b) || 0) * scale;
    const path = ensureConnector(id);
    const curve = `M ${startX + bWidth} ${y + 31} C ${startX + bWidth} ${y + 55}, `
      + `${startX} ${nextY - 18}, ${startX} ${nextY + 22}`;
    path.setAttribute("d", curve);
  }
  for (const [id, path] of connectors) {
    if (activeConnectors.has(id)) continue;
    path.remove();
    connectors.delete(id);
  }

  resultReadout.textContent = state.complete
    ? `GCD = ${state.result}`
    : frames.length ? `gcd(${frames[0].a}, ${frames[0].b})` : "gcd(a, b)";
  annotation.textContent = step?.annotation || "观察参数如何沿调用栈收敛。";
  const depthSummary = state.complete
    ? `最大公约数为 ${state.result}`
    : `最深层余数为 ${frames.at(-1)?.remainder ?? "未知"}`;
  ladderDescription.textContent = `当前有 ${frames.length} 层递归；${depthSummary}。`;
};
