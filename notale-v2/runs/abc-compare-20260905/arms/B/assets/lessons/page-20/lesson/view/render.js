const fitSvg = document.querySelector("#fitSvg");
const lossSvg = document.querySelector("#lossSvg");
const fitGrid = document.querySelector("#fitGrid");
const lossGrid = document.querySelector("#lossGrid");
const stumpSplitLine = document.querySelector("#stumpSplitLine");
const fitModelPath = document.querySelector("#fitModelPath");
const dataPoints = document.querySelector("#dataPoints");
const trainLossPath = document.querySelector("#trainLossPath");
const valLossPath = document.querySelector("#valLossPath");
const lossPoints = document.querySelector("#lossPoints");

const tagLr = document.querySelector("#tagLr");
const tagRound = document.querySelector("#tagRound");
const overfitBadge = document.querySelector("#overfitBadge");
const viewAnnotation = document.querySelector("#viewAnnotation");
const viewMetrics = document.querySelector("#viewMetrics");

// 布局尺寸常数
const FIT_PAD = { top: 20, right: 25, bottom: 25, left: 35 };
const FIT_W = 540;
const FIT_H = 220;

const LOSS_PAD = { top: 15, right: 25, bottom: 25, left: 35 };
const LOSS_W = 540;
const LOSS_H = 160;

function list(val) {
  return Array.isArray(val) ? val : [];
}

// 坐标映射
function scaleX(x, xMin, xMax, width, pad) {
  const plotW = width - pad.left - pad.right;
  return pad.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
}

function scaleY(y, yMin, yMax, height, pad) {
  const plotH = height - pad.top - pad.bottom;
  return height - pad.bottom - ((y - yMin) / (yMax - yMin || 1)) * plotH;
}

// 绘制拟合图网格
function drawFitGrid(xMin, xMax, yMin, yMax) {
  let html = "";
  // 水平线与刻度
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += 2) {
    const py = scaleY(y, yMin, yMax, FIT_H, FIT_PAD);
    html += `<line x1="${FIT_PAD.left}" y1="${py}" x2="${FIT_W - FIT_PAD.right}" y2="${py}" />`;
    html += `<text x="${FIT_PAD.left - 6}" y="${py + 3}" text-anchor="end">${y}</text>`;
  }
  // 垂直线与刻度
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += 1) {
    const px = scaleX(x, xMin, xMax, FIT_W, FIT_PAD);
    html += `<line x1="${px}" y1="${FIT_PAD.top}" x2="${px}" y2="${FIT_H - FIT_PAD.bottom}" />`;
    html += `<text x="${px}" y="${FIT_H - FIT_PAD.bottom + 14}" text-anchor="middle">x=${x}</text>`;
  }
  fitGrid.innerHTML = html;
}

// 绘制损失曲线网格
function drawLossGrid(maxRounds, maxLoss) {
  let html = "";
  // 垂直网格线（轮数）
  const stepRound = Math.max(1, Math.floor(maxRounds / 5));
  for (let r = 0; r <= maxRounds; r += stepRound) {
    const px = scaleX(r, 0, maxRounds, LOSS_W, LOSS_PAD);
    html += `<line x1="${px}" y1="${LOSS_PAD.top}" x2="${px}" y2="${LOSS_H - LOSS_PAD.bottom}" />`;
    html += `<text x="${px}" y="${LOSS_H - LOSS_PAD.bottom + 14}" text-anchor="middle">#${r}</text>`;
  }
  // 水平网格线（MSE）
  const stepLoss = Math.max(1, Math.ceil(maxLoss / 4));
  for (let l = 0; l <= maxLoss; l += stepLoss) {
    const py = scaleY(l, 0, maxLoss, LOSS_H, LOSS_PAD);
    html += `<line x1="${LOSS_PAD.left}" y1="${py}" x2="${LOSS_W - LOSS_PAD.right}" y2="${py}" />`;
    html += `<text x="${LOSS_PAD.left - 6}" y="${py + 3}" text-anchor="end">${l}</text>`;
  }
  lossGrid.innerHTML = html;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const currentRound = state.round || 0;
  const totalRounds = state.totalRounds || 12;
  const lr = state.learningRate ?? 0.4;
  const xVals = list(state.x);
  const yTrain = list(state.yTrain);
  const yVal = list(state.yVal);
  const preds = list(state.preds);
  const split = state.split;
  const historyTrain = list(state.historyTrain);
  const historyVal = list(state.historyVal);
  const isOverfitting = Boolean(state.overfitting);

  // 1. 顶部 Header 更新
  tagLr.textContent = `η = ${Number(lr).toFixed(2)}`;
  tagRound.textContent = `轮数: ${currentRound} / ${totalRounds}`;
  if (isOverfitting) {
    overfitBadge.removeAttribute("hidden");
  } else {
    overfitBadge.setAttribute("hidden", "true");
  }

  // 2. 拟合曲线区绘图
  const xMin = 0.5;
  const xMax = 8.5;
  const yMin = 0;
  const yMax = 9.5;

  drawFitGrid(xMin, xMax, yMin, yMax);

  // 树桩切分指示线
  if (split !== null && split !== undefined) {
    const splitX = scaleX(split, xMin, xMax, FIT_W, FIT_PAD);
    stumpSplitLine.setAttribute("x1", String(splitX));
    stumpSplitLine.setAttribute("x2", String(splitX));
    stumpSplitLine.setAttribute("y1", String(FIT_PAD.top));
    stumpSplitLine.setAttribute("y2", String(FIT_H - FIT_PAD.bottom));
    stumpSplitLine.style.display = "block";
  } else {
    stumpSplitLine.style.display = "none";
  }

  // 拟合模型阶梯预测折线（按采样点绘制连续阶梯路径）
  if (preds.length > 0 && xVals.length === preds.length) {
    let d = "";
    xVals.forEach((x, i) => {
      const px = scaleX(x, xMin, xMax, FIT_W, FIT_PAD);
      const py = scaleY(preds[i], yMin, yMax, FIT_H, FIT_PAD);
      if (i === 0) {
        // 从最左边缘延伸
        const startX = scaleX(xMin, xMin, xMax, FIT_W, FIT_PAD);
        d += `M ${startX},${py} L ${px},${py}`;
      } else {
        d += ` L ${px},${py}`;
      }
    });
    // 延伸到最右侧
    if (preds.length > 0) {
      const lastPy = scaleY(preds[preds.length - 1], yMin, yMax, FIT_H, FIT_PAD);
      const endX = scaleX(xMax, xMin, xMax, FIT_W, FIT_PAD);
      d += ` L ${endX},${lastPy}`;
    }
    fitModelPath.setAttribute("d", d);
  } else {
    fitModelPath.setAttribute("d", "");
  }

  // 绘制散点与当前预测误差连线
  let ptsHtml = "";
  xVals.forEach((x, i) => {
    const px = scaleX(x, xMin, xMax, FIT_W, FIT_PAD);
    const pyTrain = scaleY(yTrain[i], yMin, yMax, FIT_H, FIT_PAD);
    const pyVal = yVal[i] !== undefined ? scaleY(yVal[i], yMin, yMax, FIT_H, FIT_PAD) : null;
    const pyPred = preds[i] !== undefined ? scaleY(preds[i], yMin, yMax, FIT_H, FIT_PAD) : null;

    // 残差虚线
    if (pyPred !== null) {
      ptsHtml += `<line class="residual-line" x1="${px}" y1="${pyPred}" x2="${px}" y2="${pyTrain}" />`;
    }
    // 训练点
    ptsHtml += `<circle class="data-pt-train" cx="${px}" cy="${pyTrain}" r="4.5" />`;
    // 验证点（微幅错开半个像素以便分辨）
    if (pyVal !== null) {
      ptsHtml += `<circle class="data-pt-val" cx="${px + 2}" cy="${pyVal}" r="3.5" />`;
    }
  });
  dataPoints.innerHTML = ptsHtml;

  // 3. 损失曲线区绘图
  const maxRounds = Math.max(10, totalRounds);
  const maxLoss = 6.5;
  drawLossGrid(maxRounds, maxLoss);

  if (historyTrain.length > 0) {
    let dTrain = "";
    let dVal = "";
    let lossPtsHtml = "";

    historyTrain.forEach((loss, i) => {
      const r = i + 1;
      const px = scaleX(r, 0, maxRounds, LOSS_W, LOSS_PAD);
      const py = scaleY(Math.min(maxLoss, loss), 0, maxLoss, LOSS_H, LOSS_PAD);
      dTrain += (i === 0 ? `M ${px},${py}` : ` L ${px},${py}`);
      lossPtsHtml += `<circle cx="${px}" cy="${py}" r="3" fill="#5ec8e0" />`;
    });

    historyVal.forEach((loss, i) => {
      const r = i + 1;
      const px = scaleX(r, 0, maxRounds, LOSS_W, LOSS_PAD);
      const py = scaleY(Math.min(maxLoss, loss), 0, maxLoss, LOSS_H, LOSS_PAD);
      dVal += (i === 0 ? `M ${px},${py}` : ` L ${px},${py}`);
      lossPtsHtml += `<circle cx="${px}" cy="${py}" r="3" fill="#ff6b7a" />`;
    });

    trainLossPath.setAttribute("d", dTrain);
    valLossPath.setAttribute("d", dVal);
    lossPoints.innerHTML = lossPtsHtml;
  } else {
    trainLossPath.setAttribute("d", "");
    valLossPath.setAttribute("d", "");
    lossPoints.innerHTML = "";
  }

  // 4. 底部注释与指标
  viewAnnotation.textContent = step?.annotation || "观察每一轮梯度提升残差学习及损失变化。";

  const metrics = step?.metrics || {};
  let mHtml = "";
  for (const [key, val] of Object.entries(metrics)) {
    mHtml += `
      <div class="metric-item">
        <span class="metric-term">${key}</span>
        <span class="metric-val">${val}</span>
      </div>
    `;
  }
  viewMetrics.innerHTML = mHtml;
};
