<!-- 这一份是 build-interaction 的 模式家族：Observe and trace — follow what a system is doing。由 pattern-routing.md 选中后读这一份。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

### Direction E — Tracer

Use when the claim concerns propagation, dependency, calculation, responsibility, or a process path.

- Spatial grammar: one stable graph or route; active frontier; local rule at the current node; accumulated trace.
- Signature: energy, value, responsibility, or signal visibly travels along existing connections.
- Strong evidence: previous, current, and next context remain visible while local values update.
- Avoid replacing the graph with one card per step.

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


#### Delivery check

**Tracer**

- Topology remains stable.
- Direction, local rule, received value, and emitted result are visible.
- Manual and autoplay paths are identical.
- Completion preserves the route.

### Direction G — Inspector

Use when a local operation or hidden structure becomes understandable by probing a larger object: convolution window, cross-section, ray, cursor sample, neighborhood, crop, or magnifier.

- Spatial grammar: overview with movable probe; explicit footprint; local detail; derived output tied by connectors or shared highlight.
- Signature: the probe reveals exactly what contributes to the local result.
- Strong evidence: source cells, weights, products, and output stay synchronized.
- Avoid tooltips that only repeat a value without exposing its origin.

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


#### Delivery check

**Inspector**

- Footprint, local detail, operation, and output are synchronized.
- Orientation and indexing are consistent.
- Manual movement takes control from autoplay.

### Direction I — Live system

Use when the claim is an evolving system with internal state: training, optimization, ecology, feedback control, queueing, or iterative algorithms.

- Spatial grammar: dominant state field; compact internal structure; history trace; restrained control cluster.
- Signature: multiple views share one logical iteration and expose different consequences of the same state.
- Strong evidence: the actual simplified mechanism runs, or a deterministic surrogate is labeled honestly.
- Avoid animated wallpaper paired with fabricated metrics.

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


#### Delivery check

**Live system**

- Mechanism is real or honestly labeled.
- All views share a logical timestamp.
- Work and history are bounded.
- Pause, step, reset, and instability handling are correct.

