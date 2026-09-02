<sample id="lenna-pixel-field" category="generative" variant="full">
  <file path="samples/generative/lenna-pixel-field/pages/index.html">
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Can Data Die? — Pixel Field</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
    :root {
      --stage-w: 1600px;
      --stage-h: 900px;
      --bg: #220619;
      --text: #fff2e8;
      --font-sans: "Liberation Mono", "DejaVu Sans Mono", monospace;
      --pad-x: 110px;
      --grid: #390a29;
      --red: #a64153;
      --green: #79a695;
      --blue: #586fa6;
      --tan: #f2c299;
      --orange: #d96666;
      --focus: #f2c299;
    }

    #stage {
      isolation: isolate;
      background: var(--bg);
      padding: 0 var(--pad-x);
    }

    #field {
      z-index: 0;
      max-width: none;
      cursor: crosshair;
      image-rendering: pixelated;
    }

    h1 {
      position: absolute;
      z-index: 1;
      left: 110px;
      top: 90px;
      width: 400px;
      color: var(--text);
      font: 400 135px/125px var(--font-sans);
      letter-spacing: 0;
      pointer-events: none;
      user-select: none;
    }
  </style>
</head>
<body>
  <main id="stage">
    <canvas id="field" class="cv-fill no-pan" aria-hidden="true"></canvas>
    <h1>CAN<br>DATA<br>DIE?</h1>
  </main>

  <script src="assets/base.js"></script>
  <script>
    (() => {
      "use strict";
      if (!window.Deck) return;

      const W = 1600, H = 900, CELL = 15, GAP = 1;
      const COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
      const COUNT = 75, SPEED = 3, FADE = 0.01;
      const SEED = 0x5a70e912;
      const ORIGIN = Object.freeze({ x: 1500, y: 100 });
      const TITLE_FIELD = Object.freeze({ x: 88, y: 68, w: 444, h: 425 });
      const canvas = document.getElementById("field");
      const grid = document.createElement("canvas");
      const gridCtx = grid.getContext("2d");
      const owner = new Int16Array(COLS * ROWS);
      const palette = ["--red", "--green", "--blue", "--tan", "--orange"]
        .map(Deck.token);
      const events = new AbortController();
      const eventOptions = { signal: events.signal };
      let ctx = Deck.fit(canvas);
      if (!gridCtx || !ctx) return;
      let particles = [], ring = 0, emission = 0;
      let pointer = { x: ORIGIN.x, y: ORIGIN.y };
      let disposed = false, generation = 0;

      grid.width = W;
      grid.height = H;
      gridCtx.fillStyle = Deck.token("--bg");
      gridCtx.fillRect(0, 0, W, H);
      gridCtx.fillStyle = Deck.token("--grid");
      for (let y = 0; y < H; y += CELL) {
        for (let x = 0; x < W; x += CELL) {
          gridCtx.fillRect(x, y, CELL - GAP, CELL - GAP);
        }
      }

      function seededRandom(seed) {
        let state = seed >>> 0;
        return () => {
          state = (state + 0x6d2b79f5) >>> 0;
          let n = state;
          n = Math.imul(n ^ (n >>> 15), n | 1);
          n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
          return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        };
      }

      function resetModel() {
        if (disposed) return "";
        const random = seededRandom(SEED);
        pointer = { x: ORIGIN.x, y: ORIGIN.y };
        ring = 0;
        emission = 0;
        particles = Array.from({ length: COUNT }, (_, i) => {
          const age = COUNT - 1 - i;
          const vx = (random() * 2 - 1) * SPEED;
          const vy = (random() * 2 - 1) * SPEED;
          return {
            x: ORIGIN.x + vx * age,
            y: ORIGIN.y + vy * age,
            vx, vy,
            alpha: Math.max(0, 1 - age * FADE),
            color: palette[i % palette.length]
          };
        });
        generation += 1;
        draw();
        return particles.map(p => `${p.vx.toFixed(5)},${p.vy.toFixed(5)}`).join("|");
      }

      function launch() {
        const p = particles[ring];
        p.x = pointer.x;
        p.y = pointer.y;
        p.alpha = 1;
        ring = (ring + 1) % COUNT;
      }

      function advance(dt) {
        const frames = Math.min(2.5, dt / (1000 / 60));
        emission += frames;
        while (emission >= 1) {
          launch();
          emission -= 1;
        }
        for (const p of particles) {
          p.x += p.vx * frames;
          p.y += p.vy * frames;
          p.alpha = Math.max(0, p.alpha - FADE * frames);
        }
      }

      function titleAttenuation(x, y) {
        const f = TITLE_FIELD;
        return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h ? 0.22 : 1;
      }

      function draw() {
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(grid, 0, 0);
        owner.fill(-1);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.alpha <= 0) continue;
          const gx = Math.floor(p.x / CELL);
          const gy = Math.floor(p.y / CELL);
          if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) owner[gy * COLS + gx] = i;
        }

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const gx = Math.floor(p.x / CELL);
          const gy = Math.floor(p.y / CELL);
          if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS || owner[gy * COLS + gx] !== i) continue;
          ctx.globalAlpha = p.alpha * titleAttenuation(gx * CELL, gy * CELL);
          ctx.fillStyle = p.color;
          ctx.fillRect(gx * CELL, gy * CELL, CELL - GAP, CELL - GAP);
        }
        ctx.globalAlpha = 1;
      }

      function trackPointer(event) {
        if (Deck.reduced()) return;
        const p = Deck.pt(canvas, event);
        pointer.x = Deck.clamp(p.x, 0, W - 1);
        pointer.y = Deck.clamp(p.y, 0, H - 1);
      }

      function resetKey(event) {
        if (!event.repeat && event.key.toLowerCase() === "r") resetModel();
      }

      canvas.addEventListener("pointermove", trackPointer, eventOptions);
      canvas.addEventListener("pointerdown", trackPointer, eventOptions);
      window.addEventListener("keydown", resetKey, eventOptions);
      const offResize = Deck.onResize(() => {
        ctx = Deck.fit(canvas);
        draw();
      });

      resetModel();
      const stop = Deck.loop((_time, dt) => {
        if (dt > 0) advance(dt);
        draw();
      }, { still: 1800 });

      function cleanup() {
        if (disposed) return;
        disposed = true;
        stop();
        offResize();
        events.abort();
        delete window.resetCover;
        delete window.__lennaCover;
      }

      window.resetCover = resetModel;
      window.__lennaCover = {
        reset: resetModel,
        dispose: cleanup,
        state: () => ({ seed: SEED, generation, ring, emission, count: particles.length, disposed })
      };
      window.addEventListener("pagehide", cleanup, { signal: events.signal, once: true });
    })();
  </script>
</body>
</html>
```
  </file>
</sample>
