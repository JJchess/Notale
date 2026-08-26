# Interactive Learning Widget

Build a bounded interactive component, not a page. Place that learning instrument inside the assigned lecture page. The widget is not a small webpage, a dashboard, or a decorated form. It is a manipulable model whose visible behavior lets a learner discover, test, or verify one relationship.

The host owns the page title, narrative copy, outer composition, background, typography system, base palette, navigation, fixed frame, and shared runtime. The widget inherits those decisions. It earns its own identity through a **concept signature**: a subject-specific geometry, spatial organization, semantic color mapping, and motion behavior that make the underlying relationship tangible without inventing a second theme.

Read this reference completely before implementation. Use the early decision sections to choose a direction, the pattern library to construct the interaction, the craft and technical sections while building, and the acceptance matrix before delivery.

## Contents

1. Operating premise
2. Private interaction contract
3. Choose an interaction direction
4. Design the evidence
5. Compose the component
6. Interaction pattern library
7. State architecture
8. Input, feedback, and accessibility
9. Motion as causal evidence
10. Renderer-specific craft
11. Visual craft under the host theme
12. Implementation recipes
13. Transferable studies from high-craft explainers
14. Machine-made failure signatures
15. Acceptance and delivery

## 1. Operating premise

### The interaction is an argument

An effective learning widget makes a compact argument:

```text
learner action
  → changes a meaningful quantity
  → changes the model itself
  → produces direct visible evidence
  → supports one interpretation
```

Each arrow must be inspectable. If the action only changes a label, if the model change is hidden inside a calculation, or if the interpretation arrives before the evidence, the argument is broken.

The widget should answer all of these without relying on surrounding prose:

- What can I act on?
- What property will that action change?
- Where will I see the consequence?
- Which states are worth comparing?
- What remains invariant?
- What conclusion is justified by the evidence?

Do not begin from a list of controls or effects. Begin from the causal claim, then choose the smallest action that can expose it.

### One claim, one model, one dominant action

One component may contain several coordinated views, but it teaches one claim through one model. Multiple controls are acceptable only when they describe the same model and their relationship matters. Several unrelated sliders, tabs that hide separate activities, or a row of independent mini-demos are several weak widgets disguised as one.

Name one dominant action:

- drag the boundary normal;
- move the inspection window;
- scrub the transformation;
- choose two constrained resources;
- advance a signal one step;
- launch synchronized runs;
- perturb the input and observe recovery.

Secondary actions such as reset, pause, preset, or precise keyboard adjustment support that action. They do not compete with it.

### The visualization is the interface

The model is not an illustration placed beside the controls. The model itself should carry selection, causality, feedback, measurement, and state:

- values sit beside the geometry they measure;
- active paths illuminate on the stable graph;
- constraints appear at the attempted object;
- comparison outcomes stay attached to comparable views;
- a probe carries its own local sample and footprint;
- the changed formula term highlights next to the changed quantity.

Before adding a card, ask whether the information can live on the stage as an annotation, scale, trail, connector, local readout, or state mark. Integration produces clarity; a cabinet of panels produces distance.

### First paint is already informative

Render a representative state, not a blank promise:

- a vector with a nonzero angle and its boundary already visible;
- a process with the first transition applied;
- a probe resting on a meaningful region;
- a comparison at the same nontrivial starting state;
- a live system paused after several deterministic steps;
- a constrained choice with one item selected and remaining capacity visible.

The first paint should reveal the vocabulary of the component and invite the intended action. It must not disclose a conclusion that depends on trying; in that case show a plausible unresolved state with an obvious affordance and withhold the interpretation.

### Compact does not mean shallow

Remove explanatory chrome, not evidence. A compact component can contain:

- one large model;
- two coordinated encodings of the same state;
- a short local control cluster;
- a live measurement;
- a history trace;
- a meaningful negative or extreme state.

It becomes shallow when the model is replaced by a number, when all consequences are summarized in prose, or when states cannot be compared.

## 2. Private interaction contract

Write this contract privately before markup, rendering code, or page mutation:

```text
claim:          After using the component, the learner can state …
action:         The learner directly …
quantity:       That action changes …
model:          The component represents the relationship as …
direct evidence:The model itself changes through …
measure:        A nearby value/scale/trace quantifies …
invariant:      Across states, … stays fixed so comparison remains fair
states:         initial → active/intermediate → diagnostic extreme/failure/reveal → reset
reveal rule:    Interpretation appears when the evidence shows …
signature:      The subject-specific memorable behavior is …
anatomy:        dominant stage + local controls + local readout [+ distinct auxiliary view]
renderer:       DOM | SVG | Canvas, because …
inputs:         pointer …; keyboard/touch equivalent …
reset:          Restores these exact values and cancels …
teardown:       Releases …
host boundary:  Uses allotted region/tokens/assets/adapters; does not own …
```

Do not accept vague fields:

- “The graph updates” does not name evidence.
- “The user interacts with sliders” does not name an action.
- “The learner understands the concept” does not name a claim.
- “Animation demonstrates the result” does not identify a persistent state.
- “Reset everything” does not define deterministic values or canceled work.

### Test the contract before coding

Run four quick tests:

1. **Counterfactual:** if the interpretation text were removed, would the changed model still contain evidence?
2. **Pause:** if all motion stopped, would the current relationship still be legible?
3. **Invariant:** can a learner tell what was held constant between compared states?
4. **Transfer:** can the widget root be moved into another compatible host without importing its title, footer, global shortcuts, or theme?

If any answer is no, repair the contract before implementation.

### Ownership boundary

The host owns:

- page title, kicker, narrative copy, chapter labels, page numbers, navigation, footer;
- full-frame grid, outer padding, page background, base type roles, and general color mode;
- shared image assets, the page specification, and any required citations;
- host frame identifiers, page metadata, host-scale behavior, and shared lifecycle adapters.

The component owns:

- its root and internal layout;
- canonical state and transition rules;
- its model geometry or field;
- local controls, readouts, annotations, focus behavior, and feedback;
- its animation work, observers, pointer capture, deterministic reset, and cleanup.

Do not use the component reference to redesign the surrounding page. Do not create a second title zone, page background, global theme, navigation system, or general-purpose dashboard.

## 3. Choose an interaction direction

Before coding, choose one **interaction direction**. This is not an aesthetic theme. It is the dominant relationship between action and evidence. Commit to its spatial grammar, state transitions, and concept signature.

### Direction A — Instrument

Use when parameters continuously tune one model: damping, threshold, mixture, coefficient, gain, capacity, or another quantity.

- Spatial grammar: control adjacent to the property it changes; dominant model; live scale or readout at the consequence.
- Signature: a continuously deforming or responding object, not a value panel.
- Strong evidence: geometry, trajectory, field, extent, or distribution changes while a local measure tracks it.
- Avoid when the learner should construct, trace, compare runs, or discover a discrete constraint.

### Direction B — Manipulator

Use when position, angle, shape, order, or membership is itself meaningful and direct manipulation expresses the concept better than a form control.

- Spatial grammar: large manipulable object with visible handle or graspable body; nearby alternative control for precision.
- Signature: the same gesture that changes the model also reveals its governing geometry.
- Strong evidence: boundary rotates with its normal; support region changes with stance; vector components update with direction.
- Avoid dragging decorative cards or objects whose screen position has no semantic meaning.

### Direction C — Constructor

Use when understanding comes from assembling a valid configuration under rules: choose limited resources, connect compatible parts, allocate a budget, arrange a sequence, or satisfy competing constraints.

- Spatial grammar: available objects, construction area, and a constraint gauge sharing one visual field.
- Signature: the constraint is visible before and during the action, not reported only after submission.
- Strong evidence: capacity fills, conflicts mark their origin, and consequences update with the partial construction.
- Avoid turning the task into a conventional form followed by a generic success message.

### Direction D — Transformation

Use when two representations are the same object at different stages, coordinates, abstractions, or levels of detail.

- Spatial grammar: stable endpoints or aligned spaces connected by a scrubber, stages, correspondence traces, or moving identities.
- Signature: object identity persists while geometry changes.
- Strong evidence: the learner can stop at meaningful intermediate states and match parts across representations.
- Avoid cross-fading unrelated screenshots and calling it transformation.

### Direction E — Tracer

Use when the claim concerns propagation, dependency, calculation, responsibility, or a process path.

- Spatial grammar: one stable graph or route; active frontier; local rule at the current node; accumulated trace.
- Signature: energy, value, responsibility, or signal visibly travels along existing connections.
- Strong evidence: previous, current, and next context remain visible while local values update.
- Avoid replacing the graph with one card per step.

### Direction F — Synchronized comparison

Use when one teaching variable must be isolated across alternatives, models, parameter choices, or runs.

- Spatial grammar: aligned views with shared scales and a single launch/step clock.
- Signature: simultaneous progression from identical starting conditions.
- Strong evidence: divergence, convergence, overshoot, or tradeoff remains comparable without mental rescaling.
- Avoid independent mini-widgets that happen to be placed in a row.

### Direction G — Inspector

Use when a local operation or hidden structure becomes understandable by probing a larger object: convolution window, cross-section, ray, cursor sample, neighborhood, crop, or magnifier.

- Spatial grammar: overview with movable probe; explicit footprint; local detail; derived output tied by connectors or shared highlight.
- Signature: the probe reveals exactly what contributes to the local result.
- Strong evidence: source cells, weights, products, and output stay synchronized.
- Avoid tooltips that only repeat a value without exposing its origin.

### Direction H — Counterexample

Use when the learner must encounter a limitation, impossible strategy, misconception, or failure regime before receiving a reframe.

- Spatial grammar: plausible attempt area; accumulating evidence; preserved failure state; nearby reframe.
- Signature: the invariant or residual survives every plausible attempt.
- Strong evidence: best result, unresolved case, contradiction, boundary, or instability remains visible.
- Avoid arbitrary failure rules, fake quizzes, or explanations shown before a real attempt.

### Direction I — Live system

Use when the claim is an evolving system with internal state: training, optimization, ecology, feedback control, queueing, or iterative algorithms.

- Spatial grammar: dominant state field; compact internal structure; history trace; restrained control cluster.
- Signature: multiple views share one logical iteration and expose different consequences of the same state.
- Strong evidence: the actual simplified mechanism runs, or a deterministic surrogate is labeled honestly.
- Avoid animated wallpaper paired with fabricated metrics.

### Direction J — Prediction and reveal

Use when commitment before observation sharpens learning: predict a path, choose the stronger force, estimate an outcome, or classify a case, then reveal the mechanism.

- Spatial grammar: model in an unresolved state; small prediction action; visible run/reveal; comparison between prediction and outcome.
- Signature: the learner's commitment remains visible beside the resulting evidence.
- Strong evidence: the reveal animates or constructs the causal path, not just a correctness badge.
- Avoid trivia questions whose answer is already printed or whose interaction adds nothing to observation.

### Direction selection test

Choose the direction whose verb matches the claim:

| Claim depends on… | Prefer |
|---|---|
| tuning a quantity | Instrument |
| moving meaningful geometry | Manipulator |
| satisfying constraints | Constructor |
| preserving identity across representations | Transformation |
| following dependency or propagation | Tracer |
| isolating one variable across runs | Synchronized comparison |
| exposing a local operation | Inspector |
| discovering a limitation | Counterexample |
| observing an evolving mechanism | Live system |
| committing before evidence | Prediction and reveal |

Hybridize only when one direction remains dominant. An inspector may include an instrument for probe size; a live system may include synchronized comparison; a counterexample may transform into a new representation. Do not give both directions equal chrome or separate start points.

## 4. Design the evidence

### Evidence hierarchy

Build evidence in this order:

1. **Direct model evidence:** shape, position, path, magnitude, direction, connection, region, texture, trajectory, classification, or another model property changes.
2. **Measured evidence:** a local value, scale, dimension, formula term, count, trace, or comparison quantifies the model change.
3. **Interpretation:** a short conclusion appears only after the relevant evidence exists.

Never substitute glow, confetti, a toast, a progress bar, or changing status text for direct evidence. Those may draw attention to evidence but cannot be the evidence.

### Encode cause and consequence differently

Make the learner's cause and the model's consequence visually distinguishable:

- active control or manipulated object: focused outline, handle, grip, or semantic accent;
- immediate affected property: direct geometry change;
- propagated consequence: trail, edge activation, deformation, or secondary semantic color;
- measured result: local number, scale, or trace;
- interpretation: short quiet text after the evidence condition.

Do not color every changing object with the same accent. A single undifferentiated glow hides causal order.

### Reveal invariants

Good interactive evidence shows what does **not** change as clearly as what does:

- shared axes remain fixed during comparison;
- object identity persists during transformation;
- total budget stays constant while allocation changes;
- starting data and random seed remain fixed across runs;
- graph topology stays stable while values propagate;
- the probe footprint stays the same while location changes.

Use stable coordinates, persistent labels, construction lines, locked marks, or a quiet invariant readout. Do not make the learner infer fairness from memory.

### Use redundant encoding only for different questions

Two encodings of one quantity are justified when they answer different questions:

- direction by arrow and magnitude by length;
- total by filled extent and exact amount by number;
- current state by geometry and history by trace;
- category by hue and confidence by opacity;
- active path by edge emphasis and accumulation by node value.

Duplicating the same number in a card, label, badge, and chart is not evidence; it is noise.

### Make extremes diagnostic

Include an informative extreme, sign reversal, threshold, saturation, divergence, failure, or completion state when the concept has one. Ensure the visual encoding still works there:

- values that leave a plot mark the boundary rather than disappearing;
- a zero vector retains a readable origin and explanation;
- a saturated control shows the plateau in the model;
- an invalid construction preserves the attempted object and identifies the conflict;
- a divergent run remains on a shared scale with an off-scale marker.

Presets should take the learner to diagnostic states, not merely provide more buttons.

### Evidence should survive motion

Motion may reveal path, order, correspondence, accumulation, or recovery. When it stops, leave a legible result:

- a trail or final activated route;
- persistent before/after geometry;
- a current-step marker and accumulated expression;
- aligned final states;
- a prediction mark beside the outcome;
- a history trace with the current iteration.

If the claim exists only while pixels are moving, the component is not inspectable.

### Attach interpretation locally

Put a conclusion near the evidence that justifies it:

- beside the crossing point;
- under the shared comparison axis;
- next to the violated constraint;
- at the end of the active path;
- beside the selected validation minimum.

Keep it to one sentence or a compact equation. Long explanation belongs to the host page.

## 5. Compose the component

### Dominant-stage anatomy

Default to:

```text
┌ component root ───────────────────────────────────────────┐
│ compact mode/control row, only when needed                │
│                                                          │
│ ┌ dominant model / evidence field ─────────────────────┐ │
│ │ manipulable object, local labels, local readout,      │ │
│ │ current path/state, and direct feedback               │ │
│ └───────────────────────────────────────────────────────┘ │
│ quiet scale / formula / history / conclusion              │
└────────────────────────────────────────────────────────────┘
```

The stage should receive more area and contrast than all controls, explanations, and readouts combined.

### Named component compositions

Choose one deliberately.

#### Stage with instrument rail

Use for one dominant model and a few compact controls.

```text
short control rail
large stage
inline readout / scale / trace
```

Keep the rail to one line or a tight wrap. Put frequently adjusted controls nearest the stage. Move reset to the trailing edge. Do not let a tall control panel shrink the model.

#### Model with local inspector

Use for probes, cross-sections, kernels, or internal detail.

```text
overview model  ── linked footprint ── local detail/output
```

The overview stays dominant. The detail panel must show information unavailable at the same scale, not a magnified decorative copy. Use connectors, matching outlines, or shared coordinates to bind them.

#### Aligned comparison strip

Use for two to four alternatives that share a variable and scale.

```text
shared controls / clock
view A | view B | view C
shared axis or aligned outcome line
one conclusion
```

Give every view identical plot bounds, crop, starting state, and label placement. If three views become too narrow, stack them vertically with shared full-width axes rather than silently reducing legibility.

#### Stable graph with step rail

Use for propagation and calculation.

```text
stable graph or route
current local rule
back / step / play / reset
accumulated trace or expression
```

Keep the graph spatially stable. Put the step rail beneath or above it; never replace the graph with the stepper.

#### Construction field with constraint meter

Use for selection and assembly.

```text
available objects | construction field
constraint represented on the field
remaining capacity / conflict explanation
```

The meter should share the same semantic units as the construction. A mass budget might be a filled rail; compatibility may be connection sockets; coverage may be an outline or map.

#### Stage with subordinate history

Use for live systems.

```text
dominant current state
small internal structure
thin history trace
controls
```

History is evidence, not a dashboard peer. It should be shorter, quieter, and aligned to the current logical time.

### Proximity rules

- Put a control beside the property it changes.
- Put a value beside the geometry or behavior it measures.
- Put invalid-action feedback at the blocked object or constraint.
- Put a legend inside the visual region only when it does not occlude data.
- Put shared comparison controls once, not once per panel.
- Put reset away from the primary action but within the same control group.
- Use connectors and alignment before adding a border.

### Chrome budget

Count non-content elements: panels, borders, headings, pills, legends, hints, separators, badges, and shadows. Each must perform one job. A component usually needs:

- one root boundary, often visually implicit;
- zero or one internal stage surface;
- one compact control group;
- zero or one boxed primary readout;
- local annotations and quiet secondary values.

When the component feels empty, enlarge the model and bring evidence closer. Do not fill the space with explanatory cards. When it feels crowded, remove duplicate labels and controls before shrinking type.

### Responsive behavior inside a fixed page

The host page may use a fixed presentation frame, but the allotted component region can vary. Design to its actual bounds:

- use grid or flex tracks that allow the model to grow;
- set `min-width: 0` and `min-height: 0` on flexible children;
- make Canvas drawing size follow its CSS box through the host helper;
- preserve comparison scale when stacking;
- keep pointer hit regions aligned after page scaling;
- avoid nested scrolling;
- allow labels to wrap only where the page language supports it.

Do not solve a composition problem with `transform: scale()` on the component itself. The host already owns page scaling.

## 6. Interaction pattern library

Choose the smallest pattern that proves the claim. The following are reusable component blueprints, not topical templates.

### 6.1 Parameter instrument

Use when a continuous or discrete parameter controls one model.

```text
parameter
  → primary geometry or behavior
  → local measurement
  → optional distinct consequence view
```

Build:

1. Start at a representative nonzero value.
2. Draw the model at that value before styling the control.
3. Put the control close to the affected property.
4. Update the model continuously during input.
5. Highlight the exact term, dimension, or region being changed.
6. Add one diagnostic preset only when it reveals a meaningful regime.

Good instruments make the quantity tangible:

- a coefficient changes slope and the corresponding equation term;
- damping changes the trajectory envelope and settling time;
- capacity changes the feasible region and remaining budget;
- threshold moves a boundary while classification changes on the stage.

Weak instruments put a slider on the left and a large number on the right. The object between them must visibly respond.

For two parameters, reveal their relationship on the same model. If each parameter controls a different activity, split the lesson.

### 6.2 Bidirectional geometric manipulator

Use when a direct spatial action expresses the concept.

```text
drag meaningful object ↔ semantic keyboard/range control
                       → one canonical state
                       → geometry + measure + annotation
```

Build:

1. Draw a visible handle, graspable body, or hover preview before first use.
2. Convert pointer position into logical coordinates; never store raw screen pixels as model state.
3. Clamp or project the logical value into the valid domain.
4. Route drag and precise alternative input through the same transition.
5. Redraw all dependent evidence from the committed state.
6. Preserve a valid state on pointer cancellation.

Strong manipulators:

- rotate a vector to rotate its orthogonal boundary;
- drag a center to change a coverage region;
- move support points to change a stability polygon;
- reposition a sample to change neighborhood membership.

Position must carry meaning. Do not add drag to a card, knob, or ornament merely to make the component feel interactive.

Use a generous invisible hit target around thin handles. Show grab/grabbing cursors, focus indication, and a keyboard path that reaches the same logical states.

### 6.3 Constrained constructor

Use when the learner chooses, connects, allocates, or assembles under explicit limits.

```text
partial construction
  ↔ remaining capacity / compatibility
  → local consequence
  → valid or invalid next moves
```

Build:

1. Make the constraint visible before the first choice.
2. Start with a meaningful partial configuration when that helps reveal the units.
3. Update capacity and consequences after every accepted action.
4. Preview whether an action is valid before commitment when possible.
5. On rejection, preserve the attempted context and explain the exact violated rule locally.
6. Allow removal or reversal through the same object, not a hidden separate editor.

Distinguish three states:

- available and feasible;
- selected or placed;
- unavailable because of a specific current constraint.

Do not gray out an item without exposing why. Do not let visual selection, capacity totals, and risk consequences drift into separate state.

A constructor does not require a win state. It may be an open tradeoff instrument. Invent success only when the domain defines it.

### 6.4 Continuous transformation explorer

Use when identity across representations is the lesson.

```text
source objects
  → correspondence
  → meaningful intermediate geometry
  → target representation
```

Build:

1. Define endpoints from corresponding logical objects.
2. Interpolate actual geometry or properties, not screenshots.
3. Preserve identifiers, labels, and semantic colors across the transition.
4. Let the learner scrub and stop at meaningful intermediate states.
5. Mark important thresholds or named stages along the control.
6. Keep source and target coordinates available when comparison requires them.

Use motion to answer “where did this part go?” Persistent connector traces, paired marks, stable color roles, and labels moving with their objects are stronger than global fades.

Play/pause may demonstrate the transformation, but a scrubber or step path must leave the learner in control. Reduced motion should snap between the same named states or use short crossfades while preserving correspondence.

### 6.5 Causal tracer

Use for a process graph, forward/backward pass, dependency chain, flow, or calculation.

```text
stable topology
  + active frontier
  + local rule
  + received value
  + emitted consequence
  + accumulated trace
```

Build:

1. Lay out the full topology once.
2. Choose a start state with the graph and initial values visible.
3. Advance one logical transition per manual step.
4. Mark previous, current, and next context.
5. Attach the local rule to the active node or edge.
6. Let autoplay call the same transition as manual stepping.
7. Cancel autoplay immediately on manual input, reset, hidden state, or teardown.
8. Preserve the final route and result at completion.

Direction must be unmistakable through arrowheads, moving phase, edge gradients, or ordered activation—not through a detached “step 3” label alone.

When tracing backward responsibility through a forward graph, keep both directions distinguishable. The learner should see what value traveled forward and what influence travels backward without the topology jumping.

### 6.6 Synchronized comparison

Use to isolate one variable across alternatives.

```text
same data + same start + same scale + same clock
  → different teaching variable
  → aligned outcomes
```

Build:

1. State the single varying factor privately.
2. Seed or copy all shared starting data.
3. Use one transition clock and one step count.
4. Keep axes, camera, crop, normalization, and sample ordering fixed.
5. Mark off-scale values rather than rescaling one view.
6. Attach each outcome to its view and state the shared conclusion once.

Strong comparisons expose divergence as it happens: three learning rates descend the same landscape; three models fit the same samples; two loss functions respond to the same outlier.

Do not give each alternative its own start button, scale, or random sample. Do not highlight a preferred answer by hiding the evidence from the others; dim them only after the comparison remains readable.

### 6.7 Probe and inspection window

Use when a local operation is hidden inside a larger field.

```text
overview
  ↔ movable footprint
  ↔ extracted neighborhood
  ↔ local operation
  ↔ derived output position
```

Build:

1. Show the probe footprint before first interaction.
2. Snap or clamp it in logical coordinates.
3. Highlight source contributors in the overview.
4. Mirror those contributors in a local detail at a consistent orientation.
5. Show products, weights, or measurements in spatial correspondence.
6. Mark the exact output cell or result receiving the aggregate.
7. Update all views atomically from one probe state.

The learner should be able to trace one source item through the local operation into the result. Connectors, matching borders, and positional correspondence are more useful than a tooltip.

Support direct movement and a discrete keyboard path. When autoplay scans the field, manual interaction must take control without racing the timer.

### 6.8 Try, fail, and reframe

Use for limitations, counterexamples, impossible strategies, and misconceptions.

```text
plausible attempt
  → accumulating objective evidence
  → bounded failure or invariant
  → preserved state
  → new representation or method
```

Build:

1. Give a real, plausible action.
2. Track evidence such as best score, unresolved cases, residual, contradiction, or invariant.
3. Reveal the limitation after persuasive evidence, not after an arbitrary click count.
4. Preserve the learner's best or final attempt while explaining it.
5. Introduce the reframe by transforming or connecting existing objects when possible.
6. Let reset restore the unresolved starting state.

The failed state is the teaching artifact. Do not erase it with a modal, replace it with a red banner, or jump immediately to the solution.

The reframe should explain why the original representation failed. Adding a layer may fold space; changing coordinates may make separation possible; introducing memory may resolve an ambiguity. Preserve identity through the change.

### 6.9 Live system observer

Use for iterative and continuously evolving mechanisms.

```text
canonical logical state at iteration n
  ↔ dominant current model
  ↔ compact internal structure
  ↔ history or validation trace
```

Build:

1. Run the real simplified mechanism when feasible.
2. Separate logical stepping from visual interpolation.
3. Couple every view to the same committed iteration.
4. Provide start/pause, bounded manual stepping, deterministic reset, and one or two diagnostic presets.
5. Update expensive fields less often only if their displayed timestamp remains aligned.
6. Bound history, samples, particles, and stored frames.
7. Detect instability and turn it into visible evidence instead of allowing invalid numbers.

The current model is dominant. Network diagrams, metrics, and history support it. Avoid three equally weighted dashboard panels.

Honesty matters: if the mechanism is a scripted or precomputed surrogate, label it. Never display metrics disconnected from what is drawn.

### 6.10 Prediction and reveal

Use when committing before observation produces a useful comparison.

```text
unresolved model
  → learner prediction
  → mechanism runs or evidence is constructed
  → prediction remains visible
  → local comparison and interpretation
```

Build:

1. Ask for the smallest prediction that focuses attention.
2. Make the available options or predicted geometry part of the model, not a quiz card.
3. Preserve the prediction during the reveal.
4. Reveal the causal mechanism before showing correctness.
5. Compare outcome with prediction using distance, overlap, direction, or another domain measure.
6. Allow a new trial with changed initial conditions when repetition teaches a pattern.

Avoid scores unless repeated calibrated prediction is itself the activity. A one-shot concept reveal needs evidence and reflection, not points or confetti.

## 7. State architecture

### One canonical model state

Keep one state object or a small explicit state machine. Derive geometry, selected styles, annotations, values, feedback, completion, and accessible status from it. DOM classes, SVG attributes, Canvas pixels, and animation progress are views—not sources of truth.

```js
function createWidget(root, host) {
  const makeInitialState = () => ({
    value: 0.42,
    mode: "ready",
    step: 1,
    selected: [],
    running: false
  });

  let state = makeInitialState();
  let destroyed = false;

  function dispatch(action) {
    if (destroyed) return;
    const next = transition(state, action);
    if (next === state) return;
    state = next;
    scheduleRender();
  }

  function reset() {
    cancelActiveWork();
    state = makeInitialState();
    render(state);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelActiveWork();
    detachInputs();
  }

  attachInputs(dispatch);
  render(state);
  return { dispatch, reset, destroy };
}
```

The exact packaging may follow the page's established style. Preserve the invariants:

- one component root;
- one canonical logical state;
- one accepted transition path;
- one coordinated render path;
- one exact reset path;
- one idempotent teardown path.

### Separate logical, transient, and visual state

**Logical state** changes the model and must survive rerender: parameter values, selected objects, current step, seed, simulation variables, prediction, reveal state.

**Transient input state** supports a gesture but should not become domain truth: active pointer ID, drag offset, hover target, pressed key, focus ring source.

**Visual interpolation state** only animates between committed logical states: eased position, pulse phase, temporary flash, trail opacity. It must never decide the result.

Keep these layers distinct. A drag may preview a logical value, but pointer cancellation must either commit a valid projected value or return to the last valid state. A running animation may interpolate between steps, but manual stepping operates on logical steps.

### Define states explicitly

Every widget should name the states it actually needs:

```text
ready
  → manipulating / selecting / running
  → diagnostic extreme or invalid attempt
  → reveal / complete
  → ready through reset
```

Do not add generic `success` and `error` states when the domain has no correct answer. Prefer domain states such as `feasible`, `capacity-exceeded`, `diverging`, `stalled`, `boundary-crossed`, or `reveal-available`.

For a step process, represent the logical step as an index plus stable data, not a collection of independently toggled node classes. For a selection task, derive selected appearance, remaining capacity, disabled feasibility, and risk from one selected-ID set.

### Transition discipline

Each action should:

1. validate its payload;
2. project or clamp it into the logical domain;
3. compute the next state atomically;
4. reject without partial mutation when invalid;
5. schedule one coordinated render;
6. update accessible status only for meaningful committed changes.

Avoid handlers that directly edit three unrelated DOM nodes and hope they stay synchronized.

### Determinism

Use fixed initial values and seeded generation whenever reset, comparison, or diagnosis depends on reproducibility.

- Store the seed in logical state.
- Generate shared comparison data once, then copy it.
- Reset to the same initial sample unless “new sample” is a separate explicit action.
- Keep physics or iterative time steps bounded and deterministic enough for comparison.
- Do not use `Math.random()` during every render.

If a “new data” action is pedagogically useful, distinguish it from reset. Reset restores; regenerate changes the experiment.

### History and snapshots

Store only the history needed to support the claim:

- a bounded loss trace;
- a few comparison checkpoints;
- the learner's best attempt;
- a persistent final route;
- prediction and outcome.

Do not log every frame. Use a ring buffer or sample at logical intervals. Associate history with logical iteration, not wall-clock frame count.

### Long-running work

Separate:

- `stepModel(dt)` for bounded logical progress;
- `render(state, visualTime)` for display;
- `start`, `pause`, `step`, `reset`, and `destroy` controls.

Clamp large elapsed-time gaps after a hidden tab. Stop or pause work when the page is hidden if the host lifecycle expects it. Never fast-forward hundreds of simulation steps because the tab slept.

### Reset is a first-class transition

Reset must:

- cancel animation frames, timelines, intervals, timeouts, and delayed reveals;
- release active pointer capture when possible;
- restore exact initial logical values and seed;
- clear bounded history and transient feedback;
- redraw every coordinated view;
- restore labels, focus-independent styles, and control values;
- leave the component ready for the primary action again.

Do not implement reset by reloading the page or rebuilding unrelated host content.

### Teardown and remount

Destroy must be safe to call twice. Remove or abort:

- component-owned listeners;
- observers;
- timers and animation work;
- renderer instances and GPU resources;
- generated offscreen buffers if ownership requires it;
- pointer state;
- live-region work and delayed callbacks.

Remounting the page must not duplicate listeners, loops, SVG definitions, or canvases.

## 8. Input, feedback, and accessibility

### Prefer semantic controls when semantics fit

Use native:

- `button` for an action;
- `input type="range"` for an ordered bounded quantity;
- radio buttons for one-of-many modes;
- checkboxes for independent boolean choices;
- select only when options are numerous and comparison between them is not central.

Style them to fit the host, but retain focus, keyboard behavior, names, values, and disabled semantics.

Custom manipulation is appropriate when the object and the action share meaning. A draggable vector, boundary, sample, probe, or construction part can be stronger than a slider. A custom fake button is weaker than a native button.

### Pointer input

For custom manipulation:

- use Pointer Events;
- resolve coordinates relative to the component surface through the supplied host adapter or a transform-aware local conversion;
- capture only the active pointer after a valid pointer down;
- store the pointer ID;
- clamp in logical coordinates;
- handle `pointercancel`;
- release capture at completion;
- ignore secondary pointers unless the model explicitly supports them;
- do not use page-level `mousemove` listeners as the primary path.

Use an invisible or translucent hit region larger than the visible thin geometry. Keep hit testing based on the same transformed coordinate system as rendering.

### Keyboard equivalence

Provide an alternative that reaches the same logical states:

- arrow keys adjust a focused custom handle;
- a native range mirrors a drag;
- buttons step a process;
- selectable objects are real buttons or expose button/option semantics;
- Enter/Space commits a focused choice;
- Escape may cancel a transient manipulation when that behavior is clear.

Keyboard equivalence means equivalent model access, not identical physical gestures.

Stop key propagation only when a focused component control consumes that key. Never suppress host navigation globally. Preserve a logical tab order and visible focus.

### Touch

Design visible marks and invisible hit regions separately. A small probe can have a larger transparent target without becoming visually heavy. Avoid interactions that require hover, right click, wheel input, or pixel-perfect dragging. When hover provides a preview, touch must still reveal the same information after tap or focus.

Prevent page-level gestures only during an active component manipulation and only where required.

### Affordance without instruction stickers

Express action through:

- visible handles;
- cursor change;
- hover or focus preview;
- partial starting motion;
- ghost placement;
- track ticks;
- object shape;
- local verbs on actual controls;
- a restrained first-use emphasis.

A concise host-provided instruction may be necessary for a novel gesture. Do not create a floating “Tip: drag…” pill to compensate for an invisible affordance.

### Feedback hierarchy

Feedback should occur at the consequence:

1. input object acknowledges hover, focus, and press;
2. affected geometry changes;
3. local measurement updates;
4. propagated consequence traces or settles;
5. interpretation appears if its evidence condition is met.

Use a short flash, trace, or ease to direct attention to the actual changed object. Avoid generic success animation.

### Invalid actions

For an invalid or constrained action:

- preview infeasibility before commitment when possible;
- preserve the last valid logical state;
- keep the attempted target or relationship identifiable;
- mark the violated constraint at its location;
- state the exact reason in one local phrase;
- allow immediate recovery.

Do not merely disable all unavailable choices. When disabling is necessary, expose why through adjacent capacity, compatibility, or constraint evidence.

### Color, shape, and motion redundancy

Color may encode a state only when another channel supports it:

- hue + position;
- hue + label;
- hue + stroke pattern;
- hue + arrow direction;
- hue + symbol shape;
- hue + opacity or enclosure.

Do not use green/red alone for correctness, positive/negative, or two classes. Make focus and selected states distinguishable without color.

### Accessible status

Use one restrained live region for meaningful committed changes:

- “Remaining mass 12 kilograms” after a selection;
- “Step 4 of 6, signal reached output node” after manual advance;
- “Constraint exceeded by 3 units” after an invalid attempt.

Do not announce continuous pointer movement, animation frames, hover, decorative pulses, or every simulation tick. For rapidly changing values, update visible text continuously but announce only on commitment or pause.

### Canvas accessibility

Canvas may draw the dense model, but essential controls, current values, instructions, and conclusions remain in DOM or SVG. Provide a concise accessible description of the current model state where needed. Do not attempt to duplicate every particle or pixel in the accessibility tree.

## 9. Motion as causal evidence

### Assign motion a job

Every motion must perform at least one:

- show direction;
- preserve object identity;
- reveal order;
- expose propagation;
- compare speed or stability;
- display accumulation or dissipation;
- transition between meaningful states;
- attract attention to a just-changed consequence.

If removing a motion leaves comprehension unchanged, remove it unless it is a very restrained state affordance.

### Motion layers

Use three layers deliberately:

1. **State response:** hover, press, selection, value flash. Usually 100–180 ms.
2. **Model transition:** geometry changes, transformation, step advance. Usually 220–600 ms depending on travel and meaning.
3. **Continuous mechanism:** simulation, signal flow, scanning, or oscillation. Controlled by logical time and stoppable.

Do not run unrelated ambient loops inside an already active learning model. The host may own atmosphere; the component owns causal motion.

### Temporal grammar

- Input acknowledgment begins immediately.
- The primary model consequence begins in the same perceptual moment.
- Propagated consequences follow in causal order.
- Interpretation arrives after the evidence, not before or simultaneously.
- Exits are usually faster than entrances.
- Repeated manual input replaces or retargets animation rather than stacking it.

Use duration to communicate distance and complexity, not to decorate importance. A large spatial transformation can take longer than a local value update. Do not make routine adjustments theatrical.

### Interpolation versus simulation

For deterministic transitions, interpolate between logical states. For systems governed by repeated rules, step the model. Do not fake a physical or algorithmic result with a scripted endpoint when the simplified mechanism can run clearly.

Conversely, do not introduce a heavy physics engine for a concept that needs one analytic curve or constrained geometric interpolation.

### Manual control and autoplay

Autoplay is a convenience. It must:

- call the same transition used by manual stepping;
- expose pause;
- stop at a meaningful completion or bounded loop;
- cancel on manual step, scrub, drag, reset, or teardown;
- never make an essential state unreachable manually.

When a learner scrubs a timeline, the playhead is canonical. Do not let an old animation continue writing a competing value.

### Trails and persistence

Use trails when the path is evidence:

- a descent path on a landscape;
- signal propagation through edges;
- a trajectory envelope;
- a transformed object's correspondence;
- probe scan order.

Bound trail length and opacity. A trail should clarify past states without obscuring the current model.

### Reduced motion

Reduced motion preserves information and reachable states:

- replace travel with immediate placement plus persistent connectors;
- replace particle flow with arrow direction and activated routes;
- replace sweeping transformation with named discrete steps or short fades;
- replace pulsing with a stable outline;
- render the final state of an entrance immediately;
- keep manual controls and evidence identical.

Never hide the model, disable the interaction, or leave content at opacity zero.

## 10. Renderer-specific craft

### Choose the renderer from the representation

Use semantic DOM for:

- controls;
- short records;
- discrete choices;
- sortable or placeable labeled items;
- text-heavy states;
- accessible readouts.

Use SVG for:

- precise lines, vectors, nodes, regions, paths, axes, and connectors;
- small or medium data-bound sets;
- direct manipulation of named geometric elements;
- diagrams whose elements need focus, labels, or individual state;
- analytic curves and boundaries.

Use Canvas for:

- dense fields;
- image-like grids;
- thousands of moving marks;
- particle or pixel-based models;
- a scene that redraws as one surface;
- expensive visualizations that do not benefit from named DOM elements.

Use a hybrid when the layers have different needs: Canvas field plus DOM controls and labels; SVG overlay over Canvas; DOM construction objects beside an SVG consequence view. Keep one canonical state and one coordinated render.

### DOM craft

- Use real controls and concise labels.
- Keep selection state in state, then derive `aria-pressed`, disabled feasibility, classes, and readouts.
- Avoid rebuilding the entire subtree on continuous input.
- Keep changing numbers stable with tabular numerals and explicit formatting.
- Prevent feedback text from changing layout height; reserve a stable local line when necessary.
- Scope selectors beneath the component root.

### SVG craft

- Use a viewBox that matches a useful drawing coordinate system.
- Use named groups for semantic layers: construction, data, active path, annotation, handles.
- Compute analytic geometry and update attributes; do not approximate a crisp boundary by sampling dots.
- Add `vector-effect="non-scaling-stroke"` where scaled hairlines must stay crisp.
- Define arrowheads, clips, masks, and gradients with component-unique IDs.
- Keep text horizontal and legible unless the subject requires rotation.
- Place invisible wider hit paths behind thin visible paths.
- Convert pointer coordinates through the surface bounding box and viewBox.
- Avoid clearing and rebuilding all SVG elements for every pointer move.

Recommended layer order:

```text
background construction
reference geometry / invariant
model data
active or selected evidence
handles and hit regions
labels and local measurements
focus / feedback
```

### Canvas craft

Separate model stepping from drawing. Use the host's Canvas helper and resize callback. Draw at device-appropriate resolution while using CSS pixels for layout and logical coordinates for state.

Recommended draw order:

```text
clear
quiet field/grid
invariant/reference marks
primary model
active consequence/trail
annotations that belong on canvas
```

Keep essential text in DOM when it changes, requires accessibility, or needs exact typography. Canvas labels are appropriate for numerous tightly bound marks, but their font, contrast, and alignment must be deliberate.

Avoid a permanent `requestAnimationFrame` loop for a static instrument. Mark the view dirty and render on demand. For continuous systems, stop the loop on teardown and honor reduced motion.

### Hybrid alignment

When overlaying DOM or SVG on Canvas:

- share a common logical coordinate transform;
- update overlay position after resize;
- ensure page scaling is accounted for exactly once;
- avoid reading layout on every frame;
- keep pointer hit testing in the same coordinate space;
- use stable anchor points rather than guessed offsets.

### Performance priorities

Optimize only after representation is correct:

- cap particle and history counts;
- precompute static geometry;
- cache offscreen image-like layers;
- throttle expensive field recomputation while rendering the final committed value;
- schedule at most one pending render for high-frequency input;
- update DOM text only when its formatted value changes;
- avoid allocating large arrays per frame;
- suspend work when hidden or destroyed.

Performance degradation must not change the logical result or comparison fairness. Reduce visual density or interpolation first.

## 11. Visual craft under the host theme

### Inherit, then specialize

Use host tokens for:

- background and surfaces;
- general text and muted text;
- base borders;
- display and body type roles;
- standard control treatment;
- page-level accent behavior.

Add only component-owned semantics:

- active versus inactive;
- cause versus consequence;
- class/category distinctions required by the subject;
- positive/negative where the domain defines them;
- a concept-specific shape, texture, line, or motion signature.

Do not replace the host background, import another font system, or wrap the component in an unrelated themed poster.

### Define a concept signature

Before CSS, write one sentence:

```text
The component will be remembered for …
```

Good signatures emerge from the model:

- a decision boundary pivoting around its bias;
- a space visibly folding until classes separate;
- responsibility flowing backward along a stable graph;
- identical runners diverging on one shared terrain;
- a kernel window carrying source cells into an output;
- a constraint rail compressing as objects are selected;
- a trajectory leaving a fading but persistent envelope.

Bad signatures are generic effects:

- neon glow;
- glass cards;
- gradient blobs;
- floating particles unrelated to the model;
- a giant decorative number;
- a hover lift applied to everything.

### Shape language

Let shape express the subject:

- vectors, axes, construction lines, and dimension ticks for geometry;
- channels, pulses, and junctions for propagation;
- cells, footprints, and mapped outputs for local operators;
- rails, sockets, and capacity bands for constraints;
- fields, contours, and trajectories for optimization;
- layers, folds, and correspondence threads for transformations.

Repeat a small shape vocabulary consistently. Do not mix pills, soft blobs, sharp technical cut corners, glass panels, and cartoon badges without a conceptual reason.

### Semantic color

Use a restrained budget:

- host surface and ink;
- one primary active accent;
- one secondary consequence or comparison accent when necessary;
- domain category colors only when categories carry meaning;
- warning/error/success colors only for actual domain semantics.

Keep each color role stable across states and coordinated views. If cyan means input in the model, do not reuse it for a different “best result” badge. Use opacity, stroke weight, pattern, or enclosure to show intensity without multiplying hues.

### Hierarchy

Exactly one element dominates: the model, field, trajectory, or transformation. Establish hierarchy through:

- area;
- contrast;
- spatial centrality;
- detail;
- motion;
- annotation density.

Controls should be discoverable but subordinate. Readouts should be close but not louder than what they measure. If two views are equally large, they must be a true comparison; otherwise demote one.

### Spacing and alignment

Use the host rhythm and a small internal spacing scale. Align:

- control labels with their values;
- compared plots to shared baselines;
- local readouts to measured geometry;
- steps to stable graph coordinates;
- probe detail to the overview footprint;
- formula terms to the objects they describe.

Irregular gaps and near-missed alignments read as machine-generated even when colors are attractive.

### Typography and numbers

- Use host type roles.
- Keep labels short and in the page language.
- Do not create bilingual interface labels unless the domain term genuinely requires both.
- Format all changing numbers with deliberate precision.
- Use tabular numerals for changing readouts.
- Pair units with values consistently.
- Avoid tiny uppercase labels when Chinese or projection distance makes them hard to read.
- Do not repeat the page title inside the component.

### Controls as instruments

Controls should feel coupled to the model:

- slider track may carry meaningful ticks or regimes;
- a play button reflects running/paused state;
- a step control advances one actual transition;
- a preset names a diagnostic condition;
- a constrained object previews feasibility;
- a direct handle visually belongs to the geometry.

Give every actionable element hover, active, focus, and disabled treatment. Do not overstyle standard controls into ornamental objects that obscure their function.

### Local annotation

Prefer:

- leader lines;
- on-path labels;
- bracketed dimensions;
- small formula terms;
- direct object labels;
- threshold marks;
- origin and endpoint labels;
- shared axis notes.

Avoid:

- remote prose cards;
- legends for two directly labelable items;
- instruction badges;
- status cards;
- repeated section headings inside a small component.

### Craft check

Before technical QA, ask:

1. Is the model visibly dominant?
2. Is the concept signature derived from the subject?
3. Does the host theme remain intact?
4. Are cause and consequence visually distinct?
5. Are comparable states spatially and numerically fair?
6. Does every control feel attached to what it changes?
7. Can redundant panels, borders, labels, or effects be removed?
8. Would a still screenshot communicate the current relationship?

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

## 13. Transferable studies from high-craft explainers

These studies abstract successful mechanisms seen in high-craft interactive explainers. They are not neural-network templates. Transfer the relationship, not the dark palette, terminology, exact layout, or Canvas-heavy implementation.

### Study A — Geometry that explains the equation

**Source mechanism:** a weight vector and a decision boundary remain perpendicular. Dragging the vector rotates the boundary; changing bias translates it. Points switch regions directly on the stage.

**Why it works:**

- the manipulable object is a mathematical quantity;
- direct geometry changes before any explanation;
- vector, boundary, points, and local values share coordinates;
- three conclusions emerge from one model instead of three cards.

**Transfer to:**

- normal vectors and planes;
- torque arm and force direction;
- separating thresholds;
- light rays and surface normals;
- constraint lines in optimization;
- camera orientation and view plane.

**Preserve:** analytic geometry, a visible handle, stable reference axes, and local measurement.

**Do not transfer:** neon styling, arbitrary particle backgrounds, or multiple unrelated parameter cards.

### Study B — Reframe through a continuous spatial change

**Source mechanism:** the learner first attempts a separation that cannot solve the case. A staged transformation folds or remaps the same points into a representation where a new boundary succeeds.

**Why it works:**

- failure is genuine and remains visible;
- object identity persists through color and motion;
- the new method changes representation, not merely the answer;
- stages structure the reveal without replacing the central model.

**Transfer to:**

- coordinate transforms;
- feature engineering;
- map projections;
- unwrapping periodic data;
- changing bases;
- sorting or grouping representations;
- reframing a physical constraint.

**Preserve:** the failed state, correspondence, meaningful intermediate states, and an explicit invariant.

**Do not transfer:** a generic “next” carousel whose panels contain unrelated diagrams.

### Study C — Stable topology with traveling responsibility

**Source mechanism:** values advance through a stable network; later, influence moves backward over the same topology. Active edges, local arithmetic, node values, and accumulated expressions update in causal order.

**Why it works:**

- spatial memory is preserved;
- direction is embodied in path activation;
- local rules appear where they operate;
- manual and automatic stepping share the same logical sequence.

**Transfer to:**

- supply chains;
- dependency graphs;
- electrical paths;
- biological signaling;
- calculation trees;
- message routing;
- responsibility attribution.

**Preserve:** stable layout, previous/current/next context, direction distinction, and completion evidence.

**Do not transfer:** moving dots on lines with no visible values or rules.

### Study D — Fairness through synchronized clocks

**Source mechanism:** multiple parameter choices begin on the same landscape at the same point and move under one clock. Shared axes make overshoot, slow convergence, and stability directly comparable.

**Why it works:**

- only one variable differs;
- all alternatives begin together;
- the landscape and scale remain fixed;
- divergent behavior is retained instead of rescaled away.

**Transfer to:**

- numerical integration step sizes;
- damping regimes;
- queue policies;
- resource strategies;
- control gains;
- search algorithms;
- competing models on shared data.

**Preserve:** identical seed, start, scale, clock, and update count.

**Do not transfer:** separate controls or auto-scaling plots for each run.

### Study E — A real mechanism with coordinated views

**Source mechanism:** a simplified model actually trains. A dominant decision field, compact internal network, loss history, controls, and diagnostic messages all refer to the same iteration.

**Why it works:**

- the primary field visibly improves or fails;
- internal structure is subordinate but alive;
- history provides temporal evidence;
- presets create meaningfully different regimes;
- instability becomes a domain state.

**Transfer to:**

- iterative solvers;
- ecological populations;
- control systems;
- optimization;
- spreading processes;
- queue dynamics;
- adaptive filters.

**Preserve:** real or honest deterministic mechanism, one logical timestamp, bounded work, start/pause/step/reset, and diagnostic extremes.

**Do not transfer:** dashboard equality, fabricated metrics, or expensive fields updating on unrelated clocks.

### Study F — Aligned views reveal generalization

**Source mechanism:** simple, balanced, and overly flexible fits share data, axes, and progression. Training and validation traces stay aligned so the best stopping point and overfitting gap become visible.

**Why it works:**

- comparison is spatially fair;
- data identity is stable;
- model complexity changes one dimension;
- the conclusion sits at the divergence between two forms of evidence.

**Transfer to:**

- calibration versus fit;
- compression tradeoffs;
- smoothing strength;
- capacity planning;
- signal filtering;
- bias/variance;
- training versus real-world performance.

**Preserve:** shared samples, axes, stage, and stopping logic.

**Do not transfer:** three unaligned chart cards or a highlighted winner without the comparative path.

### Study G — Probe, footprint, products, output

**Source mechanism:** a movable local window highlights source cells, mirrors them beside editable weights, shows each product, aggregates them, and marks the corresponding output location. Automatic scanning and manual movement remain synchronized.

**Why it works:**

- overview and detail share a visible footprint;
- each contribution is traceable;
- the aggregate is spatially tied to its output;
- editing source or weights changes all views from one state;
- scanning shows repetition without hiding the local rule.

**Transfer to:**

- image filters;
- moving averages;
- neighborhood voting;
- local statistics;
- finite-difference stencils;
- audio windows;
- spatial sampling.

**Preserve:** orientation, footprint, one-to-one correspondence, exact aggregation, output mapping, and input ownership.

**Do not transfer:** a disconnected magnifier, tooltip-only inspection, or animation whose scan position differs from the computed output.

### What the source examples do not justify copying

High quality there does not imply universal use of:

- dark backgrounds;
- cyan and magenta;
- Canvas on every page;
- continuous RAF loops;
- large amounts of simulation code;
- neural-network diagrams;
- dense technical readouts;
- 14-page narrative dependencies.

Choose representation and visual signature from the assigned component. The transferable lesson is deep coupling between action, model, evidence, and state.

## 14. Machine-made failure signatures

Remove these before delivery.

### Page disguised as component

- repeats the page title and subtitle;
- creates its own full-background visual theme;
- adds chapter labels, navigation, footer, or page count;
- includes several article sections;
- owns global keyboard shortcuts;
- applies global selectors or resets.

Repair by restoring one root, one teaching region, and one model.

### Form-to-number pseudo-interaction

- controls dominate the composition;
- the model is tiny or absent;
- action changes only a numeric card;
- relationship is described in text rather than drawn;
- sliders operate independent quantities with no shared model.

Repair by making the affected object dominant and placing the value beside its direct visual consequence.

### Dashboard cabinet

- three or more equal cards hold heterogeneous status, prose, and values;
- every piece of information has a border;
- a tall sidebar compresses the stage;
- duplicated charts present no different explanatory dimension;
- status is styled as a KPI.

Repair by moving values and annotations onto the stage, keeping one boxed readout at most, and demoting history or internal structure.

### Invisible affordance

- drag works only after accidental discovery;
- a tooltip or instruction pill explains an unmarked object;
- hover is the only way to reveal essential information;
- thin lines have thin hit regions;
- touch and keyboard cannot reach the state.

Repair with handles, hover/focus preview, cursors, semantic alternatives, and larger invisible hit targets.

### Fake causality

- an animation plays but the displayed numbers are scripted separately;
- nodes flash in order without local values or rules;
- a metric changes on a timer unrelated to the drawn model;
- a transformation is a cross-fade;
- a success state appears after a fixed number of clicks rather than evidence.

Repair by sharing one state and computing each view from the same snapshot.

### Unfair comparison

- alternatives use different samples, axes, crops, clocks, or starting states;
- each plot rescales independently;
- one run starts later;
- divergent values vanish;
- a preferred alternative receives more visual detail.

Repair by freezing invariants, aligning scales, and controlling all runs through one action.

### State drift

- control value, geometry, label, and readout disagree;
- direct manipulation does not update the keyboard alternative;
- autoplay and manual step race;
- reset creates new random data unintentionally;
- an old animation overwrites a newer input;
- selection is stored in both DOM classes and JavaScript arrays.

Repair with one canonical state, one transition path, and one render.

### Decorative motion

- everything pulses or floats;
- glow substitutes for direction or magnitude;
- entrance animation repeats on every update;
- a long transition delays routine adjustment;
- continuous RAF runs on a static component;
- reduced motion removes evidence.

Repair by assigning each motion a causal job and leaving a persistent state.

### Generic visual slop

- gradient mesh or glass panel unrelated to subject;
- emoji headings;
- bilingual double labels;
- instruction stickers;
- excessive pills;
- giant generic number;
- arbitrary card hover lift;
- inconsistent radii and border weights;
- many accent colors without stable semantics;
- tiny labels and unformatted floating-point output.

Repair by inheriting the host theme and defining one subject-specific signature.

### False completion

- “Done” appears because every step was visited, though the relationship is still unclear;
- correct/incorrect is invented for an open-ended instrument;
- conclusion appears before the learner creates evidence;
- final motion ends on an empty or reset state;
- the component cannot replay its primary action.

Repair by defining a domain completion or reveal condition and preserving the final evidence.

### Fragile engineering

- page-level ID lookup reaches outside the component;
- pointer coordinates ignore host scaling;
- timers or observers survive remount;
- generated history grows without bound;
- Canvas text is the only accessible explanation;
- layout depends on fixed pixel widths inside a smaller host region;
- resize moves graphics but not hit regions;
- third-party rendering is used where analytic geometry would be clearer.

Repair through the technical contract, not a visual patch.

## 15. Acceptance and delivery

### Review the learning argument first

Ask in order:

1. Can a viewer identify the model, current state, and primary action within two seconds?
2. Does the primary action alter a meaningful quantity?
3. Does that quantity visibly change the model itself?
4. Is the direct consequence stronger than the readout or explanation?
5. Can the learner identify what stayed invariant?
6. Does measured evidence quantify rather than replace direct evidence?
7. Does interpretation follow the relevant evidence?
8. Is one claim taught through one coherent model?

Any “no” is a design failure even when the page renders cleanly.

### Review craft

1. Is one element visually dominant?
2. Is the concept signature specific to the subject?
3. Does the component inherit rather than replace the page theme?
4. Are cause, consequence, selection, and constraint visually distinct?
5. Are controls adjacent to what they change?
6. Are values and explanations attached to evidence?
7. Are comparable views aligned and fair?
8. Does the current state remain legible when paused?
9. Are all visible numbers formatted deliberately?
10. Have machine-made patterns been removed?

### State smoke matrix

Exercise every state that exists:

| State | Required observation |
|---|---|
| Initial | Representative model, primary affordance, current consequence, and essential labels are visible |
| Hover/focus | Actionable target responds without shifting layout; focus is visible |
| Primary pointer action | Logical quantity, model geometry/behavior, and every dependent view update together |
| Keyboard/touch alternative | Reaches the same logical state and evidence |
| Intermediate | Relationship remains inspectable; labels and identity persist |
| Diagnostic extreme | Threshold, reversal, saturation, divergence, invalidity, or completion remains legible |
| Invalid attempt | Last valid model persists; attempted object and exact constraint are identifiable |
| Reveal | Interpretation appears only after its evidence and does not erase that evidence |
| Pause | Current state is stable and meaningful |
| Reset | Exact initial state returns; stale feedback, history, and active work are removed |
| Rapid input | No animation stack, stale write, lost pointer, or unbounded history |
| Resize/page scale | Drawing, overlay, controls, hit regions, and labels remain aligned |
| Reduced motion | Same information, states, and actions remain available |
| Destroy/remount | No duplicate listener, observer, timer, loop, canvas, or renderer |

### Pattern-specific checks

**Instrument**

- Control range and units match the model.
- Diagnostic presets reveal different regimes.
- Direct model change is visible throughout input.

**Manipulator**

- Handle is discoverable before use.
- Screen coordinates map correctly after scaling.
- Cancellation leaves a valid state.
- Precise alternative input stays synchronized.

**Constructor**

- Constraint is visible before action.
- Feasibility is derived from current construction.
- Invalid feedback identifies the exact conflict.
- Removal and reversal work.

**Transformation**

- Objects preserve identity.
- Intermediate states are meaningful.
- Scrubbing controls the canonical state.
- Reduced motion preserves correspondence.

**Tracer**

- Topology remains stable.
- Direction, local rule, received value, and emitted result are visible.
- Manual and autoplay paths are identical.
- Completion preserves the route.

**Synchronized comparison**

- Data, start, axes, crop, clock, and update count match.
- Only the teaching variable differs.
- Off-scale and divergent values remain represented.

**Inspector**

- Footprint, local detail, operation, and output are synchronized.
- Orientation and indexing are consistent.
- Manual movement takes control from autoplay.

**Counterexample**

- Attempt is genuine.
- Failure evidence is objective and preserved.
- Reveal timing is evidence-based.
- Reframe explains the limitation.

**Live system**

- Mechanism is real or honestly labeled.
- All views share a logical timestamp.
- Work and history are bounded.
- Pause, step, reset, and instability handling are correct.

**Prediction and reveal**

- Prediction is committed before evidence.
- Prediction remains visible.
- Mechanism is shown before correctness.
- Repetition changes meaningful initial conditions.

### Technical delivery gate

Require:

- zero JavaScript errors;
- zero failed required resources;
- no overflow, clipping, nested scrolling, or unreachable controls;
- no host selector, style, event, or lifecycle pollution;
- no stale coordinated view;
- no lost final value after rapid input;
- exact reset;
- safe repeated teardown;
- expected behavior under the host page scale;
- required `Check` screenshots for materially different visual states.

Passing automated checks does not establish quality. Inspect the initial, active, diagnostic, and reset states as images. Confirm the evidence is visually dominant and the component reads as one designed instrument rather than a collection of functioning controls.

### Delivery report

Report only what was actually implemented and verified:

- learner action;
- changed quantity;
- direct visual evidence;
- alternate input path;
- diagnostic/reveal state;
- reset and cleanup behavior;
- last checks run.

Do not claim interaction quality from code inspection alone. Do not report a state you did not exercise.
