# 2D Engine Routing

Choose from the behavior that must remain correct.

| Need | Choose | Do not choose it for |
|---|---|---|
| Drag, resize, rotate, group, select, connect, or hit-test tens to hundreds of shapes | Konva | Physical collision or huge particle fields |
| Gravity, collision, mass, momentum, joints, ropes, pendulums, piles, or constraints | Matter.js | Decorative easing or a diagram with no physical rule |
| Thousands of sprites, particles, trails, or filter-driven elements updated every frame | PixiJS | A few draggable shapes or automatic rigid-body physics |

## Boundary checks

- Prefer semantic DOM or SVG when fewer than a few dozen elements need only simple clicks.
- Prefer ECharts or D3 when position encodes a dataset rather than a simulated state.
- Prefer Three.js only when depth, occlusion, or orbiting carries meaning.
- Use Matter for behavior and a custom renderer only when Matter's debug-style view cannot communicate the lesson.
- Do not add a second engine to compensate for weak state architecture.

## Local dependencies

Use only the chassis UMD builds:

- `assets/lib/konva.min.js` → `Konva` 10.3.1
- `assets/lib/matter.min.js` → `Matter` 0.20.0
- `assets/lib/pixi.min.js` → `PIXI` 7.4.2
- `assets/lib/seedrandom.min.js` → `Math.seedrandom` 3.0.5

Do not use CDN scripts, ESM imports, or examples written for a different major version.
