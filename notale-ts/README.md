# Notale generation backend

`notale-ts` generates interactive lectures through a TypeScript library, CLI, and HTTP/SSE service. It owns its prompts, page skills, browser runtime, publication assets, and offline code-page samples under `resources/`. It does not require another Notale implementation to build, test, or run.

## Run locally

Requires Node.js 20.19+ and npm. From this directory:

```bash
npm ci
npm run build
npm run dev -- serve --starter
```

The starter service uses deterministic data and makes no model requests. For real generation, set `GEMINI_API_KEY` in your environment or in this project's ignored `.env.local`, then run `npm run dev -- serve`. `PARATERA_API_KEY` is needed when the ImageGen tool is used. You can select another local secrets file with `--env-file PATH`; `NOTALE_DOTENV_DISABLED=1` disables loading a file. Environment variables take precedence over file values. Keep credentials out of Git.

The separate [Viewer](../notale-viewer/README.md) connects to the service at `http://127.0.0.1:4321` by default. You can also generate directly:

```bash
npm run dev -- build --query "Understanding gradient descent" --minutes 45
npm run dev -- inspect <run-id>
```

Set `NOTALE_RUNS_ROOT` to choose where runs are stored. `--config`, `--profile`, and `--uniform` control the model configuration. `--skills`, `--workflows`, `--prompts`, `--chassis`, and `--lib` accept explicit resource directories. An explicitly selected `--skills` directory can supply `make-illustration/scripts/gen.py`; the built-in ImageGen path is TypeScript.

## Sessions: understand, then generate or fix

`serve --sessions PATH` (or `NOTALE_SESSIONS_ROOT`) also serves the conversation layer the Viewer talks to, in `src/session/`. Each message is understood by one model call that submits a `Route` (`src/session/understand.ts`):

- `generate` a new lecture, with each attachment given a role: material, PPTX template or style-reference image;
- `fix` a lecture this session produced;
- `ask` when unsure (the attachments wait for the next message);
- `reply` otherwise.

The result is validated first: a bad role, or a target from another session, becomes a question. A fix is Istar (`src/fix/`), a fork of the editor's pi-based coding agent. It edits a copy of the target run's files directly, with read/write/edit/bash in a docker sandbox (`sandbox/`), Look (Check with a screenshot) and ImageSearch/ImageGen. After every change it checks the lecture with the editor's own page reader (`@notale/format/page`) plus Check on the changed pages. If nothing changed, the fix is a reply. If something changed, it becomes a new run with `basedOn`; the target run stays unchanged. Consecutive fixes in one session continue one agent transcript.

```
POST /v1/sessions                   → {id}
POST /v1/sessions/:id/files         raw bytes, x-file-name (URI-encoded) → {id, name, kind, size}
POST /v1/sessions/:id/turns         {text, fileIds} → ndjson: understood / working / run / progress / result | question | reply, then done
GET  /v1/sessions/:id               → {id, runs, entries, files}
```

`npx tsx scripts/eval-understand.ts` runs the understanding stage alone against a real model.

## Develop and verify

```bash
npm run typecheck
npm test
```

The default tests are offline and self-contained. The library entry exports the generator and protocol declarations; the CLI and service use the same core. The source is grouped by responsibility: `src/core` for planning, building and run state; `src/tools` for bounded authoring and media operations; `src/adapters` for models; `src/server`, `src/cli`, and `src/browser` for delivery surfaces. See [architecture](ARCHITECTURE.md), [format integration](NOTALE-FORMAT.md), and [performance measurements](PERFORMANCE.md).

Completed lectures are static directories with relative regular files. The service also exports `.notale` archives for the editor. Generated code pages use the bundled observer runtime and Pyodide; Python in a generated lesson is learner content, not a backend dependency.

## Licensing

Notale-owned source code is MIT licensed. Bundled third-party fonts, browser libraries, Python wheels, and sample assets retain their own notices; see `resources/licenses/`, the notices shipped with generated artifacts, and the [resource audit](RESOURCE-AUDIT.md). Resource provenance is tracked separately from source-code licensing.
