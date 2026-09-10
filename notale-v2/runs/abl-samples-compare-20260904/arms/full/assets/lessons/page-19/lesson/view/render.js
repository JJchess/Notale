let domInitialized = false;
let gridLayer, zoneLayer, trainPath, valPath, pointsLayer, bestMarkerLayer, axisLayer;
let statusTitle, statusDesc, metricStep, metricTrain, metricVal, metricBest;

function initDom() {
  if (domInitialized) return;
  gridLayer = document.querySelector("#gridLayer");
  zoneLayer = document.querySelector("#zoneLayer");
  trainPath = document.querySelector("#trainPath");
  valPath = document.querySelector("#valPath");
  pointsLayer = document.querySelector("#pointsLayer");
  bestMarkerLayer = document.querySelector("#bestMarkerLayer");
  axisLayer = document.querySelector("#axisLayer");

  statusTitle = document.querySelector("#statusTitle");
  statusDesc = document.querySelector("#statusDesc");
  metricStep = document.querySelector("#metricStep");
  metricTrain = document.querySelector("#metricTrain");
  metricVal = document.querySelector("#metricVal");
  metricBest = document.querySelector("#metricBest");
  domInitialized = true;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

window.renderNotaleView = ({ step }) => {
  initDom();
  if (!gridLayer) return;

  const state = step?.state || {};
  const hTrain = Array.isArray(state.history_train) ? state.history_train : [];
  const hVal = Array.isArray(state.history_val) ? state.history_val : [];
  const nTrees = Math.max(10, Number(state.n_trees) || 15);
  const currentStep = Number(state.step) || hTrain.length || 0;
  const bestStep = Number(state.best_step) || 1;
  const bestVal = Number(state.best_val) || (hVal[0] ?? 0);

  if (metricStep) metricStep.textContent = `${currentStep} / ${nTrees}`;
  if (metricTrain) metricTrain.textContent = state.current_train != null ? Number(state.current_train).toFixed(4) : "-";
  if (metricVal) metricVal.textContent = state.current_val != null ? Number(state.current_val).toFixed(4) : "-";
  if (metricBest) metricBest.textContent = `第 ${bestStep} 轮 (${Number(bestVal).toFixed(4)})`;
  if (state.status && statusDesc) {
    statusDesc.textContent = state.status;
  }

  const padL = 60;
  const padR = 40;
  const padT = 30;
  const padB = 45;
  const W = 760;
  const H = 360;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allY = [...hTrain, ...hVal];
  const maxY = Math.max(0.4, ...allY, 0.35) * 1.08;
  const minY = 0.0;

  const toX = (s) => padL + ((s - 1) / Math.max(1, nTrees - 1)) * plotW;
  const toY = (val) => padT + (1 - (val - minY) / (maxY - minY)) * plotH;

  gridLayer.innerHTML = "";
  axisLayer.innerHTML = "";

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const val = minY + (maxY - minY) * (i / yTicks);
    const yPos = toY(val);
    const line = createSvg("line", {
      x1: padL,
      y1: yPos,
      x2: W - padR,
      y2: yPos,
      stroke: "rgba(255,255,255,0.08)",
      "stroke-dasharray": i === 0 ? "none" : "3,3",
    });
    gridLayer.appendChild(line);

    const txt = createSvg("text", {
      x: padL - 10,
      y: yPos + 4,
      "text-anchor": "end",
      fill: "#64748b",
      "font-size": "11px",
      "font-family": "monospace",
    });
    txt.textContent = val.toFixed(2);
    axisLayer.appendChild(txt);
  }

  const xStep = 5;
  for (let s = 1; s <= nTrees; s += (s === 1 ? xStep - 1 : xStep)) {
    const xPos = toX(s);
    const line = createSvg("line", {
      x1: xPos,
      y1: padT,
      x2: xPos,
      y2: H - padB,
      stroke: "rgba(255,255,255,0.06)",
    });
    gridLayer.appendChild(line);

    const txt = createSvg("text", {
      x: xPos,
      y: H - padB + 18,
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": "11px",
      "font-family": "monospace",
    });
    txt.textContent = `m=${s}`;
    axisLayer.appendChild(txt);
  }

  zoneLayer.innerHTML = "";
  if (hVal.length > 3) {
    const underX = toX(Math.min(5, bestStep));
    const overX = toX(Math.max(bestStep + 3, Math.min(nTrees, bestStep + 5)));

    const rUnder = createSvg("rect", {
      x: padL,
      y: padT,
      width: Math.max(0, underX - padL),
      height: plotH,
      fill: "rgba(39, 100, 143, 0.05)",
    });
    const tUnder = createSvg("text", {
      x: padL + 8,
      y: padT + 18,
      fill: "rgba(77, 163, 219, 0.6)",
      "font-size": "11px",
      "font-weight": "500",
    });
    tUnder.textContent = "◀ 迭代不足区";
    zoneLayer.appendChild(rUnder);
    zoneLayer.appendChild(tUnder);

    if (overX < W - padR) {
      const rOver = createSvg("rect", {
        x: overX,
        y: padT,
        width: W - padR - overX,
        height: plotH,
        fill: "rgba(195, 75, 34, 0.05)",
      });
      const tOver = createSvg("text", {
        x: W - padR - 8,
        y: padT + 18,
        "text-anchor": "end",
        fill: "rgba(255, 112, 67, 0.6)",
        "font-size": "11px",
        "font-weight": "500",
      });
      tOver.textContent = "迭代过度区 (过拟合) ▶";
      zoneLayer.appendChild(rOver);
      zoneLayer.appendChild(tOver);
    }
  }

  let dTrain = "";
  let dVal = "";

  hTrain.forEach((val, i) => {
    const x = toX(i + 1);
    const y = toY(val);
    dTrain += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  hVal.forEach((val, i) => {
    const x = toX(i + 1);
    const y = toY(val);
    dVal += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  if (trainPath) trainPath.setAttribute("d", dTrain);
  if (valPath) valPath.setAttribute("d", dVal);

  bestMarkerLayer.innerHTML = "";
  pointsLayer.innerHTML = "";

  if (hVal.length > 0 && bestStep <= hVal.length) {
    const bestX = toX(bestStep);
    const bestY = toY(bestVal);

    const vLine = createSvg("line", {
      x1: bestX,
      y1: padT,
      x2: bestX,
      y2: H - padB,
      stroke: "#237052",
      "stroke-dasharray": "4,4",
      "stroke-width": 1.5,
    });
    bestMarkerLayer.appendChild(vLine);

    const badgeBg = createSvg("rect", {
      x: bestX - 35,
      y: padT - 22,
      width: 70,
      height: 18,
      rx: 3,
      fill: "#237052",
    });
    const badgeText = createSvg("text", {
      x: bestX,
      y: padT - 9,
      "text-anchor": "middle",
      fill: "#ffffff",
      "font-size": "10px",
      "font-weight": "600",
      "font-family": "monospace",
    });
    badgeText.textContent = `BEST: m=${bestStep}`;
    bestMarkerLayer.appendChild(badgeBg);
    bestMarkerLayer.appendChild(badgeText);

    const circ = createSvg("circle", {
      cx: bestX,
      cy: bestY,
      r: 5,
      fill: "#237052",
      stroke: "#ffffff",
      "stroke-width": 2,
    });
    bestMarkerLayer.appendChild(circ);
  }

  if (hTrain.length > 0) {
    const lastX = toX(hTrain.length);
    const curTrainY = toY(hTrain[hTrain.length - 1]);
    const curValY = toY(hVal[hVal.length - 1]);

    const cT = createSvg("circle", {
      cx: lastX,
      cy: curTrainY,
      r: 4,
      fill: "#4da3db",
      stroke: "#ffffff",
      "stroke-width": 1.5,
    });
    const cV = createSvg("circle", {
      cx: lastX,
      cy: curValY,
      r: 4,
      fill: "#ff7043",
      stroke: "#ffffff",
      "stroke-width": 1.5,
    });
    pointsLayer.appendChild(cT);
    pointsLayer.appendChild(cV);
  }
};
