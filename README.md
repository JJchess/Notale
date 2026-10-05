# Notale

**From a topic to an interactive lecture.**

[![CI](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml/badge.svg)](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.1.0-6246C8?style=flat-square)](CHANGELOG.md)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](notale-editor/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](notale-editor/tsconfig.json)
[![MIT license](https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square)](LICENSE)

**English** · [简体中文](README.zh-CN.md)

[Get started](#get-started) · [Workflow](#from-first-prompt-to-the-classroom) · [Architecture](#how-it-is-built) · [Contribute](#development-and-contributing)

Notale helps teachers and educational content creators turn a topic and teaching materials into interactive lectures. Generate a first draft with AI, revise it through conversation, refine it in a visual editor, and present it with notes and an audience view.

The pages run in the browser. Supported controls, charts, simulations, and code activities let learners change inputs and explore what happens. You can shape both the content and the sequence in which it is taught.

![Notale's visual editor with page thumbnails, a lecture cover, and the style panel](notale-editor-frontend/docs/release/screenshots/editor.png)

*The editing workspace: arrange pages, refine the canvas, and prepare a lecture for presentation.*

## What you can make

- **An AI-generated first draft.** Start with a topic; attach reference materials, a PPTX template, or a style image. Follow generation in the Viewer and request changes in the same conversation.
- **A workspace for your lectures.** Search server-side history, rename lectures, and archive or restore them. The Viewer keeps input drafts and uploaded attachment references, supports Chinese and English interface text, and lets you read earlier replies while new output arrives.
- **Pages you can refine.** Edit text, images, shapes, SVG, connectors, tables, and charts. Arrange layers or start from the included page templates and diagrams.
- **A teaching sequence.** Organize pages and in-page steps, add animation cues and speaker notes, then rehearse in preview.
- **An interactive presentation.** Use a speaker view, timer, annotations, and a synchronized audience window in the same browser. Supported page interactions remain available during presentation.
- **A project you can keep.** Save with revision history and local draft recovery. Import and export `.notale` projects, or export a standalone HTML presentation.

Custom scripts and Canvas content need a supported adapter for visual editing. Review generated content and interactions before teaching; see [integration coverage](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md) for the current editing boundary.

## From first prompt to the classroom

Try a prompt that describes what learners should do:

> Create a lecture introducing gradient descent. Let learners change the learning rate, predict what will happen, and compare convergence with overshooting. Include pauses for discussion.

| Step | Your next action |
| --- | --- |
| **1. Generate** | Submit the topic and any materials in the Viewer. Follow progress and inspect the completed pages. |
| **2. Revise** | Ask for a clearer explanation or a different activity. A completed revision becomes a new version; the earlier result is kept. |
| **3. Refine** | Open the selected version in the separately running editor. Adjust supported elements, page order, steps, and notes. Reopening that version returns to the same document and preserves saved manual edits. |
| **4. Teach or share** | Present with speaker tools and an audience window, or export the project or HTML presentation. |

The generator, Viewer, and editor are separate applications. You can also start directly in the editor and author a lecture without AI.

In the Viewer, use **Cmd/Ctrl+K** to find a lecture. Resize the preview and conversation panels, open a focus or fullscreen view, and select an earlier version without new results changing that selection. On narrow screens, switch between lecture and conversation tabs. The interface language setting does not change the language requested for generated content.

## Get started

Requires **Node.js 20.19+** and **npm**. The editor also needs **PostgreSQL 16**; the supplied Docker Compose configuration can run it locally. AI generation needs model credentials, and conversational revision uses a Docker sandbox.

From the repository root, install and build the shared format package once before either path:

```bash
npm ci --prefix notale-format
npm run build --prefix notale-format
```

### Option A — Try the editor

Manual editing and presentation do not require model credentials. From the repository root:

```bash
cd notale-editor
npm ci
docker compose up -d --wait
npm run build

cd ../notale-editor-frontend
npm ci
npm run build
npm run start:local
```

Open **http://localhost:4312**. `Ctrl+C` stops the application services; the database and its data remain. To use an existing PostgreSQL server, set `DATABASE_URL` and skip the Compose command. See [local deployment](notale-editor-frontend/docs/LOCAL-DEPLOYMENT.md) for ports and configuration.

### Option B — Generate with AI

Copy [`.env.example`](.env.example) to `.env.local` at the repository root and fill in the keys for your model configuration. The default configuration uses `GEMINI_API_KEY`; image generation also needs `PARATERA_API_KEY`. Both the generator and editor read this ignored local file, with shell environment variables taking precedence.

**Terminal 1 — generator**, starting from the repository root:

```bash
cd notale-ts
npm ci
npm run build
npx playwright install chromium
npm run dev -- serve --sessions .local/sessions
```

Chromium is used for visual checks. On Linux hosts missing browser system libraries, use `npx playwright install --with-deps chromium` instead; it may require administrator privileges.

**Terminal 2 — Viewer**, also starting from the repository root:

```bash
cd notale-viewer
npm ci
npm run dev
```

Open **http://localhost:3000**. The Viewer connects to the generator at `http://127.0.0.1:4321`. The `--sessions` option enables the conversation endpoints used by its home screen. PostgreSQL is only needed when you also run the editor.

To revise generated lectures through conversation, first set up the [AI agent sandbox](notale-ts/sandbox/README.md). To use **Open in editor**, also run Option A. See the [generator guide](notale-ts/README.md) for model profiles and CLI usage, and the [Viewer guide](notale-viewer/README.md) for connection settings.

For development, `serve --starter` supplies deterministic sample run data without model calls. It does not provide a credential-free AI conversation experience.

> [!IMPORTANT]
> These instructions start a local development setup. The editor uses a fixed development identity. A hosted deployment needs authentication and authorization, a private preview-signing secret, and a separate slide-content origin. Follow the [integration guide](notale-editor/docs/INTEGRATION.md) before exposing it to other users.

## How it is built

| Project | Responsibility |
| --- | --- |
| [`notale-ts/`](notale-ts/) | Lecture generation, conversational revisions, CLI, HTTP/SSE service, and publication assets |
| [`notale-viewer/`](notale-viewer/) | Lecture library, reliable topic and attachment input, generation progress, conversation, preview, and editor handoff |
| [`notale-editor-frontend/`](notale-editor-frontend/) | Next.js and React editing and presentation workspace |
| [`notale-editor/`](notale-editor/) | TypeScript document model, HTTP API, revision store, and native slide runtime |
| [`notale-format/`](notale-format/) | Shared project archive and page-runtime format contract |

The generator produces browser-based lecture pages and `.notale` archives. The Viewer follows generation and imports a selected result into the editor. The editor frontend uses a pinned `@notale/editor` package and talks to the backend over HTTP. PostgreSQL stores editor documents and assets; authored slide content is served from a separate origin.

## Development and contributing

Choose the project above that owns your change and follow its setup and verification instructions. If you change the shared editor backend contract, run `npm run contract:update` in `notale-editor-frontend/` before rebuilding the frontend. For documentation changes, keep these two README files aligned.

Bug reports are most useful with reproduction steps, expected and actual behavior, and a minimal example with private content removed. For a substantial change, describe the intended user workflow in an issue before opening a pull request.

| Read more | Start here |
| --- | --- |
| Generate and revise lectures | [Generator](notale-ts/README.md) · [Viewer](notale-viewer/README.md) |
| Develop the editor | [Frontend guide](notale-editor-frontend/README.md) · [Architecture](notale-editor-frontend/docs/EDITOR-ARCHITECTURE.md) |
| Prepare a presentation | [Presentation guide](notale-editor-frontend/docs/PRESENTATION.md) · [Original templates](notale-editor-frontend/templates/original/README.md) |
| Integrate or host Notale | [Integration guide](notale-editor/docs/INTEGRATION.md) · [Integration coverage](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md) |

### Project status and license

Notale is at **0.1.0**, in preparation for public release. The canonical repository is [THU-AICosmos/Notale](https://github.com/THU-AICosmos/Notale); [JJchess/Notale](https://github.com/JJchess/Notale) is a synchronized mirror. Both remain private pending maintainer review and explicit authorization to make them public.

Notale-owned source code is [MIT licensed](LICENSE). Bundled third-party resources retain their own licenses and notices; see the [resource audit](notale-ts/RESOURCE-AUDIT.md). The source distribution covers the five projects above and root documentation.
