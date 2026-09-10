# Game Model Recipes

Read only the section required by the chosen mechanic. Keep visuals as a projection of canonical state.

## Pure transition shape

Create a serializable state and send all actions through one transition:

```js
function makeInitialState(seed = 20260824) {
  return { phase: "ready", seed, turn: 0, pieces: makePieces(seed), trace: [] };
}

function transition(state, action) {
  if (!isAllowed(state, action)) {
    return { ...state, feedback: explainInvalid(state, action) };
  }
  const next = applyRule(state, action);
  return {
    ...next,
    turn: state.turn + 1,
    trace: [...state.trace, summarize(action, next)].slice(-24),
    phase: isComplete(next) ? "complete" : "playing"
  };
}
```

Keep `applyRule`, `isComplete`, and any score derived from the actual model. Render after transition; never mutate DOM first and reconstruct state from it.

## Deterministic variation

Use a tiny seeded generator when replayable variation matters:

```js
function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
```

Pass the generator into shuffle or setup functions. Recreate it from the same seed on reset. Do not call `Math.random()` elsewhere in the game.

## Persistent world loop

Use a world model when the player explores, builds, routes, balances, or spends limited actions:

```js
function makeWorld(seed) {
  return {
    phase: "playing",
    actionsLeft: 6,
    cells: makeCells(seed),
    inventory: [],
    discovered: [],
    currentGoal: "complete-chain",
    trace: []
  };
}
```

Each action must change at least one future affordance: reveal a cell, consume a tool, unlock a route, alter risk, add evidence, or close an option. Derive the next legal actions from the resulting world. Do not model a deck of independent questions as `cells`; persistence must affect strategy rather than merely remember a score.

Define success and failure from world facts. For example, a fieldwork game succeeds when a claim has an object, context, and dating link before actions run out—not when three hidden answer keys match.

## Timed mechanics

Add a timer only when time pressure represents the concept. Store a deadline or elapsed model time, not a decrementing DOM number. Keep one timer handle, pause on hidden pages, clamp elapsed deltas, and clear it before reset or teardown. Under reduced motion, preserve time rules but remove decorative motion; do not silently make the game easier or harder.

## Host-observable state

When the surrounding harness needs to observe progress, emit one composed event after rendering:

```js
function publish(action) {
  stage.dispatchEvent(new CustomEvent("notale:learning-state", {
    bubbles: true,
    composed: true,
    detail: {
      action: action.type,
      phase: state.phase,
      turn: state.turn,
      complete: state.phase === "complete"
    }
  }));
}
```

Expose only small serializable facts; do not include DOM nodes or mutable state references. Add this event only when the task or test harness asks for it.

## Exact replay and cleanup

Use one reset path:

```js
function reset() {
  cancelActiveWork();
  state = makeInitialState(FIXED_SEED);
  render(state);
  announce("Game reset");
  primaryAction.focus();
}
```

Make `cancelActiveWork()` idempotent. Release pointer capture/state, clear timeouts and intervals, cancel animations and frames, stop audio, and dispose graphics resources. Abort page-owned listeners and disconnect observers in `destroy()`, then register it once with `pagehide`.
