# Notale

**Build interactive lectures. Teach from the same canvas.**

[![CI](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml/badge.svg)](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml)
[![Package version](https://img.shields.io/badge/packages-0.1.0-6246C8?style=flat-square)](notale-editor/package.json)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](notale-editor/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](notale-editor/tsconfig.json)
[![MIT license](https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square)](LICENSE)

English · [简体中文](README.zh-CN.md)

Canonical repository: [THU-AICosmos/Notale](https://github.com/THU-AICosmos/Notale). [JJchess/Notale](https://github.com/JJchess/Notale) is a synchronized mirror. Both remain private until the maintainer completes review and explicitly authorizes public release.

![The Notale editor showing an interactive lecture page and its style panel](notale-editor-frontend/docs/release/screenshots/editor.png)

Notale is an open-source toolkit for creating and teaching with interactive lectures. Its TypeScript generator creates web-native lecture pages; the Viewer follows generation and presents the result; the editor lets you refine, save, and deliver it. Supported charts, controls, media, and simulations remain interactive instead of becoming static screenshots.

## What you can do

- **Create and refine pages:** edit text, images, shapes, SVG, connectors, tables, and charts; arrange layers and use original page templates and diagrams.
- **Design the teaching sequence:** organize pages and in-page steps, add animation cues and speaker notes, and preview without leaving the editor.
- **Present interactively:** use a speaker view, timer, annotations, and a synchronized audience window in the same browser.
- **Keep work recoverable and portable:** save with revision history and local draft recovery; import and export Notale projects and export a standalone HTML presentation.
- **Generate a first draft:** plan and build lecture pages with the TypeScript backend, then inspect progress in the separate Viewer.

## Get started

Requires Node.js **20.19+**, npm, and PostgreSQL 16. Docker Compose can start the supplied local database. Run from the repository root:

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

Open **http://localhost:4312**. Press `Ctrl+C` to stop the application services; the database and its data remain. To use an existing PostgreSQL server, set `DATABASE_URL` and skip the Compose command. See [local deployment](notale-editor-frontend/docs/LOCAL-DEPLOYMENT.md) for port configuration and upgrades.

To try generation without model credentials, start the backend and Viewer in separate terminals:

```bash
cd notale-ts && npm ci && npm run build && npm run dev -- serve --starter
cd notale-viewer && npm ci && npm run dev
```

For real generation and the editor's Istar, copy `.env.example` to `.env.local` at the repository root and fill in your keys; notale-ts and notale-editor both read this one file (values already set in the shell win). See the [generator guide](notale-ts/README.md). The editor and generator can be run independently.

## How it is built

| Directory | Role |
| --- | --- |
| [`notale-editor-frontend/`](notale-editor-frontend/) | Next.js and React editor, presentation workspace, and browser checks |
| [`notale-editor/`](notale-editor/) | TypeScript document model, HTTP API, revision store, and native slide runtime |
| [`notale-format/`](notale-format/) | Shared native project and page-runtime format contract |
| [`notale-ts/`](notale-ts/) | TypeScript lecture generation, CLI, HTTP/SSE service, and publication assets |
| [`notale-viewer/`](notale-viewer/) | Generation progress, preview, and archive download |

The frontend uses a pinned `@notale/editor` package and communicates with the backend over HTTP. PostgreSQL stores documents and assets; authored slide content is served from a separate origin. After changing the shared backend contract, run `npm run contract:update` in `notale-editor-frontend/` before rebuilding the frontend.

> [!IMPORTANT]
> The local starter uses a fixed development identity and listens on loopback. A public deployment needs host-provided authentication and authorization, a private preview-signing secret, and a separate slide-content origin. See the [integration guide](notale-editor/docs/INTEGRATION.md).

Notale is at **0.1.0**. Visual editing of custom scripts or Canvas content requires a supported adapter; arbitrary effects do not automatically become editable controls. The [integration coverage](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md) records what is connected and what still needs work.

**Explore:** [frontend development](notale-editor-frontend/README.md) · [architecture](notale-editor-frontend/docs/EDITOR-ARCHITECTURE.md) · [presentation](notale-editor-frontend/docs/PRESENTATION.md) · [original templates](notale-editor-frontend/templates/original/README.md)

Notale-owned source code is [MIT licensed](LICENSE). Bundled third-party resources retain their own notices. The public source consists of the five projects above and root documentation.
