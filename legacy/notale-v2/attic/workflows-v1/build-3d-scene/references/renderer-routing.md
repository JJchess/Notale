# 3D Renderer Routing

Require a spatial reason before choosing 3D.

| Need | Choose | Reject when |
|---|---|---|
| Inspect a solid, assembly, layered structure, terrain, particle volume, construction sequence, or environmental system | Three.js | A flat labelled diagram communicates the same relationship |
| Plot points, routes, polygons, or regions whose real latitude and longitude matter | globe.gl after Three.js | The sphere is only a generic “network” symbol |
| Conventional quantitative chart | Neither | Route to `build-chart` |
| Flat physical model or thousands of 2D sprites | Neither | Route to `build-2d-sim` |

## Active dependencies

- `assets/lib/three.min.js` → global `THREE`, r160 / 0.160.1
- `assets/lib/globe.gl.min.js` → global `Globe`, 2.32.0; load after Three.js
- `assets/lib/seedrandom.min.js` → `Math.seedrandom`, 3.0.5

Use `renderer.outputColorSpace = THREE.SRGBColorSpace`; do not copy examples using the removed `outputEncoding` API.

Do not use:

- Babylon.js or another engine;
- WebGPU-only code;
- ESM imports, CDN URLs, or addons absent from the chassis;
- `OrbitControls` unless a local verified build is explicitly added to the page assets;
- decorative globe particles with no data or spatial relationship.

## Conditional recipe routing

- Use the landscape example only when terrain, horizon, or time of day establishes explanatory context.
- Use the tower example only when repeated architectural parts or named construction stages are the lesson.
- Use the weather example only when precipitation, wind, accumulation, or visibility is a controlled variable.
- Combine conditional examples only when their states interact in the teaching model; keep one renderer and one loop.
