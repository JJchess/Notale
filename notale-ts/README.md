# Notale TypeScript Harness

TypeScript generation backend for Notale. It exposes the same core through a library, CLI, and durable HTTP/SSE run service. The Python `notale-v2` remains the stable reference while compatibility rows are migrated.

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

Configuration uses `GEMINI_API_KEY` by default. `NOTALE_MODEL`, `NOTALE_BASE_URL`, `NOTALE_API_KEY_ENV`, `NOTALE_REASONING_EFFORT`, `NOTALE_PAGE_CONCURRENCY`, and `NOTALE_RUNS_ROOT` override the model or runtime settings.

The viewer runs separately from `../notale-viewer`. Generated artifacts contain regular relative files, include browser dependency notices, and do not link back to this repository. Monaco inherits its light/dark base under the MIT license, while lecture-specific syntax colors are derived from the generated semantic lecture theme; no third-party VS Code theme collection is bundled.
