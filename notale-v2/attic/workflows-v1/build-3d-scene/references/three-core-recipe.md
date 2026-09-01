# Three.js Core Recipe

Use the chassis UMD build and the `THREE` global.

## Initialize one scene

```html
<script src="assets/lib/three.min.js"></script>
<script src="assets/lib/seedrandom.min.js"></script>
```

```js
const canvas = document.querySelector('[data-three]');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(4, 3, 7);
camera.lookAt(0, 0, 0);
```

Add geometry, material, camera, and light once. Do not create geometries, materials, vectors, colors, or event handlers inside the frame loop.

## Frame and resize deliberately

- Measure the canvas host with `getBoundingClientRect()`.
- Call `renderer.setSize(width, height, false)`, update `camera.aspect`, then `camera.updateProjectionMatrix()`.
- Use one `ResizeObserver`.
- Clamp delta time after tab suspension.
- Stop the loop for a reduced-motion still when direct interaction does not need continuous rendering.
- Prefer render-on-demand for static inspection scenes.

## Implement camera control without missing addons

- Provide named view buttons such as Overview, Side, Section, or Exploded.
- For optional orbiting, store azimuth, elevation, radius, and target in state; update them from bounded pointer deltas and wheel input.
- Clamp elevation away from the poles and radius away from near and far clipping planes.
- Restore the exact canonical camera state on Reset.
- Do not make free orbit the only route to an important view.

## Pick semantic objects

```js
function pointerNdc(event) {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
}
```

Set `mesh.userData.entityId` and resolve raycast hits back to canonical model records. Highlight through state, and mirror the selection in a DOM status element. Provide a DOM list or buttons for keyboard selection.

## Explain layered or assembled structures

- Store compact and exploded transforms for each named part in canonical records.
- Keep parts in one semantic group and interpolate transforms from the current rendered value when state changes.
- Separate layers along a meaningful assembly axis; preserve their order and relative scale.
- Reveal function through selection and a DOM explanation, not through arbitrary material changes.
- Add Overview, Exploded, and Section presets when they expose different relationships.
- Reset selection, transforms, and camera together so the same compact structure returns.

## Build deterministic repeated geometry

- Generate procedural values from a local `new Math.seedrandom('scene-v1')`.
- Create entities in stable ID order.
- Reuse one geometry and material where possible.
- Use `InstancedMesh` for repeated solids and `Points` for high-volume point fields.
- Update instance matrices or buffer attributes in place and mark them dirty once per frame.
- Keep an abstract particle globe only when density, layer, or topology encodes real model state.

## Light for legibility

- Start with a hemisphere or low ambient fill plus one directional key.
- Add a restrained rim only when it reveals silhouette.
- Enable shadows only for depth cues that matter; limit casters and shadow-map size.
- Set texture `colorSpace` to `THREE.SRGBColorSpace` for color images.
- Keep transparent layers sparse and avoid uncontrolled bloom.

## Dispose everything owned

```js
function disposeScene() {
  cancelAnimationFrame(raf);
  observer.disconnect();
  removeSceneListeners();
  scene.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    const materials = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : [];
    materials.forEach(material => {
      Object.values(material).forEach(value => {
        if (value && value.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
  renderer.renderLists.dispose();
  renderer.dispose();
}
```

Track shared textures and dispose them once. Dispose render targets and post-processing resources separately if present.

## Smoke

- Verify a render call succeeds and the canvas has non-zero dimensions.
- Verify semantic entity IDs are unique and raycasts resolve to model records.
- Compare seeded instance matrices after two resets.
- Inspect draw calls and triangles through `renderer.info.render`.
- Dispose and remount; confirm one canvas and stable `renderer.info.memory` after warm-up.
