const SVG_NS = "http://www.w3.org/2000/svg";
const cells = new Map();
const columnLabels = new Map();
const rowLabels = new Map();
const dependencyLines = new Map();

const matrixStage = document.querySelector("#matrixStage");
const matrix = document.querySelector("#matrix");
const columnHost = document.querySelector("#columnLabels");
const rowHost = document.querySelector("#rowLabels");
const dependencyLayer = document.querySelector("#dependencyLayer");
const dependencyHost = document.querySelector("#dependencyLines");
const operation = document.querySelector("#operation");
const formula = document.querySelector("#formula");
const annotation = document.querySelector("#viewAnnotation");
const resultReadout = document.querySelector("#resultReadout");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cellId(row, column) {
  return `${row}-${column}`;
}

function ensureCell(id) {
  if (cells.has(id)) return cells.get(id);
  const cell = document.createElement("span");
  cell.className = "dp-cell";
  cell.dataset.entityId = id;
  matrix.append(cell);
  cells.set(id, cell);
  return cell;
}

function syncLabels(host, records, values) {
  const active = new Set();
  values.forEach((value, index) => {
    const key = String(index);
    active.add(key);
    let label = records.get(key);
    if (!label) {
      label = document.createElement("span");
      records.set(key, label);
      host.append(label);
    }
    label.textContent = value;
    label.className = index === 0 ? "axis-empty" : "";
  });
  for (const [key, label] of records) {
    if (active.has(key)) continue;
    label.remove();
    records.delete(key);
  }
}

function ensureDependency(key) {
  if (dependencyLines.has(key)) return dependencyLines.get(key);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "dependency-line");
  dependencyHost.append(line);
  dependencyLines.set(key, line);
  return line;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const table = list(state.table).map(list);
  const rows = Math.max(1, table.length);
  const columns = Math.max(1, ...table.map((row) => row.length));
  matrixStage.style.setProperty("--rows", String(rows));
  matrixStage.style.setProperty("--columns", String(columns));
  dependencyLayer.setAttribute("viewBox", `0 0 ${columns} ${rows}`);

  syncLabels(columnHost, columnLabels, ["∅", ...Array.from(String(state.target || ""))]);
  syncLabels(rowHost, rowLabels, ["∅", ...Array.from(String(state.source || ""))]);

  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeCells = new Set();
  table.forEach((values, row) => {
    values.forEach((value, column) => {
      const id = cellId(row, column);
      activeCells.add(id);
      const cell = ensureCell(id);
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(column + 1);
      cell.textContent = value === null || value === undefined ? "·" : String(value);
      cell.dataset.computed = String(value !== null && value !== undefined);
      cell.dataset.changed = String(changed.has(id));
      cell.dataset.final = String(Boolean(state.complete) && row === rows - 1 && column === columns - 1);
      if (focus.has(id)) cell.dataset.focus = focus.get(id);
      else delete cell.dataset.focus;
      const rowPrefix = String(state.source || "").slice(0, row) || "空串";
      const columnPrefix = String(state.target || "").slice(0, column) || "空串";
      cell.setAttribute("aria-label", `${rowPrefix} 到 ${columnPrefix} 的距离：${value ?? "尚未计算"}`);
    });
  });
  for (const [id, cell] of cells) {
    if (activeCells.has(id)) continue;
    cell.remove();
    cells.delete(id);
  }

  const active = list(state.active);
  const dependencies = list(state.dependencies);
  const activeLines = new Set();
  if (active.length === 2) {
    dependencies.forEach((dependency, index) => {
      if (!Array.isArray(dependency) || dependency.length !== 2) return;
      const key = `${dependency[0]}-${dependency[1]}:${index}`;
      activeLines.add(key);
      const line = ensureDependency(key);
      line.setAttribute("x1", String(dependency[1] + 0.5));
      line.setAttribute("y1", String(dependency[0] + 0.5));
      line.setAttribute("x2", String(active[1] + 0.45));
      line.setAttribute("y2", String(active[0] + 0.45));
    });
  }
  for (const [key, line] of dependencyLines) {
    if (activeLines.has(key)) continue;
    line.remove();
    dependencyLines.delete(key);
  }

  const activeValue = active.length === 2 ? table[active[0]]?.[active[1]] : null;
  resultReadout.textContent = state.complete
    ? `DISTANCE = ${table[rows - 1]?.[columns - 1] ?? "—"}`
    : `D[${active[0] ?? "i"},${active[1] ?? "j"}] = ${activeValue ?? "?"}`;
  operation.textContent = state.operation || "等待递推";
  formula.textContent = active[0] > 0 && active[1] > 0
    ? "D[i,j] = min(↖ + cost, ↑ + 1, ← + 1)"
    : "D[i,0] = i · D[0,j] = j";
  annotation.textContent = step?.annotation || "观察当前单元格与三个前缀子问题。";
};
