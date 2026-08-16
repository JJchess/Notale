## Algorithmic scenery recipes
When the subject is scenery, atmosphere, or imagery (poem imagery / 诗词意境, landscapes, weather, nature scenes), never hand-place a few primitive shapes — a circle moon over two triangle mountains reads as clip-art. Generate the scene procedurally; each recipe is ~10-15 lines of JS:

- **Layered ridgelines** (mountains, hills, waves — the shan-shui technique): each ridge is a polyline sampled from 1-2 octaves of value noise (random anchors + cosine interpolation between them), filled down to the bottom edge. Stack 3-4 ridges with atmospheric perspective: farther = paler ink, smoother noise, higher on canvas; nearer = darker, more detailed, lower. `noise1d = anchors[] + cosine lerp; for x: y = base - n1(t)*amp - n2(t)*amp*0.25`.
- **Watercolor blob** (clouds, foliage masses, color washes): start from a coarse polygon (circle of 8-10 points); repeatedly subdivide each edge and displace midpoints by a random offset scaled to edge length; then draw the polygon 30-50 times at opacity .03-.06, re-deforming slightly each pass. Soft organic edges emerge from the accumulation — never from blur filters.
- **Recursive branches** (trees, lightning, river deltas, veins): draw a segment, then 2 children at ±20-35° with length ×0.7, recurse to depth 6-8; jitter every angle; strokes get thinner and paler with depth. One gnarled tree this way beats any hand-drawn path.
- **Paper grain / texture**: 200-400 one-pixel specks at opacity .02-.04, or sparse parallel hatching strokes. Texture comes from repetition, never from raster noise images.
- **Mist / depth bands**: translucent surface-colored horizontal bands drawn BETWEEN ridge layers — they push the far layers back.
- **Glow focal point** (moon, sun, lantern, star): radial-gradient halo behind a solid disc. Exactly one per scene — it is the focal point.

Composition rules for generated scenes: one focal point; clear foreground / midground / background separation; deliberate empty space (留白) — resist filling every region. Because the scene is procedural, a regenerate button ("another one" / 另作一幅) is a natural, delightful interaction — each click composes a fresh variation.
