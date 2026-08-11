---
name: build-minigame-from-query
description: Build a zero-dependency native Web mini-game from a query and deliver it as a reusable Web Component with a demo host. Use for playable or scoreable interactive demos, challenges, simulations, path games, prediction games, or resource games; optional media may guide style but is not required.
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

## 3. Implement model, then projection

- Keep canonical state in one serializable object and route actions through one transition function.
- Derive feedback, completion, score, and comparison from the model or a real algorithm.
- Reset from a fresh initial-state factory. Keep only the trace needed for the result.
- Use HTML for controls, SVG for exact geometry, and Canvas for dense fields or sprites.
- Make the model the main visual instead of wrapping it in dashboard cards.
- Support pointer or touch and the necessary keyboard actions.
- Keep focus visible, provide an `aria-live` status, and honor `prefers-reduced-motion`.
- Use image generation only for useful static artwork or texture. Keep gameplay state and controls live.

## 4. Preserve the Web Component contract

Use an open Shadow Root and a query-specific kebab-case tag. Expose:

- `start()`
- `reset()`
- `getState()` returning a detached serializable snapshot

Dispatch composed, bubbling events:

- `game-start`
- `game-progress` with `{ state, action, metrics }`
- `game-complete` with `{ score, metrics, trace }`
- `game-reset`

## 5. Run the cheap checks

Always run the deterministic validator:

```bash
python3 <skill-dir>/scripts/validate_game.py <target-directory>
```

If browser tooling is already available, open the demo once, perform one representative action, and
check for an uncaught console error. Do not create Playwright suites, multi-viewport matrices, event-count
harnesses, screenshot comparisons, or forward-test agents unless requested.

Report the component path, custom-element tag, preview command, and only the checks actually performed.
