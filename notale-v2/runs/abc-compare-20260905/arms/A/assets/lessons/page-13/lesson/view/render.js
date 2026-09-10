const treesContainer = document.querySelector("#treesContainer");
const rfModelStatus = document.querySelector("#rfModelStatus");
const kpiCost = document.querySelector("#kpiCost");
const kpiOob = document.querySelector("#kpiOob");
const rfAnnotation = document.querySelector("#rfAnnotation");
const pathAcc = document.querySelector("#pathAcc");
const pathCost = document.querySelector("#pathCost");
const chartPoints = document.querySelector("#chartPoints");

const treeElements = new Map();

function ensureTreeCard(log, isActive) {
  const key = `tree-${log.tree_id}`;
  let card = treeElements.get(key);
  if (!card) {
    card = document.createElement("div");
    card.className = "tree-card";
    card.innerHTML = `
      <span class="tree-badge">Tree #${log.tree_id}</span>
      <div class="tree-info">
        <span class="tree-feats">候选特征: [${log.features.map((f) => "f" + f).join(", ")}]</span>
        <span class="tree-split">切分: f${log.chosen_feature} &gt; ${log.threshold}</span>
      </div>
      <div class="tree-score">
        <div class="tree-score-label">OOB 准确率</div>
        <div class="tree-score-val">${(log.oob_acc * 100).toFixed(1)}%</div>
      </div>
    `;
    treesContainer.appendChild(card);
    treeElements.set(key, card);
  }
  card.className = isActive ? "tree-card active" : "tree-card";
  return card;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const treeLogs = state.tree_logs || [];
  const currentTree = state.current_tree || 0;
  const nEstimators = state.n_estimators || 5;
  const maxFeatures = state.max_features || 2;
  const totalCost = state.total_cost || 0;
  const oobAcc = state.oob_acc || 0.0;

  // 更新状态文字与 KPI
  rfModelStatus.textContent = state.complete
    ? `训练完成 · ${nEstimators} 棵树 (max_features=${maxFeatures}) 全量准确率: ${((state.ensemble_acc || 0) * 100).toFixed(1)}%`
    : `正在训练第 ${currentTree} / ${nEstimators} 棵树 (max_features=${maxFeatures})`;

  kpiCost.textContent = totalCost;
  kpiOob.textContent = `${(oobAcc * 100).toFixed(1)}%`;
  rfAnnotation.textContent = step?.annotation || "观察决策树的采样决策与集成泛化趋势。";

  // 渲染树卡片列表
  const activeKeys = new Set();
  treeLogs.forEach((log) => {
    const key = `tree-${log.tree_id}`;
    activeKeys.add(key);
    ensureTreeCard(log, log.tree_id === currentTree);
  });

  // 清除多余的卡片（例如重置时）
  for (const [key, card] of treeElements) {
    if (!activeKeys.has(key)) {
      card.remove();
      treeElements.delete(key);
    }
  }

  // 绘制折线图 (SVG 坐标体系：x: 40 ~ 360, y: 160(基底) ~ 30(顶部))
  if (treeLogs.length > 0) {
    const xMin = 40;
    const xMax = 360;
    const yBaseline = 150;
    const yTop = 30;

    // x 轴等分：以 nEstimators 为满程
    const xStep = (xMax - xMin) / Math.max(1, nEstimators - 1 || 1);

    // 最大代价归一化
    const maxCostVal = Math.max(20, ...treeLogs.map((t) => t.splits_cost));

    let dAcc = "";
    let dCost = "";
    chartPoints.innerHTML = "";

    treeLogs.forEach((log, i) => {
      const cx = xMin + (log.tree_id - 1) * xStep;
      // 准确率映射：0% -> yBaseline, 100% -> yTop
      const cyAcc = yBaseline - log.oob_acc * (yBaseline - yTop);
      // 代价映射：0 -> yBaseline, maxCostVal -> yTop
      const cyCost = yBaseline - (log.splits_cost / maxCostVal) * (yBaseline - yTop);

      dAcc += (i === 0 ? `M ${cx} ${cyAcc}` : ` L ${cx} ${cyAcc}`);
      dCost += (i === 0 ? `M ${cx} ${cyCost}` : ` L ${cx} ${cyCost}`);

      // 绘制点
      const dotAcc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dotAcc.setAttribute("cx", cx);
      dotAcc.setAttribute("cy", cyAcc);
      dotAcc.setAttribute("r", "3.5");
      dotAcc.setAttribute("class", "chart-dot acc");
      chartPoints.appendChild(dotAcc);

      const dotCost = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dotCost.setAttribute("cx", cx);
      dotCost.setAttribute("cy", cyCost);
      dotCost.setAttribute("r", "3.5");
      dotCost.setAttribute("class", "chart-dot cost");
      chartPoints.appendChild(dotCost);
    });

    pathAcc.setAttribute("d", dAcc);
    pathCost.setAttribute("d", dCost);
  } else {
    pathAcc.setAttribute("d", "");
    pathCost.setAttribute("d", "");
    chartPoints.innerHTML = "";
  }
};
