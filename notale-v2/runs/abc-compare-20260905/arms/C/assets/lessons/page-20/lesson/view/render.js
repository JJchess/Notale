const SVG_NS = "http://www.w3.org/2000/svg";

const roundBadge = document.querySelector("#roundBadge");
const lrBadge = document.querySelector("#lrBadge");
const opTitle = document.querySelector("#opTitle");
const splitVal = document.querySelector("#splitVal");
const stepVal = document.querySelector("#stepVal");
const splitLine = document.querySelector("#splitLine");
const predPath = document.querySelector("#predPath");
const trainPointsGroup = document.querySelector("#trainPointsGroup");
const testPointsGroup = document.querySelector("#testPointsGroup");
const gridLines = document.querySelector("#gridLines");
const resLollipops = document.querySelector("#resLollipops");
const trainMseVal = document.querySelector("#trainMseVal");
const testMseVal = document.querySelector("#testMseVal");
const mseDesc = document.querySelector("#mseDesc");
const viewAnnotation = document.querySelector("#viewAnnotation");

// 坐标映射范围：x ∈ [0.5, 8.5], y ∈ [0, 7.0]
// SVG viewBox: 0 0 540 240
function scaleX(x) {
  return 30 + ((x - 0.5) / 8.0) * (540 - 60);
}
function scaleY(y) {
  return 220 - (y / 7.0) * 195;
}

// 残差坐标映射：残差 r ∈ [-3.0, 3.0] 映射到 0~70 (中心 35)
function scaleResY(r) {
  const clampR = Math.max(-2.5, Math.min(2.5, r));
  return 35 - (clampR / 2.5) * 28;
}
function scaleResX(i, total) {
  return 20 + (i / (total - 1)) * 260;
}

// 初始化网格线（只跑一次）
let gridInit = false;
function initGrid() {
  if (gridInit) return;
  gridInit = true;
  gridLines.innerHTML = "";
  // 水平网格 y = 1, 2, 3, 4, 5, 6
  for (let y = 1; y <= 6; y++) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "30");
    line.setAttribute("y1", String(scaleY(y)));
    line.setAttribute("x2", "510");
    line.setAttribute("y2", String(scaleY(y)));
    gridLines.appendChild(line);
  }
}

window.renderNotaleView = ({ step }) => {
  initGrid();
  const state = step?.state || {};

  const round = state.round ?? 0;
  const maxRounds = state.maxRounds ?? 6;
  const lr = state.learningRate ?? 0.3;
  const trainX = state.trainX || [1, 2, 3, 4, 5, 6, 7, 8];
  const trainY = state.trainY || [1.2, 1.9, 3.2, 3.8, 5.1, 5.8, 4.5, 3.1];
  const trainPred = state.trainPred || [];
  const testX = state.testX || [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
  const testY = state.testY || [1.5, 2.6, 3.6, 4.6, 5.6, 5.3, 3.7];
  const testPred = state.testPred || [];
  const residuals = state.residuals || [];
  const split = state.split;

  // 1. 顶部状态
  roundBadge.textContent = `ROUND ${round} / ${maxRounds}`;
  lrBadge.textContent = `η = ${lr}`;
  opTitle.textContent = state.operation || "拟合中";

  if (split !== null && split !== undefined) {
    splitVal.textContent = `x* = ${split}`;
    stepVal.textContent = `${lr} × h_${round}(x)`;
    splitLine.style.display = "block";
    const sx = scaleX(split);
    splitLine.setAttribute("x1", String(sx));
    splitLine.setAttribute("x2", String(sx));
  } else {
    splitVal.textContent = round === 0 ? "初始均值" : "全域累加";
    stepVal.textContent = `η = ${lr}`;
    splitLine.style.display = "none";
  }

  // 2. 绘制散点
  // 训练样本
  trainPointsGroup.innerHTML = "";
  trainX.forEach((x, i) => {
    const cx = scaleX(x);
    const cy = scaleY(trainY[i]);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "#5ec8e0");
    circle.setAttribute("stroke", "#05070a");
    circle.setAttribute("stroke-width", "1.5");
    trainPointsGroup.appendChild(circle);
  });

  // 测试样本
  testPointsGroup.innerHTML = "";
  testX.forEach((x, i) => {
    const cx = scaleX(x);
    const cy = scaleY(testY[i]);
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(cx - 3.5));
    rect.setAttribute("y", String(cy - 3.5));
    rect.setAttribute("width", "7");
    rect.setAttribute("height", "7");
    rect.setAttribute("fill", "#b389ff");
    rect.setAttribute("stroke", "#05070a");
    rect.setAttribute("stroke-width", "1");
    testPointsGroup.appendChild(rect);
  });

  // 3. 绘制集成预测折线
  // 结合 trainX 和 testX 生成平滑有序的预测曲线
  const combined = [];
  trainX.forEach((x, i) => combined.push({ x, pred: trainPred[i] ?? 3.575 }));
  testX.forEach((x, i) => combined.push({ x, pred: testPred[i] ?? 3.575 }));
  combined.sort((a, b) => a.x - b.x);

  if (combined.length > 0) {
    let d = "";
    // 左端点外延
    d += `M ${scaleX(0.8)} ${scaleY(combined[0].pred)} `;
    combined.forEach((pt) => {
      d += `L ${scaleX(pt.x)} ${scaleY(pt.pred)} `;
    });
    // 右端点外延
    d += `L ${scaleX(8.2)} ${scaleY(combined[combined.length - 1].pred)}`;
    predPath.setAttribute("d", d);
  }

  // 4. 残差分布棒棒糖图
  resLollipops.innerHTML = "";
  residuals.forEach((res, i) => {
    const rx = scaleResX(i, residuals.length);
    const ry = scaleResY(res);
    const g = document.createElementNS(SVG_NS, "g");

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(rx));
    line.setAttribute("y1", "35");
    line.setAttribute("x2", String(rx));
    line.setAttribute("y2", String(ry));
    line.setAttribute("stroke", res >= 0 ? "#5ec8e0" : "#ffb454");
    line.setAttribute("stroke-width", "2");

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(rx));
    circle.setAttribute("cy", String(ry));
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", res >= 0 ? "#5ec8e0" : "#ffb454");

    g.appendChild(line);
    g.appendChild(circle);
    resLollipops.appendChild(g);
  });

  // 5. 误差与指标
  const trMse = state.trainMse !== undefined ? state.trainMse : 1.684;
  const teMse = state.testMse !== undefined ? state.testMse : 1.750;
  trainMseVal.textContent = Number(trMse).toFixed(3);
  testMseVal.textContent = Number(teMse).toFixed(3);

  if (trMse < 0.25 && teMse > trMse * 2.2) {
    mseDesc.textContent = "警告：训练误差被极致压缩，但测试误差显著偏高，模型可能过度拟合了局部样本。";
    mseDesc.style.color = "var(--viz-danger, #ff6b7a)";
  } else if (trMse < 0.45) {
    mseDesc.textContent = "收敛状态良好：弱学习器阶梯逼近真实曲线，泛化误差平稳。";
    mseDesc.style.color = "var(--viz-soft, #aab6c4)";
  } else {
    mseDesc.textContent = "当前轮数较少或学习率较保守，整体残差仍有继续缩减的空间。";
    mseDesc.style.color = "var(--viz-dim, #6f7b88)";
  }

  // 6. 文案说明
  viewAnnotation.textContent = step?.annotation || "观察弱桩如何沿梯度方向逐轮拟合残差。";
};
