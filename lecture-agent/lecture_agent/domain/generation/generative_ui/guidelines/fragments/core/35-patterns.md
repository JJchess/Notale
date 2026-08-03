## Pattern library

### Named layout patterns — pick one deliberately, reference it by name in plans
- **stage + readout row**: full-width stage (canvas/SVG with stated aspect ratio), controls in a wrap row above it, a 2–4 metric row below. The DEFAULT for simulations and anything with a main visualization — the stage is the dominant element and gets the full width.
- **balanced split**: stage `minmax(0,1fr)` with stated aspect | sidebar 260–300px, `align-items: start`. Allowed ONLY when the sidebar holds at most 2 short cards whose combined height stays under the stage height. 3+ sidebar cards next to a small stage is a known failure — switch to stage + readout row and let extra cards flow below the stage at full width.
- **stepper**: one panel per stage, dot/pill progress (● ○ ○), Prev/Next buttons, Next wraps from the last stage to the first. For cycles and multi-stage explanations.
- **bento**: a 2–3 row grid of mixed-size tiles — one dominant 2× tile plus small tiles, `gap: 12-16px`, every tile same radius. For overviews and dashboards with heterogeneous content.
- **editorial column**: single centered column `max-width: 62ch`, generous vertical rhythm, no cards. For text-led content (paper-editorial's natural habitat).

### Micro-interaction cookbook — small recipes that make widgets feel alive
- **count-up**: animate a displayed number to its new value over ~400ms with `requestAnimationFrame` and ease-out (`v = end - (end - start) * (1-t)**3`); round every frame; `tabular-nums` so width stays stable.
- **flash-on-update**: when a readout changes, toggle a class that shifts `color` or `background` to the accent and eases back over 300ms — the user's eye is pulled to the consequence of their action.
- **staggered reveal**: list/grid items enter with `opacity` + small `translateY`, each delayed `calc(var(--i) * 40ms)` (set `--i` per item). Use once on first paint, not on every update.
- **hover lift**: `transform: translateY(-2px)` plus a stronger shadow, 150ms ease-out; press returns to `translateY(0) scale(.97)`.
- **springy settle**: for elements that move to a new position use `cubic-bezier(.22,1,.36,1)` (fast, decisive) — or `cubic-bezier(.34,1.56,.64,1)` (slight overshoot) in playful directions only.
- **breathing loop**: `scale(1)↔scale(1.03)`, 3–4s ease-in-out infinite — living/organic subjects only, gated behind `prefers-reduced-motion`.
- **trace-in for SVG paths**: animate `stroke-dashoffset` from path length to 0 over 600ms once — good for diagrams revealing structure; never loop it.
