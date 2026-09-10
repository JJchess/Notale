<sample id="neuron-to-formula" category="general" variant="full">
  <file path="samples/general/neuron-to-formula/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="assets/base.css">
  <title>一颗神经元，可以写成一行计算</title>
  <style>
    :root {
      --bg:#dbe2dd;
      --text:#15231f;
      --muted:#60716b;
      --rule:#9eada7;
      --signal:#d84836;
      --parameter:#99631a;
      --paper:#e7ece8;
      --focus:#b42f20;
      --font-sans:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;
      --font-math:"Times New Roman","STIX Two Math",serif;
    }

    #stage { isolation:isolate; }

    #stage::before {
      content:"";
      position:absolute;
      inset:0;
      z-index:-1;
      background:linear-gradient(180deg,rgba(255,255,255,.13),transparent 38%);
      pointer-events:none;
    }

    .masthead {
      position:absolute;
      inset:42px 70px auto;
      display:grid;
      grid-template-columns:780px 1fr;
      align-items:end;
      gap:60px;
    }

    h1 {
      max-width:760px;
      font-size:52px;
      line-height:1.08;
      letter-spacing:-.045em;
      font-weight:720;
    }

    .claim {
      margin-top:12px;
      max-width:630px;
      color:var(--muted);
      font-size:17px;
      line-height:1.55;
    }

    .formula {
      justify-self:end;
      padding-bottom:4px;
      color:rgba(21,35,31,.34);
      font:48px/1 var(--font-math);
      letter-spacing:.01em;
      white-space:nowrap;
    }

    .formula span { transition:color .25s ease,opacity .25s ease; }
    .formula [data-ready="true"] { color:var(--text); }
    .formula [data-current="true"] { color:var(--signal); }
    .formula [data-kind="parameter"][data-current="true"] { color:var(--parameter); }

    .evidence {
      position:absolute;
      inset:154px 68px auto;
      height:552px;
    }

    #visual { width:100%; height:100%; }

    .renderer-fallback {
      height:100%;
      padding:54px 68px;
      border-top:1px solid var(--rule);
      border-bottom:1px solid var(--rule);
      background:rgba(231,236,232,.72);
    }

    .renderer-fallback h2 { font-size:29px; line-height:1.15; }
    .renderer-fallback p { margin-top:12px; font:31px/1.2 var(--font-math); }
    .renderer-fallback ol {
      margin-top:28px;
      padding-left:24px;
      columns:2;
      column-gap:72px;
      color:var(--muted);
      font-size:17px;
      line-height:1.55;
    }
    .renderer-fallback li { margin-bottom:9px; break-inside:avoid; }

    .controller {
      position:absolute;
      inset:720px 68px auto;
      height:142px;
      border-top:1px solid rgba(21,35,31,.24);
      display:grid;
      grid-template-columns:470px 1fr;
      gap:54px;
      padding-top:22px;
    }

    .explanation { min-width:0; }

    .state-name {
      color:var(--signal);
      font-size:28px;
      line-height:1.1;
      font-weight:720;
      letter-spacing:-.025em;
    }

    .state-copy {
      margin-top:8px;
      max-width:450px;
      color:var(--text);
      font-size:17px;
      line-height:1.5;
    }

    .sequence {
      display:grid;
      grid-template-columns:1fr auto;
      align-content:start;
      gap:20px 28px;
    }

    .beats {
      position:relative;
      display:grid;
      grid-template-columns:repeat(7,1fr);
      gap:0;
    }

    .beats::before {
      content:"";
      position:absolute;
      left:7px;
      right:7px;
      top:31px;
      height:1px;
      background:var(--rule);
    }

    .beat {
      position:relative;
      min-width:0;
      padding:0 2px 28px;
      border:0;
      background:none;
      color:var(--muted);
      font-size:14px;
      cursor:pointer;
    }

    .beat::after {
      content:"";
      position:absolute;
      left:50%;
      bottom:22px;
      width:7px;
      height:7px;
      border:1px solid var(--muted);
      border-radius:50%;
      background:var(--bg);
      transform:translateX(-50%);
      transition:background .2s ease,border-color .2s ease,transform .2s ease;
    }

    .beat:hover { color:var(--text); }

    .beat[aria-current="step"] {
      color:var(--text);
      font-weight:700;
    }

    .beat[aria-current="step"]::after {
      border-color:var(--signal);
      background:var(--signal);
      transform:translateX(-50%) scale(1.28);
    }

    .actions {
      display:flex;
      align-items:flex-start;
      gap:18px;
    }

    .action {
      min-width:84px;
      padding:8px 0 7px;
      border:0;
      border-bottom:1px solid var(--text);
      background:none;
      color:var(--text);
      font-size:14px;
      cursor:pointer;
    }

    .action:hover { color:var(--signal); border-color:var(--signal); }
    .action:active { transform:translateY(1px); }
    .action:disabled { opacity:.45; cursor:default; }

    .readout {
      grid-column:1 / -1;
      display:flex;
      align-items:center;
      justify-content:space-between;
      color:var(--muted);
      font-size:12px;
      letter-spacing:.02em;
    }

    .readout output {
      color:var(--text);
      font-variant-numeric:tabular-nums;
    }

    @media (prefers-reduced-motion:reduce) {
      .formula span,.beat::after { transition:none; }
    }
  </style>
</head>
<body>
  <main id="stage">
    <header class="masthead">
      <div>
        <h1>一颗神经元，可以写成一行计算</h1>
        <p class="claim">树突带入 x，突触留下 w，胞体求和，轴突按 σ 输出 a。</p>
      </div>
      <p class="formula" aria-label="a 等于 sigma 作用于 x i 乘 w i 的和加 b">
        <span data-part="output">a</span> =
        <span data-part="activation">σ</span>(<span data-part="sum">Σ</span>
        <span data-part="input">xᵢ</span><span data-part="weight" data-kind="parameter">wᵢ</span> +
        <span data-part="bias" data-kind="parameter">b</span>)
      </p>
    </header>

    <figure class="evidence" aria-labelledby="state-name" aria-describedby="state-copy">
      <canvas id="visual" role="img" aria-label="同一颗神经元连续变形：五条树突成为输入，突触成为权重，胞体成为求和与偏置，轴突小丘成为激活函数，轴突成为输出。"></canvas>
      <section class="renderer-fallback" id="renderer-fallback" hidden>
        <h2>从神经元到公式，对应关系不变</h2>
        <p>a = σ(Σ xᵢwᵢ + b)</p>
        <ol>
          <li>五条树突对应五个输入 xᵢ。</li>
          <li>突触强弱对应权重 wᵢ。</li>
          <li>胞体对应加权求和 Σ。</li>
          <li>发放阈值对应偏置 b。</li>
          <li>轴突小丘对应激活函数 σ。</li>
          <li>轴突送出的信号对应输出 a。</li>
        </ol>
      </section>
    </figure>

    <section class="controller" aria-label="推导控制">
      <div class="explanation" aria-live="polite">
        <h2 class="state-name" id="state-name">生物结构</h2>
        <p class="state-copy" id="state-copy">树突接收信号，胞体整合，轴突送出脉冲。</p>
      </div>

      <div class="sequence">
        <nav class="beats" aria-label="直接查看推导状态">
          <button class="beat" data-progress="0">神经元</button>
          <button class="beat" data-progress="0.16">输入</button>
          <button class="beat" data-progress="0.32">权重</button>
          <button class="beat" data-progress="0.49">求和</button>
          <button class="beat" data-progress="0.64">偏置</button>
          <button class="beat" data-progress="0.79">激活</button>
          <button class="beat" data-progress="1">公式</button>
        </nav>
        <div class="actions">
          <button class="action" id="reset" type="button">复位</button>
          <button class="action" id="play" type="button">播放推导</button>
        </div>
        <div class="readout">
          <output id="progress" aria-label="推导进度">0%</output>
        </div>
      </div>
    </section>
  </main>

  <script src="assets/base.js"></script>
  <script src="visual.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/general/neuron-to-formula/pages/visual.js">
```javascript
(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const [canvas, stateName, stateCopy, progressOut, playButton, resetButton] =
    ['visual', 'state-name', 'state-copy', 'progress', 'play', 'reset'].map(byId);
  const beatButtons = Array.from(document.querySelectorAll('.beat'));
  const beatPositions = beatButtons.map(button => Number(button.dataset.progress));
  const formulaParts = Array.from(document.querySelectorAll('[data-part]'));
  const rendererFallback = byId('renderer-fallback');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const removers = [];

  const W = 1464;
  const H = 552;
  const CX = 586;
  const CY = 274;
  const SOMA_R = 44;
  const AX = 981;
  const ACT_R = 36;
  const INPUT_X = 132;
  const OUTPUT_X = 1296;
  const INPUT_Y = [116, 195, 274, 353, 432];
  const HIDDEN_Y = [116, 274, 432];
  const TAU = Math.PI * 2;
  const colors = {};

  const segments = [
    [0, .34], [.1, .43], [.25, .58], [.38, .7], [.52, .86], [.68, 1]
  ];

  const beats = [
    { at:0, name:'生物结构', copy:'树突接收信号，胞体整合，轴突送出脉冲。', part:null },
    { at:.13, name:'输入 xᵢ', copy:'每条主树突收束为一个输入量 xᵢ。', part:'input' },
    { at:.29, name:'权重 wᵢ', copy:'突触强弱保留为权重 wᵢ，决定每路输入的影响。', part:'weight' },
    { at:.46, name:'求和 Σ', copy:'胞体把五路 xᵢwᵢ 相加。', part:'sum' },
    { at:.61, name:'偏置 b', copy:'发放阈值写成偏置 b，与加权和相加。', part:'bias' },
    { at:.76, name:'激活 σ', copy:'轴突小丘按激活函数 σ 决定输出强度。', part:'activation' },
    { at:.92, name:'输出 a', copy:'送往下一层。', part:'output' }
  ];
  const readyAt = Object.fromEntries(beats.filter(beat => beat.part).map(beat => [beat.part, beat.at]));

  const scene = {
    trunks:[], branches:[], weights:[], organelles:[], terminals:[],
    somaBio:[], somaMath:[], preBio:[], preMath:[], axonBio:[], axonMath:[]
  };

  const state = {
    progress:0,
    raf:0,
    running:false,
    paused:false,
    disposed:false
  };

  function showRendererFallback() {
    state.disposed = true;
    canvas.hidden = true;
    rendererFallback.hidden = false;
    stateName.textContent = '公式对应关系';
    stateCopy.textContent = '树突、突触、胞体、轴突小丘与轴突，依次对应 xᵢ、wᵢ、Σ + b、σ 与 a。';
    progressOut.value = '100%';
    progressOut.textContent = '100%';
    beatButtons.forEach(button => { button.disabled = true; });
    formulaParts.forEach(part => {
      part.dataset.ready = 'true';
      part.dataset.current = 'false';
    });
    playButton.disabled = true;
    resetButton.disabled = true;
    document.getElementById('stage').dataset.renderer = 'fallback';

    function fitFallback() {
      const scale = Math.min(innerWidth / 1600, innerHeight / 900);
      document.documentElement.style.setProperty('--s', scale > 0 ? scale : 1);
    }
    fitFallback();
    addEventListener('resize', fitFallback);
    addEventListener('pagehide', () => {
      removeEventListener('resize', fitFallback);
      document.getElementById('stage').dataset.renderer = 'disposed';
    }, { once:true });
  }

  const context = canvas.getContext && canvas.getContext('2d');
  if (!window.Deck || !context) {
    showRendererFallback();
    return;
  }

  const clamp = value => Deck.clamp(value, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const mixPoint = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const morph = (a, b, t) => a.map((point, index) => mixPoint(point, b[index], t));
  const rgba = (rgb, alpha) => `rgba(${rgb.join(',')},${alpha})`;

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const randomSource = mulberry32(20250815);
  const random = (min=0, max=1) => lerp(min, max, randomSource());

  function span(a, b, count) {
    return Array.from({ length:count }, (_, index) => mixPoint(a, b, index / (count - 1)));
  }

  function curve(a, b, bend, count) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    const control = [(a[0] + b[0]) / 2 - dy / length * bend, (a[1] + b[1]) / 2 + dx / length * bend];
    return Array.from({ length:count }, (_, index) => {
      const t = index / (count - 1);
      const u = 1 - t;
      return [
        u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * control[1] + t * t * b[1]
      ];
    });
  }

  function buildScene() {
    const trunkSpecs = [
      { angle:4, end:[204,83], bend:-54, branches:6 },
      { angle:3.46, end:[124,170], bend:-20, branches:7 },
      { angle:3.14, end:[90,266], bend:28, branches:6 },
      { angle:2.8, end:[140,382], bend:18, branches:7 },
      { angle:2.3, end:[214,464], bend:48, branches:6 }
    ];
    let branchNumber = 0;

    trunkSpecs.forEach((spec, index) => {
      const root = [CX + Math.cos(spec.angle) * 59, CY + Math.sin(spec.angle) * 59];
      const biological = curve(root, spec.end, spec.bend, 16);
      const dx = INPUT_X - CX;
      const dy = INPUT_Y[index] - CY;
      const length = Math.hypot(dx, dy);
      const mathematical = span([CX + dx / length * SOMA_R, CY + dy / length * SOMA_R], [INPUT_X, INPUT_Y[index]], 16);
      scene.trunks.push({ biological, mathematical });
      scene.weights.push({ biological:biological[10], mathematical:mathematical[10] });

      for (let branch = 0; branch < spec.branches; branch += 1) {
        const pointIndex = 3 + Math.round(branch * 9 / (spec.branches - 1));
        const origin = biological[pointIndex];
        const before = biological[pointIndex - 1];
        const after = biological[pointIndex + 1];
        const angle = Math.atan2(after[1] - before[1], after[0] - before[0])
          + ((branch + index) % 2 ? 1 : -1) * random(.55, 1.05);
        const end = [
          Math.max(28, Math.min(CX - 42, origin[0] + Math.cos(angle) * random(48, 120))),
          Math.max(24, Math.min(522, origin[1] + Math.sin(angle) * random(48, 120)))
        ];
        const branchPath = curve(origin, end, random(-18, 18), 9);
        scene.branches.push({ path:branchPath, primary:true });
        const twigs = 1 + branchNumber++ % 2;
        for (let twig = 0; twig < twigs; twig += 1) {
          const twigOrigin = branchPath[5 + twig];
          const twigAngle = angle + ((branchNumber + twig) % 2 ? 1 : -1) * random(.65, 1);
          const twigEnd = [
            twigOrigin[0] + Math.cos(twigAngle) * random(24, 58),
            twigOrigin[1] + Math.sin(twigAngle) * random(24, 58)
          ];
          scene.branches.push({ path:curve(twigOrigin, twigEnd, random(-8, 8), 6), primary:false });
        }
      }
    });

    scene.somaBio = Array.from({ length:30 }, (_, index) => {
      const angle = index / 30 * TAU;
      const radius = 64 * (1 + .1 * Math.sin(angle * 3 + .7) + .07 * Math.sin(angle * 5 + 2));
      return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius];
    });
    scene.somaMath = Array.from({ length:30 }, (_, index) => {
      const angle = index / 30 * TAU;
      return [CX + Math.cos(angle) * SOMA_R, CY + Math.sin(angle) * SOMA_R];
    });

    for (let index = 0; index < 14; index += 1) {
      const angle = random(0, TAU);
      const distance = Math.sqrt(randomSource()) * 38;
      scene.organelles.push([
        CX + Math.cos(angle) * distance, CY + Math.sin(angle) * distance * .72,
        random(4, 10), random(2, 5)
      ]);
    }

    const hill = [649, CY - 4];
    const joint = [736, CY + 8];
    scene.preBio = curve(hill, joint, 16, 14);
    scene.preMath = span([CX + SOMA_R, CY], [AX - ACT_R, CY], 14);
    scene.axonBio = curve(joint, [1186, CY - 42], 32, 26);
    scene.axonMath = span([AX + ACT_R, CY], [OUTPUT_X - 16, CY], 26);
    const end = scene.axonBio.at(-1);

    for (let index = 0; index < 5; index += 1) {
      const angle = -.72 + index * .36 + random(-.08, .08);
      const terminal = [end[0] + Math.cos(angle) * random(58, 108), end[1] + Math.sin(angle) * random(58, 108)];
      scene.terminals.push(curve(end, terminal, random(-14, 14), 9));
      for (let twig = 0; twig < 1 + (index < 3); twig += 1) {
        const twigAngle = angle + ((index + twig) % 2 ? 1 : -1) * .75;
        const twigEnd = [terminal[0] + Math.cos(twigAngle) * random(22, 47), terminal[1] + Math.sin(twigAngle) * random(22, 47)];
        scene.terminals.push(span(terminal, twigEnd, 5));
      }
    }
  }

  function phase(index, progress) {
    return ease((progress - segments[index][0]) / (segments[index][1] - segments[index][0]));
  }

  function setStroke(ctx, color, width, alpha=1) {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawPath(ctx, points, width, color, alpha=1, close=false) {
    if (!points.length || alpha <= 0) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
    if (close) ctx.closePath();
    setStroke(ctx, color, width, alpha);
    ctx.stroke();
  }

  function strokeCircle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
  }

  function fillCircle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  function drawText(ctx, text, x, y, font, color, alpha=1, align='center') {
    ctx.fillStyle = rgba(color, alpha);
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function drawArrow(ctx, a, b, alpha) {
    if (alpha <= 0) return;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save();
    ctx.translate(b[0], b[1]);
    ctx.rotate(angle);
    ctx.fillStyle = rgba(colors.signal, alpha);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-11, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDiamond(ctx, point, color, alpha) {
    ctx.save();
    ctx.translate(point[0], point[1]);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = rgba(color, alpha);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  function drawLabel(ctx, text, x, y, anchor, amount, color=colors.signal, align='left') {
    if (amount <= .02) return;
    ctx.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
    const endX = align === 'left' ? x + Math.min(100, ctx.measureText(text).width + 12) : x - 12;
    const endY = y + (y < CY ? 11 : -11);
    setStroke(ctx, color, 1, .2 + .35 * amount);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(anchor[0], anchor[1]);
    ctx.stroke();
    ctx.fillStyle = rgba(color, .45 + .55 * amount);
    fillCircle(ctx, anchor[0], anchor[1], 2.5);
    ctx.fillStyle = rgba(colors.ink, .46 + .54 * amount);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function drawBiologyLabels(ctx, amount) {
    drawLabel(ctx, '树突接收', 82, 58, scene.trunks[1].biological[8], amount, colors.ink);
    drawLabel(ctx, '胞体整合', 502, 52, [CX, CY - 63], amount, colors.ink);
    drawLabel(ctx, '轴突传出', 1030, 64, scene.axonBio[16], amount, colors.ink);
  }

  function drawScene(ctx) {
    const progress = state.progress;
    const [dendrite, weight, soma, bias, activation, output] = segments.map((_, index) => phase(index, progress));

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = .13 * output;
    setStroke(ctx, colors.ink, 1, 1);
    INPUT_Y.forEach(y => HIDDEN_Y.forEach(hiddenY => {
      ctx.beginPath(); ctx.moveTo(INPUT_X, y); ctx.lineTo(CX, hiddenY); ctx.stroke();
    }));
    HIDDEN_Y.forEach(hiddenY => {
      ctx.beginPath(); ctx.moveTo(CX, hiddenY); ctx.lineTo(AX, hiddenY); ctx.stroke();
      HIDDEN_Y.forEach(outputY => {
        ctx.beginPath(); ctx.moveTo(AX, hiddenY); ctx.lineTo(OUTPUT_X, outputY); ctx.stroke();
      });
      strokeCircle(ctx, CX, hiddenY, SOMA_R);
      strokeCircle(ctx, AX, hiddenY, ACT_R);
    });
    INPUT_Y.forEach(y => strokeCircle(ctx, INPUT_X, y, 12));
    HIDDEN_Y.forEach(y => strokeCircle(ctx, OUTPUT_X, y, 16));
    ctx.restore();

    scene.branches.forEach(branch => drawPath(
      ctx, branch.path, branch.primary ? 2.15 : 1.15,
      colors.bio, (1 - dendrite) * (branch.primary ? .68 : .42)
    ));

    scene.trunks.forEach(trunk => {
      const path = morph(trunk.biological, trunk.mathematical, dendrite);
      drawPath(ctx, path, lerp(5.4, 2.35, dendrite), dendrite > .5 ? colors.signal : colors.bio, 1);
      drawArrow(ctx, path[1], path[0], dendrite);
    });

    const preAxon = morph(scene.preBio, scene.preMath, activation);
    drawPath(ctx, preAxon, lerp(5, 2.35, activation), activation > .45 ? colors.signal : colors.bio);

    const axon = scene.axonBio.map((point, index) => mixPoint(
      point, scene.axonMath[index],
      lerp(activation, output, ease(index / (scene.axonBio.length - 1)))
    ));
    for (let index = 3; index < 27; index += 4) drawPath(ctx, axon.slice(index, index + 3), 12, colors.bio, .11 * (1 - output));
    drawPath(ctx, axon, lerp(5, 2.5, output), output > .45 ? colors.signal : colors.bio);

    ctx.save();
    ctx.globalAlpha = 1 - output;
    ctx.translate(axon.at(-1)[0], axon.at(-1)[1]);
    ctx.scale(1 - output, 1 - output);
    ctx.translate(-scene.axonBio.at(-1)[0], -scene.axonBio.at(-1)[1]);
    scene.terminals.forEach(terminal => {
      drawPath(ctx, terminal, 1.4, colors.bio, .56);
      const end = terminal.at(-1);
      ctx.fillStyle = rgba(colors.bio, .5);
      fillCircle(ctx, end[0], end[1], 2.5);
    });
    ctx.restore();
    drawArrow(ctx, axon.at(-2), axon.at(-1), output);

    const somaPath = morph(scene.somaBio, scene.somaMath, soma);
    ctx.fillStyle = rgba(colors.paper, .7);
    ctx.beginPath();
    ctx.moveTo(somaPath[0][0], somaPath[0][1]);
    for (let index = 1; index < somaPath.length; index += 1) ctx.lineTo(somaPath[index][0], somaPath[index][1]);
    ctx.closePath();
    ctx.fill();
    drawPath(ctx, somaPath, 2.5, soma > .5 ? colors.signal : colors.bio, 1, true);
    const innerSoma = somaPath.map(point => [
      CX + (point[0] - CX) * .9, CY + (point[1] - CY) * .9
    ]);
    drawPath(ctx, innerSoma, 1, colors.bio, .27 * (1 - soma), true);

    ctx.save();
    ctx.globalAlpha = 1 - soma;
    ctx.fillStyle = rgba(colors.bio, .16);
    ctx.beginPath(); ctx.ellipse(CX - 9, CY + 4, 21, 16, 0, 0, TAU); ctx.fill();
    scene.organelles.forEach(item => {
      ctx.beginPath();
      ctx.ellipse(item[0], item[1], item[2] / 2, item[3] / 2, 0, 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    drawText(ctx, 'Σ', CX, CY + 2, '38px "Times New Roman",serif', colors.ink, soma);

    const biasPoint = [lerp(661, CX, bias), lerp(CY - 3, CY + SOMA_R + 27, bias)];
    drawPath(ctx, [[CX, CY + SOMA_R], biasPoint], 1.5, colors.parameter, .55 * bias);
    if (bias > .01) {
      drawDiamond(ctx, biasPoint, colors.parameter, bias);
      drawText(ctx, 'b', biasPoint[0] + 14, biasPoint[1], '600 18px "Times New Roman",serif', colors.parameter, bias, 'left');
    }

    const activationCenter = [lerp(736, AX, activation), lerp(CY + 8, CY, activation)];
    const activationRadius = lerp(7, ACT_R, activation);
    setStroke(ctx, colors.signal, 2.4, activation);
    strokeCircle(ctx, activationCenter[0], activationCenter[1], activationRadius);
    drawText(ctx, 'σ', activationCenter[0], activationCenter[1] + 1, '36px "Times New Roman",serif', colors.ink, activation);
    drawArrow(ctx, preAxon.at(-2), preAxon.at(-1), activation);
    drawText(ctx, 'z', (CX + SOMA_R + AX - ACT_R) / 2, CY - 17, '16px "Times New Roman",serif', colors.signal, activation);

    scene.weights.forEach((item, index) => {
      const point = mixPoint(item.biological, item.mathematical, weight);
      drawDiamond(ctx, point, colors.parameter, .35 + .65 * weight);
      drawText(ctx, `w${'₁₂₃₄₅'[index]}`, point[0], point[1] - 16, '600 14px "Times New Roman",serif', colors.parameter, weight);
      drawText(ctx, `x${'₁₂₃₄₅'[index]}`, INPUT_X, INPUT_Y[index] + 1, '18px "Times New Roman",serif', colors.signal, dendrite);
    });

    drawText(ctx, 'a', OUTPUT_X + 18, CY + 1, '20px "Times New Roman",serif', colors.signal, output, 'left');

    drawBiologyLabels(ctx, 1 - ease(progress / .25));
    drawLabel(ctx, '输入 x₁...x₅', 66, 36, morph(scene.trunks[0].biological, scene.trunks[0].mathematical, dendrite)[9], dendrite);
    const weightAnchor = mixPoint(
      scene.weights[4].biological, scene.weights[4].mathematical, weight
    );
    drawLabel(ctx, '突触权重 w₁...w₅', 204, 514, weightAnchor, weight, colors.parameter);
    drawLabel(ctx, '加权和 Σ', 506, 36, [CX, CY - lerp(64, SOMA_R, soma)], soma);
    drawLabel(ctx, '偏置 b', 570, 514, biasPoint, bias, colors.parameter);
    drawLabel(ctx, '激活函数 σ', 912, 36, [activationCenter[0], activationCenter[1] - activationRadius], activation);
    drawLabel(ctx, '输出 a', 1218, 514, axon[18], output);
  }

  function currentBeat(progress) {
    return beats.findLast(beat => progress >= beat.at) || beats[0];
  }

  function updateDom() {
    const beat = currentBeat(state.progress);
    const percentage = Math.round(state.progress * 100);
    stateName.textContent = beat.name;
    stateCopy.textContent = beat.copy;
    progressOut.value = `${percentage}%`;
    progressOut.textContent = `${percentage}%`;

    beatButtons.forEach((button, index) => {
      const lower = beatPositions[index];
      const upper = beatPositions[index + 1] ?? 1.01;
      if (state.progress >= lower && state.progress < upper) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });

    formulaParts.forEach(part => {
      const name = part.dataset.part;
      part.dataset.ready = String(state.progress >= readyAt[name]);
      part.dataset.current = String(name === beat.part);
    });

    resetButton.disabled = state.progress <= .001 && !state.running;
    playButton.textContent = state.running ? '暂停' : state.paused ? '继续' : state.progress >= .999 ? '重新播放' : '播放推导';
  }

  function render(progress) {
    state.progress = clamp(progress);
    drawScene(context);
    updateDom();
  }

  function cancelAnimation(preservePause=false) {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.running = false;
    if (!preservePause) state.paused = false;
    updateDom();
  }

  function animateTo(target, duration, preservePause=false) {
    cancelAnimation(preservePause);
    if (reducedQuery.matches || duration <= 0) {
      render(target);
      return;
    }
    const from = state.progress;
    const started = performance.now();
    state.running = true;
    updateDom();

    function tick(now) {
      if (state.disposed || !state.running) return;
      const local = clamp((now - started) / duration);
      render(lerp(from, target, ease(local)));
      if (local < 1) state.raf = requestAnimationFrame(tick);
      else cancelAnimation();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function playSequence() {
    if (state.running) {
      state.paused = true;
      cancelAnimation(true);
      return;
    }
    if (state.progress >= .999) render(0);
    state.paused = false;
    animateTo(1, Math.max(700, 6200 * (1 - state.progress)));
  }

  function reset() {
    cancelAnimation();
    render(0);
  }

  function jumpTo(progress) {
    state.paused = false;
    animateTo(progress, 520);
  }

  function keyboard(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const nearest = beatPositions.reduce((best, value, index) =>
      Math.abs(value - state.progress) < Math.abs(beatPositions[best] - state.progress) ? index : best, 0);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      jumpTo(beatPositions[Math.min(beatPositions.length - 1, nearest + 1)]);
    }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); jumpTo(beatPositions[Math.max(0, nearest - 1)]); }
    else if (event.key === 'Home') { event.preventDefault(); reset(); }
    else if (event.key === 'End') { event.preventDefault(); jumpTo(1); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); reset(); }
    else if (event.code === 'Space') { event.preventDefault(); playSequence(); }
  }

  function refreshColors() {
    colors.ink = Deck.rgb('text');
    colors.bio = Deck.rgb('muted');
    colors.signal = Deck.rgb('signal');
    colors.parameter = Deck.rgb('parameter');
    colors.paper = Deck.rgb('paper');
  }

  function onReducedChange(event) {
    cancelAnimation();
    render(event.matches ? 1 : state.progress);
  }

  function handleBeatClick(event) {
    jumpTo(Number(event.currentTarget.dataset.progress));
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  }

  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    cancelAnimation();
    removers.splice(0).forEach(remove => remove());
    autofit.stop();
  }

  buildScene();
  Deck.init({ title:'一颗神经元，可以写成一行计算', keys:false });
  refreshColors();
  const autofit = Deck.autofit(canvas, drawScene);

  beatButtons.forEach(button => listen(button, 'click', handleBeatClick));
  listen(playButton, 'click', playSequence);
  listen(resetButton, 'click', reset);
  listen(window, 'keydown', keyboard);
  listen(window, 'pagehide', dispose);
  listen(reducedQuery, 'change', onReducedChange);

  const query = new URLSearchParams(location.search);
  const queryProgress = Number(query.get('t'));
  render(query.has('t') && Number.isFinite(queryProgress) ? queryProgress : reducedQuery.matches ? 1 : 0);
}());
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
