---
name: mini-game
description: Use when a concept only lands by doing: a playable unit with one goal, one core action, feedback, a win or lose condition and a reset, delivered as a self-contained embeddable piece that reports its state and result.
---

# Build a Mini-game from a Query

Turn the query into one compact game with real rules, feedback, an ending, and replay. Optimize for a
single implementation pass. Do not launch subagents, research broadly, generate design variants, or
create test suites unless the user explicitly asks.

## 1. Choose one game loop

Reduce the query to one sentence:

> The player **does one core verb** inside **one model** to achieve or discover **one result**.

Privately decide the goal, initial state, allowed actions, invalid actions, completion or failure rule,
result, and reset behavior. Make reasonable assumptions instead of asking about low-risk details. Use a
score only when the model defines better and worse outcomes; never invent precise metrics.

## 2. Scaffold once

Always use zero-dependency native Web technology. Deliver a custom element and a small demo host:

```bash
python3 <skill-dir>/scripts/scaffold_game.py \
  --name <topic-slug> \
  --title "<visible title>" \
  --lang <language-tag> \
  --out <target-directory>
```

The command creates `index.html` and `game-component.js` and refuses to overwrite a non-empty directory.
Replace the starter mechanic, copy, and visual system directly. Do not produce multiple concepts first.

## 3. Choose the visual medium deliberately

The most common failure: reaching for plain SVG `<rect>`/`<circle>` as a generic stand-in for
tiles, characters, obstacles, or props — not because the model needs exact geometry, but because
they are the fastest thing to type. State the medium you will use and why the model calls for it,
in one sentence, before you scaffold. That sentence is what stops the reflex.

| Medium | Use when the model is... | Notes |
|---|---|---|
| **Pixel-art Canvas** | a tangible world: characters/agents, tile maps, movement, pathfinding, collection or chore loops, resource/ecosystem simulations | Fixed low logical resolution, integer coordinates and scaling, `ctx.imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`, one limited palette. See snippet below. |
| **Precise vector SVG** | exact semantic geometry: graphs, networks, routes/maps, diagrams, charts, geometric or physics constructions | Precision is the point here — plain shapes are correct, not a placeholder. |
| **Typographic/kinetic HTML+CSS** | an abstract, spaceless model: predictions, bids, probability, negotiation, timers, counters — the "board" is a number or a claim, not a place | Big animated digits or words carry the state; no imagery needed at all. |
| **ASCII/monospace grid** | puzzle, logic, or code/terminal-flavored topics where a deliberate retro text aesthetic fits | `<pre>` or a CSS grid of characters; cheap to draw, more character than bare shapes. |
| **Paper-cutout/collage** | everyday, whimsical, non-technical subjects where charm matters more than precision | Layered flat shapes, soft drop shadow, slight rotation, rounded or torn edges. |
| **Isometric block/tile** | spatial stacking matters: strategy, city-building, economy simulations | CSS 3D transforms or a Canvas isometric projection; heavier to build — use only when depth is the point. |

Keep copy and controls in HTML regardless of medium. Never bake instructions, scores, buttons, or
other interface text into pixel art or images; preserve accessible labels and input alternatives.
Use image generation only for static artwork or texture, not flattened UI or pre-rendered gameplay
states.

**Pixel-art starter** — draw a palette-indexed grid without inventing sprite code from scratch:

```js
function drawPixelGrid(ctx, grid, palette, cellSize) {
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const color = palette[grid[y][x]];
      if (color == null) continue; // transparent, background shows through
      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}
// grid: 2D array of palette indices, one entry per tile/pixel-block
// palette: array of CSS color strings, index-matched to grid values
```

## 4. Implement model, then projection

- Keep canonical state in one serializable object and route actions through one transition function.
- Derive feedback, completion, score, and comparison from the model or a real algorithm.
- Reset from a fresh initial-state factory. Keep only the trace needed for the result.
- Make the model the main visual instead of wrapping it in dashboard cards.
- Support pointer or touch and the necessary keyboard actions.
- Keep focus visible, provide an `aria-live` status, and honor `prefers-reduced-motion`.
- Use image generation only for useful static artwork or texture. Keep gameplay state and controls live.

## 5. Preserve the Web Component contract

Use an open Shadow Root and a query-specific kebab-case tag. Expose:

- `start()`
- `reset()`
- `getState()` returning a detached serializable snapshot

Dispatch composed, bubbling events:

- `game-start`
- `game-progress` with `{ state, action, metrics }`
- `game-complete` with `{ score, metrics, trace }`
- `game-reset`

## 6. Run the cheap checks

Always run the deterministic validator:

```bash
python3 <skill-dir>/scripts/validate_game.py <target-directory>
```

If browser tooling is already available, open the demo once, perform one representative action, and
check for an uncaught console error. Do not create Playwright suites, multi-viewport matrices, event-count
harnesses, screenshot comparisons, or forward-test agents unless requested.

The validator may also print non-blocking `HINT:` lines about visual-medium fit. Read them; they do
not fail the run.

Report the component path, custom-element tag, preview command, and only the checks actually performed.
