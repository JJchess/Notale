# Crossword mechanism source

This is a focused adaptation of `svelte-crossword@0.3.4`, imported directly by `src/components/Play.svelte` and compiled into the mini runtime. It omits the confetti already disabled in the full sample and three themes not used by this page. Input, focus, undo/redo, checking, revealing and completion remain the original implementation. The reveal timer is cleared on component teardown. The full sample retains the unmodified package source.

- `Crossword.svelte`: shared cells and clues, correctness, Clear / Reveal / Check, and completion.
- `Puzzle.svelte`: cell updates, focus movement and undo/redo state history.
- `Cell.svelte`: keyboard events, cell rendering and incorrect-answer feedback.
- `helpers/`: grid construction, crossing-word constraints and navigation.

The generic Svelte runtime and `svelte-keyboard@0.2.0` remain package dependencies. The latter supplies the on-screen keyboard; its event consumer and the crossword state updates are included in `Puzzle.svelte`.

Source: https://github.com/russellgoldenberg/svelte-crossword
Package: https://registry.npmjs.org/svelte-crossword/-/svelte-crossword-0.3.4.tgz
Archive integrity (matches this sample's package-lock.json): `sha512-9yP40NkHNrLVAPSov0UQ8JTvVBheLi/eoZ7siI1zOaFP61wDAIfngPMj6njpxOLQM5pfFyPaVn06RSlzi6cvhw==`.
MIT license: see `LICENSE`.
