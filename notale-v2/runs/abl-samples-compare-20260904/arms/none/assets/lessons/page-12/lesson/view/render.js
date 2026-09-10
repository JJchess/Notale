const treesContainer = document.querySelector("#treesContainer");
const imp0Bar = document.querySelector("#imp0Bar");
const imp1Bar = document.querySelector("#imp1Bar");
const imp0Text = document.querySelector("#imp0Text");
const imp1Text = document.querySelector("#imp1Text");
const annotation = document.querySelector("#viewAnnotation");
const metricsGrid = document.querySelector("#viewMetrics");
const scopeInfo = document.querySelector("#rfScopeInfo");

const treeCards = new Map();

function ensureTreeCard(tree, totalSamples = 8) {
  let card = treeCards.get(tree.id);
  if (!card) {
    const el = document.createElement("div");
    el.className = "tree-card";
    el.dataset.id = String(tree.id);

    el.innerHTML = `
      <div class="tree-header">
        <span class="tree-id">Tree #${tree.id}</span>
        <span class="tree-gain">ΔG=${tree.gain.toFixed(2)}</span>
      </div>
      <div class="tree-split-info">
        <span class="tree-split-feat">${tree.feature}</span>
        <span class="tree-split-rule">≤ ${tree.threshold}</span>
      </div>
      <div class="tree-oob-block">
        <div class="tree-oob-title">
          <span>OOB 袋外样本</span>
          <span class="oob-count-text">${tree.oob_count} / ${totalSamples}</span>
        </div>
        <div class="oob-dots-grid"></div>
      </div>
    `;

    const dotsGrid = el.querySelector(".oob-dots-grid");
    for (let s = 0; s < totalSamples; s++) {
      const dot = document.createElement("div");
      dot.className = "oob-dot";
      dot.dataset.sampleId = String(s);
      dot.textContent = `S${s}`;
      dotsGrid.appendChild(dot);
    }

    treesContainer.appendChild(el);
    card = { el, dotsGrid };
    treeCards.set(tree.id, card);
  }

  // 更新切分与OOB状态
  const splitFeat = card.el.querySelector(".tree-split-feat");
  if (splitFeat) splitFeat.textContent = tree.feature;

  const splitRule = card.el.querySelector(".tree-split-rule");
  if (splitRule) splitRule.textContent = `≤ ${tree.threshold}`;

  const gainText = card.el.querySelector(".tree-gain");
  if (gainText) gainText.textContent = `ΔG=${Number(tree.gain).toFixed(2)}`;

  const countText = card.el.querySelector(".oob-count-text");
  if (countText) countText.textContent = `${tree.oob_count} / ${totalSamples}`;

  const oobSet = new Set(tree.oob_indices || []);
  const dots = card.dotsGrid.querySelectorAll(".oob-dot");
  dots.forEach((dot, sIdx) => {
    const isOOB = oobSet.has(sIdx);
    dot.dataset.isOob = String(isOOB);
  });

  return card;
}

window.renderNotaleView = ({ step, playback }) => {
  const state = step?.state || {};
  const trees = state.trees || [];
  const nSamples = state.n_samples || 8;
  const imps = state.feature_importances || [0.5, 0.5];
  const oobScore = state.oob_score ?? 0.0;

  // 1. 更新顶部特征重要性条
  const p0 = Math.round((imps[0] || 0) * 100);
  const p1 = Math.round((imps[1] || 0) * 100);
  if (imp0Bar) imp0Bar.style.width = `${p0}%`;
  if (imp1Bar) imp1Bar.style.width = `${p1}%`;
  if (imp0Text) imp0Text.textContent = `${p0}%`;
  if (imp1Text) imp1Text.textContent = `${p1}%`;

  // 2. 更新树桩卡片与 OOB 点阵
  const currentTreeIds = new Set(trees.map((t) => t.id));
  trees.forEach((t) => {
    const card = ensureTreeCard(t, nSamples);
    // 判断是否处于 focus 态
    const isFocused = (step.focus || []).some((f) => f.role === "tree" && f.index === t.id - 1);
    if (isFocused) {
      card.el.dataset.focus = "tree";
    } else {
      delete card.el.dataset.focus;
    }
  });

  // 移除多余的树
  for (const [id, card] of treeCards) {
    if (!currentTreeIds.has(id)) {
      card.el.remove();
      treeCards.delete(id);
    }
  }

  // 3. 更新标题与范围
  if (scopeInfo) {
    scopeInfo.textContent = `${trees.length} TREES · OOB ${(oobScore * 100).toFixed(1)}%`;
  }

  // 4. 更新底部解说与指标
  if (annotation) {
    annotation.textContent = step?.annotation || "随机森林执行中……";
  }

  if (metricsGrid) {
    metricsGrid.innerHTML = "";
    const metrics = step?.metrics || {};
    Object.entries(metrics).forEach(([key, val]) => {
      const cell = document.createElement("div");
      cell.className = "metric-cell";
      cell.innerHTML = `
        <span class="metric-key">${key}</span>
        <span class="metric-val">${val}</span>
      `;
      metricsGrid.appendChild(cell);
    });
  }
};
