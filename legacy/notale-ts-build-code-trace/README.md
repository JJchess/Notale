# Retired TS trace code pages — 2026-09-15

Explicit user decision: **no legacy code-page compatibility**. Active code lives in
`Notale/notale-ts/resources/code-observer` and the normal TS scaffold/Check/Builder.

## Archive map

- `notale-ts/resources/code-workbench/`: old template and runtime.
- `notale-ts/resources/skills/build-code/`: old reference and sample catalogue/bundles.
- `notale-ts/resources/code-scaffold.json`: retired editable list and old outer template;
  the still-used outer HTML now lives in the active observer resources.
- `notale-ts/src/`: retired theme installer and mapper.
- `notale-ts/test/legacy-code-parity.fragment.ts`: three old-specific tests extracted
  verbatim from parity.test.ts, retained as a fragment rather than a runnable suite.
- `notale-format/src/code-workbench.ts`: retired hash-based source-rewriting adapter.
- `snapshots/`: pre-cleanup mixed files, preserving removed scaffold/check/Builder/schema
  and archive/editor adapter branches. Surrounding user changes are included as they
  stood; never restore these snapshots wholesale over newer files.
- `*/dist/`: retired compiled theme/helper files, removed from active build outputs.
- `notale-ts/resources/python-baseline.json`: original baseline registry; obsolete
  code-page entries are no longer tested against Python by the active harness.

Paths preserve their original project-relative layout. Nothing in the active build
or tests imports this archive. No compatibility launcher or symlink is provided.
Historical experiments and generated lectures were not moved or rewritten.
To recover source, select individual files and review dependencies; this is source
history, not a supported executable distribution.
