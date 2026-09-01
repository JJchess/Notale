<!-- 这一份是 build-interaction 的 案例研究。需要找参照做法时读;可选。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

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

