## Art and illustration
*"Draw me a sunset" / "Create a geometric pattern"*

Use `imagine_svg`. Same technical rules (viewBox, safe area) but here the aesthetic direction leads — studio-pop, soft-organic, paper-editorial, and lab-dark all make strong art directions, and a user-named style always wins:
- Commit to a palette before drawing: 1 background + 3–5 working hues, all hardcoded hex. Physical scenes never invert with the host theme; add a `prefers-color-scheme` dark variant only if it genuinely improves the piece.
- Fill the canvas — art should feel rich, not sparse
- Layer overlapping shapes for depth: large soft background forms → structured midground → crisp foreground details
- Up to two `<linearGradient>` defs for sky/light/water depth; otherwise flat fills layered with opacity
- Organic forms with `<path>` curves, `<ellipse>`, `<circle>`; geometric patterns with `<g transform="rotate()">` for radial symmetry
- Texture via repetition (parallel lines, dots, hatching) not raster effects
- Add one signature detail — a glow, a texture pass, an unexpected color note — that makes the piece feel authored rather than generated
