# Interactive Learning Widget

This reference designs a bounded interactive component, not a page. The host supplies the topic, copy, available region, theme tokens, assets, navigation, and any coordinate or lifecycle adapters. The widget supplies one manipulable model and the evidence through which a learner discovers the intended relationship.

## Contents

1. Component contract
2. Evidence and anatomy
3. Interaction patterns
4. State and rendering
5. Input and lifecycle
6. Craft and failure modes
7. Acceptance

## 1. Component contract

Write this compact contract before markup or rendering code:

```text
insight:        The learner should understand …
action:         The learner changes/tests/traces …
quantity:       The action directly changes …
evidence:       The model shows this through geometry …, measurement …, and annotation …
states:         initial → active/intermediate → extreme/failure/reveal → reset
reveal rule:    Show the interpretation when … is visible, not merely when a button is clicked
anatomy:        dominant stage + local controls + local readout [+ one distinct auxiliary view]
renderer:       DOM | SVG | Canvas, because …
host inputs:    allotted bounds, tokens, assets, resize/coordinate/teardown adapters
```

The contract must describe an action–observation loop, not a feature list. “Move a slider and see a number” is too weak. Name the observable relationship: rotating a vector turns a boundary; increasing a coefficient reverses a flow; a larger step overshoots a minimum; adding capacity bends a fit while validation error eventually rises.

### Ownership boundary

The host owns everything outside the component. The widget must not create or control:

- a page title, chapter label, article introduction, footer, page number, or navigation;
- the host background, global type system, global color mode, or full-page padding;
- unrelated facts, citations, cards, or a second teaching activity;
- global CSS resets or keyboard behavior outside focused controls.

The widget may be written inline in a host artifact, but keep one root element, locally scoped selectors, component-owned state, and explicit cleanup. It should be possible to move that root and its controller into another compatible host without redesigning the interaction.

## 2. Evidence and anatomy

### Build evidence in this order

1. **Direct evidence:** shape, position, direction, magnitude, connection, trajectory, classification, or another property changes on the model itself.
2. **Measured evidence:** a nearby value, scale, formula term, tally, trace, or comparison quantifies that change.
3. **Interpretation:** a short conclusion appears after the evidence exists.

Do not substitute glow, confetti, a toast, or a changing status label for direct evidence. Motion may reveal a direction or transition, but the final state must remain readable when motion stops.

### Internal anatomy

Use one dominant stage. Controls, live values, and auxiliary views support it.

```text
┌ component root ──────────────────────────────────────────┐
│ compact controls or mode selector                        │
│                                                         │
│ dominant manipulable model ─── local annotation/readout │
│              │                                          │
│              └── optional auxiliary view of a different │
│                  consequence, derived from the same state│
│                                                         │
│ quiet formula, legend, history, or conclusion            │
└──────────────────────────────────────────────────────────┘
```

- Give the main model more visual area and contrast than all chrome combined.
- Put a control beside the property it changes; put the result beside its evidence.
- Add an auxiliary view only when it exposes a different dimension. A duplicated value or decorative mini-chart is not a second view.
- Keep comparable views on the same scale, crop, time base, and coordinate system.
- Use proximity, alignment, shared baselines, and connectors before adding panels.
- Let annotations live on or beside the model instead of building a cabinet of status cards.

### First paint

Start in an informative state: a nonzero parameter, one iteration already visible, a useful probe position, or a representative comparison. Show the available manipulation and its current consequence. Do not begin with an empty plot, hidden object, all-zero system, or blank stage that only says “start.”

The initial state must not spoil a conclusion that depends on trying. In that case, show a plausible unsolved state and a visible affordance, while withholding the explanation until the reveal rule is satisfied.

## 3. Interaction patterns

Choose the smallest pattern that proves the insight. These are component blueprints, not topic templates.

### Parameter instrument

Use when one or more parameters continuously alter a model.

```text
parameter control → primary geometry/behavior
                  ↘ local numeric or formula term
                  ↘ optional consequence view
```

- Encode the quantity more than once only when the encodings answer different questions: direction with motion, magnitude with width, total with a stack, output with a curve.
- Highlight the exact term affected by the active control.
- Include one purposeful preset that demonstrates an informative negative, extreme, or counterintuitive state.
- Keep multiple controls only when they act on the same model and the learner needs their relationship. Several independent sliders are several weak widgets.

Avoid a form on one side and a result number on the other. The object itself must visibly respond.

### Bidirectional manipulator

Use when direct manipulation expresses the concept better than a form control, while a precise alternative is still valuable.

- Drag a meaningful object such as a vector, boundary, handle, sample, probe, or point—not a decorative card.
- Keep direct manipulation and the semantic control synchronized through the same state.
- Show the handle before first use and use an appropriate pointer cursor.
- Provide a keyboard-operable range, buttons, or numeric input that reaches the same states.
- Commit drag only after clamping and validating the logical value; cancellation must leave a valid state.

Avoid adding drag merely to make the component feel interactive. Position must carry meaning.

### Try → fail → reframe

Use when the teaching point is a limitation, counterexample, misconception, or impossible strategy.

```text
plausible task → repeated evidence/attempts → bounded failure
               → interpretation → new representation or method
```

- Let the learner make a genuine attempt before revealing the limitation.
- Track evidence such as best score, unresolved case, contradiction, residual, or invariant—not just click count.
- Reveal when the evidence is persuasive: after a bounded number of attempts, a stable best result, or an explicit request for explanation.
- Preserve the failed state while explaining it; do not erase the evidence with a modal.
- If introducing a new representation, keep the original objects identifiable across the transition.

Avoid a fake quiz whose answer is already printed, or a failure message caused by an arbitrary hidden rule.

### Continuous transformation explorer

Use when understanding depends on seeing that two representations are the same object at different stages or coordinates.

- Define both endpoints from corresponding objects or control points and interpolate the actual geometry.
- Let the learner stop at meaningful intermediate states; do not replace a continuous relationship with two screenshots.
- Keep persistent labels attached to their objects and reveal new labels only when they become interpretable.
- When comparing spaces or modes, preserve identity through motion, connector traces, matching marks, or stable color semantics.
- Offer play/pause only as a convenience; a scrubber or step control must retain control of the state.

Avoid cross-fading unrelated pictures and calling it transformation.

### Causal tracer

Use for a process, propagation path, calculation graph, dependency chain, or forward/backward pass.

- Keep one stable spatial graph. Change active edges, node values, direction, and accumulated expression rather than replacing the diagram at every step.
- Show previous, current, and next context; do not isolate the current step in a floating card.
- At each step expose the local rule, the received value, and the emitted consequence close to the active node.
- Support backward stepping when reversibility helps comparison.
- Let autoplay call the same transition used by manual stepping, and cancel it on manual input or reset.
- Make completion a meaningful final state, not merely “all steps visited.”

Avoid numbered cards with no visible path or a progress bar disconnected from the model.

### Synchronized comparison

Use when one variable must be compared fairly across alternatives, runs, models, or scenarios.

- Hold starting state, data, axes, scale, crop, time, and update count constant; vary only the teaching variable.
- Start all runs from the same action and advance them on the same logical clock.
- Preserve values that leave the visible domain by marking the boundary or divergence; do not silently rescale one panel.
- Attach the concise outcome to each comparable view, then state the shared conclusion once.
- If highlighting one alternative, dim rather than remove the others so the comparison remains available.

Avoid three separate components that happen to sit in a row.

### Live system observer

Use when the lesson is an evolving system rather than a single transition.

```text
primary state field or model
  ↔ compact internal structure
  ↔ small control cluster
  ↔ history trace or validation view
```

- Run the real simplified mechanism when feasible; otherwise label a deterministic model honestly.
- Couple every view to the same iteration and state snapshot.
- Prioritize the changing model. The internal diagram and history are subordinate evidence, not dashboard peers.
- Provide start/pause, bounded stepping, deterministic reset, and one or two diagnostic presets.
- Expose enough current values to verify behavior without turning the component into a monitoring console.
- Update expensive fields less frequently than lightweight marks while keeping their logical timestamps aligned.

Avoid a beautiful animation whose displayed metrics are disconnected from the system being drawn.

## 4. State and rendering

### Canonical state

Keep one state object or a small explicit state machine. Derive geometry, selected styles, labels, values, annotations, feedback, and completion from it. DOM classes and Canvas pixels are views, never sources of truth.

```js
function createWidget(root, host) {
  const initialState = () => ({ value: 0.5, mode: "ready", attempts: 0 });
  let state = initialState();
  let destroyed = false;

  function dispatch(action) {
    if (destroyed) return;
    state = transition(state, action);
    render(state);
  }

  function reset() {
    cancelActiveWork();
    state = initialState();
    render(state);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelActiveWork();
    detachInputs();
  }

  render(state);
  attachInputs(dispatch);
  return { dispatch, reset, destroy };
}
```

The exact packaging may differ, but preserve the boundary: one root, one state, one update path, one teardown path.

### State quality

- Define concrete initial values and make reset reproduce them exactly.
- Seed generated samples and layouts whenever comparisons or reset depend on them.
- Separate transient hover/focus from persistent selection and model state.
- Reject invalid actions before partial mutation.
- Bound attempts, history, trace points, particles, and stored frames.
- Keep the same content geometry across selected, wrong, revealed, and reduced-motion states so feedback does not cause layout jumps.

### Renderer selection

- Use semantic DOM for controls, short records, sortable items, and discrete labeled states.
- Use SVG for precise lines, vectors, nodes, regions, paths, small data-bound sets, and direct manipulation that benefits from named elements.
- Use Canvas for dense fields, many continuously moving marks, image-like grids, or a model that must redraw as one surface.
- Keep controls, changing text, instructions, and accessibility alternatives outside Canvas.
- Do not use a renderer library to avoid deciding the representation.

### Coordinated rendering

Every state transition follows the same order:

1. accept and validate input;
2. update canonical state;
3. redraw every dependent view from the same snapshot;
4. update nearby values and accessible status;
5. reveal interpretation only if its evidence condition is met.

For continuous input, schedule at most one pending redraw and always render the final committed value. For long-running systems, separate the logical step from visual interpolation so pause, single-step, reset, and reduced motion remain correct.

## 5. Input and lifecycle

### Controls and direct input

- Prefer native buttons, ranges, radios, checkboxes, and inputs when their semantics fit.
- Use Pointer Events for custom manipulation. Capture only the active pointer, clamp in logical coordinates, and handle pointer cancellation.
- Use a host coordinate adapter when supplied; otherwise calculate coordinates relative to the component surface, not the page.
- Give custom controls an appropriate accessible role, name, value, and keyboard behavior.
- Stop keyboard propagation only for keys the focused component control consumes.
- Preserve visible focus and a logical tab order.
- Make touch targets large enough without inflating the visible mark.
- Do not depend on hover to reveal an essential control or value.

### Feedback

- Show hover and pressed states on every actionable element.
- Flash, trace, or ease the actual consequence after an update; avoid a generic success animation.
- Place invalid-action guidance next to the constrained object or control.
- Use color as a semantic channel only with shape, direction, label, texture, or position as a second cue.
- Announce important state changes through one restrained live region; do not narrate every animation frame.

### Reset, teardown, remount

Reset restores model state. Destroy releases host resources.

- Cancel animation frames, timelines, intervals, timeouts, and pending delayed reveals.
- Remove listeners or abort their shared signal.
- Disconnect resize/intersection observers and dispose owned renderer instances.
- Release pointer state and stop work when the component is hidden or destroyed.
- Make destroy safe to call twice and ensure remount does not duplicate work.
- Clamp large elapsed-time gaps after a hidden tab; do not fast-forward a simulation uncontrollably.

### Reduced motion

Reduced motion must preserve the same information and reachable states. Replace travel, particle flow, and choreography with immediate updates, short fades, static trails, direction arrows, or final-state emphasis. Never solve reduced motion by hiding the model.

## 6. Craft and failure modes

### Component craft

- **One dominant element:** the manipulable model or evidence field wins over controls, readouts, and explanation.
- **Subject-specific signature:** use one memorable behavior derived from the concept—flow reverses, a boundary pivots, a grid folds, responsibility travels, a trace accumulates. Do not invent a second aesthetic theme.
- **Semantic encoding:** use position, angle, length, width, direction, opacity, and color consistently. A channel must keep the same meaning across states.
- **Stable numbers:** format every displayed value deliberately and use tabular numerals for changing readouts.
- **Local explanation:** attach a formula term, label, or observation to the evidence it interprets.
- **Restrained chrome:** use spacing and alignment before borders; one instrument surface is better than many cards.
- **Informative extremes:** make zero, sign reversal, saturation, divergence, failure, and completion legible when relevant.
- **Purposeful presets:** presets should expose a diagnostic state, not merely provide more buttons.

### Machine-made failure signatures

Remove these before delivery:

- a headline and subtitle that merely restate the host request;
- an instruction pill explaining an otherwise invisible affordance;
- a form panel whose only consequence is a large number;
- three or more equal cards holding unrelated status, prose, and values;
- a small stage beside a taller stack of controls and metrics;
- duplicated charts or views with no distinct explanatory role;
- a conclusion visible before the learner can produce its evidence;
- a “correct” state invented for an open-ended observation instrument;
- animation used only to make the component feel active;
- inconsistent scales in a comparison;
- global selectors, generic element IDs, page-level shortcuts, or unbounded loops that leak into the host;
- a reset that changes the random sample or leaves an old animation running;
- essential meaning available only through color, hover, or motion.

### Density correction

When the component feels empty, enlarge the model and bring evidence closer; do not add explanatory cards. When it feels crowded, remove redundant controls and repeated labels before shrinking text. If two independent claims remain, the host needs two components or two pages—the component should not hide that split behind tabs.

## 7. Acceptance

### Visual and learning review

Ask in this order:

1. Can a viewer identify the manipulable model and current state in two seconds?
2. Does the primary action visibly change the model itself?
3. Can the viewer connect that change to the intended insight without reading a remote paragraph?
4. Are multiple views truly coordinated and nonredundant?
5. Does the reveal follow evidence rather than replace it?
6. Does the initial state invite the right action without being empty or giving away the lesson?
7. Is the component still understandable when paused and under reduced motion?
8. Does it look and behave like one component rather than a miniature page or dashboard?

### State smoke matrix

Verify the states that exist for this component:

| State | Required observation |
|---|---|
| Initial | Model, affordance, current consequence, and essential labels are visible |
| Primary action | Geometry/behavior and every dependent readout update from one state |
| Alternate input | Keyboard or non-drag path reaches the same model state |
| Extreme/failure/reveal | Evidence remains visible and interpretation is accurate |
| Reset | Exact initial state returns and obsolete work is canceled |
| Rapid input | No stacked animation, stale render, lost pointer, or unbounded history |
| Resize | Model, controls, hit regions, and labels remain aligned |
| Reduced motion | Same information and actions remain available |
| Destroy/remount | No duplicate listeners, observers, timers, or renderer instances |

Require zero runtime errors and failed resources. Treat overflow, clipping, unreachable controls, stale coordinated views, and host pollution as delivery failures. A technically valid component still fails when its central causal relationship is visually weak.
