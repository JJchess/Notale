<!-- 这一份是 build-interaction 的 完整组件范例。拿不准组件整体该怎么搭时读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

### Complete structural example: projection instrument

This is a component example, not a page template. It demonstrates boundary, host-theme inheritance, a concept signature, direct and precise input, one state path, local evidence, exact reset, and teardown. Copy its architecture when useful; do not copy its topic, composition, colors, labels, or geometry into unrelated tasks.

```html
<style>
  .projection-widget {
    --iw-active: var(--accent, #00e5ff);
    --iw-consequence: var(--accent-2, #ffb020);
    width: 100%;
    min-width: 0;
    color: var(--ink, inherit);
    font: inherit;
  }

  .projection-widget .iw-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 14px;
    min-width: 0;
  }

  .projection-widget .iw-rail {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .projection-widget .iw-rail label {
    flex: 0 0 auto;
    color: var(--muted, currentColor);
  }

  .projection-widget .iw-rail input[type="range"] {
    flex: 1 1 240px;
    min-width: 120px;
  }

  .projection-widget .iw-value {
    min-width: 5ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .projection-widget .iw-reset {
    min-height: 36px;
  }

  .projection-widget .iw-stage {
    display: block;
    width: 100%;
    min-height: 310px;
    border: 1px solid var(--line, rgba(127,127,127,.28));
    border-radius: var(--radius, 14px);
    background: var(--panel, rgba(127,127,127,.05));
    touch-action: none;
  }

  .projection-widget .iw-axis,
  .projection-widget .iw-guide {
    stroke: var(--line, rgba(127,127,127,.38));
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-axis {
    stroke-width: 1.5;
  }

  .projection-widget .iw-guide {
    stroke-width: 1;
    stroke-dasharray: 5 5;
  }

  .projection-widget .iw-vector {
    stroke: var(--iw-active);
    stroke-width: 4;
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-projection {
    stroke: var(--iw-consequence);
    stroke-width: 7;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-handle-visible {
    fill: var(--panel, #10141c);
    stroke: var(--iw-active);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .projection-widget .iw-handle-hit {
    fill: transparent;
    cursor: grab;
  }

  .projection-widget .iw-handle-hit:hover + .iw-handle-visible,
  .projection-widget .iw-handle-hit:focus + .iw-handle-visible {
    stroke-width: 5;
  }

  .projection-widget .iw-handle-hit:active {
    cursor: grabbing;
  }

  .projection-widget .iw-label {
    fill: var(--muted, currentColor);
    font: 14px var(--font-sans, sans-serif);
  }

  .projection-widget .iw-label-strong {
    fill: var(--ink, currentColor);
    font-weight: 600;
  }

  .projection-widget .iw-readout {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    min-height: 28px;
    color: var(--muted, currentColor);
  }

  .projection-widget .iw-result {
    color: var(--iw-consequence);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .projection-widget .iw-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .projection-widget .iw-vector,
    .projection-widget .iw-projection,
    .projection-widget .iw-handle-visible {
      transition: stroke-width 140ms ease, opacity 140ms ease;
    }
  }
</style>

<div class="projection-widget" data-projection-widget>
  <div class="iw-shell">
    <div class="iw-rail">
      <span>Vector angle</span>
      <input data-angle aria-label="Vector angle"
             type="range" min="-170" max="170" step="1" value="38">
      <output class="iw-value" data-angle-value>38°</output>
      <button class="iw-reset" data-reset type="button">Reset</button>
    </div>

    <svg class="iw-stage" data-stage viewBox="0 0 720 360"
         role="img" aria-label="Vector projection instrument">
      <title>Vector projection instrument</title>
      <desc>
        Drag the vector endpoint or adjust the angle control. The amber segment
        shows the vector's signed projection on the horizontal axis.
      </desc>
      <defs data-defs></defs>

      <line class="iw-axis" x1="70" y1="230" x2="650" y2="230"/>
      <line class="iw-guide" data-drop x1="0" y1="0" x2="0" y2="0"/>
      <line class="iw-projection" data-projection x1="360" y1="230" x2="360" y2="230"/>
      <line class="iw-vector" data-vector x1="360" y1="230" x2="0" y2="0"/>

      <circle class="iw-handle-hit" data-handle tabindex="0"
              role="slider" aria-label="Vector angle"
              aria-valuemin="-170" aria-valuemax="170"
              cx="0" cy="0" r="24"/>
      <circle class="iw-handle-visible" data-handle-visible cx="0" cy="0" r="9"/>

      <text class="iw-label" x="635" y="255">axis</text>
      <text class="iw-label iw-label-strong" data-vector-label x="0" y="0">v</text>
      <text class="iw-label" data-projection-label x="0" y="0">projection</text>
    </svg>

    <div class="iw-readout">
      <span>The shadow keeps only the component parallel to the axis.</span>
      <span class="iw-result" data-result>0.79 × |v|</span>
    </div>
    <div class="iw-sr-only" data-status aria-live="polite"></div>
  </div>
</div>

<script>
(() => {
  const script = document.currentScript;
  const root = script?.previousElementSibling;
  if (!root?.matches("[data-projection-widget]")) return;

  const stage = root.querySelector("[data-stage]");
  const range = root.querySelector("[data-angle]");
  const reset = root.querySelector("[data-reset]");
  const angleValue = root.querySelector("[data-angle-value]");
  const result = root.querySelector("[data-result]");
  const status = root.querySelector("[data-status]");
  const vector = root.querySelector("[data-vector]");
  const projection = root.querySelector("[data-projection]");
  const drop = root.querySelector("[data-drop]");
  const handle = root.querySelector("[data-handle]");
  const handleVisible = root.querySelector("[data-handle-visible]");
  const vectorLabel = root.querySelector("[data-vector-label]");
  const projectionLabel = root.querySelector("[data-projection-label]");

  const origin = { x: 360, y: 230 };
  const vectorLength = 145;
  const initialAngle = 38;
  let state = { angle: initialAngle };
  let activePointer = null;
  let destroyed = false;

  function clampAngle(value) {
    return Math.max(-170, Math.min(170, Math.round(value)));
  }

  function transition(current, action) {
    if (action.type === "set-angle") {
      return { ...current, angle: clampAngle(action.value) };
    }
    if (action.type === "reset") {
      return { angle: initialAngle };
    }
    return current;
  }

  function dispatch(action, announce = false) {
    if (destroyed) return;
    state = transition(state, action);
    render();
    if (announce) {
      status.textContent =
        `Angle ${state.angle} degrees, signed projection ${projectionValue().toFixed(2)}`;
    }
  }

  function projectionValue() {
    return Math.cos(state.angle * Math.PI / 180);
  }

  function render() {
    const radians = state.angle * Math.PI / 180;
    const tip = {
      x: origin.x + Math.cos(radians) * vectorLength,
      y: origin.y - Math.sin(radians) * vectorLength
    };
    const foot = { x: tip.x, y: origin.y };
    const signed = projectionValue();

    vector.setAttribute("x2", tip.x);
    vector.setAttribute("y2", tip.y);
    projection.setAttribute("x2", foot.x);
    drop.setAttribute("x1", tip.x);
    drop.setAttribute("y1", tip.y);
    drop.setAttribute("x2", foot.x);
    drop.setAttribute("y2", foot.y);

    for (const node of [handle, handleVisible]) {
      node.setAttribute("cx", tip.x);
      node.setAttribute("cy", tip.y);
    }

    handle.setAttribute("aria-valuenow", state.angle);
    range.value = state.angle;
    angleValue.textContent = `${state.angle}°`;
    result.textContent = `${signed.toFixed(2)} × |v|`;

    vectorLabel.setAttribute("x", tip.x + 14);
    vectorLabel.setAttribute("y", tip.y - 10);
    projectionLabel.setAttribute("x", (origin.x + foot.x) / 2 - 28);
    projectionLabel.setAttribute("y", origin.y + 28);
  }

  function logicalPoint(event) {
    const matrix = stage.getScreenCTM();
    if (!matrix) return { ...origin };
    return new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(matrix.inverse());
  }

  function angleFromPointer(event) {
    const p = logicalPoint(event);
    return Math.atan2(origin.y - p.y, p.x - origin.x) * 180 / Math.PI;
  }

  function onPointerDown(event) {
    activePointer = event.pointerId;
    handle.setPointerCapture(event.pointerId);
    dispatch({ type: "set-angle", value: angleFromPointer(event) });
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointer) return;
    dispatch({ type: "set-angle", value: angleFromPointer(event) });
  }

  function endPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    dispatch({ type: "set-angle", value: state.angle }, true);
  }

  function onHandleKey(event) {
    const delta = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: state.angle - delta }, true);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: state.angle + delta }, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: -170 }, true);
    } else if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: 170 }, true);
    }
  }

  function onRangeInput() {
    dispatch({ type: "set-angle", value: Number(range.value) });
  }

  function onRangeChange() {
    dispatch({ type: "set-angle", value: Number(range.value) }, true);
  }

  function onReset() {
    activePointer = null;
    dispatch({ type: "reset" }, true);
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", endPointer);
  handle.addEventListener("pointercancel", endPointer);
  handle.addEventListener("keydown", onHandleKey);
  range.addEventListener("input", onRangeInput);
  range.addEventListener("change", onRangeChange);
  reset.addEventListener("click", onReset);

  render();

  root.destroyProjectionWidget = () => {
    if (destroyed) return;
    destroyed = true;
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", endPointer);
    handle.removeEventListener("pointercancel", endPointer);
    handle.removeEventListener("keydown", onHandleKey);
    range.removeEventListener("input", onRangeInput);
    range.removeEventListener("change", onRangeChange);
    reset.removeEventListener("click", onReset);
    delete root.destroyProjectionWidget;
  };
})();
</script>
```

The example's visual result is deliberately quiet. Its quality comes from conceptual coupling: the vector is the control, its shadow is the direct evidence, the guide preserves correspondence, the number quantifies the geometry, and all input paths share one state.

