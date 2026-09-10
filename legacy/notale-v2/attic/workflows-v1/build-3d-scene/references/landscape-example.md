# Conditional Example: Explanatory Landscape

Use this example only when terrain, horizon, environmental scale, or time of day supports the concept.

## Build terrain from one deterministic field

- Define one seeded analytic `heightAt(x, z)`.
- Sample the same function for mesh vertices, vegetation, stones, labels, and object placement so nothing floats or sinks.
- Use a radial or camera-relevant grid when the scene looks toward a horizon; spend detail near the subject.
- Validate triangle winding by viewing below the surface once.
- Derive vertex color from height, slope, or another meaningful terrain property instead of a visibly tiled decorative texture.

## Bound repeated detail

- Place grass, stones, markers, or samples with stable seeded rejection rules.
- Use `InstancedMesh` and shared geometry/material.
- Anchor dense near-field detail around the camera only when movement can reach the field edge.
- Scale visible point and line sizes for DPR, but cap renderer DPR.
- Track draw calls; hundreds of material groups cost more than a coherent instanced field.

## Treat sky and time as state

- Use a simple local gradient texture, sky geometry, background color, and fog that meet at the horizon.
- Define named time states containing sun, ambient, fog, ground, sky, and optional star values.
- Interpolate from the current rendered state when a new target is chosen mid-transition.
- Keep weather as a modifier over time-of-day state, not a cross-product of presets.
- Under reduced motion, apply the target state immediately.

## Provide explanatory controls

- Add named time or terrain-state buttons in DOM.
- Show the current state and one affected measurement or observation.
- Provide a labelled static cross-section or terrain profile fallback.

## Verify

- Inspect below the horizon for inverted winding.
- Switch targets rapidly and confirm no jumps.
- Reset twice and compare terrain geometry and placements.
- Inspect near and far detail plus draw-call count at narrow and wide sizes.
