# Generative Cover

The algorithm must create the visual idea; random decoration behind a title does not. Treat title choreography, ambient motion, the reduced-motion still, and renderer lifecycle as parts of the same generated system.

## Derive the algorithm from the concept

Extract one subtle conceptual seed from the subject, then map it to behavior:

| Conceptual character | Useful computational behavior |
|---|---|
| Organic emergence | Accumulation, growth, local interaction, feedback, bounded variation |
| Mathematical order | Ratios, recurrence, harmonics, symmetry with controlled exceptions |
| Controlled chaos | Competing forces, thresholds, bifurcation, constrained randomness |
| Invisible influence | Vector fields, attraction, repulsion, diffusion, traced trajectories |
| Translation or transformation | Stable identities passing through staged mappings |
| Layered system | Coupled fields or buffers with different update rates and roles |

Do not begin by choosing a familiar pattern. First state: “The subject behaves like `<rule>`; viewers will see it through `<visible consequence>`.” Select particles, fields, cells, branches, geometry, or shaders only after that sentence is concrete.

## Develop the generative decision

Refine the first-response choice with these questions; no separate written specification:

- conceptual seed and governing rule;
- entity or field being updated;
- visible evidence of the rule;
- behavior parameters and meaningful ranges;
- deterministic seed and reset behavior;
- theme-derived semantic color roles and compositional attractor;
- title exclusion field and focal region;
- static or looping lifecycle;
- renderer, target size, and frame budget.

Parameters should change how the system behaves:

- quantities change density or population;
- scales change spatial frequency or interaction distance;
- rates change growth, decay, or energy;
- ratios change balance between forces;
- probabilities change branching or transition likelihood;
- thresholds change when a phase or rule activates.

Do not expose a control merely because a constant exists. Color pickers, particle size, and effect toggles are shallow unless they change the concept. Covers do not need parameter inputs or seed navigation unless explicitly requested.

## Choose renderer and lifecycle

| Need | Choice |
|---|---|
| Static procedural still | P2D and `noLoop()` after construction |
| Ambient system whose evolution matters | P2D at a deliberate capped frame rate |
| Shader, volumetric field, or true spatial geometry | WEBGL only when depth or shader behavior is essential |
| Multiple sketches or framework embedding | p5 instance mode |
| High-cost background or texture | Offscreen `createGraphics()` buffer rendered only when invalidated |

Do not use WEBGL for prestige. Do not keep a draw loop alive after a static result is complete. When ambient motion is nonessential, render a stable still under reduced motion and while hidden.

Use p5 instance mode when embedded in an existing application so the sketch does not pollute global state. Set pixel density deliberately from the actual performance and capture target. Keep DOM reads, logging, asset allocation, and listener registration outside `draw()`. Use a fixed or clamped time source for meaningful motion; use frame-derived time when deterministic capture matters.

## Keep generation deterministic

Separate immutable configuration, theme color roles, and mutable state. Rebuild from one seed instead of trying to reverse an evolved system.

```js
const CONFIG = Object.freeze({ seed: 4172, density: 0.72, fieldScale: 0.006 });
const COLORS = Object.freeze(readThemeColorRoles());

function resetModel() {
  randomSeed(CONFIG.seed);
  noiseSeed(CONFIG.seed);
  state = createInitialState(CONFIG);
}
```

All randomness that affects pixels must come from the seeded stream. Generate entities in stable order. If responsive reconstruction changes the entity count, derive it from logical canvas size and the same seed so repeated renders at one size match.

## Make title safety part of the algorithm

Define the title field in logical coordinates. Integrate it into generation as one of:

- an exclusion or low-density field;
- a repulsor that bends trajectories around text;
- a mask that reserves quiet negative space;
- a compositional attractor that places the strongest event opposite the title;
- a threshold that reduces contrast and detail inside the field.

Do not paint an opaque rectangle over a finished sketch to rescue legibility. Verify title safety over time, not only on the first seed or frame.

## Layer by role

Use offscreen buffers when they separate update rates or compositional responsibilities, not as a mandatory richness effect:

- static field or texture;
- persistent accumulation or trails;
- current entities;
- sparse accents or masks.

Clear only the layers that must change. Keep each layer within shared theme roles and one stroke vocabulary. If removing a layer does not alter hierarchy, the governing rule, or material character, omit it.

Useful algorithm families are a vocabulary, not a menu:

- flow or curl fields reveal invisible influence through accumulated traces;
- branching, L-systems, or recursive subdivision reveal growth and hierarchy;
- packing, Voronoi, or relaxation reveal competition for space and equilibrium;
- particles and force systems reveal attraction, repulsion, flow, collision, or collective behavior;
- cellular or reaction-diffusion systems reveal thresholds, propagation, and emergence;
- hatching, stippling, contour lines, or repeated marks create subject-relevant material texture.

Choose a family only after the governing-rule sentence identifies why it fits. Combine techniques only when they operate on the same conceptual system. Allocate background, structure, accumulation, live entities, and accents to separate buffers only when their update rates or semantic roles differ.

## Structure a p5 cover

Prefer instance mode when the cover lives inside a larger artifact:

```js
const cover = p => {
  let state;
  let staticLayer;

  function rebuild() {
    p.randomSeed(CONFIG.seed);
    p.noiseSeed(CONFIG.seed);
    state = createInitialState(p, CONFIG);
    staticLayer = p.createGraphics(p.width, p.height);
    renderStaticField(staticLayer, state);
  }

  p.setup = () => {
    const { width, height } = measureHost();
    p.pixelDensity(1);
    p.createCanvas(width, height);
    rebuild();
    if (CONFIG.mode === 'still') p.noLoop();
  };

  p.draw = () => {
    if (CONFIG.mode === 'ambient') advance(state, Math.min(p.deltaTime, 50));
    renderFrame(p, staticLayer, state);
  };

  p.windowResized = () => {
    const { width, height } = measureHost();
    p.resizeCanvas(width, height);
    rebuild();
  };
};
```

Keep DOM queries, logging, listener registration, and avoidable allocation outside `draw()`. Reuse vectors and records in hot loops. Batch point rendering or use a pixel buffer when individual p5 shape calls dominate frame time. Cap pixel density before reducing important visual information.

## Use noise with intent

Raw noise is a signal, not a finished aesthetic. Give its coordinates and outputs semantic roles:

- spatial frequency controls feature size;
- temporal frequency controls drift;
- octaves control scale complexity;
- output may drive direction, density, growth, or transition thresholds;
- domain warping is appropriate only when feedback or distorted influence matches the concept.

Do not stack noise octaves, bloom, grain, or trails merely to make the frame look complicated. Tune constrained variation until different seeds preserve the same hierarchy and title field.

## Choreograph generated motion and title

Treat the procedural system and title as two synchronized tracks owned by this reference:

1. define `initial`, `emergence`, `representative`, and `hold` states;
2. let the system establish its governing behavior before the title asks for attention;
3. settle density and contrast inside the title field before title entry;
4. hold the representative frame long enough to read;
5. loop only from a quiet boundary that preserves hierarchy and does not visibly erase the payoff.

For a few DOM/SVG title tracks, use CSS or WAAPI. When a host-provided timeline library is necessary, give its labels the same names as the generative states and keep one owner for replay and cleanup. The p5 system must not run an independent unsynchronized intro clock. Reduced motion renders `representative` immediately and stops nonessential evolution.

## Diagnose weak generative covers

| Failure | Cause | Repair |
|---|---|---|
| Tutorial pattern | A known effect was selected before a concept | Rewrite the governing-rule sentence and change the entity behavior |
| Random wallpaper | Randomness changes placement but expresses no relationship | Couple variation to a constraint, field, threshold, or feedback rule |
| Cosmetic controls | Parameters only change hue or primitive size | Expose density, rate, ratio, threshold, or interaction distance instead |
| Flat hierarchy | Every region has similar density and contrast | Add a compositional attractor and title exclusion field |
| Runaway loop | Work accumulates without bound | Bound population/history, reuse storage, and stop when a still is complete |

## Verify the system

- Render the same seed twice at the same size and compare the representative frame.
- Render several seeds when variation is part of the brief; hierarchy and title safety must survive all of them.
- Inspect the first frame, representative frame, long-running state, resized state, and reduced-motion still.
- Change each retained parameter and confirm it changes behavior in the intended direction.
- Measure the representative worst-case frame; do not rely on assumed particle limits.
- Confirm reset replaces the complete state and does not leave old buffers, loops, canvases, or listeners.
- Replay or remount the title choreography and confirm no second timeline or draw loop remains active.
- Confirm the result communicates the conceptual rule without requiring auxiliary explanation or separate controls.
