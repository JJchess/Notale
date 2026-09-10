const SVG_NS = "http://www.w3.org/2000/svg";

const trainPath = document.querySelector("#trainPath");
const valPath = document.querySelector("#valPath");
const trainArea = document.querySelector("#trainArea");
const valArea = document.querySelector("#valArea");
const gridLinesGroup = document.querySelector("#gridLines");
const axisLabelsGroup = document.querySelector("#axisLabels");
const bestRoundLine = document.querySelector("#bestRoundLine");
const bestValPoint = document.querySelector("#bestValPoint");
const currentValPoint = document.querySelector("#currentValPoint");
const currentTrainPoint = document.querySelector("#currentTrainPoint");
const overfitZone = document.querySelector("#overfitZone");

const statusText = document.querySelector("#currentStatusText");
const trainMseReadout = document.querySelector("#trainMseReadout");
const valMseReadout = document.querySelector("#valMseReadout");
const bestValReadout = document.querySelector("#bestValReadout");

const phaseUnder = document.querySelector("#phaseUnder");
const phaseOpt = document.querySelector("#phaseOpt");
const phaseOver = document.querySelector("#phaseOver");

const annotationEl = document.querySelector("#viewAnnotation");
const metricsHost = document.querySelector("#viewMetrics");

// 布局常量
const PADDING = { top: 20, right: 25, bottom: 30, left: 45 };
const WIDTH = 540;
const HEIGHT = 280;
const PLOT_W = WIDTH - PADDING.left - PADDING.right;
const PLOT_H = HEIGHT - PADDING.top - PADDING.bottom;

let isGridRendered = false;

function renderGridAndAxes() {
  if (isGridRendered) return;
  isGridRendered = true;

  gridLinesGroup.innerHTML = "";
  axisLabelsGroup.innerHTML = "";

  // 纵轴刻度 0.0 到 0.6，步长 0.1
  const yTicks = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  yTicks.forEach((tick) => {
    const y = PADDING.top + PLOT_H * (1 - tick / 0.6);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", PADDING.left);
    line.setAttribute("x2", WIDTH - PADDING.right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "grid-line");
    gridLinesGroup.append(line);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", PADDING.left - 8);
    text.setAttribute("y", y + 3);
    text.setAttribute("text-anchor", "end");
    text.setAttribute("class", "axis-label");
    text.textContent = tick.toFixed(1);
    axisLabelsGroup.append(text);
  });

  // 横轴刻度 0, 5, 10, 15, 20, 25
  const xTicks = [0, 5, 10, 15, 20, 25];
  xTicks.forEach((tick) => {
    const x = PADDING.left + (tick / 25) * PLOT_W;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", PADDING.top);
    line.setAttribute("y2", HEIGHT - PADDING.bottom);
    line.setAttribute("class", "grid-line");
    gridLinesGroup.append(line);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", x);
    text.setAttribute("y", HEIGHT - PADDING.bottom + 16);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "axis-label");
    text.textContent = `T=${tick}`;
    axisLabelsGroup.append(text);
  });
}

function getCoords(index, total, val, maxVal = 0.6) {
  const x = PADDING.left + (index / Math.max(1, total)) * PLOT_W;
  const clampedVal = Math.max(0, Math.min(maxVal, val));
  const y = PADDING.top + PLOT_H * (1 - clampedVal / maxVal);
  return { x, y };
}

function buildPathData(points) {
  if (!points || points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function renderMetrics(metrics) {
  metricsHost.innerHTML = "";
  Object.entries(metrics || {}).forEach(([key, val]) => {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = String(val);
    metricsHost.append(dt, dd);
  });
}

window.renderNotaleView = ({ step }) => {
  renderGridAndAxes();

  const state = step?.state || {};
  const totalRounds = state.total_iterations || 25;
  const currentRound = state.iteration ?? 0;
  const trainHist = state.train_history || [];
  const valHist = state.val_history || [];
  const bestRound = state.min_val_round ?? 0;
  const bestValMse = state.min_val_mse ?? 0;

  // 坐标点计算
  const trainPoints = trainHist.map((v, i) => getCoords(i, totalRounds, v));
  const valPoints = valHist.map((v, i) => getCoords(i, totalRounds, v));

  // 绘制折线
  const trainPathStr = buildPathData(trainPoints);
  const valPathStr = buildPathData(valPoints);
  trainPath.setAttribute("d", trainPathStr);
  valPath.setAttribute("d", valPathStr);

  // 填充区域
  if (trainPoints.length > 0) {
    const bottomY = HEIGHT - PADDING.bottom;
    const firstX = trainPoints[0].x;
    const lastX = trainPoints[trainPoints.length - 1].x;
    trainArea.setAttribute("d", `${trainPathStr} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`);
  } else {
    trainArea.setAttribute("d", "");
  }

  if (valPoints.length > 0) {
    const bottomY = HEIGHT - PADDING.bottom;
    const firstX = valPoints[0].x;
    const lastX = valPoints[valPoints.length - 1].x;
    valArea.setAttribute("d", `${valPathStr} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`);
  } else {
    valArea.setAttribute("d", "");
  }

  // 当前指针点
  if (trainPoints.length > 0) {
    const lastTrain = trainPoints[trainPoints.length - 1];
    currentTrainPoint.setAttribute("cx", lastTrain.x);
    currentTrainPoint.setAttribute("cy", lastTrain.y);
  }
  if (valPoints.length > 0) {
    const lastVal = valPoints[valPoints.length - 1];
    currentValPoint.setAttribute("cx", lastVal.x);
    currentValPoint.setAttribute("cy", lastVal.y);
  }

  // 最优验证轮标线与标记点（当迭代进行到或超过最优轮时显示）
  if (bestRound > 0 && currentRound >= bestRound && bestRound < valHist.length) {
    const bestCoords = getCoords(bestRound, totalRounds, bestValMse);
    bestValPoint.setAttribute("cx", bestCoords.x);
    bestValPoint.setAttribute("cy", bestCoords.y);
    bestValPoint.style.display = "block";

    bestRoundLine.setAttribute("x1", bestCoords.x);
    bestRoundLine.setAttribute("x2", bestCoords.x);
    bestRoundLine.setAttribute("y1", PADDING.top);
    bestRoundLine.setAttribute("y2", HEIGHT - PADDING.bottom);
    bestRoundLine.style.display = "block";

    // 标出过拟合区间
    const overfitX = bestCoords.x;
    const overfitW = Math.max(0, WIDTH - PADDING.right - overfitX);
    overfitZone.setAttribute("x", overfitX);
    overfitZone.setAttribute("y", PADDING.top);
    overfitZone.setAttribute("width", overfitW);
    overfitZone.setAttribute("height", PLOT_H);
  } else {
    bestValPoint.style.display = "none";
    bestRoundLine.style.display = "none";
    overfitZone.setAttribute("width", "0");
  }

  // 读数与状态文本
  statusText.textContent = `ITERATION ${currentRound} OF ${totalRounds}`;
  trainMseReadout.textContent = state.current_train_mse !== undefined ? state.current_train_mse.toFixed(4) : "—";
  valMseReadout.textContent = state.current_val_mse !== undefined ? state.current_val_mse.toFixed(4) : "—";
  bestValReadout.textContent = bestRound > 0 && currentRound >= bestRound
    ? `T=${bestRound} (${bestValMse.toFixed(4)})`
    : "待收敛";

  // 状态指示器高亮
  phaseUnder.classList.remove("active-phase");
  phaseOpt.classList.remove("active-phase");
  phaseOver.classList.remove("active-phase");

  if (state.phase === "underfitting" || state.phase === "initial") {
    phaseUnder.classList.add("active-phase");
  } else if (state.phase === "optimal") {
    phaseOpt.classList.add("active-phase");
  } else if (state.phase === "overfitting" || state.phase === "complete") {
    phaseOver.classList.add("active-phase");
  }

  // 底部解说与指标卡
  annotationEl.textContent = step?.annotation || "观察梯度提升训练集与验证集的 MSE 动态变化。";
  renderMetrics(step?.metrics);
};
