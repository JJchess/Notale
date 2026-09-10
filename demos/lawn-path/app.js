(() => {
  "use strict";

  const GRID_SIZE = 8;
  const ART = 512;                 // 美术坐标系。石块/割草机的偏移都按 64px 格子写死，不要动它。
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

  const elements = {
    stage: document.querySelector("#stage"),
    canvas: document.querySelector("#gameCanvas"),
    boardWrap: document.querySelector("#boardWrap"),
    startButton: document.querySelector("#startButton"),
    skipButtons: document.querySelectorAll('[data-action="skip"]'),
    introCanvas: document.querySelector("#introCanvas"),
    boardStatus: document.querySelector("#boardStatus"),
    repeatNote: document.querySelector("#repeatNote"),
    replayButton: document.querySelector("#replayButton"),
    moveValue: document.querySelector("#moveValue"),
    coverageValue: document.querySelector("#coverageValue"),
    progressFill: document.querySelector("#progressFill"),
    instruction: document.querySelector("#instruction"),
    resultsTitle: document.querySelector("#results-title"),
    efficiencyValue: document.querySelector("#efficiencyValue"),
    playerResultCanvas: document.querySelector("#playerResultCanvas"),
    optimalResultCanvas: document.querySelector("#optimalResultCanvas"),
    dpadButtons: document.querySelectorAll(".dpad button"),
  };

  const SCENES = {
    intro: { el: document.querySelector("#sceneIntro"), bits: ".intro-block > *" },
    play: { el: document.querySelector("#scenePlay"), bits: ".play-side > *, .board-wrap" },
    result: { el: document.querySelector("#sceneResult"), bits: ".result-side > *, .comparison figure" },
  };

  const D = Deck.reduced() ? 0 : 1;   // reduced-motion 下所有时长归零，但流程本身不变

  let state;
  let scene = "intro";
  let board = null;                  // Deck.autofit 句柄，进入幕 2 后才建得起来
  let sceneTl = null;
  let resultTween = null;
  let resultFits = null;
  let resultPath = OPTIMAL_PATH;     // 结果幕左图当前画的是哪条路线
  let resultProgress = 0;
  let swipeStart = null;
  let finishTimer = 0;

  function keyFor(row, col) {
    return `${row},${col}`;
  }

  function resetState() {
    state = {
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

  function drawGrassCell(target, row, col, mowed) {
    const x = col * CELL;
    const y = row * CELL;
    const lightShift = ((row * 3 + col * 5) % 4) * 2;
    target.fillStyle = mowed
      ? `rgb(${44 + lightShift}, ${104 + lightShift}, ${52 + lightShift})`
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
      if (!mowed) {
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

  /* 开场预览和游玩中的棋盘是同一张图，只差「谁已经割了」和画不画割草机。
     石块格一律按「不用割」画：亮的格子就等于还没割的格子，不用在石头之间找。 */
  function drawLawn(target, mowed, withMower) {
    target.clearRect(0, 0, ART, ART);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const key = keyFor(row, col);
        drawGrassCell(target, row, col, mowed.has(key) || BLOCKED.has(key));
      }
    }
    ROCKS.forEach(([row, col]) => drawRock(target, row, col));
    if (withMower) drawMower(target, state.player, state.facing);
  }

  function drawResultBase(target) {
    target.clearRect(0, 0, ART, ART);
    target.fillStyle = "#181a19";
    target.fillRect(0, 0, ART, ART);
    target.strokeStyle = "#3a3e3b";
    target.lineWidth = 1;
    target.beginPath();
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      const offset = i * CELL + 0.5;
      target.moveTo(offset, 0);
      target.lineTo(offset, ART);
      target.moveTo(0, offset);
      target.lineTo(ART, offset);
    }
    target.stroke();
    ROCKS.forEach(([row, col]) => drawRock(target, row, col));
  }

  /* 一段路（两个相邻格之间的那一小截）被走了几次。结果图只把重复路段加深，
     不把它冒充为全部低效移动的归因。无向：来回各一次算同一段走了两次。 */
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

  /* 逐段画，而不是一条 polyline。每段的颜色取决于它被走了几次。
     计数只统计已经画出来的部分，于是动画里线走回头路时会当场变深。 */
  function drawPath(target, path, ramp, progress) {
    const finalIndex = Math.max(1, Math.floor((path.length - 1) * progress));
    const counts = edgeCounts(path, finalIndex);
    target.lineWidth = 12;
    target.lineCap = "round";
    target.lineJoin = "round";

    for (let i = 1; i <= finalIndex; i += 1) {
      const times = counts.get(edgeKey(path[i - 1], path[i]));
      target.strokeStyle = ramp[Math.min(times, ramp.length) - 1];
      target.beginPath();
      target.moveTo(...center(path[i - 1]));
      target.lineTo(...center(path[i]));
      target.stroke();
    }

    target.fillStyle = ramp[0];
    target.beginPath();
    target.arc(...center(path[finalIndex]), 9, 0, Math.PI * 2);
    target.fill();
  }

  /* canvas 一律走 Deck.autofit：它按 dpr×舞台缩放采样，缩放比变了自动重新 fit 并重绘。
     绘制前把 ctx 缩到 512 的美术坐标，显示尺寸就完全交给 CSS。
     注意 Deck.fit 读 offsetWidth。元素还 hidden 时量不到尺寸，所以这些句柄都是
     进入对应幕、取消 hidden 之后才建。 */
  function scaled(target, size) {
    target.scale(size / ART, size / ART);
    return target;
  }

  function ensureBoard() {
    if (board) return;
    board = Deck.autofit(elements.canvas, (target, w) => drawLawn(scaled(target, w), state.visited, true));
  }

  function ensureResultFits() {
    if (resultFits) return;
    const player = [Deck.token("player"), Deck.token("player-2"), Deck.token("player-3")];
    const optimal = [Deck.token("optimal")];
    resultFits = [
      [elements.playerResultCanvas, () => resultPath, player],
      [elements.optimalResultCanvas, () => OPTIMAL_PATH, optimal],
    ].map(([canvas, path, ramp]) => Deck.autofit(canvas, (target, w) => {
      drawResultBase(scaled(target, w));
      drawPath(target, path(), ramp, resultProgress);
    }));
  }

  function renderResultFrame(progress) {
    resultProgress = progress;
    resultFits.forEach((fit) => fit.redraw());
  }

  function updateMeta() {
    const moves = state.path.length - 1;
    elements.moveValue.textContent = moves;
    elements.coverageValue.innerHTML =
      `${OPEN_CELLS - state.visited.size}<span class="readout-unit"> 格</span>`;
    elements.progressFill.style.width = `${(state.visited.size / OPEN_CELLS) * 100}%`;
    elements.boardStatus.textContent =
      `第 ${state.player.row + 1} 行第 ${state.player.col + 1} 列，`
      + `还剩 ${OPEN_CELLS - state.visited.size} 格没割，已移动 ${moves} 步。`;
  }

  /* --- 幕切换 ------------------------------------------------------------ */

  /* 谁可见、谁带着动画残留，只由这一个函数说了算。

     不这样写会出事：上一次换幕的收尾（把旧幕 hidden 掉、clearProps）是挂在 onComplete
     上的，异步。用户在 0.5s 动画没播完时再点一下，新一次换幕刚把某一幕放出来，
     上一次的收尾就跟着把它藏回去，实测会出现两幕叠在一起，或者整页全空。
     所以每次进来先把三幕的动画全杀掉、属性全清掉，再重新摆一遍。 */
  function setScene(name) {
    if (name === scene) return;
    const from = SCENES[scene].el;
    const to = SCENES[name];
    scene = name;
    elements.stage.dataset.scene = name;

    if (sceneTl) sceneTl.kill();
    window.clearTimeout(finishTimer);
    Object.keys(SCENES).forEach((key) => {
      const s = SCENES[key];
      const parts = [s.el, ...s.el.querySelectorAll(s.bits)];
      gsap.killTweensOf(parts);
      gsap.set(parts, { clearProps: "opacity,transform" });
      s.el.hidden = s.el !== from && s.el !== to.el;
    });

    // 先可见，才量得到尺寸（Deck.fit 读 offsetWidth）；但同一帧就压到透明，
    // 否则旧幕淡出的这 0.26s 里两幕会以全不透明叠在一起。
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

  /* --- 流程 -------------------------------------------------------------- */

  function startGame() {
    setScene("play");
    elements.canvas.focus({ preventScroll: true });
  }

  function bumpBoard() {
    elements.boardWrap.classList.remove("is-bumped");
    void elements.boardWrap.offsetWidth;
    elements.boardWrap.classList.add("is-bumped");
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
      elements.instruction.textContent = "完成。正在计算你的路线。";
      finishTimer = window.setTimeout(() => showResults(state.path), 420 * D);
    }
  }

  function showResults(playerPath) {
    const moves = playerPath.length - 1;
    const efficiency = Math.round((MIN_MOVES / moves) * 1000) / 10;
    elements.resultsTitle.innerHTML = [
      "去掉草地和石头，这其实是一条由相邻方格组成的路径。",
      `你移动了 <strong>${moves} 步</strong>，最短路线只需要 ${MIN_MOVES} 步。`,
    ].join("");
    elements.efficiencyValue.textContent = `${efficiency}%`;
    const repeats = repeatedSteps(playerPath);
    elements.repeatNote.textContent = repeats
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
    resetState();
    updateMeta();
    elements.instruction.textContent = "用方向键移动。碰到石块不会计步。";
    setScene("play");           // 顺带把棋盘建起来（如果还没建）
    board.redraw();
    elements.canvas.focus({ preventScroll: true });
  }

  /* --- 输入 -------------------------------------------------------------- */

  function onKeyDown(event) {
    const direction = DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();      // 定尺画布不该对方向键有任何滚动反应
    move(direction);
  }

  // 舞台整体被 scale 过，clientX 的差值不是逻辑 px。Deck.pt 换算回来，阈值才与缩放无关。
  function onPointerDown(event) {
    swipeStart = Deck.pt(elements.canvas, event);
    elements.canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event) {
    if (!swipeStart) return;
    const end = Deck.pt(elements.canvas, event);
    const dx = end.x - swipeStart.x;
    const dy = end.y - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    move(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIRECTIONS.ArrowRight : DIRECTIONS.ArrowLeft)
      : (dy > 0 ? DIRECTIONS.ArrowDown : DIRECTIONS.ArrowUp));
  }

  function init() {
    resetState();
    updateMeta();
    Deck.autofit(elements.introCanvas, (target, w) => drawLawn(scaled(target, w), new Set(), false));
    elements.startButton.addEventListener("click", startGame);
    elements.skipButtons.forEach((button) => {
      button.addEventListener("click", () => showResults(SAMPLE_PATH));
    });
    elements.replayButton.addEventListener("click", replay);
    document.addEventListener("keydown", onKeyDown);
    elements.canvas.addEventListener("pointerdown", onPointerDown);
    elements.canvas.addEventListener("pointerup", onPointerUp);
    elements.dpadButtons.forEach((button) => {
      button.addEventListener("click", () => move(DIRECTIONS[button.dataset.direction]));
    });
  }

  init();
})();
