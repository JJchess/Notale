<sample id="lawn-path" category="general" variant="full">
  <file path="samples/general/lawn-path/pages/index.html">
```html
<!doctype html>
<!-- Author-layer 阅读地图。整份约 8,500 token，也可按区间读取。

     HTML 骨架与依赖                   L17-L27  348 字符
     CSS：定尺舞台与开场               L28-L148  2,208 字符
     CSS：游玩幕                       L149-L293  2,134 字符
     CSS：结果幕                       L294-L372  1,195 字符
     HTML：三幕结构                    L373-L470  3,609 字符
     JS：常量与数据                    L471-L568  2,949 字符
     JS：像素美术                      L569-L678  3,389 字符
     JS：canvas 接线                   L679-L793  3,684 字符
     JS：场景机（含打断安全）          L794-L844  1,443 字符
     JS：游戏流程                      L845-L917  2,150 字符
     JS：输入与取消                    L918-L974  1,970 字符
     JS：接线 init                     L975-L994  715 字符
-->
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="一个关于路径效率的互动割草实验。用方向键走遍草坪，再和最短路线比较。"
    />
    <title>草坪上的最短路</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="./assets/base.css" />
<style>
/* base.css 管底盘；这里定义本页 1600×900 视觉。 */

:root {
  color-scheme: dark;

  --bg: #151616;
  --text: #f1f0e9;
  --font-sans: "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;

  --line: #3d413f;
  --muted: #a8aca8;
  --accent: #f0df55;
  --accent-ink: #202113;
  --player: #ef9a31;        /* 走一遍 */
  --player-2: #d1552f;      /* 走两遍 */
  --player-3: #a32a24;      /* 走三遍及以上 */
  --optimal: #77dc78;
  --focus: var(--accent);
  --serif: Georgia, "Songti SC", SimSun, serif;

  --pad: 64px;
}

button {
  border: 0;
  border-radius: 0;
  background: none;
  cursor: pointer;
}

.scene {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: var(--pad);
}

.scene-intro {
  justify-content: center;
}

.intro-block {
  max-width: 1100px;
  text-align: center;
}

h1 {
  margin-bottom: 32px;
  font-family: var(--serif);
  font-size: 88px;
  font-weight: 400;
  letter-spacing: -0.045em;
  line-height: 1.04;
}

.lede {
  max-width: 720px;
  margin: 0 auto;
  color: #c9cbc7;
  font-family: var(--serif);
  font-size: 26px;
  line-height: 1.62;
}

.intro-preview {
  width: 220px;
  height: 220px;
  margin: 44px auto 0;
  opacity: 0.85;
  box-shadow: 0 16px 44px rgb(3 15 7 / 35%);
}

.intro-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  margin-top: 48px;
}

.primary-button {
  min-height: 52px;
  padding: 0 30px;
  background: #f3f2eb;
  color: #202220;
  font-size: 17px;
  font-weight: 850;
  letter-spacing: 0.08em;
  white-space: nowrap;
  box-shadow: 6px 6px 0 rgb(8 26 13 / 32%);
  transition: background 160ms ease, color 160ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.primary-button:hover {
  background: var(--accent);
  color: var(--accent-ink);
}

.primary-button:active {
  transform: translate(3px, 3px);
  box-shadow: 3px 3px 0 rgb(8 26 13 / 32%);
}

.text-button {
  padding: 4px 0;
  border-bottom: 1px solid #737773;
  color: #d7d9d5;
  font-size: 16px;
  font-weight: 750;
  letter-spacing: 0.05em;
  white-space: nowrap;
  transition: border-color 160ms ease, color 160ms ease;
}

.text-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.scene-play,
.scene-result {
  justify-content: center;
  gap: 80px;
}

.play-side,
.result-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.play-side {
  flex: 0 0 520px;
  gap: 36px;
}

.play-side h2 {
  color: var(--accent);
  font-family: var(--serif);
  font-size: 44px;
  font-weight: 400;
  line-height: 1.25;
}

.readouts {
  display: flex;
  gap: 56px;
  width: 100%;
}

.readout {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.readout-label {
  color: var(--muted);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.readout-value,
.efficiency-value {
  font-variant-numeric: tabular-nums;
  font-weight: 300;
  line-height: 1;
}

.readout-value {
  color: var(--text);
  font-size: 60px;
  letter-spacing: -0.02em;
}

.readout-unit {
  color: var(--muted);
  font-size: 22px;
  letter-spacing: 0;
}

.progress {
  width: 100%;
  height: 4px;
  margin-top: 10px;
  background: #2f3331;
}

.progress i {
  display: block;
  width: 2%;
  height: 100%;
  background: var(--accent);
  transition: width 180ms ease-out;
}

.instruction {
  color: #c7cac6;
  font-size: 17px;
  line-height: 1.5;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 60px);
  grid-template-rows: repeat(2, 60px);
  gap: 8px;
}

.dpad button {
  border: 1px solid #555a56;
  background: #252826;
  color: var(--text);
  font-size: 24px;
  transition: background 140ms ease, transform 120ms ease;
}

.dpad button:hover {
  background: #343834;
}

.dpad button:active {
  transform: translateY(1px) scale(0.97);
}

.dpad button[data-direction="ArrowUp"] {
  grid-column: 2;
}

.dpad button[data-direction="ArrowLeft"] {
  grid-column: 1;
  grid-row: 2;
}

.dpad button[data-direction="ArrowDown"] {
  grid-column: 2;
  grid-row: 2;
}

.dpad button[data-direction="ArrowRight"] {
  grid-column: 3;
  grid-row: 2;
}

.board-wrap {
  position: relative;
  flex: 0 0 720px;
  height: 720px;
  background: #40984b;
  box-shadow: 0 26px 80px rgb(3 15 7 / 35%);
}

.board-wrap.is-bumped {
  animation: bump 180ms ease-out;
}

#gameCanvas {
  width: 100%;
  height: 100%;
}

.result-side {
  flex: 0 0 504px;
  gap: 32px;
}

.results-copy {
  font-family: var(--serif);
  font-size: 27px;
  line-height: 1.55;
}

.results-copy strong {
  color: var(--accent);
  font-weight: 400;
}

.efficiency {
  display: flex;
  align-items: baseline;
  gap: 18px;
}

.efficiency-value {
  color: var(--accent);
  font-size: 76px;
  letter-spacing: -0.03em;
}

.takeaway {
  padding-top: 28px;
  border-top: 1px solid var(--line);
}

.takeaway h2 {
  margin-bottom: 14px;
  font-family: var(--serif);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.takeaway p {
  color: #c3c6c1;
  font-family: var(--serif);
  font-size: 18px;
  line-height: 1.6;
}

.comparison {
  display: flex;
  gap: 48px;
}

.comparison figure {
  width: 420px;
}

.comparison figcaption {
  margin-bottom: 14px;
  color: #e6e7e2;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
}

.comparison canvas {
  width: 420px;
  height: 420px;
  border: 1px solid #4d514e;
  background: #181a19;
}

@keyframes bump {
  0%, 100% { transform: translateX(0); }
  35% { transform: translateX(-6px); }
  70% { transform: translateX(5px); }
}
    </style>
  </head>
  <body>
    <div id="stage" data-scene="intro">
      <section class="scene scene-intro" id="sceneIntro">
        <div class="intro-block">
          <h1>你会怎样剪完<br />这块草坪？</h1>
          <p class="lede">
            石块把简单的往返路线打乱了。试着走遍每一格草地，看看你的直觉离最短路径有多远。
          </p>
          <canvas
            class="intro-preview"
            id="introCanvas"
            role="img"
            aria-label="8 乘 8 的草坪，其中 15 格被石块占住，剩下 49 格草地要修剪。"
          ></canvas>

          <div class="intro-actions">
            <button class="primary-button" id="startButton" type="button">开始割草</button>
            <button class="text-button" data-action="skip" type="button">直接看示例</button>
          </div>
        </div>
      </section>

      <section class="scene scene-play" id="scenePlay" aria-labelledby="play-title" hidden>
        <div class="play-side min0">
          <h2 id="play-title">轮到你了。你能多高效？</h2>

          <div class="readouts">
            <div class="readout">
              <span class="readout-label">步数</span>
              <span class="readout-value" id="moveValue">0</span>
            </div>
            <div class="readout">
              <span class="readout-label">还剩</span>
              <span class="readout-value" id="coverageValue">48<span class="readout-unit"> 格</span></span>
              <div class="progress"><i id="progressFill"></i></div>
            </div>
          </div>

          <p class="sr-only" id="boardStatus" aria-live="polite"></p>

          <p class="instruction" id="instruction">用方向键移动。碰到石块不会计步。</p>

          <div class="dpad" aria-label="移动控制">
            <button type="button" data-direction="ArrowUp" aria-label="向上移动">↑</button>
            <button type="button" data-direction="ArrowLeft" aria-label="向左移动">←</button>
            <button type="button" data-direction="ArrowDown" aria-label="向下移动">↓</button>
            <button type="button" data-direction="ArrowRight" aria-label="向右移动">→</button>
          </div>

          <button class="text-button" data-action="skip" type="button">直接看示例</button>
        </div>

        <div class="board-wrap min0" id="boardWrap">
          <canvas
            class="no-pan"
            id="gameCanvas"
            tabindex="0"
            role="img"
            aria-label="8 乘 8 的草坪。使用方向键移动割草机，绕开石块并修剪所有草地。"
          ></canvas>        </div>
      </section>

      <section class="scene scene-result" id="sceneResult" aria-labelledby="results-title" hidden>
        <div class="result-side min0">
          <p class="results-copy" id="results-title"></p>

          <div class="efficiency">
            <span class="readout-label">效率</span>
            <span class="efficiency-value" id="efficiencyValue">0%</span>
          </div>

          <aside class="takeaway">
            <h2>草地消失后，只剩一个图论问题。</h2>
            <p>
              每块草地是一个节点，相邻方格是边。49 个节点至少需要 48 次移动；再次进入割过的格子会拉低效率。
            </p>
          </aside>

          <button class="primary-button" id="replayButton" type="button">再试一次</button>
        </div>

        <div class="comparison min0">
          <figure>
            <figcaption>你的路线<span id="repeatNote"></span></figcaption>
            <canvas id="playerResultCanvas" role="img" aria-label="你的割草路线图"></canvas>
          </figure>
          <figure>
            <figcaption>一条最短路线（48 次移动）</figcaption>
            <canvas id="optimalResultCanvas" role="img" aria-label="48 次移动的最短割草路线图"></canvas>
          </figure>
        </div>
      </section>
    </div>

    <script src="./assets/base.js"></script>
    <script src="./assets/lib/gsap.min.js"></script>
<script>
(() => {
  "use strict";

  const GRID_SIZE = 8;
  const ART = 512;                 // 像素美术固定坐标；每格 64px
  const CELL = ART / GRID_SIZE;
  const START = { row: 0, col: 0 };
  const ROCKS = [
    [0,7],
    [1,0], [1,1], [1,2], [1,3], [1,7],
    [2,0], [2,1],
    [4,2],
    [5,2], [5,3], [5,4],
    [6,5],
    [7,4], [7,5],
  ];
  const BLOCKED = new Set(ROCKS.map(([row, col]) => `${row},${col}`));
  const OPEN_CELLS = GRID_SIZE * GRID_SIZE - BLOCKED.size;
  const MIN_MOVES = OPEN_CELLS - 1;
  const DIRECTIONS = {
    ArrowUp: { row: -1, col: 0, facing: "up" },
    ArrowDown: { row: 1, col: 0, facing: "down" },
    ArrowLeft: { row: 0, col: -1, facing: "left" },
    ArrowRight: { row: 0, col: 1, facing: "right" },
  };
  const OPTIMAL_PATH = [
    [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,6],[1,5],[1,4],
    [2,4],[2,5],[2,6],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[7,6],
    [6,6],[5,6],[5,5],[4,5],[4,6],[3,6],[3,5],[3,4],[4,4],[4,3],
    [3,3],[2,3],[2,2],[3,2],[3,1],[3,0],[4,0],[4,1],[5,1],[5,0],
    [6,0],[7,0],[7,1],[6,1],[6,2],[7,2],[7,3],[6,3],[6,4],
  ].map(([row, col]) => ({ row, col }));

  const SAMPLE_PATH = OPTIMAL_PATH.flatMap((point, index) => {
    const points = [{ ...point }];
    if ([8, 20, 30].includes(index)) {
      points.push({ ...OPTIMAL_PATH[index - 1] }, { ...point });
    }
    return points;
  });

  const byId = (id) => document.getElementById(id);

  const ui = {
    stage: byId("stage"),
    canvas: byId("gameCanvas"),
    boardWrap: byId("boardWrap"),
    startButton: byId("startButton"),
    introCanvas: byId("introCanvas"),
    boardStatus: byId("boardStatus"),
    repeatNote: byId("repeatNote"),
    replayButton: byId("replayButton"),
    moveValue: byId("moveValue"),
    coverageValue: byId("coverageValue"),
    progressFill: byId("progressFill"),
    instruction: byId("instruction"),
    resultsTitle: byId("results-title"),
    efficiencyValue: byId("efficiencyValue"),
    playerResultCanvas: byId("playerResultCanvas"),
    optimalResultCanvas: byId("optimalResultCanvas"),
  };

  const SCENES = {
    intro: { el: byId("sceneIntro"), bits: ".intro-block > *" },
    play: { el: byId("scenePlay"), bits: ".play-side > *, .board-wrap" },
    result: { el: byId("sceneResult"), bits: ".result-side > *, .comparison figure" },
  };

  const D = Deck.reduced() ? 0 : 1;

  let state = createInitialState();
  let scene = "intro";
  let introFit = null;
  let board = null;
  let sceneTl = null;
  let resultTween = null;
  let resultFits = null;
  let resultPath = OPTIMAL_PATH;
  let resultProgress = 0;
  let swipeStart = null;
  let finishTimer = 0;
  const events = new AbortController();

  function keyFor(row, col) {
    return `${row},${col}`;
  }

  function createInitialState() {
    return {
      complete: false,
      player: { ...START },
      facing: "right",
      path: [{ ...START }],
      visited: new Set([keyFor(START.row, START.col)]),
    };
  }

  function hashNoise(x, y, seed = 0) {
    const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 31.17) * 43758.5453;
    return value - Math.floor(value);
  }

  function drawGrassCell(ctx, row, col, mowed) {
    const x = col * CELL;
    const y = row * CELL;
    const lightShift = ((row * 3 + col * 5) % 4) * 2;
    ctx.fillStyle = mowed
      ? `rgb(${44 + lightShift}, ${104 + lightShift}, ${52 + lightShift})`
      : `rgb(${53 + lightShift}, ${151 + lightShift}, ${62 + lightShift})`;
    ctx.fillRect(x, y, CELL, CELL);

    const bladeCount = mowed ? 34 : 88;
    for (let i = 0; i < bladeCount; i += 1) {
      const px = x + Math.floor(hashNoise(i, row * 9 + col, 2) * (CELL - 4));
      const py = y + Math.floor(hashNoise(i, row + col * 13, 7) * (CELL - 6));
      const bright = hashNoise(i, row, col) > 0.47;
      ctx.fillStyle = mowed
        ? (bright ? "rgba(116, 195, 104, .42)" : "rgba(28, 116, 51, .34)")
        : (bright ? "#60d85d" : "#228d42");
      ctx.fillRect(px, py + (mowed ? 2 : 4), 2, mowed ? 2 : 5);
      if (!mowed) {
        ctx.fillRect(px + 2, py + 2, 2, 4);
      }
    }

    if (mowed) {
      ctx.fillStyle = "rgba(18, 82, 35, .1)";
      ctx.fillRect(x, y, 1, CELL);
      ctx.fillRect(x, y, CELL, 1);
    }
  }

  function drawRock(ctx, row, col) {
    const x = col * CELL;
    const y = row * CELL;
    const variant = (row * 7 + col * 3) % 3;
    const inset = variant === 1 ? 10 : 8;
    const top = variant === 2 ? 14 : 11;

    ctx.save();
    ctx.translate(x + inset, y + top);
    ctx.fillStyle = "rgba(22, 58, 38, .4)";
    ctx.fillRect(2, 31, 42, 8);
    ctx.fillStyle = "#3f4d69";
    ctx.fillRect(0, 16, 5, 17);
    ctx.fillRect(5, 8, 7, 29);
    ctx.fillRect(12, 4, 25, 34);
    ctx.fillRect(37, 9, 8, 24);
    ctx.fillRect(8, 34, 31, 6);
    ctx.fillStyle = "#647392";
    ctx.fillRect(9, 8, 25, 5);
    ctx.fillRect(5, 14, 5, 12);
    ctx.fillStyle = "#7f8cac";
    ctx.fillRect(13, 9, variant === 0 ? 12 : 7, 3);
    ctx.fillRect(35, 14, 4, 10);
    ctx.fillStyle = "#34415c";
    ctx.fillRect(12, 35, 24, 4);
    ctx.restore();
  }

  function drawMower(ctx, player, facing) {
    const cx = player.col * CELL + CELL / 2;
    const cy = player.row * CELL + CELL / 2;
    const angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angles[facing]);
    ctx.translate(-30, 0);

    ctx.fillStyle = "rgba(19, 53, 28, .32)";
    ctx.fillRect(8, 21, 48, 7);

    ctx.fillStyle = "#d84d70";
    ctx.fillRect(30, 5, 27, 17);
    ctx.fillRect(25, 9, 34, 10);
    ctx.fillStyle = "#bb2857";
    ctx.fillRect(34, 18, 21, 6);
    ctx.fillStyle = "#263238";
    ctx.fillRect(30, 20, 8, 7);
    ctx.fillRect(51, 19, 8, 8);

    ctx.strokeStyle = "#f4d456";
    ctx.lineWidth = 4;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(28, 10);
    ctx.lineTo(7, -8);
    ctx.lineTo(7, 18);
    ctx.stroke();

    ctx.fillStyle = "#f2b640";
    ctx.fillRect(1, -11, 11, 30);
    ctx.fillStyle = "#ffe36a";
    ctx.fillRect(-1, -22, 14, 14);
    ctx.fillStyle = "#fff08a";
    ctx.fillRect(1, -24, 12, 5);
    ctx.fillStyle = "#e74766";
    ctx.fillRect(10, -3, 8, 5);
    ctx.fillStyle = "#efbe59";
    ctx.fillRect(8, 16, 6, 14);
    ctx.fillStyle = "#243433";
    ctx.fillRect(8, 27, 11, 5);
    ctx.restore();
  }

  /* 石块视为已割；亮格始终表示还没割的草地。 */
  function drawLawn(ctx, mowed, withMower) {
    ctx.clearRect(0, 0, ART, ART);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const key = keyFor(row, col);
        drawGrassCell(ctx, row, col, mowed.has(key) || BLOCKED.has(key));
      }
    }
    ROCKS.forEach(([row, col]) => drawRock(ctx, row, col));
    if (withMower) drawMower(ctx, state.player, state.facing);
  }

  function drawResultBase(ctx) {
    ctx.clearRect(0, 0, ART, ART);
    ctx.fillStyle = "#181a19";
    ctx.fillRect(0, 0, ART, ART);
    ctx.strokeStyle = "#3a3e3b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const offset = i * CELL + 0.5;
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset, ART);
      ctx.moveTo(0, offset);
      ctx.lineTo(ART, offset);
    }
    ctx.stroke();
    ROCKS.forEach(([row, col]) => drawRock(ctx, row, col));
  }

  /* 无向边计数只解释重复路段，不冒充全部低效移动。 */
  function edgeKey(a, b) {
    const one = keyFor(a.row, a.col);
    const two = keyFor(b.row, b.col);
    return one < two ? `${one}|${two}` : `${two}|${one}`;
  }

  function edgeCounts(path, upTo) {
    const counts = new Map();
    for (let i = 1; i <= upTo; i += 1) {
      const key = edgeKey(path[i - 1], path[i]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function repeatedSteps(path) {
    return path.length - 1 - edgeCounts(path, path.length - 1).size;
  }

  const center = (cell) => [cell.col * CELL + CELL / 2, cell.row * CELL + CELL / 2];

  /* 逐段计数和绘制，让回头路在动画中当场变深。 */
  function drawPath(ctx, path, ramp, progress) {
    const finalIndex = Math.max(1, Math.floor((path.length - 1) * progress));
    const counts = edgeCounts(path, finalIndex);
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i <= finalIndex; i += 1) {
      const times = counts.get(edgeKey(path[i - 1], path[i]));
      ctx.strokeStyle = ramp[Math.min(times, ramp.length) - 1];
      ctx.beginPath();
      ctx.moveTo(...center(path[i - 1]));
      ctx.lineTo(...center(path[i]));
      ctx.stroke();
    }

    ctx.fillStyle = ramp[0];
    ctx.beginPath();
    ctx.arc(...center(path[finalIndex]), 9, 0, Math.PI * 2);
    ctx.fill();
  }

  /* autofit 负责 DPR 与舞台缩放；hidden 幕必须先显示，才能读取尺寸。 */
  function scaled(ctx, size) {
    ctx.scale(size / ART, size / ART);
    return ctx;
  }

  function ensureBoard() {
    if (board) return;
    board = Deck.autofit(ui.canvas, (ctx, w) => drawLawn(scaled(ctx, w), state.visited, true));
  }

  function ensureResultFits() {
    if (resultFits) return;
    const player = [Deck.token("player"), Deck.token("player-2"), Deck.token("player-3")];
    const optimal = [Deck.token("optimal")];
    resultFits = [
      [ui.playerResultCanvas, () => resultPath, player],
      [ui.optimalResultCanvas, () => OPTIMAL_PATH, optimal],
    ].map(([canvas, path, ramp]) => Deck.autofit(canvas, (ctx, w) => {
      drawResultBase(scaled(ctx, w));
      drawPath(ctx, path(), ramp, resultProgress);
    }));
  }

  function renderResultFrame(progress) {
    resultProgress = progress;
    resultFits.forEach((fit) => fit.redraw());
  }

  function updateMeta() {
    const moves = state.path.length - 1;
    ui.moveValue.textContent = moves;
    ui.coverageValue.innerHTML =
      `${OPEN_CELLS - state.visited.size}<span class="readout-unit"> 格</span>`;
    ui.progressFill.style.width = `${(state.visited.size / OPEN_CELLS) * 100}%`;
    ui.boardStatus.textContent =
      `第 ${state.player.row + 1} 行第 ${state.player.col + 1} 列，`
      + `还剩 ${OPEN_CELLS - state.visited.size} 格没割，已移动 ${moves} 步。`;
  }

  /* 幕切换：先终止旧幕异步收尾再重排，避免快速操作造成叠幕或空幕。 */
  function setScene(name) {
    if (name === scene) return;
    const from = SCENES[scene].el;
    const to = SCENES[name];
    scene = name;
    ui.stage.dataset.scene = name;

    if (sceneTl) sceneTl.kill();
    if (name !== "result" && resultTween) {
      resultTween.kill();
      resultTween = null;
    }
    window.clearTimeout(finishTimer);
    finishTimer = 0;
    Object.keys(SCENES).forEach((key) => {
      const s = SCENES[key];
      const parts = [s.el, ...s.el.querySelectorAll(s.bits)];
      gsap.killTweensOf(parts);
      gsap.set(parts, { clearProps: "opacity,transform" });
      s.el.hidden = s.el !== from && s.el !== to.el;
    });

    // 先显示以便测量，同一帧置透明以免和旧幕叠加。
    to.el.hidden = false;
    gsap.set(to.el, { opacity: 0 });
    if (name === "play") ensureBoard();
    if (name === "result") ensureResultFits();

    sceneTl = gsap.timeline()
      .to(from, {
        opacity: 0,
        y: -16,
        duration: 0.26 * D,
        ease: "power2.in",
        onComplete: () => {
          from.hidden = true;
          gsap.set(from, { clearProps: "opacity,transform" });
        },
      })
      .to(to.el, { opacity: 1, duration: 0.3 * D }, ">")
      .from(to.el.querySelectorAll(to.bits), {
        y: 24,
        opacity: 0,
        duration: 0.5 * D,
        stagger: 0.07 * D,
        ease: "power3.out",
        clearProps: "opacity,transform",
      }, "<");
  }

  /* --- 流程 */
  function startGame() {
    setScene("play");
    ui.canvas.focus({ preventScroll: true });
  }

  function bumpBoard() {
    ui.boardWrap.classList.remove("is-bumped");
    void ui.boardWrap.offsetWidth;
    ui.boardWrap.classList.add("is-bumped");
  }

  function move(direction) {
    if (state.complete || scene !== "play") return;
    const nextRow = state.player.row + direction.row;
    const nextCol = state.player.col + direction.col;
    const outside = nextRow < 0 || nextCol < 0 || nextRow >= GRID_SIZE || nextCol >= GRID_SIZE;
    if (outside || BLOCKED.has(keyFor(nextRow, nextCol))) {
      bumpBoard();
      return;
    }

    state.player = { row: nextRow, col: nextCol };
    state.facing = direction.facing;
    state.path.push({ ...state.player });
    state.visited.add(keyFor(nextRow, nextCol));
    updateMeta();
    board.redraw();

    if (state.visited.size === OPEN_CELLS) {
      state.complete = true;
      ui.instruction.textContent = "完成。正在计算你的路线。";
      finishTimer = window.setTimeout(() => showResults(state.path), 420 * D);
    }
  }

  function showResults(playerPath) {
    const moves = playerPath.length - 1;
    const efficiency = Math.round((MIN_MOVES / moves) * 1000) / 10;
    ui.resultsTitle.innerHTML = [
      "去掉草地和石头，这其实是一条由相邻方格组成的路径。",
      `你移动了 <strong>${moves} 步</strong>，最短路线只需要 ${MIN_MOVES} 步。`,
    ].join("");
    ui.efficiencyValue.textContent = `${efficiency}%`;
    const repeats = repeatedSteps(playerPath);
    ui.repeatNote.textContent = repeats
      ? `　深色 = 同一路段被重复经过，共 ${repeats} 次`
      : "　没有重复";

    resultPath = playerPath;
    resultProgress = 0;
    setScene("result");

    const p = { v: 0 };
    if (resultTween) resultTween.kill();
    resultTween = gsap.to(p, {
      v: 1,
      duration: 1.25 * D,
      ease: "power3.out",
      onUpdate: () => renderResultFrame(p.v),
      onComplete: () => renderResultFrame(1),
    });
  }

  function replay() {
    state = createInitialState();
    updateMeta();
    ui.instruction.textContent = "用方向键移动。碰到石块不会计步。";
    setScene("play");
    board.redraw();
    ui.canvas.focus({ preventScroll: true });
  }

  /* --- 输入 */
  function onKeyDown(event) {
    const direction = DIRECTIONS[event.key];
    const active = document.activeElement;
    if (!direction || scene !== "play"
      || (active !== ui.canvas && !active?.closest(".dpad"))) return;
    event.preventDefault();
    move(direction);
  }

  // Deck.pt 把缩放后的指针坐标还原到 1600×900 舞台。
  function onPointerDown(event) {
    if (swipeStart) return;
    swipeStart = { ...Deck.pt(ui.canvas, event), id: event.pointerId };
    ui.canvas.setPointerCapture?.(event.pointerId);
    ui.canvas.focus({ preventScroll: true });
  }

  function onPointerUp(event) {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const end = Deck.pt(ui.canvas, event);
    const start = swipeStart;
    cancelSwipe(event);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    move(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIRECTIONS.ArrowRight : DIRECTIONS.ArrowLeft)
      : (dy > 0 ? DIRECTIONS.ArrowDown : DIRECTIONS.ArrowUp));
  }

  function cancelSwipe(event) {
    if (!swipeStart || event.pointerId !== swipeStart.id) return;
    if (ui.canvas.hasPointerCapture?.(event.pointerId)) {
      ui.canvas.releasePointerCapture(event.pointerId);
    }
    swipeStart = null;
  }

  function onClick(event) {
    const button = event.target.closest("button");
    if (!button || !ui.stage.contains(button)) return;
    if (button === ui.startButton) startGame();
    else if (button === ui.replayButton) replay();
    else if (button.dataset.action === "skip") showResults(SAMPLE_PATH);
    else if (button.dataset.direction) move(DIRECTIONS[button.dataset.direction]);
  }

  function destroy() {
    window.clearTimeout(finishTimer);
    sceneTl?.kill();
    resultTween?.kill();
    [introFit, board, ...(resultFits || [])].forEach((fit) => fit?.stop());
    if (swipeStart) cancelSwipe({ pointerId: swipeStart.id });
    events.abort();
  }

  function init() {
    updateMeta();
    introFit = Deck.autofit(ui.introCanvas,
      (ctx, w) => drawLawn(scaled(ctx, w), new Set(), false));
    const options = { signal: events.signal };
    ui.stage.addEventListener("click", onClick, options);
    document.addEventListener("keydown", onKeyDown, options);
    ui.canvas.addEventListener("pointerdown", onPointerDown, options);
    ui.canvas.addEventListener("pointerup", onPointerUp, options);
    for (const type of ["pointercancel", "lostpointercapture"]) {
      ui.canvas.addEventListener(type, cancelSwipe, options);
    }
    window.addEventListener("pagehide", destroy, { ...options, once: true });
  }

  init();
})();
    </script>
  </body>
</html>
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/lib/gsap.min.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
