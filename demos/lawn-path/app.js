(() => {
  "use strict";

  const GRID_SIZE = 8;
  const BOARD_SIZE = 512;
  const CELL = BOARD_SIZE / GRID_SIZE;
  const START = { row: 0, col: 0 };
  const BLOCKED = new Set([
    "0,7",
    "1,0", "1,1", "1,2", "1,3", "1,7",
    "2,0", "2,1",
    "4,2",
    "5,2", "5,3", "5,4",
    "6,5",
    "7,4", "7,5",
  ]);
  const OPEN_CELLS = GRID_SIZE * GRID_SIZE - BLOCKED.size;
  const DIRECTIONS = {
    ArrowUp: { row: -1, col: 0, facing: "up" },
    ArrowDown: { row: 1, col: 0, facing: "down" },
    ArrowLeft: { row: 0, col: -1, facing: "left" },
    ArrowRight: { row: 0, col: 1, facing: "right" },
  };
  const BUTTON_DIRECTIONS = {
    up: DIRECTIONS.ArrowUp,
    down: DIRECTIONS.ArrowDown,
    left: DIRECTIONS.ArrowLeft,
    right: DIRECTIONS.ArrowRight,
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

  const elements = {
    canvas: document.querySelector("#gameCanvas"),
    boardWrap: document.querySelector("#boardWrap"),
    startLayer: document.querySelector("#startLayer"),
    startButton: document.querySelector("#startButton"),
    skipButton: document.querySelector("#skipButton"),
    replayButton: document.querySelector("#replayButton"),
    moveLabel: document.querySelector("#moveLabel"),
    coverageLabel: document.querySelector("#coverageLabel"),
    instruction: document.querySelector("#instruction"),
    results: document.querySelector("#results"),
    resultsTitle: document.querySelector("#results-title"),
    playerResultCanvas: document.querySelector("#playerResultCanvas"),
    optimalResultCanvas: document.querySelector("#optimalResultCanvas"),
    canvasError: document.querySelector("#canvasError"),
    dpadButtons: document.querySelectorAll(".dpad button"),
  };

  let ctx;
  let state;
  let swipeStart = null;
  let resultAnimationFrame = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function keyFor(row, col) {
    return `${row},${col}`;
  }

  function resetState() {
    state = {
      started: false,
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

  function drawGrassCell(target, row, col, mowed, emptyBoard = false) {
    const x = col * CELL;
    const y = row * CELL;
    const lightShift = ((row * 3 + col * 5) % 4) * 2;
    target.fillStyle = mowed
      ? `rgb(${66 + lightShift}, ${143 + lightShift}, ${73 + lightShift})`
      : `rgb(${53 + lightShift}, ${151 + lightShift}, ${62 + lightShift})`;
    target.fillRect(x, y, CELL, CELL);

    const bladeCount = mowed ? 34 : 88;
    for (let i = 0; i < bladeCount; i += 1) {
      const px = x + Math.floor(hashNoise(i, row * 9 + col, 2) * (CELL - 4));
      const py = y + Math.floor(hashNoise(i, row + col * 13, 7) * (CELL - 6));
      const bright = hashNoise(i, row, col) > 0.47;
      target.fillStyle = mowed
        ? (bright ? "rgba(116, 195, 104, .42)" : "rgba(28, 116, 51, .34)")
        : (bright ? "#60d85d" : "#228d42");
      target.fillRect(px, py + (mowed ? 2 : 4), 2, mowed ? 2 : 5);
      if (!mowed && !emptyBoard) {
        target.fillRect(px + 2, py + 2, 2, 4);
      }
    }

    if (mowed) {
      target.fillStyle = "rgba(18, 82, 35, .1)";
      target.fillRect(x, y, 1, CELL);
      target.fillRect(x, y, CELL, 1);
    }
  }

  function drawRock(target, row, col) {
    const x = col * CELL;
    const y = row * CELL;
    const variant = (row * 7 + col * 3) % 3;
    const inset = variant === 1 ? 10 : 8;
    const top = variant === 2 ? 14 : 11;

    target.save();
    target.translate(x + inset, y + top);
    target.fillStyle = "rgba(22, 58, 38, .4)";
    target.fillRect(2, 31, 42, 8);
    target.fillStyle = "#3f4d69";
    target.fillRect(0, 16, 5, 17);
    target.fillRect(5, 8, 7, 29);
    target.fillRect(12, 4, 25, 34);
    target.fillRect(37, 9, 8, 24);
    target.fillRect(8, 34, 31, 6);
    target.fillStyle = "#647392";
    target.fillRect(9, 8, 25, 5);
    target.fillRect(5, 14, 5, 12);
    target.fillStyle = "#7f8cac";
    target.fillRect(13, 9, variant === 0 ? 12 : 7, 3);
    target.fillRect(35, 14, 4, 10);
    target.fillStyle = "#34415c";
    target.fillRect(12, 35, 24, 4);
    target.restore();
  }

  function drawMower(target, player, facing) {
    const cx = player.col * CELL + CELL / 2;
    const cy = player.row * CELL + CELL / 2;
    const angles = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

    target.save();
    target.translate(cx, cy);
    target.rotate(angles[facing]);
    target.translate(-30, 0);

    target.fillStyle = "rgba(19, 53, 28, .32)";
    target.fillRect(8, 21, 48, 7);

    target.fillStyle = "#d84d70";
    target.fillRect(30, 5, 27, 17);
    target.fillRect(25, 9, 34, 10);
    target.fillStyle = "#bb2857";
    target.fillRect(34, 18, 21, 6);
    target.fillStyle = "#263238";
    target.fillRect(30, 20, 8, 7);
    target.fillRect(51, 19, 8, 8);

    target.strokeStyle = "#f4d456";
    target.lineWidth = 4;
    target.lineCap = "square";
    target.beginPath();
    target.moveTo(28, 10);
    target.lineTo(7, -8);
    target.lineTo(7, 18);
    target.stroke();

    target.fillStyle = "#f2b640";
    target.fillRect(1, -11, 11, 30);
    target.fillStyle = "#ffe36a";
    target.fillRect(-1, -22, 14, 14);
    target.fillStyle = "#fff08a";
    target.fillRect(1, -24, 12, 5);
    target.fillStyle = "#e74766";
    target.fillRect(10, -3, 8, 5);
    target.fillStyle = "#efbe59";
    target.fillRect(8, 16, 6, 14);
    target.fillStyle = "#243433";
    target.fillRect(8, 27, 11, 5);
    target.restore();
  }

  function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const mowed = state.started && state.visited.has(keyFor(row, col));
        drawGrassCell(ctx, row, col, mowed, !state.started);
      }
    }

    if (!state.started) return;
    BLOCKED.forEach((key) => {
      const [row, col] = key.split(",").map(Number);
      drawRock(ctx, row, col);
    });
    drawMower(ctx, state.player, state.facing);
  }

  function updateMeta() {
    elements.moveLabel.textContent = `第 ${state.path.length} 步`;
    elements.coverageLabel.textContent = `已修剪 ${state.visited.size} / ${OPEN_CELLS} 格`;
  }

  function startGame() {
    if (state.started) return;
    state.started = true;
    elements.startLayer.hidden = true;
    elements.instruction.textContent = "使用方向键移动。碰到石块不会计步。";
    drawBoard();
    elements.canvas.focus({ preventScroll: true });
  }

  function bumpBoard() {
    elements.boardWrap.classList.remove("is-bumped");
    void elements.boardWrap.offsetWidth;
    elements.boardWrap.classList.add("is-bumped");
  }

  function move(direction) {
    if (!state.started || state.complete) return;
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
    drawBoard();

    if (state.visited.size === OPEN_CELLS) {
      state.complete = true;
      elements.instruction.textContent = "完成。正在计算你的路线。";
      window.setTimeout(() => showResults(state.path), reduceMotion.matches ? 0 : 420);
    }
  }

  function drawResultBase(target) {
    target.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    target.fillStyle = "#181a19";
    target.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    target.strokeStyle = "#3a3e3b";
    target.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const offset = i * CELL + 0.5;
      target.beginPath();
      target.moveTo(offset, 0);
      target.lineTo(offset, BOARD_SIZE);
      target.stroke();
      target.beginPath();
      target.moveTo(0, offset);
      target.lineTo(BOARD_SIZE, offset);
      target.stroke();
    }
    BLOCKED.forEach((key) => {
      const [row, col] = key.split(",").map(Number);
      drawRock(target, row, col);
    });
  }

  function drawPath(target, path, color, progress = 1) {
    const finalIndex = Math.max(1, Math.floor((path.length - 1) * progress));
    target.strokeStyle = color;
    target.lineWidth = 12;
    target.lineCap = "round";
    target.lineJoin = "round";
    target.beginPath();
    target.moveTo(path[0].col * CELL + CELL / 2, path[0].row * CELL + CELL / 2);
    for (let i = 1; i <= finalIndex; i += 1) {
      target.lineTo(path[i].col * CELL + CELL / 2, path[i].row * CELL + CELL / 2);
    }
    target.stroke();

    const end = path[finalIndex];
    target.fillStyle = color;
    target.beginPath();
    target.arc(end.col * CELL + CELL / 2, end.row * CELL + CELL / 2, 9, 0, Math.PI * 2);
    target.fill();
  }

  function renderResultFrame(playerPath, progress) {
    const playerCtx = elements.playerResultCanvas.getContext("2d");
    const optimalCtx = elements.optimalResultCanvas.getContext("2d");
    drawResultBase(playerCtx);
    drawResultBase(optimalCtx);
    drawPath(playerCtx, playerPath, "#ef9a31", progress);
    drawPath(optimalCtx, OPTIMAL_PATH, "#77dc78", progress);
  }

  function animateResults(playerPath) {
    window.cancelAnimationFrame(resultAnimationFrame);
    if (reduceMotion.matches) {
      renderResultFrame(playerPath, 1);
      return;
    }

    const start = performance.now();
    const duration = 1250;
    const frame = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      renderResultFrame(playerPath, eased);
      if (raw < 1) resultAnimationFrame = window.requestAnimationFrame(frame);
    };
    resultAnimationFrame = window.requestAnimationFrame(frame);
  }

  function showResults(playerPath) {
    const efficiency = Math.round((OPEN_CELLS / playerPath.length) * 1000) / 10;
    elements.resultsTitle.innerHTML = [
      "去掉草地和石头，这其实是一条由相邻方格组成的路径。",
      `你用了 <strong>${playerPath.length} 步</strong>，最短路线只需要 ${OPEN_CELLS} 步。`,
      `你的效率是 <strong>${efficiency}%</strong>。`,
    ].join("");
    elements.results.hidden = false;
    animateResults(playerPath);
    elements.results.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  }

  function replay() {
    window.cancelAnimationFrame(resultAnimationFrame);
    resetState();
    elements.results.hidden = true;
    elements.startLayer.hidden = false;
    elements.instruction.textContent = "使用方向键移动。碰到石块不会计步。";
    updateMeta();
    drawBoard();
    elements.boardWrap.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    elements.startButton.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (!DIRECTIONS[event.key]) return;
    if (state.started && !state.complete) event.preventDefault();
    move(DIRECTIONS[event.key]);
  }

  function onPointerDown(event) {
    swipeStart = { x: event.clientX, y: event.clientY };
    elements.canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event) {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIRECTIONS.ArrowRight : DIRECTIONS.ArrowLeft)
      : (dy > 0 ? DIRECTIONS.ArrowDown : DIRECTIONS.ArrowUp));
  }

  function init() {
    try {
      ctx = elements.canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
    } catch (error) {
      elements.canvasError.hidden = false;
      elements.startLayer.hidden = true;
      console.error(error);
      return;
    }

    resetState();
    updateMeta();
    drawBoard();
    elements.startButton.addEventListener("click", startGame);
    elements.skipButton.addEventListener("click", () => showResults(SAMPLE_PATH));
    elements.replayButton.addEventListener("click", replay);
    document.addEventListener("keydown", onKeyDown);
    elements.canvas.addEventListener("pointerdown", onPointerDown);
    elements.canvas.addEventListener("pointerup", onPointerUp);
    elements.dpadButtons.forEach((button) => {
      button.addEventListener("click", () => move(BUTTON_DIRECTIONS[button.dataset.direction]));
    });
  }

  init();
})();
