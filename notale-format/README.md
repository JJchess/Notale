# @notale/format

Shared native `.notale` v1 envelope and page runtime contract. The archive is ZIP with `notale-project.json`, `index.html`, authored slides and their relative assets. `document.slides` is authoritative for editing; the root HTML files are playback output. Container and author-document schema versions are independent. No harness or editor business dependencies.

Build this package before installing the sibling harness/editor dependencies: `npm install && npm run build`.
