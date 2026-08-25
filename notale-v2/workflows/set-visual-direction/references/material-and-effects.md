# Material and effect selection

Read this reference before importing an effect recipe. Select by teaching function, never because a renderer happens to be available.

## Selection table

| Treatment | Use when | Preserve from the old recipe | Reject when |
|---|---|---|---|
| Flat field and rules | hierarchy and diagrams already provide enough form | exact line weights, semantic contrast, quiet negative space | extra depth would not encode anything |
| Instrument glass | a panel overlays moving media or behaves like a lens/readout | translucent fill, inner highlight, solid fallback, readable text | every content group becomes a frosted card |
| Tactile surface | the learner presses, turns, or seats a physical control | one light direction, raised/pressed state reversal, short feedback | static text panels imitate plastic hardware |
| Technical frame | measurement, teardown, or system structure is central | thin routed lines, real annotations, sparse metrics, consistent corner logic | sci-fi framing is unrelated to the content |
| Container guides | alignment or measured space is part of the visual language | guides on true content edges, tiny marks at real intersections | lines are sprinkled inside every component |
| Chamfered edge | an engineered artifact justifies machined geometry | one cut scale, matching border/background/hit area, visible focus | rounded and cut shapes mix without a rule |
| Directional border | one selected surface needs a light-catching edge | one-pixel gradient, inherited geometry, low opacity | rainbow rims or every panel receives emphasis |
| Dithered field | sampling, quantization, pixels, or coarse measurement supports the topic | visible cells, broad deterministic masses, dark receding edges | it is generic grain or animated television noise |
| Perspective grid | depth, coordinates, or scale is being discussed | thin fading lines, calm camera, sparse haze | retro-futurist scenery competes with labels |
| Atmospheric folds | light, fluids, fields, or a literal medium benefits from slow spatial depth | one off-axis glow, layered folds, restrained drift | a flat colored glow is being used as filler |
| Ambient particles | the region represents a medium, population, flow, or settling process | bounded layer, deterministic state, quiet text zone, lifecycle cleanup | it becomes a page-wide screensaver |

## Apply restraint

- Use one material family across the deck. Vary elevation or opacity, not the underlying metaphor.
- Use a decorative effect only after the explanatory visual, type, and controls work without it.
- Derive effect color from an established semantic or accent token; do not hardcode cyan or violet.
- Concentrate brightness away from dense text. Make backgrounds `pointer-events:none`.
- Stop or freeze ambient work when hidden. Provide a meaningful still under reduced motion.
- Cap canvas/WebGL resolution before degrading foreground clarity.
- Keep a single brightest point; make it coincide with the page's teaching focus when possible.
- Remove glow before increasing text weight if a projector preview looks muddy.

## Projection test

Inspect the rendered `1600x900` frame at full size and at a smaller 16:9 preview. Then simulate weak projection by lowering contrast and saturation. Confirm that:

- body text, thin diagram lines, and control boundaries remain distinct;
- the effect does not create false edges or hide annotations;
- selected and focused states remain visible without bloom;
- the page still explains something when the effect is static or absent.
