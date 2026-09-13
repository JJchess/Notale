# Asset provenance review

Status: incomplete; no redistribution clearance is implied.

| Area | Inspected evidence | Release action |
| --- | --- | --- |
| Refined templates | All 8 manifest entries point to reference PNG sources and carry watermarkMasks metadata. templates/README.md describes reconstruction against refs. | Replace release catalog with original editable templates; do not distribute reference-derived files until source rights are established. Preserve users' existing documents. |
| Template fonts | prepare-fonts.py converts renamed font files from refs/template/organized/_shared/fonts. Current output directory contains four WOFF2 files without accompanying license texts. | Establish original family/version and license texts, or replace the release templates with system-font defaults / separately verified open fonts. |
| Template images | Hashed PNG filenames in templates/refined/assets identify content, not authorship or rights. | Exclude from new original catalog unless provenance is established. |
| npm dependencies | Reproducible lockfile inventory contains 379 entries, including LGPL and mixed license expressions. Only the local @notale/editor package lacks a license declaration. | Read actual licenses and bundled notices; classify linked versus bundled distribution. Do not treat package metadata as final compliance. |
| Root project | No root LICENSE/COPYING exists; root README describes an earlier generator architecture. | Define release source scope and license for owned code, preserve third-party notices, update entry documentation before publication. |

The original-template replacement must preserve useful coverage: complete slide layouts and independently insertable diagrams, editable elements, reliable thumbnails, no screenshot overlays, no external reference-directory dependency, and appropriate visual polish. Merely hiding all templates is not completion.

Runtime documents and uploaded assets are independent of the library catalog. Replacement must not rewrite existing lecture data or remove stored blobs. Before publication inspect the actual release file list and Git history scope, not only the current catalog.
