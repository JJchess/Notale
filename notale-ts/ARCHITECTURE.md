# Architecture

`notale-ts` is the generation backend. `RunService` owns background execution, `RunStore` persists snapshots and ordered JSONL events, and the CLI and Fastify server are adapters over the same core. Page agents run with bounded filesystem tools and default to eight concurrent pages. A browser runtime build packages the TS deck chassis, Monaco, Pyodide, workers, licenses, and only the Python wheels requested by a lecture.

`notale-viewer` is a separate Next.js process and imports no backend source or runtime package. It speaks protocol v1 over HTTP/SSE. The backend atomically combines event replay with live subscription, so reconnects have no history/live gap. Closing or restarting the viewer does not affect generation.

Completed output is static. Every dependency is copied as a regular relative file beneath `output/`; manifests reject symlinks. `notale-editor` consumes root `page-NN.html` files plus the recursive `assets/` tree.

The Python implementation and old viewer remain stable references until the user chooses to switch entry points. The deterministic starter pipeline is only an infrastructure fixture; normal CLI and server execution use the real model pipeline.
