# Notale TypeScript Harness

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

The obsolete simplified browser workbench, worker, chassis and runtime installer are also archived under `../legacy/notale-ts-simplified/`. Production CodeScaffold uses `resources/code-workbench` with npm runtime dependencies; `src/browser/code-workbench/theme.ts` remains active for the approved theme mapping. Build reuses a cached Python wheel only after verifying its lockfile SHA-256.

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

Planner prompts, inputs, models, tools and gates do not branch on templates. The template Style Director runs independently using `style-template.md` and `SubmitTemplateStyle`, delivering CSS plus `work/template-spec.json`. It preserves branding and declares replaceable objects and regions. Builder shares teaching/steps/audience/continuity/retry contracts but loads `build-template.md` instead of free-composition samples. Check assembles the fixed SVG layer and validates the resulting page, including after-action states. Code pages retain their workbench and only receive palette/font mapping. Template specifications and conversion intermediates stay outside the published output; assembled HTML and local resources continue to use `.notale v1` without editor-side PPTX support.
