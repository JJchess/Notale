# Frozen `.notale` v1 contract

Frozen for editor integration on 2026-09-14. Changes to generation prompts, code-page planning, file inputs or template inputs must continue to produce this contract. Incompatible changes require a new version and explicit reader migration, never a silent replacement of v1.

## Container and authoritative content

- `.notale` is a ZIP container. Root `notale-project.json` contains `format: "notale"`, `formatVersion: 1`, `entry: "index.html"`, and `document`. The embedded document uses `schemaVersion: 1`, independently of the container version.
- For editing, `document.slides` is the ordered page list. Each page supplies `id`, `name`, `sourcePath` and editable `html`; preserve its `data-notale-id` identities. Canvas size comes from `document.width` and `document.height`.
- `document.assets` maps package-relative paths to `{ hash, size, mime }`, where `hash` is SHA-256 of the resource bytes. Resolve relative URLs from the referring file. Preserve paths and resource bytes when round-tripping; do not hard-code font/player filenames or their internal directories.
- For playback, `entry` and page files provide the assembled static lecture. The editable source is the HTML in `document`; do not independently merge the playback copy into it. A future editor exporter must render playback from edited content rather than retain stale page files.
- Pages, fonts, pictures, interaction/code runtimes and license notices are included. HTTP encoding sidecars may be omitted when their original exists. Export caches and generation work/logs remain outside the package. `publication.json` is diagnostic information, not an import dependency.
- Optional metadata may be added without breaking v1. Readers should tolerate unknown optional container fields, reject unsupported container/document versions, and validate safe relative paths, required files, resource sizes and hashes before importing. An old ZIP without container markers remains a separate legacy input.

## Code pages and future inputs

Container compatibility and code-editor compatibility are separate. Current code pages embed a workbench through `.code-workbench-frame`. Lesson metadata (`.notale-code-lesson.json`, currently `schemaVersion: 1`) declares the page, editable relative paths and fixed runtime location. Consumers should follow those declarations rather than assume every lesson is named `starter.py`.

Prompt, reasoning and audit changes do not alter the container contract. Changes to editable-file declarations, lesson configuration semantics, frame/runtime APIs or loading paths require a separately coordinated code-page compatibility change; retain existing support until an explicit editor migration is ready. New file/template inputs must materialize necessary resources in the package, not reference temporary uploads or host filesystem paths.

## Download and identity

`/v1/runs/:id/download?format=notale` is the native endpoint. `/download` and `?format=zip` retain legacy ZIP export. Native downloads use `application/octet-stream` and a UTF-8 filename derived from the cover heading, then its title, then `讲义-<runId>.notale`.

The filename is a display label, not an identity or type check. Use the manifest to identify type/version and document identity. Importing a copy may create a new document ID; stable identity across independently rebuilt exports is not a v1 guarantee.

Full playback needs static HTTP resource hosting; this contract does not imply desktop double-click/file-URL support. Packaging does not automatically make existing external dependencies offline. Viewer local-file opening and editor `.notale` support are separate integrations.
