---
name: build-3d-scene
description: "Build recognizable, meaningful, performant, accessible 3D teaching scenes with local Three.js or globe.gl. Use when real depth, occlusion, orbiting, spatial assembly, terrain, weather, architecture, a named physical object, or geographic position on Earth is necessary to explain the subject, including scenes that need stronger silhouette, construction detail, deterministic state, interaction, fallback, performance, or cleanup."
---

# Build a 3D Scene

Build a spatial model, not a decorative background. Keep 3D only when changing viewpoint or depth reveals a relationship that a labelled 2D representation would hide.

## Route before building

1. Read the assigned brief, page specification, shared contract, `CHASSIS.md`, and chassis `LIBS.md`.
2. State what the learner understands by rotating, selecting, assembling, or changing the scene.
3. Read [renderer-routing.md](references/renderer-routing.md).
4. Select one active renderer:
   - Use **Three.js** for custom meshes, materials, lighting, raycasting, particles, terrain, structures, and environmental state.
   - Use **globe.gl** only when latitude, longitude, regions, or routes on the real Earth carry meaning.
5. Read [three-core-recipe.md](references/three-core-recipe.md) for every Three.js scene, or [globe-recipe.md](references/globe-recipe.md) for a geographic globe.
6. Read a conditional example only when the brief requires it:
   - [recognizable-object-modeling.md](references/recognizable-object-modeling.md) for a named artifact, body, vehicle, instrument, or piece of equipment
   - [landscape-example.md](references/landscape-example.md)
   - [tower-construction-example.md](references/tower-construction-example.md)
   - [weather-example.md](references/weather-example.md)
7. Use only the local Three.js and globe.gl builds. Do not introduce Babylon.js, a CDN, unbundled controls, or another 3D engine.

## Follow the workflow

### 1. Write the spatial contract

Define before creating geometry:

- learning question and why depth is essential;
- coordinate system, units, scale, origin, and named parts;
- spatial relationship encoded by position, size, orientation, material, or connection;
- the silhouette, joints, openings, appendages, and proportions that make a named object recognizable without labels;
- allowed camera views and what each view reveals;
- selectable or adjustable state and its valid range;
- the statement that must remain true in every reachable state;
- a labelled 2D or textual fallback.

Remove any effect that does not reinforce this contract.

### 2. Make state deterministic

- Keep semantic state in serializable plain data outside scene objects.
- Define one canonical initial snapshot that exactly matches the state after page initialization; camera presets must not silently mutate it.
- Give every interactive object a stable semantic ID.
- Build geometry from stable ordered inputs.
- Load `assets/lib/seedrandom.min.js` and use a local fixed seed for procedural placement, particles, terrain, or event schedules.
- Route all controls through `setState` and update the scene from state.
- Implement Reset by cloning that canonical state and camera directly, not by reloading the page or calling a preset that changes different values.
- Verify strict serialized equality for `snapshot → primary action → reset → snapshot`, including camera, fallback mode, selection, and seeded variables.

### 3. Establish the spatial read

- Pass a recognition gate before adding interaction: in the initial three-quarter view and at thumbnail size, the named subject must be identifiable from its form rather than its title.
- Choose camera, framing, and clipping planes before adding detail.
- Match meaningful proportions and show a scale cue when size matters.
- Group related parts and name them in `userData` for raycasting and cleanup.
- Use a restrained key, fill, and rim or hemisphere light so form reads without glare.
- Use materials to distinguish semantic roles; do not hide structure under bloom, fog, or particles.
- Build the object's characteristic negative spaces and connections. A generic slab, capsule, stack, or blob with labels is not a model of a recognizable artifact.
- Render a useful still frame before adding motion.

### 4. Add purposeful interaction

- Offer labelled DOM controls for view presets, state changes, Reset, and pause.
- Treat free orbit as optional exploration, not the only way to find an important view.
- Give pointer picking a keyboard-accessible list, buttons, or step controls.
- Update a nearby DOM heading or status region with the selected part, value, and unit.
- Use canvas bounds for raycasting coordinates so harness scaling is respected.
- Constrain camera distance and elevation so the model cannot be lost or clipped.

### 5. Choreograph state, not spectacle

- Keep one animation loop and use clamped delta time.
- Pause autonomous motion while hidden, offscreen, or under reduced motion.
- Animate between named semantic states; make scrubbing or rapid changes continuous and reversible.
- Keep captions synchronized from model state.
- Never let a narrated result depend on an unseeded event or frame rate.

### 6. Protect frame time and memory

- Cap device pixel ratio before reducing essential geometry.
- Reuse geometries and materials; use `InstancedMesh` or `Points` for repeated objects.
- Watch draw calls, shader/material variants, shadow maps, transparent layers, and per-frame allocations.
- Resize from one observer and update renderer size plus camera projection together.
- Dispose geometries, materials, textures, render targets, renderer, loops, observers, and listeners.
- Verify repeated Reset or remount does not grow canvases or GPU resources.

### 7. Preserve access without WebGL

- Label the canvas container and provide a concise DOM explanation and current-state summary.
- Keep instructions, labels, values, and controls outside WebGL.
- Provide keyboard paths to the same meaningful states as pointer input.
- Under reduced motion, render a stable view and retain direct state controls.
- On WebGL failure, show a labelled still diagram, ordered part list, data table, or step-through explanation.

## Deliver

Deliver the requested page and local assets with:

- preserved `#stage`, page metadata, shared assets, and fixed-stage harness behavior;
- one justified renderer and no inactive second engine;
- deterministic scene state, seed, Reset, pause, and named camera views;
- DOM controls, labels, status, and a useful non-WebGL fallback;
- bounded rendering settings and one explicit cleanup function;
- local asset paths with no network dependency.
- a recognizable initial silhouette and coherent exploded/cutaway states for named physical objects.

## Run the minimum smoke

1. Load from the harness-compatible local path and confirm zero JavaScript errors and failed resources.
2. Confirm the canvas has non-zero dimensions, the intended object count exists, and a frame renders.
3. Hide DOM labels and inspect the initial and exploded views at thumbnail size; confirm the subject and major parts remain recognizable.
4. Exercise each named state and camera preset with pointer and keyboard.
5. Select one object and confirm the DOM status reports the correct semantic ID and value.
6. Reset twice and compare camera, semantic state, and seeded geometry.
7. Resize narrow and wide; confirm aspect, raycasting, labels, and controls stay aligned.
8. Emulate reduced motion and WebGL failure; confirm the explanation remains complete.
9. Tear down and remount; confirm one canvas, one loop, and stable resource counts.
10. Run the available `Check` or page self-check and fix runtime, resource, overflow, clipping, and text-size failures.
