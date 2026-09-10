# 填字里，你先想到谁？

Approved by the user on 2026-09-07. Formal category: `interaction/general`.

Letter entry updates a constrained grid, crossing words, validation, undo history, and completion evidence.

The model-readable bundle includes the locked `svelte-crossword@0.3.4` mechanism source and license under [vendor/svelte-crossword](vendor/svelte-crossword/README.md). This supplements the reference material without changing the runnable build or puzzle data.

Source: https://github.com/the-pudding/crossword-puzzles, commit `552aa705a9a08ee48e06724921dba83ec8b6f968`.

Original media, fonts, data and implementation are retained locally. [Original review](../../provenance/REVIEW.md) · [Asset manifest](../../provenance/assets.json). Manifest paths are relative to the original candidate; unchanged runtime assets remain under pages/, archived originals under provenance/.

This is a scoped, runnable sample extracted from the original work, not the complete original article. Framework samples include their compiled browser build and editable author source. Serve this directory over HTTP.


Mini uses its local readable crossword components at runtime. It removes only disabled confetti and unused alternate themes; all 13 puzzles, the classic theme, real input/history/validation, mobile keyboard, completion fade and representation highlights remain. The upstream MIT license is retained.

The 1600×900 desktop mini keeps the original 528px crossword board next to its clues. Intro/source context, collection navigation and methodology occupy the left column; across/down lists and method text scroll locally. All 13 original puzzles, answers and interactions remain intact.
