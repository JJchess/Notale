<!-- 这一份是 build-interaction 的 实现配方。遇到对应机制时读;可以读多条,不必全读。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

## 12. Implementation recipes

These recipes encode fragile mechanics. Adapt names and domain logic; preserve the boundaries.

### Recipe: one scheduled render

For high-frequency input, accept every logical value but keep at most one pending visual render:

```js
let renderPending = false;

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    render(state);
  });
}
```

The final input event must update state before the scheduled callback. Do not debounce so aggressively that the committed final value is lost.

### Recipe: pointer position to SVG domain

Keep screen coordinates out of state:

```js
function svgPoint(event, svg, viewBox) {
  const source = (event.touches && event.touches[0])
    || (event.changedTouches && event.changedTouches[0])
    || event;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: viewBox.x, y: viewBox.y };
  const p = new DOMPoint(source.clientX, source.clientY)
    .matrixTransform(matrix.inverse());

  return {
    x: Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width, p.x)),
    y: Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height, p.y))
  };
}
```

The inverse screen matrix handles both the host transform and the SVG viewBox, including preserved aspect ratio. If the host supplies a coordinate adapter, use its documented coordinate space and do not remove the same transform twice. Verify with a visible handle after resize and host scaling.

### Recipe: direct input and precise input share one action

```js
function setAngle(value, source) {
  dispatch({
    type: "set-angle",
    value: Math.max(-Math.PI, Math.min(Math.PI, value)),
    source
  });
}

handle.addEventListener("pointermove", event => {
  if (event.pointerId !== activePointer) return;
  const p = logicalPoint(event);
  setAngle(Math.atan2(origin.y - p.y, p.x - origin.x), "pointer");
});

range.addEventListener("input", () => {
  setAngle(Number(range.value) * Math.PI / 180, "range");
});
```

Render updates both handle geometry and range value. Do not dispatch one input from the other element's synthetic event.

### Recipe: named SVG elements updated from state

```js
const view = {
  vector: root.querySelector("[data-vector]"),
  boundary: root.querySelector("[data-boundary]"),
  handle: root.querySelector("[data-handle]"),
  value: root.querySelector("[data-angle-value]")
};

function render(s) {
  const vx = Math.cos(s.angle);
  const vy = -Math.sin(s.angle);
  const tip = { x: origin.x + vx * length, y: origin.y + vy * length };
  const tangent = { x: -vy, y: vx };

  view.vector.setAttribute("x2", tip.x);
  view.vector.setAttribute("y2", tip.y);
  view.handle.setAttribute("cx", tip.x);
  view.handle.setAttribute("cy", tip.y);
  view.boundary.setAttribute("x1", origin.x - tangent.x * 150);
  view.boundary.setAttribute("y1", origin.y - tangent.y * 150);
  view.boundary.setAttribute("x2", origin.x + tangent.x * 150);
  view.boundary.setAttribute("y2", origin.y + tangent.y * 150);
  view.value.textContent = `${Math.round(s.angle * 180 / Math.PI)}°`;
}
```

This makes the geometric relationship explicit. Do not draw the boundary as sampled pixels or separately approximate its angle.

### Recipe: autoplay uses logical step

```js
let timer = 0;

function advanceOne() {
  dispatch({ type: "advance" });
}

function start() {
  if (timer || state.complete) return;
  dispatch({ type: "set-running", value: true });
  timer = window.setInterval(() => {
    if (state.complete) {
      stop();
      return;
    }
    advanceOne();
  }, 650);
}

function stop() {
  if (timer) window.clearInterval(timer);
  timer = 0;
  dispatch({ type: "set-running", value: false });
}

stepButton.addEventListener("click", () => {
  stop();
  advanceOne();
});
```

For smoother model time, use `requestAnimationFrame`, but keep a separate bounded logical transition. Manual input must cancel or take ownership of autoplay.

### Recipe: deterministic generated sample

```js
function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeSample(seed, count) {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: random() * 2 - 1,
    y: random() * 2 - 1
  }));
}
```

Generate shared comparison samples once. Reset uses the same seed; “new sample” changes it explicitly.

### Recipe: Canvas resize and dirty drawing

```js
const canvas = root.querySelector("canvas");
let ctx = null;
let cssWidth = 1;
let cssHeight = 1;
let dirty = true;

function createCanvasFit(canvas, drawAfterFit, host) {
  const context = canvas.getContext("2d");

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, canvas.offsetWidth || rect.width);
    const height = Math.max(1, canvas.offsetHeight || rect.height);
    const hostScale = rect.width && width ? rect.width / width : 1;
    const density = Math.min(2.5, devicePixelRatio * Math.max(1, hostScale));
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    drawAfterFit(context, width, height);
  }

  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  const offHostResize = host?.onResize ? host.onResize(fit) : () => {};
  fit();

  return {
    redraw: fit,
    stop() {
      observer.disconnect();
      offHostResize();
    }
  };
}

const fitted = createCanvasFit(canvas, (nextContext, width, height) => {
  ctx = nextContext;
  cssWidth = width;
  cssHeight = height;
  dirty = true;
  draw();
}, host);

function invalidate() {
  dirty = true;
  if (!state.running) requestAnimationFrame(draw);
}

function draw(now = 0) {
  if (!ctx || (!dirty && !state.running)) return;
  dirty = false;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawInvariantLayer(ctx, state, cssWidth, cssHeight);
  drawModel(ctx, state, cssWidth, cssHeight, now);
}

function destroyCanvas() {
  fitted.stop();
}
```

Retain the returned `{ redraw, stop }` object and invoke `stop()` during teardown. Prefer the host's equivalent fitter when one is supplied.

### Recipe: local invalid feedback without state drift

```js
function transition(s, action) {
  if (action.type !== "toggle-item") return s;

  const nextIds = s.selected.includes(action.id)
    ? s.selected.filter(id => id !== action.id)
    : [...s.selected, action.id];
  const used = totalMass(nextIds);

  if (used > s.limit) {
    return {
      ...s,
      feedback: {
        kind: "capacity",
        item: action.id,
        overBy: used - s.limit
      }
    };
  }

  return {
    ...s,
    selected: nextIds,
    feedback: null
  };
}
```

The rejected item remains identifiable through `feedback.item`, while the valid selection stays intact. Render capacity, feasibility, item state, and message from this one next state.

### Recipe: reduced-motion branch

```js
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function transitionGeometry(from, to) {
  if (reduceMotion.matches) {
    visual = to;
    render(state);
    return;
  }
  animateBetween(from, to, {
    duration: 420,
    onUpdate: value => {
      visual = value;
      render(state);
    }
  });
}
```

Listen for preference changes only if the host can remain mounted while the setting changes, and detach that listener during teardown.

