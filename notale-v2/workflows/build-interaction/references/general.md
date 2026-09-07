# General Learning Interaction

Exploration, simulation, construction, prediction, diagnosis, decision, and play are mechanics inside one consequential learning loop. Renderer choice follows that loop; it does not define it.

## Require a learning loop

The interaction must preserve this chain:

`learner action → canonical model transition → visible evidence → rule-based consequence → meaningful next action`

All five links must be inspectable. Redesign the mechanic when the proposed action is only:

- reveal or advance through predetermined content;
- hover for labels;
- filter fixed records without changing a model or decision;
- drag an object whose position has no rule or consequence;
- watch a simulation without prediction, control, measurement, or comparison;
- choose an answer that is only checked against an answer key;
- collect arbitrary points unrelated to conceptual quality.

Do not add a win state to open exploration. When completion exists, derive it from actual model conditions, constraints, measurements, or objectives—not click count, visited screens, elapsed animation, or a detached answer table.

Every consequential outcome must be computed from the learner's current input through a declared domain model—such as equations, algorithms, constraints, state-transition rules, data transformations, or simulation steps. Scripted animation branches, UI-choice lookups, arbitrary score changes, and appearance-only mappings may visualize an outcome but must not substitute for the model.

## Write the interaction contract

Refine the first-response construction decision with these questions before UI work; no separate written contract:

| Decision | Required answer |
|---|---|
| Learning target | What relationship should the learner become able to predict, control, construct, diagnose, or explain? |
| Likely misconception | What plausible but incomplete model should the interaction expose? |
| First action | What meaningful action can occur immediately? |
| Canonical state | Which entities, variables, units, constraints, phases, and attempts are authoritative? |
| Transition | How does the first action change state? |
| Evidence | What geometry, measurement, trace, chart, comparison, risk, or constraint changes? |
| Consequence | What becomes possible, impossible, safer, worse, more stable, or more accurate? |
| Next action | How can the learner test, revise, repair, compare, or transfer? |
| Visual world | What material, stage metaphor, graphic vocabulary, and motion behavior make the mechanism tangible? |
| Signature mechanism | Which action–consequence event should be remembered after the page closes? |
| Boundary states | Which representative, limit, invalid, failure, and success states must be designed? |
| Reset | What exact snapshot, seed, view, evidence, and support state returns? |

Use real units and valid ranges. State whether a model is calibrated, approximate, or an explanatory surrogate. Name assumptions and the behavior preserved by simplification; visual plausibility is not scientific accuracy.

## Make the learning world the interface

The stage is not an illustration with its inputs set apart from it. It is the place where action, state, and evidence meet.

- Give the model world the largest uninterrupted region.
- Put each control beside the variable or object it changes.
- Put measurements beside their source and constraints beside the action they constrain.
- Return feedback to the changed object, path, comparison, or state; do not exile it to a generic message area.
- Keep the next legal action visible in the same world.
- Let status appear in the stage when it belongs to the system; reserve separate chrome for navigation and genuinely global actions.

The initial view must already be alive and informative. Start at a representative nonzero state with visible evidence and an obvious first action. Avoid an empty canvas, a centered Start button, or a fully solved configuration.

### Choose a representation by intent

Use a **reference representation** when the learner needs a stable map of parts, locations, connections, or categories. Use an **intuition representation** when the learner must see a mechanism, flow, force, transformation, or local rule. For physical topics, draw recognizable functional parts and the mechanism between them. For abstract topics, use a spatial metaphor only when its geometry preserves the actual rule.

Labels confirm object identity; they do not replace the mechanism. A circle labelled “pressure” is not evidence of pressure. Show the surface, force direction, particle density, gauge response, or another model-derived consequence.

### Build subject-specific visual language

The supplied theme owns palette, typography, common surfaces, and controls. This reference owns the learning world's geometry and behavior.

Choose:

- one material or environment from the subject;
- functional silhouettes for the main objects;
- a stable vocabulary for boundaries, guides, forces, traces, selections, risk, and success;
- background, governing system, operative objects, and evidence layers with distinct roles;
- semantic theme colors for category, state, intensity, and exception;
- one signature interaction where the governing relationship becomes unusually clear.

Use continuous color only for a continuous variable such as temperature, depth, density, potential, or intensity. Use discrete roles for categories and states. Texture should come from material logic—hatching, particles, fibers, strata, paths, accumulation—not from indiscriminate blur or noise.

Ambient motion may give the world life, but it stays slower and quieter than learner-caused motion. Learner actions receive the clearest trace, transition, count, flash, ghost, or measured response so cause and effect remain attributable.

## Choose mechanics inside one model

These are composable mechanics, not reference categories. Use only the ones that expose the target relationship, and make them share one canonical state.

### Manipulate and compare

Use when a learner varies a parameter, scrubs a transformation, probes a structure, or compares controlled conditions.

Maintain:

`parameter or probe → primary model change → local evidence → interpreted consequence`

- Give each parameter a name, unit, valid range, and reason for that range.
- Keep controls adjacent to affected features.
- Preserve stable identity through transformations.
- Mark thresholds, invariant regions, and regime changes in the world.
- For synchronized comparisons, share starting state, scale, units, camera, and clock; isolate the named variable that differs.
- Keep selected context visible and dim unrelated material rather than replacing the entire world.

Do not create a parameter zoo. Two variables are useful only when their joint effect answers the same learning question.

### Predict, run, and inspect

Use when evolution or a hidden consequence matters.

1. Show an unresolved but reason-able state.
2. Accept a directional, categorical, spatial, numeric, or sketched prediction.
3. Preserve the commitment visibly.
4. Run or step the model.
5. Compare prediction and result at the same scale.
6. Expose the rule and offer revision or a changed condition.

Keep the prediction visible through reveal. The failure or mismatch is evidence; do not replace it immediately with the canonical answer.

For a dynamic system, synchronize current model, internal rule or local mechanism, and bounded history through one logical step. Manual Step and autoplay dispatch the same transition.

### Construct, operate, and regulate

Use when placement, connection, measurement, tool choice, sequencing, allocation, or continuous control produces evidence.

- Expose capacity, compatibility, tolerance, safety, and remaining requirements before failure.
- Translate pointer or form input into a logical proposal, apply rules, then render the constrained result.
- Preserve valid partial progress and allow local repair.
- Make wrong or unsafe choices change risk, deviation, conflict, stability, or legal actions.
- Gate completion from actual criteria such as pose tolerance, valid measurement, connection compatibility, resource balance, or objective state.
- When several constructions are valid, evaluate constraints and trade-offs rather than one hidden arrangement.

A procedure needs an operation proxy—a gauge, probe, tool, measurement, connection, readiness condition, or threshold that changes state. Clicking a labelled step does not model an operation.

### Decide and diagnose

Use when a learner commits to a trade-off, diagnosis, strategy, route, or hypothesis and new evidence follows from that choice.

- Start with more than one plausible model or option.
- Make a test, observation, or choice change available evidence and next actions.
- Preserve prior commitments and consequences for comparison.
- Mark hypotheses as supported, weakened, contradicted, or unresolved; do not auto-select a conclusion without evidence.
- Let the learner revise after inspecting consequences.

Avoid fake choices in which one option is obviously moral, safe, or numerically dominant by definition. Teach the rule directly when no real trade-off exists.

### Play through the concept

A learning game repeats skilled action under productive pressure. Define:

- target relationship;
- primary player verb;
- model objective;
- pressure that makes the relationship matter;
- immediate semantic feedback;
- model-defined failure;
- rapid retry;
- what improved skill looks like beyond faster clicking.

Build the smallest complete loop first:

`read state → choose action → model step → evidence changes → objective or pressure updates → choose again`

Pressure should arise from capacity, stability, energy, uncertainty, competing outcomes, limited moves, or a changing opportunity when that constraint belongs to the model. Do not add an arbitrary countdown. Difficulty should tighten the relationship, combine learned variables, reduce support, or add meaningful variation—not merely speed everything up.

The first attempt must be fair and recoverable. Preserve the decisive failure state long enough to inspect, then retry directly without a long intro.

## Keep canonical state authoritative

Use a fresh initial-state factory and explicit transitions:

```js
function createInitialState(seed) {
  return {
    seed,
    phase: 'ready',
    model: {},
    controls: {},
    selection: null,
    measurements: {},
    history: [],
    attempt: { actions: [], prediction: null },
    support: { level: 0, type: null },
    view: {}
  };
}

function dispatch(action) {
  state = transition(state, action);
  const evidence = deriveEvidence(state);
  renderWorld(state, evidence);
  renderControls(state, evidence);
  renderFeedback(state, evidence);
}
```

Pointer, keyboard, touch, form controls, autoplay, external actions, retry, and Reset all dispatch actions. Renderers are views. DOM classes, canvas pixels, chart marks, sprite positions, animation progress, and displayed scores are not the authoritative model.

Separate lifecycle from model values. Define legal phases and transitions. Repeated Start, Play, Submit, or Retry must not create another loop or bypass a locked phase.

Derive legal actions, constraints, evidence, progress, completion, feedback, and fixed/variable copy from the same state. An impossible action preserves model validity while producing a local rule-specific explanation.

## Implement direct manipulation

Use one coordinate chain:

`host pointer → logical coordinates → proposed action → clamp/project/snap by rule → canonical state → scene + measurement + annotation`

- Measure actual rendered bounds.
- Use one logical-to-host transform for renderer, overlay, and hit testing.
- Keep screen coordinates out of canonical model state.
- Capture the pointer only during the active gesture and release it on end, cancel, reset, or teardown.
- Preserve the last valid state on cancellation or an impossible proposal.
- Show guides, tolerances, contacts, remaining range, or rejection reason while acting.
- Route arrows, buttons, select-and-place, and precise input through the same transition.

Evaluate logical geometry rather than hidden pixel zones. A visually close proposal should succeed when it satisfies the declared tolerance, and fail visibly when it violates the model.

## Own one simulation clock

When model evolution matters, use a fixed logical step and one clamped accumulator:

```js
const STEP = 1 / 60;
let previous = performance.now();
let accumulator = 0;

function frame(now) {
  accumulator += Math.min((now - previous) / 1000, 0.05);
  previous = now;

  while (state.phase === 'running' && accumulator >= STEP) {
    state = transition(state, { type: 'STEP', dt: STEP });
    accumulator -= STEP;
  }

  render(state, deriveEvidence(state));
  raf = requestAnimationFrame(frame);
}
```

Manual Step dispatches the same `STEP`. Do not run a physics runner and a second application loop that both advance the model. If real elapsed time is the model variable, state that choice and still clamp suspension gaps. Bound history from the learning question.

Seeds, entity creation order, and initial conditions must be deterministic enough to reproduce representative and boundary states. When randomness is part of the experience, validate fairness and target exposure across the supported seed range.

## Make state change visually traceable

Use motion to show causality and maintain object identity:

- a trace for path or accumulation;
- a ghost for previous pose or attempt;
- a shared baseline for comparison;
- a local flash or pulse for the exact changed feature;
- count or measurement animation tied to the same derived value;
- transition from proposal to constrained result;
- persistent prediction and observed result at the same coordinates.

Design named stable states before interpolation. Motion begins from canonical state and settles on an inspectable canonical result. Cancel active transitions before a new conflicting action, Reset, or teardown. Use CSS/WAAPI for a few DOM or SVG tracks, a host timeline when named overlap and replay coordination are genuinely needed, and one renderer clock for continuous worlds.

Ambient motion establishes material, flow, or system activity but cannot be the only evidence. Under reduced motion, transition directly or step between the same states; retain every rule, consequence, measurement, and next action.

## Use charts as evidence inside the world

A chart belongs here when learner action changes a model and data marks are the clearest consequence:

`action → model transition → derived records → scales and marks → interpretation or next action`

Define:

- records and stable IDs;
- field-to-channel mapping;
- units, domain, baseline, aggregation, missing values, and uncertainty;
- fixed comparison scales across attempts;
- prediction, threshold, target, or baseline overlays;
- exact DOM values and fallback table;
- bounded history and named attempts.

Keep controls near the feature they change. Highlight new evidence without erasing the baseline. If domains change, expose that change rather than animating an illusion. Hover remains supplemental; mirror selected marks and exact values in semantic DOM.

Initialize one ECharts or equivalent instance and update it from canonical state. Use keyed joins for D3. Seed, settle, and stop force layouts. Dispose chart instances, observers, simulations, and transitions during teardown.

## Select and own the renderer

| Need | Renderer |
|---|---|
| Semantic controls, text, small selectable systems | DOM or SVG |
| Custom procedural scene with modest entity count | Canvas or p5 |
| Drag, resize, rotate, connect, group, and hit-test tens to hundreds of shapes | Konva |
| Rigid bodies, joints, gravity, collision, or physical constraints that are the concept | Matter.js |
| Thousands of sprites, particles, trails, or repeated marks | PixiJS |
| Conventional changing quantitative evidence | Host chart system or ECharts |
| Custom data-bound geometry or relation | D3 with SVG |

Use one primary engine. A physics engine plus a custom view is acceptable when ownership is explicit; do not combine libraries because the model is unclear.

### DOM and SVG

- Use semantic controls and stable entity groups.
- Set a logical SVG `viewBox`; calculate real label widths and connector lanes.
- Keep connector paths behind nodes and labels in quiet regions.
- Use focus, keyboard selection, and visible status in addition to pointer behavior.
- Preserve object IDs across states and transitions.

### Canvas and p5

- Separate immutable configuration, theme color roles, mutable model, and derived evidence.
- Use one logical coordinate system shared with DOM overlays.
- Use offscreen buffers only for static field, persistent traces, masks, or layers with different update rates.
- Avoid DOM work, logging, and allocation in the hot loop.
- Cap pixel density and delta time before reducing important evidence.
- Stop the loop for static or settled states and while hidden when continuous updates are unnecessary.

### Konva

- Create one stage and a few role-based layers.
- Create shapes once, index by stable entity ID, and update attributes from state.
- Dispatch constrained drag actions; do not leave truth in node coordinates.
- Use one verified scaling approach and `batchDraw()` grouped updates.
- Destroy the stage and owned listeners on teardown.

### Matter.js

- Use it only when physical behavior carries the target relationship.
- Set mass, friction, drag, restitution, gravity, constraints, and initial velocity explicitly.
- Generate bodies in stable semantic order from canonical definitions and seed.
- Use one fixed-step clock; never combine `Runner.run()` with another model clock.
- Render recognizable functional objects from body poses when debug primitives are not the lesson.
- Reset by constructing a fresh world, not reversing accumulated physics.

### PixiJS

- Use ordinary containers for independently interactive sprites and a particle container for many repeated marks with limited dynamic properties.
- Keep position, velocity, life, category, selection, and identity in model records.
- Pool records and sprites; reuse textures and geometry.
- Restrict filters to bounded regions that communicate state.
- Keep instructions, labels, measurements, and evidence in DOM.
- Stop the ticker and release owned resources without destroying shared textures.

## Design evidence, feedback, and support

Feedback must answer:

1. what changed;
2. which rule produced the change;
3. how the evidence supports that rule;
4. what action remains possible.

Wrong, unsafe, or suboptimal actions produce inspectable state consequences—conflict, deviation, increased risk, unstable behavior, violated constraint, or a failed comparison. Preserve useful failure evidence and valid partial progress.

When support is needed, diagnose the current attempt before escalating:

1. reflective question about the visible evidence;
2. contrast or analogy;
3. governing principle;
4. procedural nudge without exact values;
5. parallel worked example rather than the current solution.

Do not infer motivation, confidence, mastery, or durable disposition from one run.

## Reset, retry, and teardown

Before Reset or Retry:

1. cancel active drag and release pointer capture;
2. stop owned animation frames, physics runners, chart simulations, timelines, timers, audio, and tickers;
3. discard mutable model and renderer-owned transient state;
4. rebuild from the initial factory and canonical seed;
5. restore view, controls, selection, history, attempts, support, feedback, and lifecycle phase;
6. render through the same path used after ordinary actions.

Retry may intentionally preserve a comparison baseline or learner prediction; Reset restores the full authored initial snapshot. Define the difference explicitly.

On teardown, disconnect observers, remove listeners, release pointer capture, destroy renderer instances, and dispose owned buffers, textures, bodies, stages, and chart resources. A remount produces one renderer, one clock, and one input response.

## Preserve access paths

- Every rule-relevant pointer action has a keyboard, select-and-place, button, or precise-control path.
- Touch targets remain reachable outside canvas edge dead zones and moving hazards.
- Instructions, values, units, constraints, feedback, and status remain in semantic DOM or accessible SVG.
- Hover is never the only evidence route.
- Focus remains visible, and navigation keys are captured only while a focused control consumes them.
- Reduced motion preserves rules and outcomes through direct transitions or stepping.
- Renderer failure preserves a textual model, table, named controls, or lower-tech route to the relationship whenever feasible.

## Repair failures

| Failure | Cause | Repair |
|---|---|---|
| Instrument demo | Inputs and values surround a passive illustration | Move action, evidence, and state into one dominant world |
| Slider theater | A parameter changes appearance but not measured consequence | Connect it to a model variable, evidence, and next action |
| Hover museum | Selection only repeats labels | Expose local mechanism, operation, or comparison |
| Animated answer | The learner watches after an answer | Preserve prediction and let conditions affect model-derived evidence |
| Interactive checklist | Labels stand in for modeled operations | Add a tool, measurement, placement, compatibility, or risk proxy |
| Quiz with effects | Choice is checked against an answer key | Generate a rule-based consequence and allow revision |
| Decorative physics | Objects move without inspectable quantities | Expose physical variables and outcomes or remove the engine |
| Fake learning game | Reward loop survives after removing the concept | Bind the primary verb, pressure, and failure to the target relation |

## Verify the complete interaction

- Trace the primary action through transition, evidence, consequence, and next legal action.
- Inspect the initial state before input; verify it contains useful evidence and an obvious first action.
- Exercise representative, boundary, invalid, failure, partial-progress, success, and transfer states that apply.
- Complete rule-relevant pointer actions through an equivalent non-pointer path.
- Confirm controls, object state, measurement, chart, feedback, progress, and legal actions update together.
- For simulations or physics, run the same seed for a fixed step count twice and compare declared outputs.
- For comparisons, hold scale, unit, start, and clock constant while isolating one variable.
- For games, verify fair start, grace, readable failure evidence, rapid retry, pause, and one loop.
- Interrupt motion or direct manipulation with Reset and compare the complete initial snapshot twice.
- Verify logical coordinates, overlays, labels, controls and action regions when the fixed stage is scaled.
- Force reduced motion and renderer fallback; verify the learning loop and all evidence remain available.
- Destroy and remount; confirm one renderer, one clock, one listener response, and stable owned-resource counts.
- Confirm zero clipped controls, unreachable actions, failed resources, stale callbacks, and runtime errors.
