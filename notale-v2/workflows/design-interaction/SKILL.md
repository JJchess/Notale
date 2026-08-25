---
name: design-interaction
description: "Design and implement one focused learning interaction for a Notale lecture page, including controls, explicit state, visible feedback, keyboard and touch alternatives, deterministic reset, reduced-motion behavior, and cleanup. Use for sliders, toggles, step explorers, comparisons, reveals, drag manipulation, or other pages where the learner must act to understand a concept; do not use for decorative motion alone or a scored game loop."
---

# Design Interaction

Build one short action–observation loop that makes the page's teaching point easier to discover. Keep the explanation legible before interaction and make every important state reachable without guessing.

## Reference routing

Before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command, read [interaction-recipes.md](references/interaction-recipes.md). Read only the sections that match the selected input, state, rendering, keyboard, and lifecycle paths. Do not load unrelated references.

## 1. Establish the learning contract

1. Read the page specification, shared contract, and `CHASSIS.md` before editing.
2. Write one private sentence: “The learner **does X** to observe or compare **Y**, which demonstrates **Z**.”
3. Name the initial state, allowed actions, meaningful intermediate states, terminal state if any, and exact reset state.
4. Define the evidence that changes on screen: geometry, annotation, measured value, relationship, or conclusion. Do not count a glow, toast, or animation alone as evidence.
5. Remove secondary controls that do not serve that sentence. Prefer one rich control over several unrelated widgets.

## 2. Choose the smallest sound mechanism

- Prefer native buttons, radios, checkboxes, and ranges when their semantics fit.
- Use DOM or SVG for discrete labeled objects and exact semantic geometry.
- Use Canvas only for dense or continuously redrawn models; keep instructions, controls, values, and text alternatives in HTML.
- Use drag only when position itself carries meaning. Always provide buttons, a range, or another keyboard-operable path to the same learning states.
- Keep motion subordinate to state. If choreography rather than manipulation is the main task, use `design-motion` instead.

## 3. Model state before drawing

1. Create a fresh initial-state factory; never reuse a mutated object for reset.
2. Route every learner action through one transition function or a small explicit set of named action handlers.
3. Reject invalid actions without partially mutating state, then explain what is allowed near the control.
4. Derive labels, readouts, selected styles, annotations, and completion from canonical state. Do not keep parallel DOM-only truth.
5. Render the initial state before binding optional animation.
6. Make reset cancel active work, restore the exact initial state, render once, restore a sensible focus target, and announce the reset.
7. Seed any necessary randomization so reload and reset are reproducible. Avoid randomness when it does not teach anything.

## 4. Build one visible feedback loop

Use this order for each action:

1. Accept the input.
2. Update canonical state.
3. Redraw all derived views.
4. Show the consequence next to the model, not only in a distant status panel.
5. State the interpretation after enough evidence is visible; do not reveal the conclusion before the learner acts unless the specification requires it.

Keep controls visibly enabled, selected, disabled, and resettable. Preserve the theme's semantic color meanings and do not use color as the only state cue.

## 5. Make every path operable

- Use `<button>` and labeled form controls instead of clickable generic elements whenever possible.
- Keep `:focus-visible` intact and preserve a logical tab order.
- Give the interactive region a concise instruction and expose changing textual status through a restrained `aria-live="polite"` region.
- Support touch with Pointer Events and a hit area appropriate to the page scale. Add `.no-pan` only to the surface that truly consumes drag gestures.
- Prevent interaction keys from leaking into deck navigation only while the interactive control owns them. Do not globally capture arrow keys.
- For drag, support pointer capture, cancellation, and a non-drag alternative. Use `Deck.pt()` for coordinates inside the scaled stage.
- Under reduced motion, update state instantly or with a subtle fade while keeping the same actions, information, and completion path.

## 6. Own the lifecycle

Collect every listener removal, observer disconnect, timer cancellation, animation cancellation, `Deck.loop()` stop function, and graphics disposal in one idempotent cleanup routine. Cancel obsolete work before starting a replacement. Invoke cleanup on page teardown and before any re-initialization.

Avoid per-frame layout reads, overlapping event bindings, unbounded history, and detached nodes. Pause or stop work that is not visible; never let a hidden tab produce a large time jump.

## Deliverable contract

- Modify only the assigned page file unless the task explicitly grants other files.
- Preserve `#stage`, `data-page`, `data-total`, and the shared asset interfaces.
- Keep the complete state model, action handling, rendering, reset, and cleanup in the page-owned code.
- Provide a visible reset control whenever the learner can change state.
- Keep the page understandable at the initial and reduced-motion states; do not hide essential information behind hover.
- Report the learning action, the implemented input paths, the reset behavior, and the checks actually run.

## Minimal runtime smoke

1. Open the initial state and confirm that the prompt, control, model, and current value or status are visible.
2. Exercise one primary action and confirm that canonical state, visual evidence, and textual feedback all change.
3. Exercise the keyboard or non-drag alternative and one touch/pointer path where applicable.
4. Reset, repeat the primary action, and confirm the same starting state and result.
5. Trigger actions rapidly and confirm that work does not stack or continue after reset.
6. Run the available page `Check` for the initial state and each materially different state; require zero JavaScript errors and zero failed resources. Fix runtime, clipping, and unreachable-control failures. Treat aesthetic judgment as human review, not a synthetic hard gate.
