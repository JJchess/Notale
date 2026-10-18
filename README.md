<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/notale-lockup-dark.svg">
    <img src="notale-viewer/public/brand/notale-lockup.svg" alt="Notale" width="240">
  </picture>
</p>

<h1 align="center">Rethink how knowledge is created and learned.</h1>

<p align="center">An AI-native platform for creating interactive knowledge.</p>

<p align="center">
  <a href="https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml"><img src="https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-0.1.0-6246C8?style=flat-square" alt="Version 0.1.0"></a>
  <a href="docs/DOCKER.md"><img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose"></a>
  <a href="notale-editor/tsconfig.json"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-2EA44F?style=flat-square" alt="Apache License 2.0"></a>
</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center"><a href="https://aicosmos.ai">Try Notale</a> · <a href="#quick-start">Quick start</a> · <a href="#see-knowledge-in-motion">See it in action</a> · <a href="#inside-notale">Architecture</a></p>

![A creator conducting a world of interactive knowledge](docs/assets/readme/hero-en.jpg)

Knowledge deserves a form people can participate in. An explanation can give a subject structure; an experiment lets us change its conditions and discover why it works. Notale brings these experiences into one continuous narrative.

Describe what you want to teach, share, or understand. Add a paper, reference materials, or a presentation template. Notale turns them into interactive lectures that combine explanations, visual models, and executable experiments. Continue shaping the result through conversation and visual editing, then present it or take it with you as HTML.

Created by the **AI Cosmos team at Tsinghua University's CoAI Lab**, Notale explores how knowledge can be created, experienced, and understood when the reader becomes an active participant.

## Quick start

Run your own personal workspace with **Docker and Docker Compose**. Node.js, PostgreSQL, and browser dependencies run in containers; you do not need to install them on the host.

**1. Get the code and create your configuration.**

```bash
git clone https://github.com/THU-AICosmos/Notale.git
cd Notale
cp .env.example .env.local
```

**2. Open `.env.local` and fill in `GEMINI_API_KEY` and `PARATERA_API_KEY`.** These are credentials for your model providers. Model calls use your provider accounts.

**3. Start the workspace with one command.**

```bash
docker compose --env-file .env.local up -d --build --wait
```

Open **[localhost:3000](http://localhost:3000)** to create a lecture. The visual editor is at **[localhost:4312](http://localhost:4312)**; use **Open in editor** from a generated result to continue editing it. The first start builds the applications and downloads dependencies, so it takes longer than later starts.

To stop the services while keeping your data:

```bash
docker compose --env-file .env.local down
```

See the **[Docker guide](docs/DOCKER.md)** for configuration, logs, updates, data storage, and troubleshooting.

> [!IMPORTANT]
> This setup is a personal workspace bound to your own machine. For a service shared with other users, follow the [integration guide](notale-editor/docs/INTEGRATION.md) to configure authentication, authorization, and a separate origin for lecture content.

## See knowledge in motion

### Make an abstract idea tangible

Move a camera, change its field of view, or adjust a clipping plane. The three-dimensional scene and its two-dimensional projection respond together. A formula becomes something you can investigate.

![Changing camera controls updates a 3D scene and its 2D projection](docs/assets/readme/camera-projection.gif)

### Let the explanation run

Edit a Python array and run it. The insertion-sort workbench connects the code, its execution trace, and a changing bar chart on the same page. The animation follows **real Python execution in the browser**.

![Editing an input array and running Python produces a new sorting trace](docs/assets/readme/code-execution.gif)

*A demonstration of the included insertion-sort sample. The input is changed during the recording; the execution results are not prerecorded animation data.*

### Bring your materials and your visual language

A paper can supply the content; a PPTX template can supply the visual direction. In this example, *Attention Is All You Need* and a public presentation template become a **six-page attention lecture** with explanations and an interactive experiment.

![A public PPTX template and the six-page attention lecture that uses its visual direction](docs/assets/readme/template.png)

*Template: SlidesCarnival, Colorful Geometric / Dumaine, CC BY 4.0; adapted. See [media sources](docs/assets/readme/SOURCES.md).*

### Build a complete learning journey

Notale organizes interactive activities into a larger explanation. This **separate example** starts from a six-chapter outline and produces a **33-page course**, spanning Transformer architecture, attention, scaling laws, post-training, and inference systems.

![Selected pages and the complete 33-page course overview](docs/assets/readme/course.png)

*This course was generated from its own outline, independently of the paper-and-template example above.*

## Keep creating after the first draft

1. **Create.** Describe a topic and attach your materials. Follow generation in the Viewer.
2. **Explore.** Change inputs, manipulate visual models, and run supported code activities.
3. **Refine.** Ask for revisions or open the visual editor. Shape content, page order, steps, and notes.
4. **Present and keep.** Use speaker tools and an audience view. Export HTML or a `.notale` project.

![The Notale visual editor with page thumbnails, canvas, and style controls](notale-editor-frontend/docs/release/screenshots/editor.png)

Completed conversational revisions create new versions. Saved edits remain available when you reopen the same version in the editor. You can also start directly in the editor and create a lecture without AI.

Custom scripts and Canvas content need a supported adapter for visual editing. See [editing coverage](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md) for the current boundary.

## Inside Notale

| Project | Responsibility |
| --- | --- |
| [`notale-ts/`](notale-ts/) | AI generation, conversational revision, CLI, and HTTP/SSE service |
| [`notale-viewer/`](notale-viewer/) | Lecture library, creation conversation, generation progress, and preview |
| [`notale-editor-frontend/`](notale-editor-frontend/) | Visual editing and presentation workspace |
| [`notale-editor/`](notale-editor/) | Document model, HTTP API, revision storage, and slide runtime |
| [`notale-format/`](notale-format/) | Shared `.notale` archive and page-runtime format |

The generator produces browser-based pages. The Viewer follows generation and opens selected results in the editor. PostgreSQL stores editor documents and assets; lecture content runs on a separate origin.

For source development, use **Node.js 20.19+** and follow the relevant project guide. The Docker path above handles the full local setup for you.

| Go further | Start here |
| --- | --- |
| Run and maintain your workspace | [Docker guide](docs/DOCKER.md) |
| Configure generation and model providers | [Generator guide](notale-ts/README.md) · [Viewer guide](notale-viewer/README.md) |
| Develop the editor | [Frontend guide](notale-editor-frontend/README.md) · [Architecture](notale-editor-frontend/docs/EDITOR-ARCHITECTURE.md) |
| Prepare a presentation | [Presentation guide](notale-editor-frontend/docs/PRESENTATION.md) · [Page templates](notale-editor-frontend/templates/original/README.md) |
| Integrate Notale into your product | [Integration guide](notale-editor/docs/INTEGRATION.md) |

We welcome reproducible bug reports, new examples, and improvements to the creation experience. For substantial changes, open an issue describing the intended workflow first. Keep the English and Chinese READMEs aligned when changing documentation.

Notale-owned source is licensed under [Apache 2.0](LICENSE). Bundled third-party resources retain their own licenses and notices; see the [resource notices](notale-ts/RESOURCE-AUDIT.md) and [README media sources](docs/assets/readme/SOURCES.md).
