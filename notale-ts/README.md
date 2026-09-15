# Notale TypeScript Harness

## Code pages: observer-v1 (2026-09-15)

New `build-code` pages use the integrated observer workbench. The host creates the
scaffold before the first request and preloads all four full samples. Authors write
only starter.py, observe.py, tests.py and view/render.js, using the normal TS
Read/Write/Edit/Check loop. Default: Paratera GLM-5.3-Flash low, 300 s/request,
480 s/page, 128000 output-token ceiling; `PARATERA_API_KEY` is required.
Visual-page profiles and Planner/Director are unchanged. `--samples` and auxiliary
sample switches continue to affect visual pages; code pages always preload four.

The runtime and samples are shipped in `resources/code-observer` and
`resources/skills/build-code/observer-samples`; no experiment directory or Python
subprocess is required. Themes map deterministically from Director CSS. NumPy is
loaded on demand, with editor/view/Python startup overlapped. Catppuccin palette
license notices accompany the derived syntax colors; no VS Code theme catalogue
is loaded. Only observer-v1 is supported for generation and Check. The retired
trace pipeline is archived under `../legacy/notale-ts-build-code-trace/`;
historical output is untouched but no longer carries a compatibility promise.

Run `npx tsx --test test/code-observer.test.ts` for the offline contract and browser/
archive regression (no paid model requests). See [architecture](ARCHITECTURE.md)
for ownership and compatibility boundaries. Runtime passes do not imply complete
algorithm/visualization semantic correctness or a two-minute generation guarantee.

**Status (2026-09-13, batch 278): migration acceptance completed.** Current differential checks, completed 45/60-minute real generation, cancellation of a separate 90-minute task, Viewer recovery, movable outputs and editor import are recorded in [ACCEPTANCE.md](ACCEPTANCE.md). The requirement index and retained content/loading limitations are in [COMPATIBILITY.md](COMPATIBILITY.md).

TypeScript generation backend for Notale. It exposes the same core through a library, CLI, and durable HTTP/SSE run service. The Python `notale-v2` remains available as the stable reference.

```bash
npm install
npm run build

# Real model pipeline (defaults to the Google OpenAI-compatible endpoint)
export GEMINI_API_KEY=...
npm run dev -- serve

# Deterministic development pipeline
npm run dev -- serve --starter
```

Generate directly from the CLI:

```bash
npm run dev -- build --query "用直觉理解梯度下降" --minutes 45 --style "冷静的工程手册"
npm run dev -- inspect <run-id>
```

Model configuration comes from the baseline `resources/config.yaml`. CLI `--config` selects another configuration, `--profile` chooses its Builder profile, and `--uniform` disables workflow-specific overrides. Keys are read from the environment (or `.env.local`, falling back to the Python project's existing file); `--env-file` selects an explicit file. `NOTALE_RUNS_ROOT` selects the run directory.

API, CLI and Viewer default to the Python Planner's 90 minutes, original audience, and empty scenario/style. Explicit request text is preserved, without the former 360-minute ceiling or request-field text-length caps. Viewer creation has explicit course settings. Builders default to `--notes cap`: the initial cover instruction limits visible text to 80 characters, while regular and interaction pages use 200; code pages receive no text budget and speaker notes remain disabled. This is a generation guideline, not a delivery gate or a repeated Check report. `--notes off` disables it, `notes` adds speaker notes to the same page-type budget, and `only` requests only speaker notes. Other Builder options include `--concurrency`, `--samples mini|none`, `--sample-shots`, `--visual-focus`, and `--aux-samples`/`--no-aux-samples`. `--style-director`/`--no-style-director` and `--template` control theme planning. `--workflows`, `--prompts`, `--chassis`, and `--lib` select input resources. For `plan`, `--model`, `--effort`, `--base-url`, `--key-env`, and `--wire` override only Planner/Director settings; Builder keeps its configured profiles. Independent stages accept their own minimal configuration blocks. An explicit `--skills PATH` retains the legacy `PATH/make-illustration/scripts/gen.py` extension contract (Python executable on PATH, original arguments and `illustrations.json`, 300-second timeout). The default ImageGen path remains native TypeScript. Custom plugins run only when selected; their own Python dependencies are not bundled by this harness.

`ImageSearch` uses `GEMINI_API_KEY`; `ImageGen` uses `PARATERA_API_KEY`. Page agents receive the downloaded/generated image as visual input and run a real 1600×900 Chromium check after authoring. If Playwright has no browser on the machine, run `npx playwright install chromium` or set `NOTALE_CHROMIUM_PATH`.

The viewer runs separately from `../notale-viewer`. Generated artifacts contain regular relative files, include browser dependency notices, and do not link back to this repository. Monaco inherits its light/dark base under the MIT license, while lecture-specific syntax colors are derived from the generated semantic lecture theme; no third-party VS Code theme collection is bundled.

Separate stages use a label directory directly under `--runs`:

```bash
npm run dev -- plan --label example --runs ../experiments/runs/notale-ts --query "黑体辐射" --minutes 45
npm run dev -- build --label example --runs ../experiments/runs/notale-ts --only page-01 --only page-02
```

Planning refuses an existing label. The first Builder invocation can select pages with repeated `--only`; an existing Builder manifest or selected page artifact rejects another build, matching Python. This is not resumable incremental building. These stage commands write the original `pages`, `briefs.json`, trace, and Builder manifest/results layout; the complete `build --query` command remains the HTTP/Viewer-compatible workflow with final publication.

Planner writes a single `## Audience` before the first page in `pages/plan/pages.md`, describing the learners based on the requested audience. Optional `## Continuity` entries use `### entry-id`, a `Pages: page-02, page-03` line, and concrete shared facts or reproducible data rules; use `无` when none apply. See the format in [the Planner prompt](resources/prompts/deck.md). FinalizePlan requires a nonempty audience and rejects duplicate entry IDs, empty constraints, and invalid or repeated page references. Every Builder receives the same escaped `<audience>`; only listed pages receive each `<continuity>` entry, including code pages and overlapping groups. Page specs remain separate, with no repeated global definitions. Parsing legacy plans without these sections remains supported. Python implements the same contract; this adds no model stage or shared runtime state.

Inspect existing pages using the host CLI (no model request):

```bash
npm run dev -- check /path/to/pages/page-01.html --text-report
npm run dev -- check /path/to/pages/page-01.html --after "return document.title" --json
npm run dev -- check /path/to/pages/page-01.html --crop=0,0,800,450 --shot-dir /tmp/selfcheck
```

With no page arguments, `check` scans `page-*.html` in the current directory. Repeated `--after` scripts run sequentially; `--crop` implies screenshots. `--wait` defaults to 1200 ms and `--zoom` to 2. Like Python's diagnostic CLI, reported page problems do not change the successful inspection exit status (0); no existing input pages returns 2. The host command requires the installed TS harness and browser. Newly seeded artifacts also include the same implementation as `assets/selfcheck.mjs`, with embedded probes and their own npm dependency declaration.

After moving a newly generated artifact, run its independent checker from the `pages` (or published output) directory:

```bash
npm install --prefix assets
npm exec --prefix assets -- playwright install chromium
node assets/selfcheck.mjs page-01.html --json
```

These dependencies are only needed for diagnostics; viewing the lecture does not require Node. `npm run build` creates the portable checker and verifies/prepares the offline Python wheels used by the migrated scaffold. Existing artifacts are not modified retroactively. An explicitly supplied custom chassis's `selfcheck.py` is retained when present; the default TS artifact checker uses Node.

The package entry exports `createModelPipeline`, `ModelRuntime`, `workflowModels`, and the baseline profile resolvers. The initial simplified executor, file/media tools, model transport and Check implementation are archived in `../legacy/notale-ts-simplified/`; `chat-model.ts` now contains types only. The `runAgent`, `ChatModel`, and `modelFromEnvironment` runtime APIs have been removed; use the migrated workflow and configured model runtime so generation retains the Python prompts, tools, retries, and gates.

The initial simplified workbench remains archived under `../legacy/notale-ts-simplified/`; the later trace workbench and theme installer are archived under `../legacy/notale-ts-build-code-trace/`. Production scaffold uses only `resources/code-observer`, including its outer HTML and deterministic theme mapper. Build reuses a cached Python wheel only after verifying its lockfile SHA-256.

Native lecture export uses a ZIP container with the `.notale` extension. `notale-project.json` adds `format: "notale"`, `formatVersion: 1`, and `entry: "index.html"` alongside the existing `document` (`schemaVersion: 1`). Container and editor document versions are independent. `document.slides` defines page order and editable HTML; the unchanged page files and `index.html` provide playback. Assets, fonts with full fallback coverage, runtimes and license notices are preserved. Only published output is packaged; redundant HTTP encodings are omitted. Generated logs and export caches stay outside the archive. External dependencies in authored pages are not rewritten.

The download filename comes from the first page's nonempty `<h1>`, then its `<title>`, falling back to `讲义-<runId>.notale`. It is read at download time, sanitized and length-limited; it never uses the full query or changes/repackages the cached archive.

After a service run completes, `.notale` packing runs independently with one active archive job per process. Preview and run completion never wait for it. Files and durable job state live under `<run>/exports/`; writes publish atomically and repeated downloads reuse a cache keyed by exporter version, artifact identity and source file metadata. Queued/interrupted jobs resume on server startup; failed jobs retry only on demand. Existing completed runs are packaged as v1 on their first download. The full CLI `build` prints the generation result, then waits for the archive; packing failures use stderr and a nonzero exit code without changing the completed run. Independent planning/build stages do not pack.

`GET /v1/runs/:id/download?format=notale` waits for an active job or streams the cached file with a sanitized UTF-8 attachment filename and `application/octet-stream`. Omitting `format` also exports `.notale` v1; `format=zip` is rejected. Invalid formats return 400, unfinished runs 409, missing runs 404, and packing failures 503. The Viewer downloads `.notale` by default. Local-file playback, desktop file associations and editor changes are deferred; v1 is the only supported export format; the editor will be upgraded separately.

Publication builds the fixed player with Vite during `npm run build`, alongside reusable font subsets and compression caches in `.cache/publication` (override with `NOTALE_PUBLICATION_CACHE`). First-time font preparation took 133 seconds on the development host; it is deployment work, not a per-lecture build. Each lecture then receives its own WOFF2 subsets, disjoint fallback ranges covering the registered font's remaining glyphs, hashed player assets and precompressed HTTP variants before atomic publication. Authored work files, generation prompts and model calls are unchanged. Failed runs keep diagnostic work files without publishing a final lecture.

The HTTP server serves published HTML with revalidation, other published resources with immutable caching, and unfinished work with `no-store`. The player prepares up to three pages ahead, limits concurrent preparation, retains visited pages, and accepts Shift+Left/Right for direct page changes even inside code frames (text inputs retain their keys). Ordinary arrows still advance steps. Code visualization readiness is separate from editor/Python readiness. ZIP export omits redundant HTTP encodings; it retains the original resources and complete font fallback coverage for static hosting and editor import.

2026-09-14 targeted acceptance reused existing complete lectures (7/7/8 pages), without model calls: initial seven-page assembly/publication 4.48 seconds, cached final publication 0.51–1.38 seconds. Chromium at 20 Mbps/40 ms measured an 806 ms usable first page and 7 ms adjacent transition after one second of dwell on the initial candidate. Full seven-page ZIP import returned 201 from the editor; a relocated static copy ran its Python page and passed its three embedded assertions. These measurements are local representative samples, not guarantees for arbitrary generated content or devices.

## PPTX templates

The Viewer accepts one `.pptx` attachment (up to 50 MiB). `POST /v1/templates` accepts multipart field `file` and returns `{id,name,sha256}`; pass `templateId` to `POST /v1/runs`. Uploads are immutable by content hash and each run receives its own `input/template.pptx` snapshot. The CLI also accepts `--template path/to/template.pptx`; existing CSS/image reference inputs retain their previous behavior.

Install LibreOffice and fontconfig on the server (`NOTALE_LIBREOFFICE` can select the executable). Conversion, SVG/resource processing and font subsetting are native TypeScript; Python/UNO is not used. A private headless LibreOffice process renders actual example slides and their inherited masters. Unused master layouts, PowerPoint animation and external linked resources are not imported. Conversion is cached; cancellation kills the converter process group. Non-widescreen templates are fitted proportionally inside 1600×900. Font substitutions are reported.

Planner prompts, inputs, models, tools and gates do not branch on templates. The template Style Director runs independently using `style-template.md` and `SubmitTemplateStyle`, delivering CSS plus `work/template-spec.json`. It preserves branding and declares replaceable objects and regions. Both Builder modes share the teaching section of each non-code SKILL, the full technical contract and visual guidance. Template mode preloads the teaching section without sample selection, then adds only the constraints in `build-template.md`. Both Directors also receive the shared visual guidance for new content and components; original template artwork stays intact. Check assembles the fixed SVG layer and validates the resulting page, including after-action states. Code pages retain their workbench and only receive palette/font mapping. Template specifications and conversion intermediates stay outside the published output; assembled HTML and local resources continue to use `.notale v1` without editor-side PPTX support.

The native teaching/visual refinements are recorded in `resources/python-baseline.json` under `nativeResourceUpdates`. Python baseline files stay unchanged; parity tests retain the original assembly checks using baseline inputs, while contract tests check the current free/template prompts. These changes add no model stage or mandatory reference-read round.


## Content files

Upload PDF, DOCX, or static PNG/JPEG/WebP with multipart field `file` to `POST /v1/files`; use the returned IDs in optional `fileIds` on `POST /v1/runs`. The Viewer supports multiple files, removal, per-file upload retry and drag/drop. Content files and the separate PPTX template can be combined. Limits live in `src/core/file-input.ts`: 10 files, 50 MiB per file, 200 MiB and 200 pages per task. Other formats and animated images are rejected. Invalid/encrypted documents fail during preparation with a file-specific error.

CLI: `notale build --query "Summarize these materials" --file paper.pdf --file notes.docx --file figure.png`. Staged `plan --label NAME` takes the same repeated `--file`; subsequent `build --label NAME` uses saved sources and does not accept replacement files.

The server needs Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), LibreOffice and fontconfig. DOCX is converted to PDF in a private LibreOffice profile; its page references mean converted pagination. Native PDF text is extracted locally with line coordinates. Page images render on demand; scans/images use the existing Planner vision model for faithful transcription, with two recognition calls at most per document concurrently. Text-only profiles reject scans rather than pretending to read images. The source cache includes document hash, converter/font environment, model profile and transcription instruction; it publishes only complete results. Task cancellation aborts model work and converter process groups. Originals remain in each task's `input/files` snapshot.

Source preparation runs alongside the existing Style Director. It adds no material content to that Director. Small sources preload complete text; long sources preload a catalog. Optional `SearchSources` and `ReadSource` provide paginated text, page images and normalized crops. Planner assigns already-read refs through `sources_by_page`; Builders preload only the corresponding evidence, retain normal audience/continuity behavior and can read additional sources. The user's query determines fidelity, expansion and image reuse; no separate intent model or UI mode is introduced. Transcription uncertainties remain in evidence; generated conclusions still require review.

Only images actually referenced by page HTML/CSS/JS and `assets/sources/CREDITS.md` enter the published lecture and `.notale v1`; originals, OCR results and preparation caches stay outside. Use the complete `asset` paths returned by `ReadSource`, without dynamic filename construction. Structured editing tools reject changes to these source assets and publication verifies their hashes. These protections do not constitute an OS sandbox for the existing Builder shell. This feature does not change the no-attachment prompts, tool list, output format or editor import contract.

Acceptance (2026-09-14): mixed PDF/DOCX/PNG produced 5 pages; scanned PDF plus PPTX produced 4. All nine passed the existing page audit and loaded after archive relocation; both v1 archives imported through the current editor API with HTTP 201 in an isolated scope. Candidate publication initially lacked package-lock.json; after supplying it, publication/packing reused the generated pages in 1.17/1.32 seconds, without regenerating. Browser upload retry and task refresh were checked. The current input contracts passed; one wider Python/TS handoff parity test differed in existing prompt content and remains outside this change. Manual review also found an unsupported peak-flow inference in generated wording: the source prompt now explicitly separates observation, calculation and unmeasured mechanisms. This is a prompt constraint, not an automatic semantic correctness gate; the two reference outputs predate that wording refinement.


## Generation guidance (2026-09-15 candidate)

Planner keeps evidence, derivations and unknown conditions distinct in the existing Audience/Continuity handoff. Free and template Directors share logical-canvas font guidance from `src/core/guidance.ts`; their CSS interface explains actual typography and semantic color roles. Builders retain necessary derivations within the existing 80/200-character budgets and use meaningful steps and data-linked visual states. This adds no Check metric, model stage or retry policy.

Acceptance: typecheck and 61 tests passed. The four input/template combinations were exercised with three real queries each: 10/12 succeeded initially, 11/12 after one independent rerun of each failure. All 11 successful archives (57 pages) loaded after relocation and imported through the current editor API. One mixed-file/template Planner task again ended with an empty response before FinalizePlan; another task's invalid nested CSS comments succeeded only on a separate rerun. Manual review still found unsupported claims, inconsistent calculations and decorative panels, so this is not a claim of semantic or visual convergence. Local evidence: `../experiments/notale-ts/quality-20260914/REPORT.md`; the stable Viewer was not replaced.
