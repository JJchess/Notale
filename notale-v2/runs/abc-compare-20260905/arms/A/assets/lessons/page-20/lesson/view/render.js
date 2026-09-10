const SVG_NS = "http://www.w3.org/2000/svg";

const roundIndicator = document.querySelector("#roundIndicator");
const mseBadge = document.querySelector("#mseBadge");
const fitGrid = document.querySelector("#fitGrid");
const splitLine = document.querySelector("#splitLine");
const fitPath = document.querySelector("#fitPath");
const samplePoints = document.querySelector("#samplePoints");
const stumpDesc = document.querySelector("#stumpDesc");
const resBars = document.querySelector("#resBars");
const stumpStepPath = document.querySelector("#stumpStepPath");
const viewAnnotation = document.querySelector("#viewAnnotation");
const metricsGrid = document.querySelector("#metricsGrid");

// 坐标映射范围：X in [0.5, 8.5], Y in [-2.5, 2.5]
// SVG viewBox: 上图 520x180, 下图 520x120
const W = 520;
const FIT_H = 180;
const RES_H = 120;
const PAD_X = 30;
const PLOT_W = W - PAD_X * 2;

function mapX(x) {
  return PAD_X + ((x - 0.5) / 8.0) * PLOT_W;
}

function mapFitY(y) {
  // y: [-2.5, 2.5] -> [FIT_H - 15, 15]
  const norm = (y - (-2.5)) / 5.0;
  return FIT_H - 15 - norm * (FIT_H - 30);
}

function mapResY(r) {
  // r: [-2.5, 2.5] -> [RES_H - 10, 10]
  const norm = (r - (-2.5)) / 5.0;
  return RES_H - 10 - norm * (RES_H - 20);
}

function initGrid() {
  fitGrid.innerHTML = "";
  // 绘制 4 条水平参考网格线
  [-2, -1, 0, 1, 2].forEach((val) => {
    const y = mapFitY(val);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", PAD_X);
    line.setAttribute("x2", W - PAD_X);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    fitGrid.appendChild(line);
  });
}
initGrid();

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const samples = state.samples || [];
  const round = state.round ?? 0;
  const totalRounds = state.total_rounds ?? 6;
  const split = state.split;
  const eta = state.eta ?? 0.5;

  roundIndicator.textContent = `ROUND ${round}/${totalRounds}`;
  mseBadge.textContent = `MSE: ${state.mse ?? "—"}`;

  // 1. 绘制切分线
  if (split !== null && split !== undefined) {
    const sx = mapX(split);
    splitLine.setAttribute("x1", sx);
    splitLine.setAttribute("x2", sx);
    splitLine.setAttribute("visibility", "visible");
    stumpDesc.textContent = `切分点 s = ${split.toFixed(2)}, 左侧补偿: ${state.left_val > 0 ? "+" : ""}${state.left_val.toFixed(2)}, 右侧补偿: ${state.right_val > 0 ? "+" : ""}${state.right_val.toFixed(2)}`;
  } else {
    splitLine.setAttribute("visibility", "hidden");
    stumpDesc.textContent = round === 0 ? "初始化中（以样本均值开始）" : "拟合残差完毕";
  }

  // 2. 绘制样本散点
  samplePoints.innerHTML = "";
  samples.forEach((pt) => {
    const cx = mapX(pt.x);
    const cy = mapFitY(pt.y);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "sample-circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 4.5);
    samplePoints.appendChild(circle);
  });

  // 3. 绘制集成曲线 F_m(x)
  if (samples.length > 0) {
    let d = "";
    samples.forEach((pt, i) => {
      const px = mapX(pt.x);
      const py = mapFitY(pt.pred);
      if (i === 0) {
        d += `M ${mapX(0.5)} ${py} L ${px} ${py}`;
      } else {
        d += ` L ${px} ${py}`;
      }
    });
    // 延伸到右侧
    const lastPred = samples[samples.length - 1].pred;
    d += ` L ${mapX(8.5)} ${mapFitY(lastPred)}`;
    fitPath.setAttribute("d", d);
  }

  // 4. 绘制残差柱
  resBars.innerHTML = "";
  const zeroY = mapResY(0);
  samples.forEach((pt) => {
    const x = mapX(pt.x);
    const r = pt.res;
    const ry = mapResY(r);
    const rect = document.createElementNS(SVG_NS, "rect");
    const barW = 10;
    rect.setAttribute("x", x - barW / 2);
    if (r >= 0) {
      rect.setAttribute("y", ry);
      rect.setAttribute("height", Math.max(2, zeroY - ry));
      rect.setAttribute("class", "res-bar");
    } else {
      rect.setAttribute("y", zeroY);
      rect.setAttribute("height", Math.max(2, ry - zeroY));
      rect.setAttribute("class", "res-bar negative");
    }
    rect.setAttribute("rx", 2);
    resBars.appendChild(rect);
  });

  // 5. 绘制基桩台阶线
  if (split !== null && split !== undefined) {
    const sx = mapX(split);
    const ly = mapResY(state.left_val);
    const ry = mapResY(state.right_val);
    const stepD = `M ${mapX(0.5)} ${ly} L ${sx} ${ly} L ${sx} ${ry} L ${mapX(8.5)} ${ry}`;
    stumpStepPath.setAttribute("d", stepD);
    stumpStepPath.setAttribute("visibility", "visible");
  } else {
    stumpStepPath.setAttribute("visibility", "hidden");
  }

  // 6. 标注与指标
  viewAnnotation.textContent = step?.annotation || "观察残差如何逐轮缩减。";

  metricsGrid.innerHTML = "";
  const metrics = step?.metrics || {};
  Object.entries(metrics).forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    const group = document.createElement("div");
    group.appendChild(dt);
    group.appendChild(dd);
    metricsGrid.appendChild(group);
  });
};
