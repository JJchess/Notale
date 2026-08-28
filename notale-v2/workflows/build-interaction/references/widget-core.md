<!-- 这一份是 build-interaction 的 基底。总是先读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

# Interactive Learning Widget

Build a bounded interactive component, not a page. Place that learning instrument inside the assigned lecture page. The widget is not a small webpage, a dashboard, or a decorated form. It is a manipulable model whose visible behavior lets a learner discover, test, or verify one relationship.

The host owns the page title, narrative copy, outer composition, background, typography system, base palette, navigation, fixed frame, and shared runtime. The widget inherits those decisions. It earns its own identity through a **concept signature**: a subject-specific geometry, spatial organization, semantic color mapping, and motion behavior that make the underlying relationship tangible without inventing a second theme.

Read this reference completely before implementation. Use the early decision sections to choose a direction, the pattern library to construct the interaction, the craft and technical sections while building, and the acceptance matrix before delivery.

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

