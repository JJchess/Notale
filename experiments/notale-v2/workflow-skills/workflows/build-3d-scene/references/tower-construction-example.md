# Conditional Example: Procedural Tower Construction

Use this example only when repeated architectural vocabulary, assembly order, or construction stages are the lesson.

## Model a semantic vocabulary

- Define style parameters for plan, storeys, columns, walls, roof, openings, and detail proportions.
- Build repeated parts from shared geometries and materials.
- Size doors, windows, trim, and roof detail as fractions of the surface that holds them.
- Give each group and stage a stable semantic ID and caption.
- Fill stepped ledges and enclosed volumes so the structure does not read as floating shells.

## Drive one named timeline

- Store stages as ordered records containing ID, caption, target height or visibility, and explanation.
- Keep the complete structure present in model state; reveal it from the stage value.
- Use a local clipping plane for a continuous build reveal only when the material and caps remain correct.
- Add caps that match the current plan shape so clipped solids do not appear hollow.
- Keep temporary support geometry slightly ahead only when that relationship explains construction.
- Let direct stage buttons and a scrubber set the same timeline state.

## Keep transitions robust

- Interpolate from the current stage value when the learner changes target mid-motion.
- Render captions from state and make stage change understandable without sound.
- Disable automatic build motion under reduced motion while preserving stage controls.
- On style or model changes, dispose the old group before adding the replacement.

## Verify

- Orbit once at ground level and from above to find missing faces, inverted winding, and intersecting roofs.
- Scrub slowly through each stage and confirm caps stay inside walls.
- Change stages rapidly and confirm captions and geometry never diverge.
- Reset twice and compare final part counts and transforms.
- Switch model variants repeatedly and watch memory plus draw calls.
