<sample id="lenna-scroll-bars" category="chart" variant="mini">
  <file path="samples/chart/lenna-scroll-bars/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lenna：网络余波</title>
<link rel="stylesheet" href="assets/base.css">
<style>
  :root{--bg:#390a29;--text:#fff2e8;--focus:#a5f2d5;--axis:#f2c299;--grid:#58123f;--bar:#681b4d;--paper:#fffaf5;--ink:#282828;--font-sans:Arial,"PingFang SC",sans-serif}
  html,body{overflow:hidden}#stage{position:fixed;background:var(--bg)}
  .heading{position:absolute;z-index:3;left:50px;top:24px}.heading h1{font-size:30px;line-height:1.08;letter-spacing:-.025em}
  #chart{position:absolute;inset:0;width:1600px;height:900px;overflow:visible;shape-rendering:crispEdges}
  .grid line{stroke:var(--grid)}.axis text{fill:var(--axis);font:14px ui-monospace,monospace}.axis .current{fill:var(--text);font-size:18px;font-weight:700}
  .bar{fill:var(--bar)}.bar.current{stroke:var(--focus);stroke-width:3px}
  .card{position:absolute;z-index:4;right:120px;top:50%;width:360px;padding:28px;color:var(--ink);background:var(--paper);transform:translateY(-50%)}
  .card p{font-size:18px;line-height:1.62}.card strong{font-weight:750}.card .year{padding:0 4px;outline:2px solid var(--focus)}
  .controls{position:absolute;z-index:5;right:50px;top:28px;display:flex;border:1px solid var(--axis)}.controls button{height:44px;padding:0 17px;border:0;border-right:1px solid var(--axis);color:var(--text);background:#390a29;font-weight:700;cursor:pointer}.controls button:disabled{opacity:.42;cursor:default}
  .domain-key{position:absolute;z-index:3;left:140px;top:188px;display:none;gap:9px;flex-direction:column}.domains .domain-key{display:flex}.domain-key span{width:108px;padding:6px 8px;color:var(--text)}.domain-key i{display:inline-block;width:20px;height:20px;margin-right:10px;vertical-align:middle}
  .source{position:absolute;z-index:3;left:50px;bottom:27px;color:var(--axis);font:13px ui-monospace,monospace;opacity:.76}
  #status{position:absolute;left:50px;bottom:52px;color:var(--axis);font:14px ui-monospace,monospace}
  .fallback{position:absolute;z-index:6;left:50%;top:50%;width:520px;padding:30px;color:var(--ink);background:var(--paper);transform:translate(-50%,-50%);font-size:18px;line-height:1.55}
  @media(prefers-reduced-motion:reduce){.bar,.segment{transition:none!important}}
</style>
</head>
<body>
<main id="stage">
  <header class="heading"><h1>Lenna：1972–2021 年网络实例</h1></header>
  <svg id="chart" viewBox="0 0 1600 900" role="img" aria-labelledby="chartTitle chartDesc">
    <title id="chartTitle">Lenna 图像网络实例年度图</title>
    <desc id="chartDesc">1972 与 1995 年度柱，以及保持总高度的域名分类柱。</desc>
    <g class="grid"></g><g class="axis y-axis"></g><g class="bars"></g>
    <g class="stacks"></g><g class="axis x-axis"></g>
  </svg>
  <article class="card" id="card"><p id="copy"></p></article>
  <nav class="controls" aria-label="叙事状态">
    <button id="previous">上一状态</button><button id="next">下一状态</button><button id="reset">重置</button>
  </nav>
  <div class="domain-key" aria-label="域名类别">
    <span><i style="background:#586fa6"></i>.org</span><span><i style="background:#a64153"></i>.edu</span>
    <span><i style="background:#d96666"></i>.com</span><span><i style="background:#f29f80"></i>other</span>
  </div>
  <p id="status" role="status">读取 4,801 条原始记录…</p>
  <p class="source">数据：Lenna 检索数据集；截止 2021-09</p>
  <section id="fallback" class="fallback" hidden><strong>本地 data.csv 未能读取。</strong><br>图表不会用占位数值替代年度计数。请重新载入数据。</section>
</main>
<script src="assets/lib/d3.min.js"></script><script src="assets/base.js"></script><script src="app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/lenna-scroll-bars/mini/pages/app.js">
```javascript
(() => {
"use strict";
const states = [
  { id:"1972", year:1972, copy:"<strong class=year>1972</strong> 年只有 <strong>2 个实例</strong>。一次扫描把测试图送进研究复制链。" },
  { id:"1995", year:1995, copy:"<strong class=year>1995</strong> 年达到峰值 <strong>287</strong>；此后没有一年更高。" },
  { id:"domains", year:null, copy:"45 根年度柱保持原高度。早期主要来自 <strong>.org</strong>；后来 <strong>.com</strong> 与 other 扩张，<strong>.edu</strong> 延续教学和研究站点中的使用。" }
];
const categories = [".org", ".edu", ".com", "other"];
const colors = { ".org":"#586fa6", ".edu":"#a64153", ".com":"#d96666", other:"#f29f80" };
const byId = id => document.getElementById(id);
const stage = byId("stage"), card = byId("card"), copy = byId("copy");
const status = byId("status");
const chart = d3.select("#chart"), barsLayer = chart.select(".bars"), stacksLayer = chart.select(".stacks");
const controller = new AbortController(), signal = controller.signal;
const xScale = d3.scaleBand().domain(d3.range(1972, 2022)).range([50, 1550]).paddingInner(.1);
const yScale = d3.scaleLinear().domain([0, 287]).range([800, 100]);
let yearly = [], bars, segments, stateIndex = 0;
let ready = false, destroyed = false;
function aggregate(rows) {
  const years = new Map();
  let recordCount = 0;
  rows.forEach(record => {
    const year = Number.parseInt(record.year, 10);
    if (!Number.isInteger(year) || year < 1972) return;
    const row = years.get(year) || { year, value:0, ".org":0, ".edu":0, ".com":0, other:0 };
    const domain = String(record.domain || "");
    const key = categories.find(name => name !== "other" && domain.endsWith(name)) || "other";
    row.value += 1;
    row[key] += 1;
    years.set(year, row);
    recordCount += 1;
  });
  const result = [...years.values()].sort((first, second) => first.year - second.year);
  if (recordCount !== 4801 || result.length !== 45 || result.find(row => row.year === 1995).value !== 287 || result.at(-1).value !== 252) {
    throw new Error("data.csv invariant failed");
  }
  return result;
}
function buildChart() {
  chart.select(".y-axis").attr("transform", "translate(45,0)")
    .call(d3.axisLeft(yScale).tickValues(d3.range(0, 281, 40)).tickSize(-1500));
  chart.select(".x-axis").attr("transform", "translate(0,800)")
    .call(d3.axisBottom(xScale).tickValues(d3.range(1972, 2022)).tickSize(0).tickPadding(10));
  bars = barsLayer.selectAll("rect").data(yearly, row => row.year).join("rect")
    .attr("class", "bar").attr("data-year", row => row.year)
    .attr("x", row => xScale(row.year)).attr("y", row => yScale(row.value))
    .attr("width", xScale.bandwidth()).attr("height", row => yScale(0) - yScale(row.value));
  const stack = d3.stack().keys(categories)(yearly).flatMap(series => series.filter(part => part[1] > part[0])
    .map(part => Object.assign(part, { key:series.key })));
  segments = stacksLayer.selectAll("rect").data(stack, part => `${part.data.year}-${part.key}`).join("rect")
    .attr("class", "segment").attr("data-year", part => part.data.year).attr("data-domain", part => part.key)
    .attr("x", part => xScale(part.data.year)).attr("y", part => yScale(part[1]))
    .attr("width", xScale.bandwidth()).attr("height", part => yScale(part[0]) - yScale(part[1]))
    .attr("fill", part => colors[part.key]);
}
function clearMotion() {
  bars?.interrupt();
  segments?.interrupt();
}
function render(previousIndex, animate) {
  const state = states[stateIndex], previous = states[previousIndex] || states[0];
  const motion = animate && !Deck.reduced();
  stage.classList.toggle("domains", state.id === "domains");
chart.selectAll(".x-axis .tick").style("display", year =>
  year === state.year || (year - 1972) % 4 === 0 && Math.abs(year - state.year) > 1 ? null : "none")
    .select("text").classed("current", year => year === state.year);
  bars.interrupt().style("display", row => state.year !== null && row.year <= state.year ? null : "none")
    .style("opacity", 1).classed("current", row => row.year === state.year);
  segments.interrupt().style("display", state.id === "domains" ? null : "none").style("opacity", 1);
if (state.id === "domains" && motion) {
  segments.style("opacity", 0).transition().duration(420).style("opacity", 1);
} else if (state.year !== null && motion && state.year > (previous.year || 1971)) {
    const incoming = yearly.filter(row => row.year > previous.year && row.year <= state.year);
    bars.filter(row => incoming.includes(row)).style("opacity", 0)
      .attr("data-reveal-delay", row => incoming.indexOf(row) * 80)
      .transition().delay(row => incoming.indexOf(row) * 80).duration(300)
      .ease(d3.easeLinear).style("opacity", 1);
  } else bars.attr("data-reveal-delay", 0);
  copy.innerHTML = state.copy;
  const datum = yearly.find(row => row.year === state.year);
  status.textContent = datum ? `${state.year} 年：${datum.value} 个检索实例` : "45 个年度总数已按域名拆分";
  byId("previous").disabled = stateIndex === 0;
  byId("next").disabled = stateIndex === states.length - 1;
}
function setState(nextIndex, animate = true) {
  if (!ready || destroyed) return false;
  const bounded = Number(nextIndex);
  if (!states[bounded] || bounded === stateIndex) return false;
  clearMotion();
  const previous = stateIndex;
  stateIndex = bounded;
  render(previous, animate);
  return true;
}
function reset() {
  if (!ready || destroyed) return false;
  clearMotion();
  const previous = stateIndex;
  stateIndex = 0;
  render(previous, false);
  return true;
}
function destroy() {
  if (destroyed) return;
  destroyed = true;
  clearMotion();
  controller.abort();
}
byId("previous").addEventListener("click", () => setState(stateIndex - 1), { signal });
byId("next").addEventListener("click", () => setState(stateIndex + 1), { signal });
byId("reset").addEventListener("click", reset, { signal });
window.addEventListener("pagehide", destroy, { once:true, signal });
Deck.init({ keys:false });
window.LennaMini = { setState, reset, destroy,
  snapshot: () => ({ ready, state:states[stateIndex].id, stateIndex, destroyed }) };
fetch("assets/data/data.csv", { signal }).then(response => {
  if (!response.ok) throw Error();
  return response.text();
}).then(text => {
  yearly = aggregate(d3.csvParse(text));
  buildChart();
  ready = true;
  render(0, false);
}).catch(() => {
  if (destroyed) return;
  byId("fallback").hidden = false;
  byId("chart").hidden = card.hidden = true;
  status.textContent = "data.csv 未载入；没有绘制占位柱";
});
})();
```
  </file>
</sample>
