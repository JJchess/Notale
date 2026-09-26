<sample id="lawn-path" category="general" variant="mini">
  <file path="samples/general/lawn-path/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>草坪路线修复 mini</title>
<link rel="stylesheet" href="assets/base.css">
<style>
:root{
 --bg:#171918;--text:#f2f0e9;--muted:#a9afa9;--line:#414642;
 --focus:#f0df55;
 --font-sans:Arial,"PingFang SC",sans-serif
}
#stage{padding:52px 70px}
h1{font-size:42px}
main{display:grid;grid-template-columns:560px 1fr;gap:76px;padding-top:30px}
.board-wrap{
 position:relative;width:560px;height:560px;background:#40984b
}
#board,.fallback{width:100%;height:100%}
.fallback{display:grid;grid-template-columns:repeat(8,1fr)}
.cell{position:relative;background:#399d46;border:1px solid #287d37}
.cell.mowed{background:#2e7039}
.cell.rock{background:radial-gradient(ellipse at 40% 30%,#91a0b7,#4b5a72 55%,#26344c 60%)}
.cell.player{outline:4px solid var(--focus);outline-offset:-7px}
#mower{
 position:absolute;left:0;top:0;width:42px;height:29px;z-index:3;
 border:3px solid #982244;background:#d84d70;pointer-events:none;
 box-shadow:0 5px 0 #13362266;transition:transform .18s ease
}
#mower:before{
 content:"";position:absolute;left:-19px;top:-17px;width:27px;height:25px;
 border-left:4px solid #f4d456;border-top:4px solid #f4d456;transform:skewY(35deg)
}
.reject{animation:reject .18s ease}
@keyframes reject{50%{transform:translateX(-5px)}}
.side h2{font-size:29px}
.readouts{
 display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:30px;
 padding:19px 0;border-block:1px solid var(--line)
}
.readout b{display:block;margin-top:6px;font-size:34px;font-weight:400}
#status{min-height:50px;margin-top:22px;font-size:17px;line-height:1.45}
.controls{display:flex;gap:28px;margin-top:18px}
.dpad{display:grid;grid-template-columns:repeat(3,50px);gap:7px}
.dpad button{height:50px;border:1px solid #606660;background:#262a27;font-size:22px}
.dpad :first-child{grid-column:2}
.dpad :nth-child(n+2){grid-row:2}
.actions button{height:43px;padding:0 16px;border:1px solid #747a74;background:none}
#assess{border-color:var(--focus);background:var(--focus);color:#202113}
#assess:disabled{opacity:.35}
#result{margin-top:23px;padding-top:17px;border-top:1px solid var(--line);font-size:18px}
#result strong{color:var(--focus);font-size:30px}
@media(prefers-reduced-motion:reduce){#mower{transition:none}.reject{animation:none}}
</style>
</head>
<body><div id="stage">
<header><h1>修好最后五格</h1></header>
<main>
 <section>
  <div class="board-wrap" id="boardWrap">
   <canvas id="board" tabindex="0" role="img" aria-label="8 乘 8 草坪路线修复棋盘"></canvas>
   <div id="fallback" class="fallback" role="img" aria-label="草坪棋盘备用视图" hidden></div>
   <div id="mower" aria-hidden="true"></div>
  </div>
 </section>
 <section class="side">
  <h2>不走回头路，能正好 48 步吗？</h2>
  <div class="readouts">
   <div class="readout"><span>总步数</span><b id="moves"></b></div>
   <div class="readout"><span>还剩</span><b id="left"></b></div>
   <div class="readout"><span>重复边</span><b id="repeats"></b></div>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  <div class="controls">
   <div class="dpad" aria-label="移动控制">
    <button data-key="ArrowUp" aria-label="向上">↑</button>
    <button data-key="ArrowLeft" aria-label="向左">←</button>
    <button data-key="ArrowDown" aria-label="向下">↓</button>
    <button data-key="ArrowRight" aria-label="向右">→</button>
   </div>
   <div class="actions">
    <button id="assess" data-action="assess" disabled>评估路线</button>
    <button data-action="reset">重置</button>
   </div>
  </div>
  <div id="result"></div>
 </section>
</main></div>
<script src="assets/base.js"></script>
<script src="app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/lawn-path/mini/pages/app.js">
```javascript
(() => {
  "use strict";
  const GRID = 8;
  const CELL = 70;
  const ROCKS = [
    [0,7],[1,0],[1,1],[1,2],[1,3],[1,7],[2,0],[2,1],
    [4,2],[5,2],[5,3],[5,4],[6,5],[7,4],[7,5]
  ];
  const FULL_PATH = [
    [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,6],[1,5],[1,4],
    [2,4],[2,5],[2,6],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[7,6],
    [6,6],[5,6],[5,5],[4,5],[4,6],[3,6],[3,5],[3,4],[4,4],[4,3],
    [3,3],[2,3],[2,2],[3,2],[3,1],[3,0],[4,0],[4,1],[5,1],[5,0],
    [6,0],[7,0],[7,1],[6,1],[6,2],[7,2],[7,3],[6,3],[6,4]
  ];
  const STEPS = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0],
    ArrowLeft: [0, -1], ArrowRight: [0, 1]
  };
  const ui = {};
  document.querySelectorAll("[id]").forEach(element => ui[element.id] = element);
  const cellKey = cell => cell.join(",");
  const blocked = new Set(ROCKS.map(cellKey));
  const events = new AbortController();
  let state;
  let canvasFit;
  let fallbackMode = false;

  function edgeKey(first, second) {
    return [cellKey(first), cellKey(second)].sort().join("|");
  }
  function edgeCounts() {
    const counts = new Map();
    for (let index = 1; index < state.path.length; index += 1) {
      const edge = edgeKey(state.path[index - 1], state.path[index]);
      counts.set(edge, (counts.get(edge) || 0) + 1);
    }
    return counts;
  }
  function metrics() {
    const moves = state.path.length - 1;
    return { moves, remaining: 49 - state.visited.size, repeats: moves - edgeCounts().size };
  }
  function freshState() {
    const path = FULL_PATH.slice(0, 44).map(cell => [...cell]);
    return {
      phase: "repair", path, visited: new Set(path.map(cellKey)),
      player: [...path.at(-1)],
      message: "从割草机继续，剩下五格都要割到。"
    };
  }
  function move(name) {
    if (state.phase !== "repair") return;
    const step = STEPS[name];
    const next = [state.player[0] + step[0], state.player[1] + step[1]];
    if (next.some(value => value < 0 || value >= GRID) || blocked.has(cellKey(next))) {
      state.message = "撞到边界或石块，路线不变。";
      ui.boardWrap.classList.add("reject");
    } else {
      state.player = next;
      state.path.push(next);
      state.visited.add(cellKey(next));
      const remaining = metrics().remaining;
      state.message = remaining ? `有效移动。还有 ${remaining} 格未割。`
        : "草坪已覆盖。检查回头路，再评估。";
    }
    render();
  }
  function assess() {
    const value = metrics();
    if (value.remaining || state.phase !== "repair") return;
    state.phase = "result";
    const score = Math.round(48000 / value.moves) / 10;
    ui.result.innerHTML = `<strong>${score}% 效率</strong><br>` +
      `${value.moves} 步，对比 48 步下界；重复无向边 ${value.repeats} 条。`;
    state.message = value.repeats ? "完成了，但回头路让总步数超过下界。"
      : "正好 48 步，没有重复边。路线达到下界。";
    render();
  }
  function reset() {
    state = freshState();
    ui.result.textContent = "";
    ui.boardWrap.classList.remove("reject");
    render();
  }
  function drawBoard(context) {
    for (let row = 0; row < GRID; row += 1) {
      for (let col = 0; col < GRID; col += 1) {
        const x = col * CELL;
        const y = row * CELL;
        context.fillStyle = state.visited.has(`${row},${col}`) ? "#2d7138" : "#3b9e49";
        context.fillRect(x, y, CELL, CELL);
      }
    }
    const counts = edgeCounts();
    for (let index = 1; index < state.path.length; index += 1) {
      const first = state.path[index - 1];
      const second = state.path[index];
      const repeated = counts.get(edgeKey(first, second)) > 1;
      context.strokeStyle = repeated ? "#a82d26"
        : index >= 44 ? "#ef9a31" : "#d8e5d55c";
      context.lineWidth = index >= 44 ? 9 : 4;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(first[1] * CELL + 35, first[0] * CELL + 35);
      context.lineTo(second[1] * CELL + 35, second[0] * CELL + 35);
      context.stroke();
    }
    ROCKS.forEach(([row, col]) => {
      const x = col * CELL + 11;
      const y = row * CELL + 14;
      context.fillStyle = "#65758d";
      Deck.rr(context, x, y, 50, 39, 11);
      context.fill();
      context.fillStyle = "#a2acbd";
      context.fillRect(x + 8, y + 6, 22, 7);
    });
  }
  function drawFallback() {
    Array.from(ui.fallback.children).forEach((cell, index) => {
      const name = `${Math.floor(index / GRID)},${index % GRID}`;
      cell.className = `cell ${blocked.has(name) ? "rock" : ""} ` +
        `${state.visited.has(name) ? "mowed" : ""} ` +
        `${cellKey(state.player) === name ? "player" : ""}`;
    });
  }
  function render() {
    const value = metrics();
    ui.moves.textContent = value.moves;
    ui.left.textContent = value.remaining;
    ui.repeats.textContent = value.repeats;
    ui.status.textContent = state.message;
    ui.assess.disabled = Boolean(value.remaining) || state.phase !== "repair";
    const [row, col] = state.player;
    ui.mower.style.transform = `translate(${col * CELL + 14}px,${row * CELL + 21}px)`;
    fallbackMode ? drawFallback() : canvasFit.redraw();
  }
  function snapshot() {
    return { phase: state.phase, player: [...state.player], ...metrics(), fallback: fallbackMode };
  }
  function dispose() {
    events.abort();
    canvasFit?.stop();
  }

  ui.fallback.innerHTML = '<div class="cell"></div>'.repeat(GRID * GRID);
  state = freshState();
  if (!window.Deck || !ui.board.getContext("2d")) {
    fallbackMode = true;
    ui.board.hidden = true;
    ui.fallback.hidden = false;
  } else {
    canvasFit = Deck.autofit(ui.board, drawBoard);
  }
  document.addEventListener("click", event => {
    const control = event.target.closest("button");
    if (control?.dataset.key) move(control.dataset.key);
    if (control?.dataset.action === "reset") reset();
    if (control?.dataset.action === "assess") assess();
  }, { signal: events.signal });
  document.addEventListener("keydown", event => {
    if (!STEPS[event.key]) return;
    event.preventDefault();
    move(event.key);
  }, { signal: events.signal });
  window.addEventListener("pagehide", dispose, { signal: events.signal });
  window.LawnMini = { reset, dispose, snapshot };
  render();
})();
```
  </file>
</sample>
