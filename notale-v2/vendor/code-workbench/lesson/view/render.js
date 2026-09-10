const bars = new Map();
const rangeMarks = new Map();
const metricRows = new Map();

const barsHost = document.querySelector("#bars");
const rangeHost = document.querySelector("#rangeLayer");
const annotation = document.querySelector("#viewAnnotation");
const metricsHost = document.querySelector("#viewMetrics");
const spectrum = document.querySelector("#spectrum");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function numericValue(item) {
  const value = item && typeof item === "object" ? (item.value ?? item.label ?? 0) : item;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function displayValue(item) {
  if (item && typeof item === "object") return String(item.label ?? item.value ?? "");
  return String(item ?? "");
}

function ensureBar(index) {
  if (bars.has(index)) return bars.get(index);
  const root = document.createElement("div");
  root.className = "spectrum-bar";
  root.dataset.index = String(index);
  root.dataset.entityId = String(index);

  const stem = document.createElement("div");
  stem.className = "bar-stem";
  const value = document.createElement("span");
  value.className = "bar-value";
  const label = document.createElement("span");
  label.className = "bar-index";
  label.textContent = String(index).padStart(2, "0");
  root.append(stem, value, label);
  barsHost.append(root);
  const record = { root, value };
  bars.set(index, record);
  return record;
}

function renderRanges(ranges, count) {
  const active = new Set();
  for (const [index, record] of bars) {
    record.root.dataset.inRange = String(ranges.some((range) => index >= range.from && index <= range.to));
  }
  ranges.forEach((range, index) => {
    const from = Math.max(0, Math.min(count - 1, Number(range.from) || 0));
    const to = Math.max(from, Math.min(count - 1, Number(range.to) || from));
    const key = `${range.role || "range"}:${from}:${to}`;
    active.add(key);
    let mark = rangeMarks.get(key);
    if (!mark) {
      mark = document.createElement("span");
      mark.className = "range-mark";
      rangeHost.append(mark);
      rangeMarks.set(key, mark);
    }
    mark.dataset.label = String(range.label || range.role || "range");
    mark.style.left = `${(from / Math.max(1, count)) * 100}%`;
    mark.style.width = `${((to - from + 1) / Math.max(1, count)) * 100}%`;
    mark.style.transform = `translateY(${index * 13}px)`;
  });
  for (const [key, mark] of rangeMarks) {
    if (active.has(key)) continue;
    mark.remove();
    rangeMarks.delete(key);
  }
}

function renderMetrics(metrics) {
  const entries = Object.entries(metrics || {}).slice(0, 3);
  const active = new Set(entries.map(([key]) => key));
  for (const [key, value] of entries) {
    let row = metricRows.get(key);
    if (!row) {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = key;
      metricsHost.append(term, detail);
      row = { term, detail };
      metricRows.set(key, row);
    }
    row.detail.textContent = String(value);
  }
  for (const [key, row] of metricRows) {
    if (active.has(key)) continue;
    row.term.remove();
    row.detail.remove();
    metricRows.delete(key);
  }
}

function algorithmLabel(filename) {
  if (filename.includes("bubble")) return "BUBBLE SORT";
  if (filename.includes("selection")) return "SELECTION SORT";
  if (filename.includes("insertion")) return "INSERTION SORT";
  return "SEQUENCE TRACE";
}

window.renderNotaleView = ({ step }) => {
  const items = list(step?.state?.items);
  const count = items.length;
  const values = items.map(numericValue);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const span = Math.max(1, high - low);
  const focus = new Map(list(step?.focus).filter((item) => Number.isInteger(item?.index)).map((item) => [item.index, item.role || "focus"]));
  const changed = new Set(list(step?.changes).filter((item) => Number.isInteger(item?.index)).map((item) => item.index));
  const active = new Set();

  barsHost.style.setProperty("--count", String(Math.max(1, count)));
  document.querySelector("#sampleCount").textContent = `N = ${count}`;
  document.querySelector("#algorithmName").textContent = algorithmLabel(step?.source?.file || "");

  items.forEach((item, index) => {
    active.add(index);
    const record = ensureBar(index);
    const height = 6 + ((numericValue(item) - low) / span) * 88;
    record.root.style.setProperty("--bar-height", `${height}%`);
    record.root.dataset.changed = String(changed.has(index));
    if (focus.has(index)) record.root.dataset.focus = focus.get(index);
    else delete record.root.dataset.focus;
    record.value.textContent = displayValue(item);
  });
  for (const [index, record] of bars) {
    if (active.has(index)) continue;
    record.root.remove();
    bars.delete(index);
  }

  renderRanges(list(step?.state?.ranges), count);
  renderMetrics(step?.metrics);
  annotation.textContent = step?.annotation || "等待执行轨迹。";
  spectrum.setAttribute("aria-label", `当前序列：${items.map(displayValue).join("，")}`);
};
