const sampleCountEl = document.querySelector("#sampleCount");
const annotationEl = document.querySelector("#viewAnnotation");
const metricsHost = document.querySelector("#viewMetrics");
const treesRibbon = document.querySelector("#treesRibbon");
const accPath = document.querySelector("#accPath");
const accArea = document.querySelector("#accArea");
const pointsGroup = document.querySelector("#pointsGroup");

function renderMetrics(metrics) {
  metricsHost.innerHTML = "";
  if (!metrics) return;
  for (const [key, value] of Object.entries(metrics)) {
    const box = document.createElement("div");
    box.className = "metric-box";
    const dt = document.createElement("span");
    dt.className = "metric-label";
    dt.textContent = key;
    const dd = document.createElement("span");
    dd.className = "metric-val";
    dd.textContent = String(value);
    box.append(dt, dd);
    metricsHost.append(box);
  }
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const trees = state.trees || [];
  const count = trees.length;

  sampleCountEl.textContent = `T = ${count} TREES`;
  annotationEl.textContent = step?.annotation || "正在执行随机森林训练代码...";

  renderMetrics(step?.metrics);

  // 渲染树卡片列表
  treesRibbon.innerHTML = "";
  const focusTree = (step?.focus || [])[0]?.tree;

  trees.forEach((t) => {
    const card = document.createElement("div");
    card.className = "tree-card" + (t.tree === focusTree ? " active" : "");
    card.innerHTML = `<span class="tree-name">Tree #${t.tree}</span><span>Acc: ${(t.acc * 100).toFixed(0)}%</span>`;
    treesRibbon.appendChild(card);
  });

  // 如果有焦点树，自动滚动入视野
  if (treesRibbon.lastElementChild) {
    treesRibbon.scrollLeft = treesRibbon.scrollWidth;
  }

  // 绘制泛化准确率曲线 (viewBox 0 0 600 320)
  if (count === 0) {
    accPath.setAttribute("d", "");
    accArea.setAttribute("d", "");
    pointsGroup.innerHTML = "";
    return;
  }

  const width = 600;
  const height = 320;
  const padX = 30;
  const padY = 24;

  const pts = trees.map((t, idx) => {
    const x = count === 1 ? width / 2 : padX + (idx / (count - 1)) * (width - 2 * padX);
    // accuracy 在 [0, 1] 间映射到高度 (0% 对应 height-padY, 100% 对应 padY)
    const y = (height - padY) - (t.acc) * (height - 2 * padY);
    return { x, y, acc: t.acc, tree: t.tree };
  });

  // 连线路径
  const lineD = pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, "");
  accPath.setAttribute("d", lineD);

  // 阴影面积路径
  const baseBottom = height - padY;
  const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${baseBottom} L ${pts[0].x.toFixed(1)} ${baseBottom} Z`;
  accArea.setAttribute("d", areaD);

  // 点
  pointsGroup.innerHTML = "";
  pts.forEach((pt) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", pt.x.toFixed(1));
    circle.setAttribute("cy", pt.y.toFixed(1));
    circle.setAttribute("class", "chart-point" + (pt.tree === focusTree ? " active" : ""));
    pointsGroup.appendChild(circle);
  });
};
