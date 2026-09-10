const SVG_NS = "http://www.w3.org/2000/svg";

const stageTag = document.querySelector("#stageTag");
const roundReadout = document.querySelector("#roundReadout");
const trainMseReadout = document.querySelector("#trainMseReadout");
const valMseReadout = document.querySelector("#valMseReadout");
const viewAnnotation = document.querySelector("#viewAnnotation");

const gridLines = document.querySelector("#gridLines");
const trainPath = document.querySelector("#trainPath");
const valPath = document.querySelector("#valPath");
const trainArea = document.querySelector("#trainArea");
const valArea = document.querySelector("#valArea");
const dataPoints = document.querySelector("#dataPoints");
const bestMarker = document.querySelector("#bestMarker");
const bestLine = document.querySelector("#bestLine");
const bestDot = document.querySelector("#bestDot");
const bestText = document.querySelector("#bestText");

const phaseUnder = document.querySelector("#phaseUnder");
const phaseOptimal = document.querySelector("#phaseOptimal");
const phaseOver = document.querySelector("#phaseOver");

// 画布坐标转换
const PLOT_W = 740;
const PLOT_H = 320;
const PAD_L = 55;
const PAD_R = 30;
const PAD_T = 30;
const PAD_B = 40;

const INNER_W = PLOT_W - PAD_L - PAD_R;
const INNER_H = PLOT_H - PAD_T - PAD_B;

// 坐标映射
function getX(r, total) {
  const maxR = Math.max(12, total);
  return PAD_L + ((r - 1) / (maxR - 1)) * INNER_W;
}

function getY(loss, maxLoss) {
  const boundedLoss = Math.max(0, Math.min(maxLoss, loss));
  return PAD_T + (1 - boundedLoss / maxLoss) * INNER_H;
}

// 静态网格线初始化
let gridRendered = false;
function renderGrid(totalRounds, maxLoss) {
  if (gridRendered) return;
  gridRendered = true;
  gridLines.innerHTML = "";

  // 水平网格线与 Y 轴刻度
  const yTicks = [0.0, 0.5, 1.0, 1.5, 2.0];
  yTicks.forEach((tick) => {
    const y = getY(tick, maxLoss);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", PAD_L);
    line.setAttribute("y1", y);
    line.setAttribute("x2", PLOT_W - PAD_R);
    line.setAttribute("y2", y);
    gridLines.appendChild(line);

    const txt = document.createElementNS(SVG_NS, "text");
    txt.setAttribute("x", PAD_L - 8);
    txt.setAttribute("y", y + 3.5);
    txt.setAttribute("text-anchor", "end");
    txt.textContent = tick.toFixed(1);
    gridLines.appendChild(txt);
  });

  // 垂直网格线与 X 轴刻度 (轮数)
  for (let r = 1; r <= 12; r += 1) {
    const x = getX(r, 12);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", PAD_T);
    line.setAttribute("x2", x);
    line.setAttribute("y2", PLOT_H - PAD_B);
    line.setAttribute("stroke-dasharray", "2 3");
    gridLines.appendChild(line);

    const txt = document.createElementNS(SVG_NS, "text");
    txt.setAttribute("x", x);
    txt.setAttribute("y", PLOT_H - PAD_B + 18);
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = `T${r}`;
    gridLines.appendChild(txt);
  }
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const history = Array.isArray(state.history) ? state.history : [];
  const currentRound = state.current_round || 0;
  const totalRounds = state.total_rounds || 12;
  const stage = state.stage || "ready";

  const maxLoss = 2.0;
  renderGrid(totalRounds, maxLoss);

  // 1. 顶部读数同步
  stageTag.textContent = stage;
  stageTag.dataset.stage = stage;
  roundReadout.textContent = `${currentRound} / ${totalRounds}`;
  trainMseReadout.textContent = state.train_loss !== null && state.train_loss !== undefined
    ? Number(state.train_loss).toFixed(4)
    : "—";
  valMseReadout.textContent = state.val_loss !== null && state.val_loss !== undefined
    ? Number(state.val_loss).toFixed(4)
    : "—";
  viewAnnotation.textContent = step?.annotation || "准备就绪，点击运行开始逐步观测梯度提升迭代过程。";

  // 2. 阶段卡片高亮
  phaseUnder.classList.toggle("active", stage === "underfitting");
  phaseOptimal.classList.toggle("active", stage === "optimal");
  phaseOver.classList.toggle("active", stage === "overfitting");

  // 3. 曲线路径与数据点渲染
  dataPoints.innerHTML = "";
  if (history.length === 0) {
    trainPath.setAttribute("d", "");
    valPath.setAttribute("d", "");
    trainArea.setAttribute("d", "");
    valArea.setAttribute("d", "");
    bestMarker.style.display = "none";
    return;
  }

  let trainD = "";
  let valD = "";
  const zeroY = getY(0, maxLoss);

  history.forEach((pt, idx) => {
    const x = getX(pt.round, totalRounds);
    const yT = getY(pt.train_loss, maxLoss);
    const yV = getY(pt.val_loss, maxLoss);

    if (idx === 0) {
      trainD += `M ${x} ${yT}`;
      valD += `M ${x} ${yV}`;
    } else {
      trainD += ` L ${x} ${yT}`;
      valD += ` L ${x} ${yV}`;
    }

    // 绘制圆点
    const dotT = document.createElementNS(SVG_NS, "circle");
    dotT.setAttribute("cx", x);
    dotT.setAttribute("cy", yT);
    dotT.setAttribute("r", idx === history.length - 1 ? "4.5" : "3");
    dotT.setAttribute("class", idx === history.length - 1 ? "dot-train dot-latest" : "dot-train");
    dataPoints.appendChild(dotT);

    const dotV = document.createElementNS(SVG_NS, "circle");
    dotV.setAttribute("cx", x);
    dotV.setAttribute("cy", yV);
    dotV.setAttribute("r", idx === history.length - 1 ? "4.5" : "3");
    dotV.setAttribute("class", idx === history.length - 1 ? "dot-val dot-latest" : "dot-val");
    dataPoints.appendChild(dotV);
  });

  trainPath.setAttribute("d", trainD);
  valPath.setAttribute("d", valD);

  // 闭合填充区域
  const firstX = getX(history[0].round, totalRounds);
  const lastX = getX(history[history.length - 1].round, totalRounds);
  trainArea.setAttribute("d", `${trainD} L ${lastX} ${zeroY} L ${firstX} ${zeroY} Z`);
  valArea.setAttribute("d", `${valD} L ${lastX} ${zeroY} L ${firstX} ${zeroY} Z`);

  // 最佳轮次标注 (若已确定或历史已过最优谷底)
  let bestItem = history.reduce((min, curr) => curr.val_loss < min.val_loss ? curr : min, history[0]);
  if (bestItem && history.length >= 4) {
    bestMarker.style.display = "inline";
    const bx = getX(bestItem.round, totalRounds);
    const by = getY(bestItem.val_loss, maxLoss);
    bestLine.setAttribute("x1", bx);
    bestLine.setAttribute("y1", PAD_T);
    bestLine.setAttribute("x2", bx);
    bestLine.setAttribute("y2", PLOT_H - PAD_B);
    bestDot.setAttribute("cx", bx);
    bestDot.setAttribute("cy", by);
    bestText.setAttribute("x", bx);
    bestText.setAttribute("y", PAD_T - 8);
    bestText.textContent = `最优泛化轮次 (T${bestItem.round})`;
  } else {
    bestMarker.style.display = "none";
  }
};
