---
name: create-sim
description: Build one deterministic, directly manipulable simulation inside a Notale HTML-native page.
---

# Create a simulation page

Add one deterministic, directly manipulable domain simulation to the page being built under
the Builder role contract.

## Model → trace → projection contract

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
- Stop or reuse animation handles rather than creating unbounded loops. Target at most 18,000 HTML
  characters.
