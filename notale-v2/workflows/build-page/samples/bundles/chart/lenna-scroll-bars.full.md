<sample id="lenna-scroll-bars" category="chart" variant="full">
  <file path="samples/chart/lenna-scroll-bars/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Lenna：五十年的网络余波</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/story.css">
</head>
<body>
  <main id="stage" class="no-pan" tabindex="-1" aria-label="Lenna 图像网络实例的年度叙事图表">
    <figure id="story-figure" aria-labelledby="chart-title">
      <header class="chart-heading">
        <h1>Lenna：1972–2021 年网络实例</h1>
        <p>柱高表示当年检索实例；最终状态按域名拆分。</p>
      </header>
      <svg id="chart" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">1972 至 2021 年间检索到的 Lenna 图像网络实例</title>
        <desc id="chart-desc">柱高表示每年找到的实例数。叙事结束时，柱子按点 org、点 edu、点 com 与其他域名拆分。</desc>
        <g class="y-axis" aria-hidden="true"></g>
        <g class="bars" aria-hidden="true"></g>
        <g class="stacks" aria-hidden="true"></g>
        <g class="legend" aria-label="域名类别图例"></g>
        <g class="x-axis" aria-hidden="true"></g>
      </svg>

      <article id="prose-card" class="prose-card is-settled" aria-live="polite">
        <div class="card-media" hidden>
          <img id="card-image" alt="">
        </div>
        <p id="card-copy"></p>
      </article>

      <figcaption class="source-note">数据：上游 Lenna 检索数据集；记录截至 2021 年 9 月</figcaption>

      <div id="fallback" class="fallback" hidden>
        <strong>图表未能读取本地数据。</strong>
        <span>为避免伪造柱高，本页不会用占位数值替代 data.csv。</span>
      </div>

      <table id="data-table" hidden>
        <caption>每年检索实例及域名类别数量</caption>
        <thead><tr><th>年份</th><th>总数</th><th>.org</th><th>.edu</th><th>.com</th><th>其他</th></tr></thead>
        <tbody></tbody>
      </table>
    </figure>
  </main>

  <script src="assets/lib/d3.min.js"></script>
  <script src="assets/base.js"></script>
  <script src="assets/story.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/lenna-scroll-bars/pages/assets/story.css">
```css
:root {
  --bg: #390a29;
  --text: #fff2e8;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --focus: #a5f2d5;
  --pad-x: 50px;
  --ink: #282828;
  --grid: #440d31;
  --bar: #591642;
  --mint: #a5f2d5;
  --axis: #f2c299;
  --paper: #fffaf5;
  --org: #586fa6;
  --edu: #a64153;
  --com: #d96666;
  --other: #f29f80;
}

html,
body {
  overflow: hidden;
}

#stage {
  background: var(--bg);
  isolation: isolate;
  user-select: none;
  -webkit-user-select: none;
}

#story-figure,
#chart {
  position: absolute;
  inset: 0;
  width: 1600px;
  height: 900px;
}

#chart {
  overflow: visible;
  shape-rendering: crispEdges;
}

.chart-heading {
  position: absolute;
  z-index: 2;
  left: 50px;
  top: 24px;
  pointer-events: none;
}

.chart-heading h1 {
  font-size: 30px;
  font-weight: 760;
  line-height: 1.08;
  letter-spacing: -0.025em;
}

.chart-heading p {
  margin-top: 7px;
  color: var(--axis);
  font-family: var(--font-mono);
  font-size: 14px;
}

.y-axis text,
.x-axis text,
.legend text {
  fill: var(--axis);
  font-family: var(--font-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.y-axis line {
  stroke: var(--grid);
  stroke-opacity: 0.9;
}

.y-axis .domain,
.x-axis .domain,
.x-axis line {
  display: none;
}

.x-axis .tick text {
  transition: fill 180ms ease, font-size 180ms ease, font-weight 180ms ease;
}

.x-axis .tick text.is-hidden {
  display: none;
}

.x-axis .tick text.is-current {
  display: block;
  fill: var(--text);
  font-size: 18px;
  font-weight: 800;
}

.year-bar {
  fill: var(--bar);
}

.year-bar.is-current {
  stroke: var(--mint);
  stroke-width: 3px;
  vector-effect: non-scaling-stroke;
}

.legend {
  opacity: 0;
  pointer-events: none;
  transition: opacity 320ms ease;
}

.legend.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.legend-item {
  cursor: default;
  outline: none;
  pointer-events: bounding-box;
}

.legend-item rect {
  stroke: transparent;
  stroke-width: 2px;
  transition: stroke 120ms ease, opacity 120ms ease;
}

.legend-item.is-hovered rect,
.legend-item:focus-visible rect {
  stroke: var(--ink);
}

.prose-card {
  position: absolute;
  z-index: 5;
  top: 50%;
  right: 120px;
  width: 360px;
  color: var(--ink);
  background: var(--paper);
  transform: translate3d(0, -50%, 0);
  opacity: 1;
  box-shadow: 0 0 0 1px rgba(40, 40, 40, 0.035);
  transition: transform 430ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease;
  will-change: transform, opacity;
}

.prose-card.is-leaving-up {
  transform: translate3d(0, calc(-50% - 190px), 0);
  opacity: 0;
}

.prose-card.is-entering-bottom {
  transform: translate3d(0, calc(-50% + 210px), 0);
  opacity: 0;
  transition: none;
}

.prose-card.is-leaving-down {
  transform: translate3d(0, calc(-50% + 190px), 0);
  opacity: 0;
}

.prose-card.is-entering-top {
  transform: translate3d(0, calc(-50% - 210px), 0);
  opacity: 0;
  transition: none;
}

.card-media {
  width: 100%;
  height: 240px;
  overflow: hidden;
  background: #d9d4d0;
}

.card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1);
  clip-path: inset(100% 0 0 0);
  transform: scale(1.035);
  transition: clip-path 620ms cubic-bezier(0.22, 1, 0.36, 1) 80ms, transform 720ms ease 80ms;
}

.prose-card.is-settled .card-media img {
  clip-path: inset(0 0 0 0);
  transform: scale(1);
}

#card-copy {
  min-height: var(--copy-min, 190px);
  padding: 27px 28px 28px;
  font-size: 18px;
  font-weight: 520;
  line-height: 1.65;
  letter-spacing: 0.005em;
}

#card-copy strong.year {
  display: inline-block;
  padding: 0 4px;
  font-weight: 800;
  line-height: 1.25;
  outline: 2px solid var(--mint);
  outline-offset: 1px;
}

#card-copy strong.metric {
  font-weight: 800;
}

.domain-word {
  display: inline-block;
  padding: 0 4px;
  color: var(--ink);
  font-weight: 800;
  line-height: 1.35;
  cursor: default;
  outline: 2px solid transparent;
  outline-offset: 1px;
}

.domain-word[data-domain=".org"] { background: #8dabf2; }
.domain-word[data-domain=".edu"] { background: #d96666; }
.domain-word[data-domain=".com"] { background: #f29f80; }
.domain-word[data-domain="other"] { background: #f2c299; }

.domain-word:hover,
.domain-word:focus-visible {
  outline-color: var(--ink);
}

.source-note {
  position: absolute;
  z-index: 2;
  left: 50px;
  bottom: 28px;
  color: var(--axis);
  font-family: var(--font-mono);
  font-size: 13px;
  opacity: 0.7;
}

.fallback {
  position: absolute;
  z-index: 10;
  left: 50%;
  top: 50%;
  width: 520px;
  padding: 28px;
  color: var(--ink);
  background: var(--paper);
  transform: translate(-50%, -50%);
  font-size: 18px;
  line-height: 1.55;
}

.fallback strong,
.fallback span {
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .prose-card,
  .card-media img,
  .legend,
  .stack-segment,
  .year-bar {
    transition: none !important;
  }
}
```
  </file>
  <file path="samples/chart/lenna-scroll-bars/pages/assets/story.js">
```javascript
(function () {
  "use strict";

  const STATES = [
    {
      id: "1972",
      year: 1972,
      copyMin: 260,
      image: "playboy.jpg",
      alt: "三本 1972 年杂志的低分辨率黑白档案照片",
      copy: "<strong class=\"year\">1972</strong> 年，USC 的工程师把一张杂志照片扫描成数字测试图。数据里此时只找到 <strong class=\"metric\">2 个实例</strong>，但它已经进入图像处理研究的复制链。"
    },
    {
      id: "1991",
      year: 1991,
      copyMin: 205,
      image: "journal.jpg",
      alt: "1991 年光学工程期刊封面的低分辨率档案照片",
      copy: "到 <strong class=\"year\">1991</strong> 年，Lenna 登上工程期刊封面；当年数据升至 <strong class=\"metric\">65 个实例</strong>。实验室里的测试素材，开始成为公开的工程符号。"
    },
    {
      id: "1995",
      year: 1995,
      copyMin: 215,
      copy: "版权争议没有让它退场，反而把这张图从研究素材推成工程民间传说；讨论与复用同时增长。<strong class=\"year\">1995</strong> 年，检索实例冲到整组数据的峰值：<strong class=\"metric\">287</strong>，此后再没有一年更高。"
    },
    {
      id: "2014",
      year: 2014,
      copyMin: 185,
      image: "silicon-valley.jpg",
      alt: "电视剧画面中出现低分辨率 Lenna 测试图的档案照片",
      copy: "进入大众网络之后，它不只留在论文里。<strong class=\"year\">2014</strong> 年仍有 <strong class=\"metric\">218 个实例</strong>，并从课堂、软件一路进入流行文化。"
    },
    {
      id: "2019",
      year: 2019,
      copyMin: 210,
      image: "losing-lena.jpg",
      alt: "Lena Forsén 在倡议影片中请求互联网让图像退休的档案照片",
      copy: "<strong class=\"year\">2019</strong> 年，《Losing Lena》公开要求技术界让这张图退休。反对声已经清晰可见，但当年数据仍记录了 <strong class=\"metric\">175 个实例</strong>。"
    },
    {
      id: "2021",
      year: 2021,
      copyMin: 210,
      copy: "两年后，柱子没有消失。<strong class=\"year\">2021</strong> 年仍检索到 <strong class=\"metric\">252 个实例</strong>。反对声改变了一部分使用，却没有切断分发链：一次复制形成的惯性，远比最初的场景更长寿。"
    },
    {
      id: "domains",
      year: null,
      domains: true,
      copyMin: 250,
      copy: "拆开每年的柱子，早期高度主要来自 <span class=\"domain-word\" data-domain=\".org\" tabindex=\"0\" role=\"button\">.org</span>；后来 <span class=\"domain-word\" data-domain=\".com\" tabindex=\"0\" role=\"button\">.com</span> 与 <span class=\"domain-word\" data-domain=\"other\" tabindex=\"0\" role=\"button\">other</span> 接过扩散，<span class=\"domain-word\" data-domain=\".edu\" tabindex=\"0\" role=\"button\">.edu</span> 则让它继续出现在教学与研究站点。传播换了基础设施，并没有自然退休。"
    }
  ];

  const CATEGORY_ORDER = [".org", ".edu", ".com", "other"];
  const CATEGORY_COLORS = {
    ".org": "#586fa6",
    ".edu": "#a64153",
    ".com": "#d96666",
    other: "#f29f80"
  };
  const W = 1600, H = 900;
  const MARGIN = { left: 50, right: 50, top: 100, bottom: 100 };
  const BAR_REVEAL_INTERVAL = 80;
  const svg = d3.select("#chart");
  const yAxisLayer = svg.select(".y-axis");
  const xAxisLayer = svg.select(".x-axis");
  const barsLayer = svg.select(".bars");
  const stacksLayer = svg.select(".stacks");
  const legendLayer = svg.select(".legend");
  const byId = (id) => document.getElementById(id);
  const [stage, card, cardCopy, cardImage, status, fallback] =
    ["stage", "prose-card", "card-copy", "card-image", "chart-desc", "fallback"].map(byId);
  const cardMedia = card.querySelector(".card-media");
  const removers = [];

  let yearly = [];
  let xScale;
  let yScale;
  let stateIndex = 0;
  let hoveredDomain = null;
  let ready = false;
  let navToken = 0;
  let transitioning = false;
  let queuedDirection = 0;
  let wheelLocked = false;
  let wheelTimer = 0;
  let touchStartY = null;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  Deck.init({ title: "Lenna：五十年的网络余波", keys: false });

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }

  function domainCategory(domain) {
    const value = String(domain || "");
    if (value.endsWith(".com")) return ".com";
    if (value.endsWith(".edu")) return ".edu";
    if (value.endsWith(".org")) return ".org";
    return "other";
  }

  function loadLocalCsv(path) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("GET", path, true);
      request.addEventListener("load", () => {
        if ((request.status >= 200 && request.status < 300) || request.status === 0) {
          try {
            resolve(d3.csvParse(request.responseText));
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`读取 ${path} 失败：HTTP ${request.status}`));
        }
      });
      request.addEventListener("error", () => reject(new Error(`无法读取本地 ${path}`)));
      request.send();
    });
  }

  function aggregate(rows) {
    const records = rows
      .map((d, order) => ({ domain: d.domain || "", year: Number.parseInt(d.year, 10), order }))
      .filter((d) => Number.isInteger(d.year) && d.year >= 1972);

    const grouped = d3.group(records, (d) => d.year);
    const result = Array.from(grouped, ([year, values]) => {
      const counts = { ".org": 0, ".edu": 0, ".com": 0, other: 0 };
      values.forEach((d) => { counts[domainCategory(d.domain)] += 1; });
      return { year, value: values.length, ...counts };
    }).sort((a, b) => a.year - b.year);

    const peak = d3.max(result, (d) => d.value);
    if (records.length !== 4801 || result[0].year !== 1972 || result.at(-1).year !== 2021 || peak !== 287) {
      throw new Error("data.csv 与固定上游数据不一致");
    }
    return result;
  }

  function buildTable() {
    d3.select("#data-table tbody")
      .selectAll("tr")
      .data(yearly, (d) => d.year)
      .join("tr")
      .html((d) => `<th>${d.year}</th><td>${d.value}</td><td>${d[".org"]}</td><td>${d[".edu"]}</td><td>${d[".com"]}</td><td>${d.other}</td>`);
  }

  function buildScales() {
    xScale = d3.scaleBand()
      .domain(d3.range(1972, 2022))
      .range([MARGIN.left, W - MARGIN.right])
      .paddingInner(0.1);
    yScale = d3.scaleLinear()
      .domain([0, d3.max(yearly, (d) => d.value)])
      .range([H - MARGIN.bottom, MARGIN.top]);
  }

  function drawYAxis() {
    yAxisLayer
      .attr("transform", `translate(${MARGIN.left - 5},0)`)
      .call(d3.axisLeft(yScale).ticks(14).tickSize(-(W - MARGIN.left - MARGIN.right)));
    const ticks = yAxisLayer.selectAll(".tick");
    ticks.filter((d) => d === 280).select("text")
      .attr("x", -18)
      .attr("text-anchor", "start")
      .text("280 个检索实例");
  }

  function drawXAxis(state, animate) {
    xAxisLayer
      .attr("transform", `translate(0,${H - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).tickValues(d3.range(1972, 2022)).tickSize(0).tickPadding(10));

    const tickTexts = xAxisLayer.selectAll(".tick text");
    if (!animate) tickTexts.style("transition", "none");
    tickTexts
      .classed("is-current", (year) => state.year === year)
      .classed("is-hidden", (year) => {
        if (state.year === year) return false;
        if ((year - 1972) % 4 !== 0) return true;
        return state.year !== null && Math.abs(year - state.year) === 1;
      });
    if (!animate) {
      xAxisLayer.node().getBoundingClientRect();
      requestAnimationFrame(() => tickTexts.style("transition", null));
    }
  }

  function buildLegend() {
    const items = legendLayer
      .attr("transform", `translate(${xScale(1975)},${yScale(250)})`)
      .selectAll("g.legend-item")
      .data(CATEGORY_ORDER, (d) => d)
      .join((enter) => {
        const g = enter.append("g")
          .attr("class", "legend-item")
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", (d) => `突出 ${d} 域名`);
        g.append("rect").attr("width", 25).attr("height", 25);
        g.append("text").attr("x", 38).attr("y", 17);
        return g;
      });

    items.attr("transform", (_, i) => `translate(0,${i * 38})`)
      .on("pointerenter.story", (_, d) => setHover(d))
      .on("pointerleave.story", () => setHover(null))
      .on("focus.story", (_, d) => setHover(d))
      .on("blur.story", () => setHover(null))
      .on("keydown.story", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setHover(hoveredDomain === d ? null : d);
        }
      });
    items.select("rect").attr("fill", (d) => CATEGORY_COLORS[d]);
    items.select("text").text((d) => d);
  }

  function showLegend(visible, animate) {
    if (animate) {
      legendLayer.style("transition", null).style("opacity", null);
      legendLayer.classed("is-visible", visible);
    } else {
      legendLayer
        .style("transition", "none")
        .style("opacity", visible ? 1 : 0)
        .classed("is-visible", visible);
      legendLayer.node().getBoundingClientRect();
      requestAnimationFrame(() => {
        legendLayer.style("transition", null).style("opacity", null);
      });
    }
    legendLayer.attr("aria-hidden", visible ? null : "true");
  }

  function renderStandardBars(state, previousState, animate) {
    const visible = yearly.filter((d) => d.year <= state.year);
    const previousYear = previousState && previousState.year !== null
      ? previousState.year
      : previousState && previousState.domains ? state.year : 1971;
    const previousCount = yearly.filter((d) => d.year <= previousYear).length;
    const forward = state.year > previousYear;

    const oldStacks = stacksLayer.selectAll("rect").interrupt("stack-fade");
    if (animate) oldStacks.transition("stack-fade").duration(220).style("opacity", 0).remove();
    else oldStacks.remove();
    barsLayer.selectAll("rect").interrupt("reveal");

    const bars = barsLayer.selectAll("rect.year-bar")
      .data(visible, (d) => d.year)
      .join(
        (enter) => enter.append("rect")
          .attr("class", "year-bar")
          .attr("data-year", (d) => d.year),
        (update) => update,
        (exit) => {
          exit.interrupt("reveal");
          return animate
            ? exit.transition("reveal").duration(180).style("opacity", 0).remove()
            : exit.remove();
        }
      )
      .attr("x", (d) => xScale(d.year))
      .attr("y", (d) => yScale(d.value))
      .attr("width", xScale.bandwidth())
      .attr("height", (d) => yScale(0) - yScale(d.value))
      .classed("is-current", (d) => d.year === state.year)
      .attr("data-reveal-delay", (d, i) => animate && forward && d.year > previousYear ? (i - previousCount) * BAR_REVEAL_INTERVAL : 0);

    bars.style("display", null);
    bars.filter((d) => animate && forward && d.year > previousYear)
      .style("opacity", 0)
      .transition("reveal")
      .delay((d, i, nodes) => Number(nodes[i].getAttribute("data-reveal-delay")))
      .duration(300)
      .ease(d3.easeLinear)
      .style("opacity", 1);
    bars.filter((d) => !(animate && forward && d.year > previousYear)).style("opacity", 1);

    showLegend(false, animate);
  }

  function stackRecords() {
    return d3.stack().keys(CATEGORY_ORDER)(yearly).flatMap((series) =>
      series
        .filter((segment) => segment[1] > segment[0])
        .map((segment) => ({
          key: series.key,
          year: segment.data.year,
          y0: segment[0],
          y1: segment[1],
          value: segment[1] - segment[0]
        }))
    );
  }

  function renderStacks(animate) {
    const oldBars = barsLayer.selectAll("rect.year-bar").interrupt("reveal");
    if (animate) oldBars.transition("reveal").duration(260).style("opacity", 0);
    else oldBars.style("opacity", 0);

    const segments = stacksLayer.selectAll("rect.stack-segment")
      .data(stackRecords(), (d) => `${d.year}-${d.key}`)
      .join(
        (enter) => enter.append("rect")
          .attr("class", "stack-segment")
          .attr("data-domain", (d) => d.key)
          .attr("data-year", (d) => d.year)
          .style("opacity", animate ? 0 : 1),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("x", (d) => xScale(d.year))
      .attr("y", (d) => yScale(d.y1))
      .attr("width", xScale.bandwidth())
      .attr("height", (d) => yScale(d.y0) - yScale(d.y1))
      .attr("fill", (d) => CATEGORY_COLORS[d.key]);

    segments.interrupt("stack-fade");
    if (animate) {
      segments.transition("stack-fade")
        .delay((d) => (d.year - 1972) * 12)
        .duration(420)
        .ease(d3.easeCubicOut)
        .style("opacity", (d) => hoveredDomain && d.key !== hoveredDomain ? 0.28 : 1);
    } else {
      segments.style("opacity", (d) => hoveredDomain && d.key !== hoveredDomain ? 0.28 : 1);
    }
    showLegend(true, animate);
    updateHover();
  }

  function updateHover() {
    stacksLayer.selectAll("rect.stack-segment")
      .interrupt("hover")
      .transition("hover")
      .duration(120)
      .style("opacity", (d) => hoveredDomain && d.key !== hoveredDomain ? 0.28 : 1);
    legendLayer.selectAll(".legend-item")
      .classed("is-hovered", (d) => d === hoveredDomain)
      .attr("aria-pressed", (d) => d === hoveredDomain ? "true" : "false");
  }

  function setHover(domain) {
    hoveredDomain = CATEGORY_ORDER.includes(domain) ? domain : null;
    updateHover();
    if (STATES[stateIndex].domains) {
      status.textContent = hoveredDomain ? `已突出 ${hoveredDomain} 域名，其余类别透明度为 0.28。` : "已显示全部域名类别。";
    }
  }

  function cardDomain(event) {
    const node = event.target.closest?.(".domain-word");
    return node ? node.dataset.domain : null;
  }

  function onCardActivate(event) {
    const domain = cardDomain(event);
    if (domain) setHover(domain);
  }

  function onCardDeactivate(event) {
    if (cardDomain(event)) setHover(null);
  }

  function onCardKey(event) {
    const domain = cardDomain(event);
    if (domain && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setHover(hoveredDomain === domain ? null : domain);
    }
  }

  function renderCard(state) {
    card.dataset.state = state.id;
    card.style.setProperty("--copy-min", `${state.copyMin}px`);
    cardCopy.innerHTML = state.copy;
    if (state.image) {
      cardMedia.hidden = false;
      cardImage.src = `assets/story/${state.image}`;
      cardImage.alt = state.alt;
    } else {
      cardMedia.hidden = true;
      cardImage.removeAttribute("src");
      cardImage.alt = "";
    }
  }

  function renderState(nextIndex, previousIndex, animateBars) {
    const next = STATES[nextIndex];
    const previous = previousIndex === null ? null : STATES[previousIndex];
    hoveredDomain = null;
    drawXAxis(next, animateBars);
    if (next.domains) renderStacks(animateBars);
    else renderStandardBars(next, previous, animateBars);
    renderCard(next);
    stage.dataset.state = next.id;
    stage.dataset.stateIndex = String(nextIndex);
    const stateDatum = next.year === null ? null : yearly.find((d) => d.year === next.year);
    status.textContent = next.domains
      ? "最终状态：年度柱已按 .org、.edu、.com 与其他域名拆分。"
      : `${next.year} 年，共 ${stateDatum.value} 个检索实例。`;
  }

  function clearMotion() {
    navToken += 1;
    transitioning = false;
    queuedDirection = 0;
    barsLayer.selectAll("*").interrupt();
    stacksLayer.selectAll("*").interrupt();
    legendLayer.selectAll("*").interrupt();
    card.className = "prose-card is-settled";
  }

  function setState(nextIndex, options) {
    const opts = { animate: true, ...options };
    const bounded = Deck.clamp(Number(nextIndex), 0, STATES.length - 1);
    if (!ready || !Number.isInteger(bounded)) return false;
    if (bounded === stateIndex && opts.animate) return false;
    const previousIndex = stateIndex;
    const direction = bounded >= previousIndex ? 1 : -1;

    if (!opts.animate || Deck.reduced()) {
      clearMotion();
      stateIndex = bounded;
      renderState(stateIndex, previousIndex, false);
      card.className = "prose-card is-settled";
      return true;
    }

    const token = ++navToken;
    transitioning = true;
    card.className = `prose-card ${direction > 0 ? "is-leaving-up" : "is-leaving-down"}`;

    setTimeout(() => {
      if (token !== navToken) return;
      stateIndex = bounded;
      renderState(stateIndex, previousIndex, true);
      card.className = `prose-card ${direction > 0 ? "is-entering-bottom" : "is-entering-top"}`;
      card.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (token === navToken) card.className = "prose-card is-settled";
      });
    }, 300);

    setTimeout(() => {
      if (token !== navToken) return;
      transitioning = false;
      if (queuedDirection) {
        const queued = queuedDirection;
        queuedDirection = 0;
        navigate(queued);
      }
    }, 920);
    return true;
  }

  function navigate(direction) {
    if (!ready) return false;
    const step = direction > 0 ? 1 : -1;
    if (transitioning) {
      queuedDirection = step;
      return false;
    }
    return setState(stateIndex + step, { animate: true });
  }

  function reset() {
    if (!ready) return false;
    clearMotion();
    const previousIndex = stateIndex;
    stateIndex = 0;
    hoveredDomain = null;
    renderState(0, previousIndex, false);
    card.className = "prose-card is-settled";
    return true;
  }

  function inspect() {
    const current = STATES[stateIndex];
    const datum = current.year === null ? null : yearly.find((d) => d.year === current.year);
    const cardBox = card.getBoundingClientRect();
    return {
      ready,
      stateIndex,
      state: current.id,
      year: current.year,
      value: datum ? datum.value : null,
      hoveredDomain,
      recordCount: d3.sum(yearly, (d) => d.value),
      annualRows: yearly.length,
      barWidth: xScale ? xScale.bandwidth() : null,
      baseline: yScale ? yScale(0) : null,
      card: { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height },
      visibleBars: barsLayer.selectAll("rect.year-bar").size(),
      stackSegments: stacksLayer.selectAll("rect.stack-segment").size(),
      revealDelays: barsLayer.selectAll("rect.year-bar").nodes().map((node) => Number(node.dataset.revealDelay || 0))
    };
  }

  function onWheel(event) {
    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 16 || wheelLocked) return;
    wheelLocked = true;
    navigate(delta > 0 ? 1 : -1);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelLocked = false; }, 780);
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const targetName = event.target && event.target.tagName;
    if (targetName === "INPUT" || targetName === "TEXTAREA" || targetName === "SELECT") return;
    if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
      event.preventDefault();
      navigate(1);
    } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === "Home" || event.key.toLowerCase() === "r") {
      event.preventDefault();
      reset();
    }
  }

  function onTouchStart(event) {
    if (event.touches && event.touches.length === 1) touchStartY = event.touches[0].clientY;
  }

  function onTouchMove(event) {
    if (touchStartY !== null) event.preventDefault();
  }

  function onTouchEnd(event) {
    if (touchStartY === null) return;
    const touch = event.changedTouches && event.changedTouches[0];
    if (touch) {
      const distance = touchStartY - touch.clientY;
      if (Math.abs(distance) >= 42) navigate(distance > 0 ? 1 : -1);
    }
    touchStartY = null;
  }

  function onTouchCancel() { touchStartY = null; }

  listen(stage, "wheel", onWheel, { passive: false });
  listen(stage, "touchstart", onTouchStart, { passive: true });
  listen(stage, "touchmove", onTouchMove, { passive: false });
  listen(stage, "touchend", onTouchEnd, { passive: true });
  listen(stage, "touchcancel", onTouchCancel);
  listen(document, "keydown", onKey);
  listen(card, "pointerover", onCardActivate);
  listen(card, "pointerout", onCardDeactivate);
  listen(card, "focusin", onCardActivate);
  listen(card, "focusout", onCardDeactivate);
  listen(card, "keydown", onCardKey);

  function teardown() {
    clearMotion();
    clearTimeout(wheelTimer);
    removers.splice(0).forEach((remove) => remove());
    svg.selectAll("*").interrupt().on(".story", null);
  }

  listen(window, "pagehide", teardown, { once: true });

  window.LennaStory = {
    whenReady: () => readyPromise,
    states: STATES.map((d) => d.id),
    next: () => navigate(1),
    previous: () => navigate(-1),
    setState: (index, options) => setState(index, options),
    setStateById: (id, options) => setState(STATES.findIndex((d) => d.id === id), options),
    reset,
    destroy: teardown,
    setHover,
    inspect,
    data: () => yearly.map((d) => ({ ...d })),
    constants: { width: W, height: H, margin: { ...MARGIN }, revealInterval: BAR_REVEAL_INTERVAL }
  };

  loadLocalCsv("assets/data/data.csv")
    .then((rows) => {
      yearly = aggregate(rows);
      buildScales();
      drawYAxis();
      buildLegend();
      buildTable();
      ready = true;
      renderState(0, null, false);
      card.className = "prose-card is-settled";
      stage.dataset.ready = "true";
      resolveReady(inspect());
    })
    .catch((error) => {
      console.error(error);
      fallback.hidden = false;
      card.hidden = true;
      stage.dataset.ready = "error";
      resolveReady({ ready: false, error: String(error) });
    });
}());
```
  </file>
</sample>
