<sample id="pollinator-network" category="chart" variant="full">
  <file path="samples/chart/pollinator-network/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>谁连接了两个授粉群落？</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/app.css">
</head>
<body>
  <div id="stage">
    <header class="masthead" aria-labelledby="page-title">
      <div class="mast-copy">
        <h1 id="page-title">谁连接了两个授粉群落？</h1>
        <p class="dek">关键不只是“访问得多”，而是同一位传粉者是否把访花路径伸向了两侧植物群落。</p>
      </div>
    </header>

    <main class="page-main min0">
      <figure class="network-frame min0" aria-labelledby="figure-title">
        <div class="figure-head">
          <div class="figure-question">
            <h2 id="figure-title">两位桥接者的 16 条两侧连线</h2>
          </div>
          <div class="view-tools" aria-label="网络视图">
            <button class="view-button" id="bridgeView" type="button" aria-pressed="true" aria-keyshortcuts="1">桥接证据</button>
            <button class="view-button" id="fullView" type="button" aria-pressed="false" aria-keyshortcuts="2">完整网络</button>
            <button class="reset-button" id="resetView" type="button" aria-keyshortcuts="R">重置</button>
          </div>
        </div>

        <div class="network-host min0" id="networkHost">
          <svg id="networkSvg" role="img" aria-labelledby="network-title network-desc" preserveAspectRatio="xMidYMid meet">
            <title id="network-title">植物-传粉者二部网络</title>
            <desc id="network-desc">左侧林缘与右侧湿草甸各有四种植物和三位局部访花者。中央两位广食性传粉者都向两侧植物发出连线，因此形成群落桥梁。线越宽，访花次数越多。</desc>
          </svg>
          <section class="fallback" id="chartFallback" hidden tabindex="0" aria-label="网络数据文字回退">
            <h3>网络图暂不可用</h3>
            <p>以下表格保留全部固定教学数据；单位为访花次数。</p>
            <table>
              <thead><tr><th>传粉者</th><th>植物</th><th>群落</th><th>次数</th></tr></thead>
              <tbody id="fallbackRows"></tbody>
            </table>
          </section>
        </div>

        <figcaption class="figure-foot">
          <p class="status-line" id="chartStatus" aria-live="polite">正在建立确定性网络布局……</p>
          <div class="legend" aria-label="图例">
            <span class="legend-role"><i class="legend-flower" aria-hidden="true"></i>植物</span>
            <span class="legend-role"><i class="legend-bee" aria-hidden="true"></i>传粉者</span>
            <span class="legend-widths" aria-label="线宽表示访花次数">
              线宽 = 访花次数
              <span class="legend-width"><i class="line-sample s10"></i>10</span>
              <span class="legend-width"><i class="line-sample s20"></i>20</span>
              <span class="legend-width"><i class="line-sample s30"></i>30</span>
            </span>
          </div>
        </figcaption>
      </figure>

      <aside class="evidence-column min0" aria-labelledby="conclusion-title">
        <section class="conclusion-block">
          <h2 id="conclusion-title">两位广食者，<br>跨过群落边界。</h2>
          <p>它们在两侧都留下访花连线；其余六位局部访花者只连向一侧。</p>
        </section>

        <section class="evidence-section" aria-labelledby="evidence-title">
          <div class="section-heading">
            <h3 id="evidence-title">桥接者的两侧证据</h3>
            <span>单位：次</span>
          </div>
          <div class="bridge-list" id="bridgeList"></div>
        </section>

        <section class="reading-note" aria-label="读图边界">
          <div class="zero-evidence">
            <span class="zero-number">0</span>
            <span class="zero-copy"><strong>其余 6 位局部访花者</strong>连接到另一群落的植物数</span>
          </div>
          <p class="boundary-note">中央虚线走廊只标示桥接位置，不编码数量。</p>
        </section>
      </aside>
    </main>

    <footer class="page-foot">
      <p><strong>数据说明：</strong>教学示意 · 固定构造值 · 单位为访花次数 · 无连线 = 未记录访花 · 不含抽样不确定性 · 非实地调查</p>
      <span class="folio"><span id="recordCount">16 节点 · 28 关系</span></span>
    </footer>
  </div>

  <script src="assets/lib/d3.min.js"></script>
  <script src="assets/base.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/pollinator-network/pages/assets/app.css">
```css
:root {
  --stage-w: 1600px;
  --stage-h: 900px;
  --bg: #cfd8d0;
  --text: #17211c;
  --font-sans: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --paper: #eef1eb;
  --paper-hi: #f8f9f5;
  --ink: #17211c;
  --muted: #626c63;
  --faint: #8d948c;
  --rule: #bcc5bb;
  --rule-dark: #929d92;
  --green: #214f41;
  --green-2: #34735f;
  --amber: #dd922e;
  --amber-deep: #9c5a14;
  --community-a: #7c5876;
  --community-a-soft: #eee3eb;
  --community-b: #2f6c73;
  --community-b-soft: #deeceb;
  --focus: #b64d2e;
}

button { border: 0; }

#stage {
  display: grid;
  grid-template-rows: 116px minmax(0, 1fr) 32px;
  gap: 10px;
  padding: 30px 52px 22px;
  isolation: isolate;
  background: var(--paper);
}

.masthead {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  border-bottom: 1px solid var(--rule);
}

.mast-copy { min-width: 0; }

h1 {
  margin-top: 10px;
  color: var(--ink);
  font-size: 50px;
  font-weight: 820;
  letter-spacing: -.055em;
  line-height: 1.02;
}

.dek {
  margin-top: 9px;
  max-width: 1050px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.45;
}

.page-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 348px;
  gap: 28px;
  min-height: 0;
}

.network-frame {
  position: relative;
  display: grid;
  grid-template-rows: 62px minmax(0, 1fr) 54px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  background: var(--paper-hi);
}

.figure-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 11px 16px 10px 24px;
  border-bottom: 1px solid rgba(201,196,180,.72);
}

.figure-question {
  min-width: 0;
}

.figure-question h2 {
  color: var(--ink);
  font-size: 18px;
  font-weight: 760;
  line-height: 1.25;
}

.view-tools {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
}

.view-button,
.reset-button {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule-dark);
  color: var(--muted);
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.view-button:hover,
.reset-button:hover { border-color: var(--green-2); color: var(--green); }

.view-button[aria-pressed="true"] {
  border-color: var(--green);
  color: var(--green);
  box-shadow: inset 0 -2px 0 var(--green);
}

.reset-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-inline: 12px;
}

.network-host {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--paper-hi);
}

#networkSvg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.community-zone {
  stroke-width: 1.2;
  stroke-dasharray: 5 6;
}

.community-zone.a { fill: var(--community-a-soft); stroke: rgba(124,88,118,.38); }
.community-zone.b { fill: var(--community-b-soft); stroke: rgba(47,108,115,.38); }

.bridge-band {
  fill: rgba(243,223,189,.42);
  stroke: rgba(156,90,20,.24);
  stroke-width: 1;
  stroke-dasharray: 3 6;
}

.zone-label {
  font-size: 15px;
  font-weight: 780;
  letter-spacing: .06em;
}

.zone-label.a { fill: var(--community-a); }
.zone-label.b { fill: var(--community-b); }
.zone-label.bridge { fill: var(--amber-deep); text-anchor: middle; }

.zone-sub {
  fill: var(--muted);
  font-size: 12px;
  letter-spacing: .02em;
}

.zone-sub.bridge { text-anchor: middle; }

.link {
  fill: none;
  stroke-linecap: round;
  mix-blend-mode: multiply;
  transition: opacity 220ms ease, stroke 220ms ease;
}

.link.community-a { stroke: var(--community-a); }
.link.community-b { stroke: var(--community-b); }

.bridge-halo {
  fill: none;
  stroke: var(--amber);
  stroke-width: 1.5;
  stroke-dasharray: 3 4;
  opacity: 0;
  transition: opacity 220ms ease;
}

.node {
  cursor: pointer;
  outline: none;
  transition: opacity 220ms ease;
}

.node-focus {
  fill: none;
  stroke: var(--focus);
  stroke-width: 2.5;
  opacity: 0;
}

.node:focus .node-focus { opacity: 1; }

.node-label {
  fill: var(--ink);
  stroke: var(--paper-hi);
  stroke-width: 5px;
  stroke-linejoin: round;
  paint-order: stroke;
  font-size: 14px;
  font-weight: 740;
  pointer-events: none;
}

.node-label.bridge {
  fill: var(--amber-deep);
  font-size: 15px;
  font-weight: 820;
}

.node-role {
  fill: var(--muted);
  stroke: var(--paper-hi);
  stroke-width: 4px;
  paint-order: stroke;
  font-size: 13px;
  font-weight: 720;
  letter-spacing: .02em;
  pointer-events: none;
}

.plant-petal { fill: var(--green-2); stroke: var(--paper-hi); stroke-width: 1.6; }
.plant-core { fill: var(--paper-hi); stroke: var(--green); stroke-width: 1.6; }
.pollinator-mark { fill: var(--amber); stroke: var(--amber-deep); stroke-width: 1.6; }
.pollinator-mark.bridge { fill: var(--ink); stroke: var(--amber); stroke-width: 2.2; }
.pollinator-stripe { stroke: var(--paper-hi); stroke-width: 2; stroke-linecap: round; opacity: .88; }

.bridge-tag rect {
  fill: var(--amber);
  stroke: var(--paper-hi);
  stroke-width: 2;
}

.bridge-tag text {
  fill: #34220e;
  font-size: 13px;
  font-weight: 850;
  letter-spacing: .1em;
  text-anchor: middle;
}

.fallback {
  position: absolute;
  inset: 18px;
  overflow: hidden;
  padding: 22px;
  border: 1px solid var(--rule-dark);
  border-radius: 18px;
  background: var(--paper-hi);
}

.fallback h3 { font-size: 18px; }
.fallback p { margin-top: 5px; color: var(--muted); font-size: 14px; }
.fallback table { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 13px; }
.fallback th, .fallback td { padding: 5px 8px; border-bottom: 1px solid var(--rule); text-align: left; }

.figure-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 8px 18px 9px 24px;
  border-top: 1px solid rgba(201,196,180,.72);
}

.status-line {
  min-width: 0;
  color: var(--green);
  font-size: 14px;
  font-weight: 710;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.legend-role,
.legend-widths,
.legend-width {
  display: inline-flex;
  align-items: center;
}

.legend-role { gap: 6px; }
.legend-widths { gap: 8px; }
.legend-width { gap: 4px; }

.legend-flower {
  position: relative;
  width: 16px;
  height: 16px;
}

.legend-flower::before,
.legend-flower::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 0;
  width: 8px;
  height: 16px;
  border-radius: 50%;
  background: var(--green-2);
}

.legend-flower::after { transform: rotate(90deg); }

.legend-bee {
  width: 17px;
  height: 12px;
  border: 2px solid var(--amber-deep);
  border-radius: 50% 46% 46% 50%;
  background: var(--amber);
  box-shadow: inset 5px 0 0 rgba(255,255,255,.68), inset -4px 0 0 rgba(255,255,255,.68);
}

.line-sample {
  display: inline-block;
  width: 24px;
  border-radius: 999px;
  background: var(--community-b);
}

.line-sample.s10 { height: 2px; }
.line-sample.s20 { height: 4px; }
.line-sample.s30 { height: 7px; }

.evidence-column {
  display: grid;
  grid-template-rows: auto auto 1fr;
  min-width: 0;
  min-height: 0;
  padding-left: 22px;
  border-left: 1px solid var(--rule);
}

.conclusion-block {
  position: relative;
  overflow: hidden;
  padding: 15px 2px 17px;
  border-top: 3px solid var(--green);
  color: var(--ink);
}

.conclusion-block h2 {
  position: relative;
  font-size: 30px;
  font-weight: 780;
  letter-spacing: -.035em;
  line-height: 1.18;
}

.conclusion-block p {
  position: relative;
  margin-top: 13px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.55;
}

.evidence-section {
  padding: 15px 2px 16px;
  border-bottom: 1px solid var(--rule);
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h3 {
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}

.section-heading span {
  color: var(--faint);
  font-size: 12px;
}

.bridge-list {
  display: grid;
  gap: 13px;
  margin-top: 13px;
}

.bridge-evidence {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 10px;
  align-items: center;
  min-width: 0;
}

.entity-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 28px;
  padding: 0;
  color: var(--ink);
  background: transparent;
  font-size: 15px;
  font-weight: 780;
  cursor: pointer;
}

.entity-button:hover { color: var(--amber-deep); }

.entity-hex {
  width: 16px;
  height: 16px;
  background: var(--amber);
  clip-path: polygon(25% 7%, 75% 7%, 100% 50%, 75% 93%, 25% 93%, 0 50%);
}

.entity-total {
  color: var(--amber-deep);
  font-size: 14px;
  font-weight: 820;
  white-space: nowrap;
}

.split-bar {
  grid-column: 1 / -1;
  display: flex;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--rule);
}

.split-a { background: var(--community-a); }
.split-b { background: var(--community-b); }

.split-values {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 13px;
}

.split-values strong { color: var(--ink); font-weight: 760; }

.reading-note {
  min-height: 0;
  padding: 15px 2px 0;
}

.zero-evidence {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 0;
  border-bottom: 1px solid var(--rule);
}

.zero-number {
  color: var(--green);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 34px;
  line-height: 1;
}

.zero-copy {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.4;
}

.zero-copy strong { display: block; color: var(--ink); font-size: 14px; }

.boundary-note {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
}

.page-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
}

.page-foot strong { color: var(--ink); }

.folio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--green);
  font-weight: 800;
  letter-spacing: .08em;
}

.folio::before {
  content: "";
  width: 34px;
  height: 1px;
  background: var(--green);
}

@media (prefers-reduced-motion: reduce) {
  .link, .node, .bridge-halo { transition: none; }
}
```
  </file>
  <file path="samples/chart/pollinator-network/pages/assets/app.js">
```javascript
(function () {
  "use strict";

  Deck.init({
    title: "谁连接了两个授粉群落？",
    total: 1,
    keys: false
  });

  // Canonical teaching records. Renderer input is always derived from these untouched values.
  const CANONICAL_NODES = Object.freeze([
    { id: "plant-clover", label: "红三叶", kind: "plant", community: "a", nx: .070, ny: .205 },
    { id: "plant-sage", label: "林下鼠尾草", kind: "plant", community: "a", nx: .070, ny: .405 },
    { id: "plant-hawthorn", label: "山楂", kind: "plant", community: "a", nx: .070, ny: .605 },
    { id: "plant-bramble", label: "覆盆子", kind: "plant", community: "a", nx: .070, ny: .805 },
    { id: "bee-osmia", label: "红壁蜂", kind: "pollinator", local: "a", nx: .305, ny: .265 },
    { id: "bee-leafcutter", label: "切叶蜂", kind: "pollinator", local: "a", nx: .305, ny: .515 },
    { id: "bee-longhorn", label: "长角蜂", kind: "pollinator", local: "a", nx: .305, ny: .745 },
    { id: "bee-bumble", label: "白尾熊蜂", kind: "pollinator", nx: .500, ny: .375 },
    { id: "fly-hover", label: "条纹食蚜蝇", kind: "pollinator", nx: .500, ny: .650 },
    { id: "bee-reed", label: "芦蜂", kind: "pollinator", local: "b", nx: .695, ny: .265 },
    { id: "butterfly-ringlet", label: "眼蝶", kind: "pollinator", local: "b", nx: .695, ny: .515 },
    { id: "moth-silver", label: "银纹夜蛾", kind: "pollinator", local: "b", nx: .695, ny: .745 },
    { id: "plant-loosestrife", label: "千屈菜", kind: "plant", community: "b", nx: .930, ny: .205 },
    { id: "plant-vetchling", label: "草甸山黧豆", kind: "plant", community: "b", nx: .930, ny: .405 },
    { id: "plant-scabious", label: "松虫草", kind: "plant", community: "b", nx: .930, ny: .605 },
    { id: "plant-angelica", label: "欧当归", kind: "plant", community: "b", nx: .930, ny: .805 }
  ]);

  const CANONICAL_LINKS = Object.freeze([
    { id: "l01", pollinator: "bee-bumble", plant: "plant-clover", visits: 32 },
    { id: "l02", pollinator: "bee-bumble", plant: "plant-sage", visits: 21 },
    { id: "l03", pollinator: "bee-bumble", plant: "plant-hawthorn", visits: 10 },
    { id: "l04", pollinator: "bee-bumble", plant: "plant-bramble", visits: 28 },
    { id: "l05", pollinator: "bee-bumble", plant: "plant-loosestrife", visits: 19 },
    { id: "l06", pollinator: "bee-bumble", plant: "plant-vetchling", visits: 24 },
    { id: "l07", pollinator: "bee-bumble", plant: "plant-scabious", visits: 17 },
    { id: "l08", pollinator: "bee-bumble", plant: "plant-angelica", visits: 18 },
    { id: "l09", pollinator: "fly-hover", plant: "plant-clover", visits: 11 },
    { id: "l10", pollinator: "fly-hover", plant: "plant-sage", visits: 14 },
    { id: "l11", pollinator: "fly-hover", plant: "plant-hawthorn", visits: 19 },
    { id: "l12", pollinator: "fly-hover", plant: "plant-bramble", visits: 9 },
    { id: "l13", pollinator: "fly-hover", plant: "plant-loosestrife", visits: 8 },
    { id: "l14", pollinator: "fly-hover", plant: "plant-vetchling", visits: 10 },
    { id: "l15", pollinator: "fly-hover", plant: "plant-scabious", visits: 17 },
    { id: "l16", pollinator: "fly-hover", plant: "plant-angelica", visits: 12 },
    { id: "l17", pollinator: "bee-osmia", plant: "plant-clover", visits: 25 },
    { id: "l18", pollinator: "bee-osmia", plant: "plant-sage", visits: 33 },
    { id: "l19", pollinator: "bee-leafcutter", plant: "plant-sage", visits: 15 },
    { id: "l20", pollinator: "bee-leafcutter", plant: "plant-bramble", visits: 29 },
    { id: "l21", pollinator: "bee-longhorn", plant: "plant-clover", visits: 19 },
    { id: "l22", pollinator: "bee-longhorn", plant: "plant-hawthorn", visits: 27 },
    { id: "l23", pollinator: "bee-reed", plant: "plant-loosestrife", visits: 30 },
    { id: "l24", pollinator: "bee-reed", plant: "plant-vetchling", visits: 20 },
    { id: "l25", pollinator: "butterfly-ringlet", plant: "plant-vetchling", visits: 18 },
    { id: "l26", pollinator: "butterfly-ringlet", plant: "plant-scabious", visits: 31 },
    { id: "l27", pollinator: "moth-silver", plant: "plant-scabious", visits: 22 },
    { id: "l28", pollinator: "moth-silver", plant: "plant-angelica", visits: 26 }
  ]);

  const nodeById = new Map(CANONICAL_NODES.map(d => [d.id, d]));
  const pollinatorCommunities = new Map();
  CANONICAL_LINKS.forEach(link => {
    const set = pollinatorCommunities.get(link.pollinator) || new Set();
    set.add(nodeById.get(link.plant).community);
    pollinatorCommunities.set(link.pollinator, set);
  });
  const bridgeIds = new Set(
    Array.from(pollinatorCommunities.entries())
      .filter(([, communities]) => communities.size > 1)
      .map(([id]) => id)
  );

  const state = {
    view: "bridge",
    selected: null
  };

  const svgElement = document.getElementById("networkSvg");
  const host = document.getElementById("networkHost");
  const status = document.getElementById("chartStatus");
  const fallback = document.getElementById("chartFallback");
  const bridgeViewButton = document.getElementById("bridgeView");
  const fullViewButton = document.getElementById("fullView");
  const resetButton = document.getElementById("resetView");
  const cleanups = [];
  let simulation = null;
  let graph = null;
  let resizeFrame = 0;
  let destroyed = false;

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatVisits(value) {
    return `${value} 次`;
  }

  function entityId(nodeOrId) {
    return typeof nodeOrId === "object" ? nodeOrId.id : nodeOrId;
  }

  function summarizePollinator(id) {
    const totals = { a: 0, b: 0, total: 0 };
    CANONICAL_LINKS.forEach(link => {
      if (link.pollinator !== id) return;
      const community = nodeById.get(link.plant).community;
      totals[community] += link.visits;
      totals.total += link.visits;
    });
    return totals;
  }

  function renderEvidence() {
    const list = document.getElementById("bridgeList");
    list.replaceChildren();
    Array.from(bridgeIds).forEach(id => {
      const record = nodeById.get(id);
      const totals = summarizePollinator(id);
      const item = document.createElement("article");
      item.className = "bridge-evidence";
      item.innerHTML = `
        <button class="entity-button" type="button" data-entity="${id}" aria-label="聚焦${record.label}">
          <span class="entity-hex" aria-hidden="true"></span>${record.label}
        </button>
        <span class="entity-total">合计 ${formatVisits(totals.total)}</span>
        <div class="split-bar" aria-hidden="true">
          <span class="split-a" style="width:${(totals.a / totals.total * 100).toFixed(2)}%"></span>
          <span class="split-b" style="width:${(totals.b / totals.total * 100).toFixed(2)}%"></span>
        </div>
        <div class="split-values">
          <span>林缘 <strong>${formatVisits(totals.a)}</strong></span>
          <span>湿草甸 <strong>${formatVisits(totals.b)}</strong></span>
        </div>`;
      list.appendChild(item);
    });
    list.querySelectorAll("[data-entity]").forEach(button => {
      addListener(button, "click", () => selectEntity(button.dataset.entity));
    });
  }

  function populateFallback() {
    const rows = document.getElementById("fallbackRows");
    const labels = { a: "林缘", b: "湿草甸" };
    rows.replaceChildren();
    CANONICAL_LINKS.forEach(link => {
      const plant = nodeById.get(link.plant);
      const pollinator = nodeById.get(link.pollinator);
      const row = document.createElement("tr");
      row.innerHTML = `<td>${pollinator.label}</td><td>${plant.label}</td><td>${labels[plant.community]}</td><td>${formatVisits(link.visits)}</td>`;
      rows.appendChild(row);
    });
  }

  function flowerMark(selection) {
    const angles = [-90, -18, 54, 126, 198];
    angles.forEach(angle => {
      const radians = angle * Math.PI / 180;
      selection.append("circle")
        .attr("class", "plant-petal")
        .attr("cx", Math.cos(radians) * 9)
        .attr("cy", Math.sin(radians) * 9)
        .attr("r", 8.5);
    });
    selection.append("circle").attr("class", "plant-core").attr("r", 5.5);
  }

  function pollinatorMark(selection, bridge) {
    const r = bridge ? 20 : 17;
    const points = Array.from({ length: 6 }, (_, index) => {
      const a = Math.PI / 3 * index;
      return `${Math.cos(a) * r},${Math.sin(a) * r}`;
    }).join(" ");
    selection.append("polygon")
      .attr("class", `pollinator-mark${bridge ? " bridge" : ""}`)
      .attr("points", points);
    selection.append("line").attr("class", "pollinator-stripe").attr("x1", -7).attr("x2", -7).attr("y1", -11).attr("y2", 11);
    selection.append("line").attr("class", "pollinator-stripe").attr("x1", 2).attr("x2", 2).attr("y1", -14).attr("y2", 14);
  }

  function buildLayout(width, height) {
    const random = seededRandom(0xB10D1E);
    const topPad = 34;
    const usableHeight = height - 42;
    const nodes = CANONICAL_NODES.map(record => ({
      ...record,
      bridge: bridgeIds.has(record.id),
      tx: record.nx * width,
      ty: topPad + record.ny * usableHeight,
      x: record.nx * width + (random() - .5) * 18,
      y: topPad + record.ny * usableHeight + (random() - .5) * 18
    }));
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const links = CANONICAL_LINKS.map(record => {
      const plant = nodesById.get(record.plant);
      return {
        ...record,
        source: record.pollinator,
        target: record.plant,
        bridge: bridgeIds.has(record.pollinator),
        community: plant.community
      };
    });

    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(nodes)
      .randomSource(seededRandom(0x5E771E))
      .force("link", d3.forceLink(links)
        .id(node => node.id)
        .distance(link => link.bridge ? width * .315 : width * .215)
        .strength(link => link.bridge ? .018 : .045))
      .force("charge", d3.forceManyBody().strength(node => node.bridge ? -125 : -82))
      .force("collide", d3.forceCollide().radius(node => node.bridge ? 44 : 36).iterations(2))
      .force("x", d3.forceX(node => node.tx).strength(node => node.bridge ? .88 : .66))
      .force("y", d3.forceY(node => node.ty).strength(.74))
      .alpha(1)
      .alphaDecay(.0228)
      .velocityDecay(.48)
      .stop();

    for (let i = 0; i < 340; i += 1) simulation.tick();
    simulation.stop();

    nodes.forEach(node => {
      node.x = Math.max(40, Math.min(width - 40, node.x));
      node.y = Math.max(66, Math.min(height - 34, node.y));
    });

    return { nodes, links };
  }

  function edgePath(link) {
    const sx = link.source.x;
    const sy = link.source.y;
    const tx = link.target.x;
    const ty = link.target.y;
    const direction = link.community === "a" ? -1 : 1;
    const hash = parseInt(link.id.slice(1), 10);
    const bow = ((hash % 3) - 1) * 6 + direction * (link.bridge ? 5 : 2);
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2 + bow;
    return `M${sx.toFixed(2)},${sy.toFixed(2)} Q${mx.toFixed(2)},${my.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)}`;
  }

  function renderGraph() {
    if (destroyed || !window.d3) return;
    const width = Math.max(900, Math.round(host.clientWidth || 1100));
    const height = Math.max(430, Math.round(host.clientHeight || 506));
    const svg = d3.select(svgElement);
    svg.selectAll("*").interrupt();
    svg.selectAll("g[data-layer]").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    graph = buildLayout(width, height);
    graph.width = width;
    graph.height = height;
    const weight = d3.scaleSqrt().domain([0, 34]).range([1.1, 8.6]);

    const backdrop = svg.append("g").attr("data-layer", "backdrop").attr("aria-hidden", "true");
    backdrop.append("rect")
      .attr("class", "community-zone a")
      .attr("x", 18).attr("y", 18)
      .attr("width", width * .405).attr("height", height - 34)
      .attr("rx", 86);
    backdrop.append("rect")
      .attr("class", "community-zone b")
      .attr("x", width * .575).attr("y", 18)
      .attr("width", width * .408).attr("height", height - 34)
      .attr("rx", 86);
    backdrop.append("rect")
      .attr("class", "bridge-band")
      .attr("x", width * .437).attr("y", 16)
      .attr("width", width * .126).attr("height", height - 30)
      .attr("rx", 58);

    backdrop.append("text").attr("class", "zone-label a").attr("x", 42).attr("y", 42).text("A · 林缘植物群落");
    backdrop.append("text").attr("class", "zone-sub").attr("x", 42).attr("y", 58).text("4 种植物 · 3 位局部访花者");
    backdrop.append("text").attr("class", "zone-label b").attr("x", width - 42).attr("y", 42).attr("text-anchor", "end").text("B · 湿草甸植物群落");
    backdrop.append("text").attr("class", "zone-sub").attr("x", width - 42).attr("y", 58).attr("text-anchor", "end").text("4 种植物 · 3 位局部访花者");
    backdrop.append("text").attr("class", "zone-label bridge").attr("x", width / 2).attr("y", 37).text("桥接走廊");
    backdrop.append("text").attr("class", "zone-sub bridge").attr("x", width / 2).attr("y", 53).text("同时抵达 A + B");

    const orderedLinks = graph.links.slice().sort((a, b) => Number(a.bridge) - Number(b.bridge) || a.visits - b.visits);
    const links = svg.append("g").attr("data-layer", "links").attr("aria-hidden", "true")
      .selectAll("path")
      .data(orderedLinks, d => d.id)
      .join("path")
      .attr("class", d => `link community-${d.community}`)
      .attr("d", edgePath)
      .attr("stroke-width", d => weight(d.visits));
    links.append("title").text(d => `${nodeById.get(d.pollinator).label} → ${nodeById.get(d.plant).label}：${formatVisits(d.visits)}`);

    const haloLayer = svg.append("g").attr("data-layer", "halos").attr("aria-hidden", "true");
    const halos = haloLayer.selectAll("circle")
      .data(graph.nodes.filter(node => node.bridge), d => d.id)
      .join("circle")
      .attr("class", "bridge-halo")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 32);

    const nodes = svg.append("g").attr("data-layer", "nodes")
      .selectAll("g.node")
      .data(graph.nodes, d => d.id)
      .join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", d => {
        if (d.kind === "plant") return `${d.label}，植物，${d.community === "a" ? "林缘" : "湿草甸"}群落`;
        const total = summarizePollinator(d.id).total;
        return `${d.label}，传粉者，${d.bridge ? "连接两个群落" : "只连接一个群落"}，共 ${formatVisits(total)}`;
      });

    nodes.append("circle").attr("class", "node-focus").attr("r", d => d.bridge ? 28 : 24);
    nodes.append("circle").attr("r", 27).attr("fill", "transparent").attr("aria-hidden", "true");
    nodes.each(function (node) {
      const mark = d3.select(this).append("g").attr("aria-hidden", "true");
      if (node.kind === "plant") flowerMark(mark);
      else pollinatorMark(mark, node.bridge);
    });

    nodes.each(function (node) {
      const group = d3.select(this);
      let x = 0;
      let y = 0;
      let anchor = "middle";
      if (node.kind === "plant" && node.community === "a") { x = 25; y = 4; anchor = "start"; }
      else if (node.kind === "plant") { x = -25; y = 4; anchor = "end"; }
      else if (node.bridge) { x = 0; y = 36; }
      else { x = 0; y = 31; }
      group.append("text")
        .attr("class", `node-label${node.bridge ? " bridge" : ""}`)
        .attr("x", x).attr("y", y).attr("text-anchor", anchor)
        .text(node.label);
      if (node.kind === "pollinator" && !node.bridge) {
        group.append("text").attr("class", "node-role").attr("x", 0).attr("y", y + 15).attr("text-anchor", "middle").text("局部访花者");
      }
      if (node.bridge) {
        const tag = group.append("g").attr("class", "bridge-tag").attr("transform", "translate(0,-34)").attr("aria-hidden", "true");
        tag.append("rect").attr("x", -22).attr("y", -10).attr("width", 44).attr("height", 20).attr("rx", 10);
        tag.append("text").attr("y", 4).text("桥梁");
      }
    });

    nodes.on("click.network", (_, node) => selectEntity(node.id));
    nodes.on("keydown.network", function (event, node) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEntity(node.id);
      }
    });
    nodes.on("focus.network", (_, node) => selectEntity(node.id));

    graph.linksSelection = links;
    graph.nodesSelection = nodes;
    graph.halosSelection = halos;
    updateView(false);
  }

  function updateView(animate) {
    if (!graph) return;
    const duration = animate && !Deck.reduced() ? 220 : 0;
    const selected = state.selected;
    const selectionIsBridge = selected && bridgeIds.has(selected);
    const linkedIds = new Set();
    if (selected) {
      graph.links.forEach(link => {
        const sourceId = entityId(link.source);
        const targetId = entityId(link.target);
        if (sourceId === selected || targetId === selected) {
          linkedIds.add(sourceId);
          linkedIds.add(targetId);
        }
      });
    }

    function linkOpacity(link) {
      const sourceId = entityId(link.source);
      const targetId = entityId(link.target);
      if (selected) return sourceId === selected || targetId === selected ? .92 : .045;
      if (state.view === "bridge") return link.bridge ? .78 : .105;
      return link.bridge ? .70 : .52;
    }

    function nodeOpacity(node) {
      if (selected) return node.id === selected || linkedIds.has(node.id) ? 1 : .20;
      if (state.view === "bridge" && node.kind === "pollinator" && !node.bridge) return .68;
      return 1;
    }

    graph.linksSelection.interrupt().transition().duration(duration).style("opacity", linkOpacity);
    graph.nodesSelection.interrupt().transition().duration(duration).style("opacity", nodeOpacity);
    graph.halosSelection.interrupt().transition().duration(duration)
      .style("opacity", node => selected ? (node.id === selected && selectionIsBridge ? 1 : .10) : .92);

    bridgeViewButton.setAttribute("aria-pressed", state.view === "bridge" ? "true" : "false");
    fullViewButton.setAttribute("aria-pressed", state.view === "full" ? "true" : "false");
    document.querySelectorAll("[data-entity]").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.entity === selected ? "true" : "false");
    });

    if (selected) {
      const record = nodeById.get(selected);
      if (record.kind === "pollinator") {
        const totals = summarizePollinator(selected);
        status.textContent = bridgeIds.has(selected)
          ? `${record.label}：林缘 ${formatVisits(totals.a)}，湿草甸 ${formatVisits(totals.b)}，合计 ${formatVisits(totals.total)}。`
          : `${record.label}：只访问${record.local === "a" ? "林缘" : "湿草甸"}植物，合计 ${formatVisits(totals.total)}。`;
      } else {
        const incoming = CANONICAL_LINKS.filter(link => link.plant === selected);
        const visits = incoming.reduce((sum, link) => sum + link.visits, 0);
        status.textContent = `${record.label}：${record.community === "a" ? "林缘" : "湿草甸"}植物，被 ${incoming.length} 位传粉者访问，共 ${formatVisits(visits)}。`;
      }
    } else if (state.view === "bridge") {
      status.textContent = "桥接证据：2 位传粉者同时连向 A 与 B，共显示 16 条桥接者访花边。";
    } else {
      status.textContent = `完整网络：8 位传粉者、8 种植物、${CANONICAL_LINKS.length} 条访花关系。`;
    }
  }

  function setView(view) {
    state.view = view;
    state.selected = null;
    updateView(true);
  }

  function selectEntity(id) {
    if (!nodeById.has(id)) return;
    state.selected = id;
    updateView(true);
  }

  function resetPage() {
    state.view = "bridge";
    state.selected = null;
    renderGraph();
    status.textContent = "桥接证据：2 位传粉者同时连向 A 与 B，共显示 16 条桥接者访花边。";
  }

  function scheduleResize() {
    if (resizeFrame || destroyed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      renderGraph();
    });
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "1") setView("bridge");
    else if (event.key === "2") setView("full");
    else if (event.key.toLowerCase() === "r") resetPage();
    else if (event.key === "Escape" && state.selected) {
      state.selected = null;
      updateView(true);
    }
  }

  function scrollFallback(event) {
    const page = fallback.clientHeight * .8;
    const amount = { PageDown: page, PageUp: -page, End: fallback.scrollHeight, Home: -fallback.scrollHeight }[event.key];
    if (!amount) return;
    event.preventDefault();
    fallback.scrollBy(0, amount);
  }

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    if (simulation) simulation.stop();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    if (window.d3) d3.select(svgElement).selectAll("*").interrupt().on(".network", null);
    cleanups.splice(0).forEach(cleanup => cleanup());
  }

  renderEvidence();
  populateFallback();
  document.getElementById("recordCount").textContent = `${CANONICAL_NODES.length} 节点 · ${CANONICAL_LINKS.length} 关系`;

  addListener(bridgeViewButton, "click", () => setView("bridge"));
  addListener(fullViewButton, "click", () => setView("full"));
  addListener(resetButton, "click", resetPage);
  addListener(document, "keydown", onKeyDown);
  addListener(fallback, "keydown", scrollFallback);
  addListener(fallback, "wheel", event => { fallback.scrollTop += event.deltaY; }, { passive: true });
  addListener(window, "pagehide", teardown, { once: true });

  if (!window.d3 || typeof d3.forceSimulation !== "function") {
    fallback.hidden = false;
    svgElement.hidden = true;
    status.textContent = "网络渲染器不可用；已显示全部关系的文字表格。";
  } else {
    try {
      renderGraph();
      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (!graph || Math.abs((graph.width || width) - width) > 1 || Math.abs((graph.height || height) - height) > 1) {
          scheduleResize();
        }
      });
      observer.observe(host);
      cleanups.push(() => observer.disconnect());
    } catch (error) {
      console.error("Pollinator network render failed", error);
      fallback.hidden = false;
      svgElement.hidden = true;
      status.textContent = "网络渲染失败；已显示全部关系的文字表格。";
    }
  }

  window.__POLLINATOR_PAGE__ = {
    reset: resetPage,
    setView,
    getState: () => ({ ...state }),
    getLayoutSignature: () => graph ? graph.nodes.map(node => `${node.id}:${node.x.toFixed(3)},${node.y.toFixed(3)}`).join("|") : ""
  };
})();
```
  </file>
</sample>
