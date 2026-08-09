---
name: create-sim
description: Build one deterministic, directly manipulable simulation inside a Notale HTML-native page.
allowed-tools: [context_read, page_write, page_read, page_search, page_patch, check_page, submit_page]
---

# Create a simulation page

Build one dependency-free HTML fragment for the assigned `sim-explorable` page. The Reveal shell and
`global.css` already exist outside the iframe.

## Direct workflow

1. Read the complete PageContext and identify the single state transition or comparison the learner
   must inspect.
2. Implement the fragment in one `page_write` call. Do not write a scratch plan first.
3. Call `check_page` immediately. Do not reread the generated page unless the check reports a
   concrete failure whose location is unknown.
4. Repair with one targeted `page_patch`, check again, then call `submit_page`.

## Model → trace → projection contract

- Use native HTML/CSS/JavaScript with SVG or Canvas; no packages, CDN, imports, fetches, fonts, or
  remote images.
- Implement a real domain engine for the page's mechanism: an algorithm, equation/integrator, finite
  state machine, rule system, or data transformation. The engine owns domain state and is the only
  function allowed to produce the next instructional state.
- Run the engine from an explicit input to produce a semantic event trace or computed state sequence.
  Trace events describe what actually happened (`compare`, `swap`, `write`, `transition`, sampled
  physical state), not screenshots of what the renderer should show.
- Derive each visible frame by reducing/replaying the engine output from the initial input. The renderer
  reads that derived state and updates HTML/SVG/Canvas; it does not invent values or advance the model.
- Controls may change model input, dispatch a model action, or change the trace cursor. A Step button
  advances the cursor over an existing trace; changing the input must execute the engine again.
- Never handwrite arrays of successive frames, branch on a step number to display a canned result, or
  let an event handler directly mutate teaching labels/shapes as a substitute for model execution.
- For example, a sorting page must follow `input → bubbleSort(input) → compare/swap trace → replay →
  render`. Back and Reset replay the same trace or execute the same initial input; they do not maintain
  a second handcrafted version of the array.
- Start by executing the initial input so the first render is meaningful. Keep playback/UI state small
  and separate from domain state; reset must reproduce the initial model result exactly.
- Show the invariant, changed element, comparison, or readout needed to interpret each transition.
- Keep the primary visual stage dominant. Avoid dashboard cards, long instructions, and decorative
  animation.
- Support keyboard activation and visible focus. Respect reduced motion. Stop or reuse animation
  handles rather than creating unbounded loops.
- Fit 1280×720 without scrolling. Target at most 18,000 HTML characters.

Use `--notale-*` variables from `global.css` with explicit fallbacks for surfaces, ink, muted text,
accent, and rules. Keep page-specific semantic colors scoped to the fragment.
