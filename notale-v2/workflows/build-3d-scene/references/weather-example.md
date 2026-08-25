# Conditional Example: Weather as a Model Variable

Use this example only when precipitation, wind, visibility, accumulation, or environmental response is part of the explanation.

## Reuse one deterministic system

- Allocate a fixed rain pool and snow pool once.
- Keep typed arrays from the Three.js buffer attributes as the authoritative render buffers.
- Change density with `geometry.setDrawRange` rather than reallocating buffers.
- Seed spawn positions, lightning schedule, and other procedural events.
- Represent drizzle, rain, storm, snow, and blizzard as modifiers over shared state rather than unrelated systems.

## Keep weather visible to the camera

- Place a compact precipitation volume inside the camera frustum and move it with the view when needed.
- Disable frustum culling only for a deliberately camera-anchored pool.
- Make wind affect direction as well as speed.
- Keep falling and accumulated snow as separate state variables.
- Gate slow lighting, fog, and surface updates instead of recalculating them every frame.

## Keep effects semantic

- Correlate density, fall speed, slant, visibility, wetness, and accumulation with the selected weather state.
- Use a dedicated light for lightning so time-of-day state remains intact.
- Keep flashes below DOM text and within safe contrast.
- Do not autoplay sound; make ambience optional and user initiated.
- Expose current weather, wind, visibility, and accumulation in DOM with units.

## Respect access and performance

- Under reduced motion, show a sparse still state and expose stepped weather controls.
- Provide a labelled state comparison or table if WebGL fails.
- Cap pool size and DPR before removing explanatory variables.
- Dispose pool geometry, materials, textures, timers, listeners, and optional audio nodes.

## Verify

- Track one particle from spawn to reset and confirm it crosses the visible volume.
- Enter the same seeded state twice and compare sampled particles and event timing.
- Leave snow active and confirm accumulation changes separately from falling density.
- Switch states rapidly and confirm no pool reallocation or caption mismatch.
- Profile the densest storm and verify gated slow updates.
