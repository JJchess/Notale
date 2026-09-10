<!-- 这一份是 build-interaction 的 模式家族：Tune and transform — set a value, watch it propagate。由 pattern-routing.md 选中后读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

### Direction A — Instrument

Use when parameters continuously tune one model: damping, threshold, mixture, coefficient, gain, capacity, or another quantity.

- Spatial grammar: control adjacent to the property it changes; dominant model; live scale or readout at the consequence.
- Signature: a continuously deforming or responding object, not a value panel.
- Strong evidence: geometry, trajectory, field, extent, or distribution changes while a local measure tracks it.
- Avoid when the learner should construct, trace, compare runs, or discover a discrete constraint.

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


#### Delivery check

**Instrument**

- Control range and units match the model.
- Diagnostic presets reveal different regimes.
- Direct model change is visible throughout input.

### Direction D — Transformation

Use when two representations are the same object at different stages, coordinates, abstractions, or levels of detail.

- Spatial grammar: stable endpoints or aligned spaces connected by a scrubber, stages, correspondence traces, or moving identities.
- Signature: object identity persists while geometry changes.
- Strong evidence: the learner can stop at meaningful intermediate states and match parts across representations.
- Avoid cross-fading unrelated screenshots and calling it transformation.

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


#### Delivery check

**Transformation**

- Objects preserve identity.
- Intermediate states are meaningful.
- Scrubbing controls the canonical state.
- Reduced motion preserves correspondence.

