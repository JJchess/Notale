# 一张地图，51 条不同的路

Approved by the user on 2026-09-07. Formal category: `interaction/general`.

Keyboard or touch moves along legal maze cells; visited paths, completion, and saved progress derive from the same grid.

Source: https://github.com/the-pudding/mazes, commit `4bfd954b3532d0eacff03195f3da234e115f3ac9`.

Original media, fonts, data and implementation are retained locally. [Original review](../../provenance/REVIEW.md) · [Asset manifest](../../provenance/assets.json). Manifest paths are relative to the original candidate; unchanged runtime assets remain under pages/, archived originals under provenance/.

This is a scoped, runnable sample extracted from the original work, not the complete original article. Framework samples include their compiled browser build and editable author source. Serve this directory over HTTP.


Mini consolidates the identical keyboard/touch wall-crossing rule and repeated SVG wall markup. It preserves all 51 mazes, six stories, illustrations, policy snapshots, dashboard and methodology; SVG path animation, wall drawing, resets and reduced motion are unchanged. `src/utils/nextLocation.js` is a local pure movement helper, not a new state machine.

At 1600×900 the six illustrated story entries sit beside the full geographic state map. Alternative ordered lists scroll locally; sort/state controls remain visible. Methodology opens in a bounded reading panel with close/Escape and keyboard focus containment. Original maze SVG geometry, controls, progression, stories and historical data remain intact.
