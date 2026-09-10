const treesGrid = document.querySelector("#treesGrid");
const oobSamplesList = document.querySelector("#oobSamplesList");
const importanceBars = document.querySelector("#importanceBars");
const oobScore = document.querySelector("#oobScore");
const rfStatus = document.querySelector("#rfStatus");
const viewAnnotation = document.querySelector("#viewAnnotation");
const dashMetrics = document.querySelector("#dashMetrics");

// 真实样本标签：前 4 个正，中间 4 个负，后 4 个 1/0/1/0
const TRUE_LABELS = [1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0];

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const trees = state.trees || [];
  const oobPredictions = state.oob_predictions || {};
  const importances = state.importances || {};
  const oobAccuracy = state.oob_accuracy;
  const activeTree = state.active_tree;

  // 1. 顶栏 OOB 分数与状态
  if (oobAccuracy !== null && oobAccuracy !== undefined) {
    oobScore.textContent = `${(oobAccuracy * 100).toFixed(1)}%`;
  } else {
    oobScore.textContent = "--";
  }

  rfStatus.textContent = state.step_type === "complete" 
    ? "RANDOM FOREST · TRAINED & EVALUATED" 
    : `RANDOM FOREST · 5 TREES (STEP: ${step?.sequence ?? 0})`;

  // 2. 渲染 5 棵树的卡片
  treesGrid.innerHTML = "";
  trees.forEach((tree, idx) => {
    const card = document.createElement("div");
    card.className = "tree-card" + (activeTree === idx ? " active" : "");

    const inBagSet = new Set(tree.in_bag || []);
    const oobSet = new Set(tree.oob || []);

    const header = document.createElement("div");
    header.className = "tree-card-header";
    header.innerHTML = `<span>Tree #${idx + 1}</span><span class="tree-split-info">${tree.split_feat || "—"}</span>`;

    const matrix = document.createElement("div");
    matrix.className = "samples-matrix";
    for (let s = 0; s < 12; s++) {
      const cell = document.createElement("div");
      cell.className = "sample-cell";
      if (inBagSet.has(s)) {
        cell.classList.add("in-bag");
      } else if (oobSet.has(s)) {
        cell.classList.add("oob");
      }
      cell.textContent = s;
      matrix.appendChild(cell);
    }

    card.appendChild(header);
    card.appendChild(matrix);
    treesGrid.appendChild(card);
  });

  // 3. 渲染 OOB 聚合样本（12 个）
  oobSamplesList.innerHTML = "";
  for (let s = 0; s < 12; s++) {
    const item = document.createElement("div");
    item.className = "oob-sample-item";
    const hasPred = s in oobPredictions;
    const predVal = oobPredictions[s];
    const trueVal = TRUE_LABELS[s];

    if (hasPred) {
      if (predVal === trueVal) item.classList.add("correct");
      else item.classList.add("wrong");
    }

    item.innerHTML = `
      <div class="item-top">
        <span>S[${s}]</span>
        <span class="tag-true">y=${trueVal}</span>
      </div>
      <div class="item-bot">
        <span class="tag-pred ${hasPred && predVal !== trueVal ? 'err' : ''}">
          ${hasPred ? `OOB: ${predVal}` : "未覆盖"}
        </span>
      </div>
    `;
    oobSamplesList.appendChild(item);
  }

  // 4. 渲染特征重要性条形图
  importanceBars.innerHTML = "";
  const featEntries = Object.entries(importances);
  // 若无数据，展示默认 3 个特征占位
  const displayEntries = featEntries.length > 0 ? featEntries : [
    ["x0_信号", 0.0],
    ["x1_主导", 0.0],
    ["x2_噪声", 0.0]
  ];

  const maxImp = Math.max(0.3, ...displayEntries.map(([, v]) => v || 0));

  displayEntries.forEach(([name, val]) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const meta = document.createElement("div");
    meta.className = "bar-meta";
    meta.innerHTML = `<span class="bar-name">${name}</span><span class="bar-val">${(val || 0).toFixed(4)}</span>`;

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill" + (name.includes("主导") ? " lead" : "");
    const pct = Math.min(100, Math.round(((val || 0) / maxImp) * 100));
    fill.style.width = `${pct}%`;

    track.appendChild(fill);
    row.appendChild(meta);
    row.appendChild(track);
    importanceBars.appendChild(row);
  });

  // 5. 注记与指标
  viewAnnotation.textContent = step?.annotation || "等待执行...";
  
  dashMetrics.innerHTML = "";
  const metrics = step?.metrics || {};
  Object.entries(metrics).forEach(([k, v]) => {
    const span = document.createElement("span");
    span.innerHTML = `${k}: <strong>${v}</strong>`;
    dashMetrics.appendChild(span);
  });
};
