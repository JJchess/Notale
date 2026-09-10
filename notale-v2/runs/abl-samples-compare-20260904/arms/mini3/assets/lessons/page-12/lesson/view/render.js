const treesContainer = document.querySelector("#treesContainer");
const importanceBars = document.querySelector("#importanceBars");
const viewAnnotation = document.querySelector("#viewAnnotation");
const oobBadge = document.querySelector("#oobBadge");
const metricsHost = document.querySelector("#viewMetrics");

const metricRows = new Map();

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

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const trees = state.trees || [];
  const importances = state.importances || [];
  const activeTree = state.activeTree;
  const currentFeature = state.currentFeature;
  const activeSample = state.activeSample;
  const oobAcc = state.oobAccuracy;

  // 1. 渲染 OOB 徽章
  if (oobAcc !== undefined && oobAcc !== null) {
    const pct = Math.round(oobAcc * 100);
    oobBadge.textContent = `OOB 准确率: ${pct}%`;
  } else {
    oobBadge.textContent = `OOB 评估中...`;
  }

  // 2. 渲染树卡片与样本网格
  treesContainer.innerHTML = "";
  trees.forEach((tree) => {
    const card = document.createElement("div");
    const isActive = activeTree === tree.id;
    card.className = `tree-card ${isActive ? "active" : ""}`;

    const header = document.createElement("div");
    header.className = "tree-header";
    header.innerHTML = `
      <span class="tree-name">Tree ${tree.id}</span>
      <span class="tree-rule">${tree.feature} ≤ ${tree.threshold}</span>
    `;

    const labelRow = document.createElement("div");
    labelRow.className = "sample-grid-label";
    labelRow.innerHTML = `
      <span>样本 0 ~ 7 分布</span>
      <span>OOB: [${(tree.oob || []).join(", ")}]</span>
    `;

    const grid = document.createElement("div");
    grid.className = "sample-grid";

    // 8 个样本状态展示
    for (let s = 0; s < 8; s++) {
      const cell = document.createElement("div");
      const isOob = (tree.oob || []).includes(s);
      const isEval = isActive && activeSample === s && isOob;

      cell.className = `sample-cell ${isOob ? "oob" : "in-bag"} ${isEval ? "active-eval" : ""}`;
      cell.textContent = `S${s}`;
      cell.title = isOob ? `样本 ${s}: 袋外样本 (未用于训练)` : `样本 ${s}: 已在 Bootstrap 中采样`;
      grid.appendChild(cell);
    }

    card.appendChild(header);
    card.appendChild(labelRow);
    card.appendChild(grid);
    treesContainer.appendChild(card);
  });

  // 3. 渲染置换特征重要性条形图
  importanceBars.innerHTML = "";
  const maxDrop = 0.5; // 最大比例尺基准
  importances.forEach((imp, fIdx) => {
    const row = document.createElement("div");
    const isCurFeat = currentFeature === fIdx;
    row.className = `importance-row ${isCurFeat ? "imp-row-active" : ""}`;

    const label = document.createElement("div");
    label.className = "imp-label";
    label.textContent = imp.name;

    const track = document.createElement("div");
    track.className = "imp-track";

    const fill = document.createElement("div");
    fill.className = "imp-fill";
    const widthPct = Math.min(100, Math.max(0, (imp.drop / maxDrop) * 100));
    fill.style.width = `${widthPct}%`;
    track.appendChild(fill);

    const val = document.createElement("div");
    val.className = "imp-val";
    val.textContent = `-${Math.round(imp.drop * 100)}%`;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(val);
    importanceBars.appendChild(row);
  });

  // 4. 渲染指标与注释
  renderMetrics(step?.metrics);
  viewAnnotation.textContent = step?.annotation || "正在分析随机森林袋外评估与特征置换重要性...";
};
