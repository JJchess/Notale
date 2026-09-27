# Public source and contribution boundary

This repository contains the five standalone projects `notale-format/`, `notale-editor/`, `notale-editor-frontend/`, `notale-ts/`, and `notale-viewer/`, with their documentation, resources, dependency notices and CI. Copy `.env.example` to `.env.local` for local model configuration; real credentials and generated user content stay outside Git.

Develop public changes in a clone of this repository. Review the staged diff, then run `python3 scripts/check-public-source.py` before committing. CI checks the committed tree too, including paths and bundled editor archive contents. The scanner is an additional check; review new files and credentials that pattern matching cannot identify.

Private downstream deployments consume public commits. A reusable fix discovered downstream must be implemented as a focused public change, reviewed here, then incorporated downstream. Never merge a private deployment branch or copy its whole source tree into this repository. The former mixed-workspace public export command has been retired.

For automation, use this repository's read-only `GITHUB_TOKEN` for CI and a credential scoped only to this repository for publishing. Local push hooks are convenience safeguards and can be bypassed; they do not replace credential scope or review. Keep version tags immutable.
