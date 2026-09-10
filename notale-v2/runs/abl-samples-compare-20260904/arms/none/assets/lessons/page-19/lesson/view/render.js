const statusBadge = document.querySelector("#statusBadge");
const paramsInfo = document.querySelector("#paramsInfo");
const viewAnnotation = document.querySelector("#viewAnnotation");
const viewMetrics = document.querySelector("#viewMetrics");
const maxRoundLabel = document.querySelector("#maxRoundLabel");

const trainLine = document.querySelector("#trainLine");
const valLine = document.querySelector("#valLine");
const lossGrid = document.querySelector("#lossGrid");
const lossPoints = document.querySelector("#lossPoints");
const bestPointMarker = document.querySelector("#bestPointMarker");
const overfitRegion = document.querySelector("#overfitRegion");

const fitGrid = document.querySelector("#fitGrid");
const samplePoints = document.querySelector("#samplePoints");
const fitPath = document.querySelector("#fitPath");

// 静态初始化网格线
function initGrids() {
  if (lossGrid.children.length === 0) {
    for (let i = 1; i <= 4; i++) {
      const y = (220 / 5) * i;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", "540");
      line.setAttribute("y2", String(y));
      lossGrid.appendChild(line);
    }
  }

  if (fitGrid.children.length === 0) {
    for (let i = 1; i <= 3; i++) {
      const y = (180 / 4) * i;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", "540");
      line.setAttribute("y2", String(y));
      fitGrid.appendChild(line);
    }
  }
}

initGrids();

window.renderNotaleView = ({ step, playback }) => {
  const state = step?.state || {};
  const history = state.history || [];
  const round = state.round || history.length || 0;
  const nEst = state.n_estimators || 35;
  const lr = state.learning_rate ?? 0.15;
  const bestRound = state.best_round || 1;
  const minValMse = state.min_val_mse || 0.04;
  const status = state.status || "normal";

  // 1. 更新顶部状态与参数
  paramsInfo.textContent = `n_estimators: ${nEst} | lr: ${lr}`;
  maxRoundLabel.textContent = `轮数 ${Math.max(round, nEst)}`;

  statusBadge.className = "status-badge";
  if (status === "overfitting") {
    statusBadge.classList.add("overfitting");
    statusBadge.textContent = "过拟合 (Overfitting)";
  } else if (status === "underfitting") {
    statusBadge.classList.add("underfitting");
    statusBadge.textContent = "欠拟合 (Underfitting)";
  } else if (status === "optimal") {
    statusBadge.classList.add("optimal");
    statusBadge.textContent = "当前最优 (Optimal)";
  } else {
    statusBadge.textContent = "正常训练中";
  }

  // 2. 绘制 MSE 学习曲线
  const maxR = Math.max(nEst, round, history.length, 10);
  const maxMse = Math.max(
    0.3,
    ...history.map((h) => Math.max(h.train_mse, h.val_mse))
  );

  const getLossX = (r) => ((r - 1) / Math.max(1, maxR - 1)) * 520 + 10;
  const getLossY = (mse) => 205 - (Math.min(mse, maxMse) / maxMse) * 185;

  let trainD = "";
  let valD = "";

  history.forEach((h, idx) => {
    const x = getLossX(h.round);
    const yTrain = getLossY(h.train_mse);
    const yVal = getLossY(h.val_mse);

    if (idx === 0) {
      trainD += `M ${x} ${yTrain}`;
      valD += `M ${x} ${yVal}`;
    } else {
      trainD += ` L ${x} ${yTrain}`;
      valD += ` L ${x} ${yVal}`;
    }
  });

  trainLine.setAttribute("d", trainD);
  valLine.setAttribute("d", valD);

  // 最佳折点标记与过拟合区域
  if (bestRound > 0 && history.length >= bestRound) {
    const bestX = getLossX(bestRound);
    const bestY = getLossY(minValMse);

    bestPointMarker.style.display = "";
    const circle = bestPointMarker.querySelector("circle");
    const line = bestPointMarker.querySelector("line");
    const text = bestPointMarker.querySelector("text");

    circle.setAttribute("cx", String(bestX));
    circle.setAttribute("cy", String(bestY));
    line.setAttribute("x1", String(bestX));
    line.setAttribute("y1", String(bestY));
    line.setAttribute("x2", String(bestX));
    line.setAttribute("y2", "215");
    text.setAttribute("x", String(bestX));
    text.setAttribute("y", String(Math.max(15, bestY - 12)));
    text.textContent = `最优第${bestRound}轮`;

    // 若当前已过最佳轮数且误差回升，标红过拟合危险区
    if (round > bestRound) {
      const currentX = getLossX(round);
      overfitRegion.setAttribute("x", String(bestX));
      overfitRegion.setAttribute("width", String(Math.max(0, currentX - bestX)));
      overfitRegion.style.display = "";
    } else {
      overfitRegion.style.display = "none";
    }
  } else {
    bestPointMarker.style.display = "none";
    overfitRegion.style.display = "none";
  }

  // 3. 绘制样本数据与拟合曲线 (fitSvg)
  const curve = state.curve;
  if (curve && curve.train_x && curve.train_x.length > 0) {
    // 渲染样本散点
    samplePoints.innerHTML = "";
    const getXCoord = (x) => ((x + 3.2) / 6.4) * 520 + 10;
    const getYCoord = (y) => 90 - y * 65; // 假设 y 在 -1.4 ~ 1.4 间

    // 训练样本点
    curve.train_x.forEach((x, i) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(getXCoord(x)));
      circle.setAttribute("cy", String(getYCoord(curve.train_y[i])));
      circle.setAttribute("class", "sample-dot");
      samplePoints.appendChild(circle);
    });

    // 验证样本点 (淡黄)
    if (curve.val_x) {
      curve.val_x.forEach((x, i) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(getXCoord(x)));
        circle.setAttribute("cy", String(getYCoord(curve.val_y[i])));
        circle.setAttribute("class", "val-sample-dot");
        samplePoints.appendChild(circle);
      });
    }

    // 拟合预测曲线
    if (curve.train_preds && curve.train_preds.length > 0) {
      let fitD = "";
      curve.train_x.forEach((x, i) => {
        const px = getXCoord(x);
        const py = getYCoord(curve.train_preds[i]);
        if (i === 0) fitD += `M ${px} ${py}`;
        else fitD += ` L ${px} ${py}`;
      });
      fitPath.setAttribute("d", fitD);
    }
  }

  // 4. 底部注释与关键指标
  viewAnnotation.textContent = step?.annotation || "运行代码观察梯度提升学习曲线与过拟合动态。";

  viewMetrics.innerHTML = "";
  const metrics = step?.metrics || {};
  Object.entries(metrics).forEach(([k, v]) => {
    const item = document.createElement("div");
    item.className = "metric-item";
    item.innerHTML = `<span class="metric-label">${k}</span><span class="metric-val">${v}</span>`;
    viewMetrics.appendChild(item);
  });
};
