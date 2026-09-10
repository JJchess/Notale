# Source and learning-model audit

## Classification

- Taxonomy: `build-interaction / general`.
- Pattern: learning game through construction, comparison, and retry.
- Internal donor: `/data1/home/zhuyifan/ws2/Notale/demos/lawn-path`.
- Archived artifact: `pages/index.html`, rebuilt from the donor's `index.html`, `styles.css`, and `app.js`.
- The archive preserves the fixed 1600×900 stage, deterministic Canvas art, three-scene state machine, keyboard controls, touch/pointer controls, reduced-motion path, resize behavior, and interrupted-transition cleanup.

## Real state and consequence

The model is an 8×8 grid with 15 blocked cells and 49 traversable cells. Runtime state records the player's current cell, facing direction, ordered path, and set of visited cells. A legal move changes all four through one update path. A blocked or out-of-bounds move changes none of them.

Completion is gated by `visited.size === 49`; it is not triggered by a timer or answer button. The result derives movement count, efficiency, repeated undirected edges, path coloring, and accessible copy from the recorded path. Retry restores the exact initial state.

## Optimality certificate and corrected unit

Any route covering 49 distinct traversable cells needs at least 48 moves because the start occupies the first cell and each move can add at most one new cell. The supplied comparison path contains all 49 open cells exactly once, contains no blocked cell, and every adjacent pair has Manhattan distance one. It therefore reaches the 48-move lower bound and certifies optimality without a fabricated score.

Before archiving, the donor's display unit was corrected from an ambiguous "49 steps" convention, which counted the starting position, to standard movement count:

- initial readout: 0 moves;
- optimal route: 48 moves across 49 cells;
- efficiency: `48 / actualMoves`;
- dark route segments: repeated traversal of the same undirected edge, reported separately from total inefficiency.

The decorative intro kicker was removed. No other visual system, scene composition, or interaction was redesigned.

## Verification

Run `python3 verify.py index.html`. The browser test exercises the complete route at DPR 1 and 2, blocked moves, keyboard, direction pad, swipe input, exact reset, repeated-edge evidence, reduced motion, transition interruption, scene exclusivity, Canvas sampling, no-scroll layout, and the embedded line map.

The generic chassis self-check can also be run with:

```text
python3 pages/assets/selfcheck.py pages/index.html --shot --shot-dir .codex-shots
```

## Third-party boundary

The page has no downloaded image, font, or article asset. `pages/assets/` is the repository's unchanged Notale chassis. The only runtime library used by the page is the chassis copy of GSAP 3.12.5; see `THIRD_PARTY_NOTICES.md`.
