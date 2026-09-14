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
