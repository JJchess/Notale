# Interaction Recipes

Read only the sections required by the chosen interaction. Keep the page's canonical state and teaching logic outside these adapters.

## Serializable state and transitions

Build reset from a factory and keep rendering free of mutations:

```js
function initialState() {
  return { value: 0, mode: "ready", attempts: 0 };
}

let state = initialState();

function dispatch(action) {
  const next = transition(state, action);
  if (next === state) return;
  state = next;
  render(state);
}

function reset() {
  cancelActiveWork();
  state = initialState();
  render(state);
  primaryControl.focus();
}
```

Return a new object from `transition`; derive visible values and classes in `render`.

## Pointer and drag inside the scaled stage

Use Pointer Events, capture the active pointer, and convert coordinates through the chassis:

```js
let activePointer = null;

surface.addEventListener("pointerdown", event => {
  if (activePointer !== null) return;
  activePointer = event.pointerId;
  surface.setPointerCapture(event.pointerId);
  dispatch({ type: "move", point: Deck.pt(surface, event) });
});

surface.addEventListener("pointermove", event => {
  if (event.pointerId !== activePointer) return;
  dispatch({ type: "move", point: Deck.pt(surface, event) });
});

function endPointer(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  dispatch({ type: "commit" });
}

surface.addEventListener("pointerup", endPointer);
surface.addEventListener("pointercancel", endPointer);
```

Clamp the logical point to the model's domain. Add `.no-pan` to `surface`, not the whole page. Do not depend on hover; show the drag handle before the first action.

## Keyboard parity

Prefer native controls. For a custom slider-like control, implement the relevant ARIA pattern and update through the same action path:

```js
surface.addEventListener("keydown", event => {
  const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  dispatch({ type: "nudge", delta });
});
```

Stop propagation only for consumed keys while focus is inside the control; otherwise leave deck navigation untouched. Pair a drag surface with visible decrement/increment buttons or a range input.

## Listener and observer cleanup

Use one abort signal for DOM listeners and collect non-listener cleanup separately:

```js
const events = new AbortController();
const cleanups = [];

button.addEventListener("click", onAction, { signal: events.signal });
cleanups.push(Deck.onResize(() => render(state)));

function destroy() {
  events.abort();
  while (cleanups.length) cleanups.pop()();
  cancelActiveWork();
}

window.addEventListener("pagehide", destroy, { once: true });
```

Make `destroy()` safe to call twice. Disconnect `ResizeObserver` and `IntersectionObserver`, release pointer state, cancel timers and animation frames, and dispose graphics resources owned by the page.

## Canvas redraw

Use `Deck.autofit(canvas, draw)` for state-driven 2D graphics. Call its `redraw()` after state changes and its `stop()` during cleanup. Keep controls and changing text in HTML. For continuous animation use `Deck.loop()` and retain its stop function; provide a meaningful `still` time for reduced motion.
