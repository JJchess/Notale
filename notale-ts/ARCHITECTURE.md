# Architecture

## Integrated code-page path

For new `build-code` pages, `CodeScaffold` is host preparation, not a model tool.
The existing Builder then receives four editable files plus authoring instructions
and four full samples. It uses the normal TS model adapter and Read/Write/Edit/Check
loop; only this workflow gets a 480-second abort deadline, 300-second request limit
and actual final-audit error feedback. No Python experiment agent is embedded.

`starter.py` is learner code, `observe.py` observes real execution, `tests.py`
checks the course, and `view/render.js` renders the observed state. Exact-file
ownership excludes lesson configuration, CSS, HTML and shared resources. The host
owns those files and deterministic theme mapping. Runtime assets use shared URLs;
Monaco/Pyodide are installed once inside the lecture and publication materializes
relative files. Fixed view assets use HTTP caching; mutable source stays fresh.

Lesson metadata declares `runtimeVersion: observer-v1` and the four editable paths.
The outer page, CodeScaffold return shape and `.notale` v1 format remain compatible.
Only observer-v1 is supported by generation and Check. Old or unknown versions
require a newly generated page; no legacy generator or automatic migration remains.
New Check serves the whole pages directory to reach shared assets, waits for
initialization, and checks real execution, course tests, source locations, selected
frames and reset. It does not assert algorithm-specific semantic correctness.

The observer workbench implements CodeLab v2 capture/restore/pause and the editor
presentation adapter natively; neither archive export nor editor import/serving
rewrites workbench source. Poster mode avoids starting Python. The retired trace
implementation is stored in the outer legacy directory, not in the runtime graph.

`notale-ts` is the generation backend. `RunService` owns background execution, `RunStore` persists snapshots and ordered JSONL events, and the CLI and Fastify server are adapters over the same core. Page agents run with bounded filesystem tools and default to eight concurrent pages. A browser runtime build packages the TS deck chassis, Monaco, Pyodide, workers, licenses, and only the Python wheels requested by a lecture.

`notale-viewer` is a separate Next.js process and imports no backend source or runtime package. It speaks protocol v1 over HTTP/SSE. The backend atomically combines event replay with live subscription, so reconnects have no history/live gap. Closing or restarting the viewer does not affect generation.

Completed output is static. Every dependency is copied as a regular relative file beneath `output/`; manifests reject symlinks. `notale-editor` consumes root `page-NN.html` files plus the recursive `assets/` tree.

The Python implementation and old viewer remain stable references until the user chooses to switch entry points. The deterministic starter pipeline is only an infrastructure fixture; normal CLI and server execution use the real model pipeline.
