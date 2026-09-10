const FEATURE_NAMES = ["收入", "年龄", "负债比", "信贷数", "逾期率", "房产值", "学历", "工龄"];

const statusTitle = document.querySelector("#rfStatusTitle");
const badgeTrees = document.querySelector("#badgeTrees");
const badgeFeatures = document.querySelector("#badgeFeatures");
const badgeOOB = document.querySelector("#badgeOOB");
const subFeatureCount = document.querySelector("#subFeatureCount");

const featuresPool = document.querySelector("#featuresPool");
const treesMatrix = document.querySelector("#treesMatrix");

const oobArea = document.querySelector("#oobArea");
const oobPolyline = document.querySelector("#oobPolyline");
const oobPointsGroup = document.querySelector("#oobPoints");

const costValue = document.querySelector("#costValue");
const varianceEffect = document.querySelector("#varianceEffect");
const viewAnnotation = document.querySelector("#viewAnnotation");

// 初始化特征池 DOM
function initFeaturePool() {
  if (featuresPool.children.length > 0) return;
  FEATURE_NAMES.forEach((name, idx) => {
    const pill = document.createElement("div");
    pill.className = "feature-pill";
    pill.id = `feat-pill-${idx}`;
    pill.innerHTML = `
      <span class="feat-id">x${idx + 1}</span>
      <span class="feat-name">${name}</span>
    `;
    featuresPool.appendChild(pill);
  });
}

initFeaturePool();

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const currentTree = state.current_tree || 0;
  const totalTrees = state.total_trees || 12;
  const maxFeatures = state.max_features || 3;
  const totalFeatures = state.total_features || 8;
  const selectedFeatures = new Set(Array.isArray(state.selected_features) ? state.selected_features : []);
  const currentOOB = typeof state.current_oob === "number" ? state.current_oob : 0.45;
  const totalCost = state.total_cost || 0;
  const oobCurve = Array.isArray(state.oob_curve) ? state.oob_curve : [0.45];
  const isComplete = Boolean(state.complete);

  // 1. 顶栏读数
  statusTitle.textContent = isComplete
    ? `训练完成：${totalTrees} 棵树集成完毕`
    : currentTree > 0
    ? `正在构建第 ${currentTree} / ${totalTrees} 棵树...`
    : "随机森林待运行";

  badgeTrees.textContent = `${currentTree} / ${totalTrees}`;
  badgeFeatures.textContent = `${maxFeatures} / ${totalFeatures}`;
  badgeOOB.textContent = currentOOB.toFixed(4);
  subFeatureCount.textContent = String(maxFeatures);

  // 2. 特征池点亮
  FEATURE_NAMES.forEach((_, idx) => {
    const pill = document.getElementById(`feat-pill-${idx}`);
    if (pill) {
      if (selectedFeatures.has(idx)) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    }
  });

  // 3. 树矩阵渲染（最多显示最新 16 棵树）
  treesMatrix.innerHTML = "";
  const treeCount = Math.max(currentTree, 0);
  const startTree = Math.max(1, treeCount - 15);
  for (let t = startTree; t <= treeCount; t++) {
    const card = document.createElement("div");
    card.className = "tree-card" + (t === currentTree ? " active-tree" : "");

    let dotsHtml = "";
    for (let f = 0; f < 8; f++) {
      // 当前树显示真实抽样；已完成的历史树按固定伪哈希渲染特征分布
      const isLit = t === currentTree
        ? selectedFeatures.has(f)
        : ((t * 7 + f * 5 + 3) % 8) < maxFeatures;
      dotsHtml += `<span class="feat-dot ${isLit ? "lit" : ""}"></span>`;
    }

    card.innerHTML = `
      <span class="tree-card-id">#${t}</span>
      <div class="tree-feat-dots">${dotsHtml}</div>
    `;
    treesMatrix.appendChild(card);
  }

  // 4. OOB 折线图坐标计算
  // 图表区域：x 从 36 到 520, y 从 140 (误差 0.0) 到 20 (误差 0.45)
  const xMin = 36;
  const xMax = 520;
  const yBottom = 140;
  const yTop = 20;
  const maxErr = 0.45;
  const minErr = 0.0;

  const pts = [];
  const ptElements = [];
  const totalSteps = Math.max(totalTrees, oobCurve.length, 1);

  oobCurve.forEach((err, idx) => {
    const x = xMin + (idx / (totalSteps - 1 || 1)) * (xMax - xMin);
    const clampedErr = Math.max(minErr, Math.min(maxErr, err));
    const y = yBottom - ((clampedErr - minErr) / (maxErr - minErr)) * (yBottom - yTop);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);

    const isLatest = idx === oobCurve.length - 1;
    ptElements.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" class="chart-point ${isLatest ? "latest" : ""}" />`
    );
  });

  if (pts.length > 0) {
    oobPolyline.setAttribute("points", pts.join(" "));
    const areaPoints = [`${pts[0].split(",")[0]},${yBottom}`, ...pts, `${pts[pts.length - 1].split(",")[0]},${yBottom}`];
    oobArea.setAttribute("points", areaPoints.join(" "));
  } else {
    oobPolyline.setAttribute("points", "");
    oobArea.setAttribute("points", "");
  }
  oobPointsGroup.innerHTML = ptElements.join("");

  // 5. 成本与方差降低分析
  costValue.textContent = `${totalCost} 次分裂评估`;
  if (currentTree <= 1) {
    varianceEffect.textContent = "基学习器方差偏高（未集成）";
    varianceEffect.style.color = "#ffb454";
  } else if (currentTree < 6) {
    varianceEffect.textContent = "集成方差快速下降中";
    varianceEffect.style.color = "#5ec8e0";
  } else {
    varianceEffect.textContent = "方差收敛趋于稳定，进入边际收益区";
    varianceEffect.style.color = "#2e6a45";
  }

  // 6. 底部注记
  viewAnnotation.textContent = step?.annotation || "观察随机森林在不同超参数配置下的泛化误差与资源消耗。";
};
