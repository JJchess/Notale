# Crossword mechanism source

This is the unmodified `src/` of `svelte-crossword@0.3.4`, the dependency imported by `src/components/Play.svelte`. It is included here for model-readable reference; the runnable page still uses its existing compiled build and locked npm dependency.

- `Crossword.svelte`: shared cells and clues, correctness, Clear / Reveal / Check, and completion.
- `Puzzle.svelte`: cell updates, focus movement and undo/redo state history.
- `Cell.svelte`: keyboard events, cell rendering and incorrect-answer feedback.
- `helpers/`: grid construction, crossing-word constraints and navigation.

The generic Svelte runtime and `svelte-keyboard@0.2.0` remain package dependencies. The latter supplies the on-screen keyboard; its event consumer and the crossword state updates are included in `Puzzle.svelte`.

Source: https://github.com/russellgoldenberg/svelte-crossword
Package: https://registry.npmjs.org/svelte-crossword/-/svelte-crossword-0.3.4.tgz
Archive integrity (matches this sample's package-lock.json): `sha512-9yP40NkHNrLVAPSov0UQ8JTvVBheLi/eoZ7siI1zOaFP61wDAIfngPMj6njpxOLQM5pfFyPaVn06RSlzi6cvhw==`.
MIT license: see `LICENSE`.
