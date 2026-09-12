# Compatibility inventory

| Boundary | TypeScript implementation | Evidence |
|---|---|---|
| One-command generation | `notale build` | Real Gemini run completed with normal, steps, and code pages |
| Long-running service | `notale serve`, Fastify, durable `RunStore` | Viewer-independent process and persisted snapshots |
| Viewer progress recovery | protocol v1 HTTP/SSE | Terminal replay returned ordered events 1–12 and closed cleanly |
| Page tools | scoped `Read`, `Write`, `Edit` tool loop | Cross-page writes rejected by contract test |
| Page protocol | root `page-NN.html`, `#stage`, semantic assets, `window.Deck` | Real steps page emitted `data-deck-step`; Chromium state check passed |
| Trace and run record | redacted `trace.jsonl`, `events.jsonl`, `run.json`, `briefs.json`, artifact manifest | Real and deterministic runs inspected |
| Static export | relative regular files, no repository links or symlinks | copied-output contract test and manifest traversal |
| Code runtime | Monaco/Pyodide ESM, semantic theme, declared packages | browser checks for plain Python and NumPy; plain run made no NumPy request |
| Editor import | page files and recursive asset tree | current editor imported a generated three-page artifact as version 1 |

The TS workflow intentionally does not carry over retired experiment switches, duplicate planner/builder CLIs, screenshot-report loops, or unused model wire adapters. The active configuration uses the Google OpenAI-compatible chat wire; that is the implemented model boundary. Media generation and visual self-review are future optional tools rather than dependencies of the generation contract.
